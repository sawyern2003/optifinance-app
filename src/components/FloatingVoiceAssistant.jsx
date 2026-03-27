import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { parseAndExecuteVoiceCommand } from '@/lib/voiceCommands';
import { api } from '@/api/api';

/**
 * Floating Voice Assistant - Global voice control orb
 *
 * Appears on all pages, always ready to listen
 * Processes voice commands hands-free
 */
export function FloatingVoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Handle voice command result
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        setResult(null);
        setTranscript('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await processAudio(audioBlob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      setResult(null);
      setTranscript('');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to use voice commands.',
        variant: 'destructive',
      });
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);

    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      await new Promise((resolve, reject) => {
        reader.onload = () => resolve();
        reader.onerror = () => reject(reader.error);
      });

      const base64Audio = reader.result.split(',')[1];

      // Transcribe audio using Whisper
      const transcribeResult = await api.integrations.Core.TranscribeAudio({
        audio: base64Audio,
        nameHint: '' // Could pass patient names here for better accuracy
      });

      const transcribedText = transcribeResult.text || '';
      setTranscript(transcribedText);

      if (!transcribedText.trim()) {
        setResult({
          success: false,
          message: "I didn't catch that. Please try again."
        });
        setIsProcessing(false);
        return;
      }

      // Parse and execute the voice command
      const commandResult = await parseAndExecuteVoiceCommand(transcribedText);
      setResult(commandResult);

      // Handle navigation if needed
      if (commandResult.success && commandResult.action === 'navigate' && commandResult.navigateTo) {
        setTimeout(() => {
          navigate(commandResult.navigateTo);
        }, 1500);
      }

      // Show toast notification
      toast({
        title: commandResult.success ? 'Command executed' : 'Command failed',
        description: commandResult.message,
        className: commandResult.success ? 'bg-green-50 border-green-200' : '',
        variant: commandResult.success ? undefined : 'destructive',
      });

    } catch (error) {
      console.error('Error processing audio:', error);
      setResult({
        success: false,
        message: 'Failed to process command. Please try again.'
      });
      toast({
        title: 'Processing failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Transcript/Result Display */}
      {(transcript || result) && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 max-w-xs animate-slide-in">
          {transcript && (
            <div className="mb-2">
              <p className="text-xs font-medium text-gray-500 mb-1">You said:</p>
              <p className="text-sm text-gray-700">{transcript}</p>
            </div>
          )}

          {result && (
            <div className={`flex items-start gap-2 ${transcript ? 'mt-3 pt-3 border-t border-gray-100' : ''}`}>
              {result.success ? (
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Voice Orb Button */}
      <button
        onClick={toggleListening}
        disabled={isProcessing}
        className={`
          relative w-16 h-16 rounded-full shadow-2xl transition-all duration-300
          flex items-center justify-center group
          ${isListening
            ? 'bg-[#d4a740] scale-110 shadow-[#d4a740]/50'
            : isProcessing
            ? 'bg-[#2C3E50]'
            : 'bg-[#1a2845] hover:bg-[#2C3E50] hover:scale-105'
          }
        `}
        title={isListening ? 'Stop listening' : 'Start voice command'}
      >
        {/* Pulsing ring when listening */}
        {isListening && (
          <div className="absolute inset-0 rounded-full bg-[#d4a740] animate-ping opacity-75" />
        )}

        {/* Icon */}
        <div className="relative z-10">
          {isProcessing ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : isListening ? (
            <MicOff className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
          )}
        </div>

        {/* Glow effect */}
        {isListening && (
          <div className="absolute inset-0 rounded-full bg-[#d4a740] blur-xl opacity-50 animate-pulse" />
        )}
      </button>

      {/* Helper text (shows on hover when not active) */}
      {!isListening && !isProcessing && !transcript && !result && (
        <div className="absolute bottom-20 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-[#1a2845] text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">
            Click to give voice command
          </div>
        </div>
      )}
    </div>
  );
}
