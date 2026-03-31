import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, Check, X, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { parseVoiceCommand, executeVoiceCommand } from '@/lib/voiceCommands';
import { api } from '@/api/api';
import { useElevenLabs } from '@/hooks/useElevenLabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  const [aiResponse, setAiResponse] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [parsedCommand, setParsedCommand] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  // ElevenLabs TTS hook
  const { speak, stop: stopSpeaking, isSpeaking, progress } = useElevenLabs();

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
    if (result && !isSpeaking) {
      const timer = setTimeout(() => {
        setResult(null);
        setTranscript('');
        setAiResponse('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [result, isSpeaking]);

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
        audioBase64: base64Audio,
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

      // Detect Whisper hallucinations (common when transcribing silence/noise)
      const hallucinations = [
        /thank you for watching/i,
        /subscribe to my channel/i,
        /let's get together/i,
        /wonderful place/i,
        /lots of trees/i,
        /please like and subscribe/i,
        /thank you so much/i,
        /see you next time/i,
      ];

      const isHallucination = hallucinations.some(pattern => pattern.test(transcribedText));

      // Also check if transcript is suspiciously long (>200 chars from short audio)
      const isTooLong = transcribedText.length > 200;

      if (isHallucination || isTooLong) {
        console.warn('[VOICE] Detected Whisper hallucination:', transcribedText);
        setResult({
          success: false,
          message: "Sorry, I didn't catch that. Please speak clearly and try again."
        });
        setIsProcessing(false);
        return;
      }

      // Parse the voice command (without executing)
      const parsed = await parseVoiceCommand(transcribedText);

      // If low confidence or unknown action, show error immediately
      if (parsed.action === 'unknown' || (parsed.confidence && parsed.confidence < 0.6)) {
        setResult({
          success: false,
          message: parsed.message || "I didn't quite catch that. Could you try rephrasing?"
        });
        setIsProcessing(false);
        return;
      }

      // For simple queries (answer_question, navigate), execute immediately without confirmation
      if (parsed.action === 'answer_question' || parsed.action === 'navigate') {
        const commandResult = await executeVoiceCommand(parsed);
        setResult(commandResult);

        // AI speaks back with the result
        if (commandResult.message) {
          setAiResponse(commandResult.message);
          try {
            await speak(commandResult.message);
          } catch (ttsError) {
            console.error('TTS error:', ttsError);
          }
        }

        // Handle navigation if needed
        if (commandResult.success && commandResult.action === 'navigate' && commandResult.navigateTo) {
          setTimeout(() => {
            navigate(commandResult.navigateTo);
          }, 1500);
        }

        setIsProcessing(false);
        return;
      }

      // For data-changing commands (add_treatment, add_expense, etc.), show confirmation dialog
      setParsedCommand(parsed);
      setShowConfirmDialog(true);
      setIsProcessing(false);

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

  const handleConfirmCommand = async () => {
    if (!parsedCommand) return;

    setShowConfirmDialog(false);
    setIsProcessing(true);

    try {
      const commandResult = await executeVoiceCommand(parsedCommand);
      setResult(commandResult);

      // AI speaks back with the result
      if (commandResult.message) {
        setAiResponse(commandResult.message);
        try {
          await speak(commandResult.message);
        } catch (ttsError) {
          console.error('TTS error:', ttsError);
        }
      }

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
      console.error('Error executing command:', error);
      toast({
        title: 'Execution failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setParsedCommand(null);
    }
  };

  const handleCancelCommand = () => {
    setShowConfirmDialog(false);
    setParsedCommand(null);
    setTranscript('');
    toast({
      title: 'Command cancelled',
      description: 'No changes were made',
    });
  };

  const formatCommandDescription = (command) => {
    switch (command.action) {
      case 'add_treatment':
        return `Add treatment: ${command.treatment_name || 'Treatment'} for ${command.patient_name || 'patient'} - £${command.price || 0} (${command.payment_status || 'pending'})`;
      case 'add_expense':
        return `Add expense: £${command.expense_amount || 0} for ${command.expense_category || 'Other'}${command.expense_description ? ` - ${command.expense_description}` : ''}`;
      case 'send_invoice':
        return `Send invoice to ${command.patient_name || 'patient'}`;
      case 'send_reminder':
        return `Send payment reminder to ${command.patient_name || 'patient'}`;
      case 'send_review_request':
        return `Send review request to ${command.patient_name || 'patient'}`;
      case 'mark_paid':
        return `Mark ${command.invoice_number ? `invoice ${command.invoice_number}` : `invoice for ${command.patient_name || 'patient'}`} as paid`;
      case 'book_appointment':
        return `Book appointment for ${command.patient_name || 'patient'} - ${command.treatment_name || 'Treatment'} on ${command.date || 'today'} at ${command.time || 'TBD'}`;
      default:
        return command.message || 'Execute this command?';
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Transcript/Result Display */}
      {(transcript || result || isSpeaking) && (
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

          {/* AI Speaking Indicator */}
          {isSpeaking && aiResponse && (
            <div className={`${transcript || result ? 'mt-3 pt-3 border-t border-gray-100' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="w-4 h-4 text-[#d4a740] animate-pulse" />
                <p className="text-xs font-medium text-[#d4a740]">AI Assistant:</p>
              </div>
              <p className="text-sm text-gray-700 mb-2">{aiResponse}</p>

              {/* Progress bar */}
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#d4a740] transition-all duration-100"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voice Orb Button */}
      <button
        onClick={toggleListening}
        disabled={isProcessing || isSpeaking}
        className={`
          relative w-16 h-16 rounded-full shadow-2xl transition-all duration-300
          flex items-center justify-center group
          ${isSpeaking
            ? 'bg-[#d4a740] scale-110 shadow-[#d4a740]/50'
            : isListening
            ? 'bg-[#d4a740] scale-110 shadow-[#d4a740]/50'
            : isProcessing
            ? 'bg-[#2C3E50]'
            : 'bg-[#1a2845] hover:bg-[#2C3E50] hover:scale-105'
          }
        `}
        title={isSpeaking ? 'AI speaking...' : isListening ? 'Stop listening' : 'Start voice command'}
      >
        {/* Pulsing ring when listening or speaking */}
        {(isListening || isSpeaking) && (
          <div className="absolute inset-0 rounded-full bg-[#d4a740] animate-ping opacity-75" />
        )}

        {/* Icon */}
        <div className="relative z-10">
          {isSpeaking ? (
            <Volume2 className="w-8 h-8 text-white animate-pulse" />
          ) : isProcessing ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : isListening ? (
            <MicOff className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
          )}
        </div>

        {/* Glow effect */}
        {(isListening || isSpeaking) && (
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

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Voice Command</DialogTitle>
            <DialogDescription>
              Please confirm this action before I execute it.
            </DialogDescription>
          </DialogHeader>

          {parsedCommand && (
            <div className="space-y-4">
              {/* Show what user said */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">You said:</p>
                <p className="text-sm text-gray-700">&quot;{transcript}&quot;</p>
              </div>

              {/* Show parsed command */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-700 mb-1">I will:</p>
                <p className="text-sm font-medium text-blue-900">{formatCommandDescription(parsedCommand)}</p>
              </div>

              {/* Show confidence if available */}
              {parsedCommand.confidence && (
                <div className="text-xs text-gray-500">
                  Confidence: {Math.round(parsedCommand.confidence * 100)}%
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={handleCancelCommand}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCommand}
              disabled={isProcessing}
              className="flex-1 bg-[#d4a740] hover:bg-[#c49730] text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                'Confirm'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
