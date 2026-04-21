import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, Sparkles, Loader2, MessageCircle, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/api/api';
import { useElevenLabs } from '@/hooks/useElevenLabs';
import { parseAndExecuteVoiceCommand } from '@/lib/voiceCommands';

/**
 * Voice Assistant Hero - Stunning redesign
 *
 * Premium, minimal design inspired by high-end wellness and medical apps
 * Large centered orb with smooth animations and elegant interactions
 */
export function VoiceAssistantHero() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [showConversation, setShowConversation] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  // ElevenLabs TTS
  const { speak, isSpeaking, progress } = useElevenLabs();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Show conversation when there are messages
  useEffect(() => {
    if (conversation.length > 0) {
      setShowConversation(true);
    }
  }, [conversation.length]);

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

      // Transcribe audio
      const transcribeResult = await api.integrations.Core.TranscribeAudio({
        audioBase64: base64Audio,
        nameHint: ''
      });

      const transcribedText = transcribeResult.text || '';

      if (!transcribedText.trim()) {
        await speakAndAddToConversation("I didn't catch that. Could you try again?", 'assistant');
        setIsProcessing(false);
        return;
      }

      // Add user message to conversation
      addToConversation(transcribedText, 'user');

      // Process the command (with workflow context if applicable)
      const response = await processVoiceInput(transcribedText);

      // Add AI response and speak it
      await speakAndAddToConversation(response.message, 'assistant');

      // Handle any follow-up workflow
      if (response.workflow) {
        setCurrentWorkflow(response.workflow);
      } else {
        setCurrentWorkflow(null);
      }

      // Navigate if needed
      if (response.navigateTo) {
        setTimeout(() => {
          navigate(response.navigateTo);
        }, 1500);
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      await speakAndAddToConversation("Sorry, something went wrong. Please try again.", 'assistant');
    } finally {
      setIsProcessing(false);
    }
  };

  const processVoiceInput = async (transcript) => {
    // If we're in a workflow, process as part of that workflow
    if (currentWorkflow) {
      return await processWorkflowStep(transcript, currentWorkflow);
    }

    // Otherwise, process as new command
    return await processNewCommand(transcript);
  };

  const processNewCommand = async (transcript) => {
    // Call clinic-llm to parse command
    const { data, error } = await api.integrations.Core._invokeClinicLlm('voice_command', {
      transcript,
      prompt: `Parse this voice command and determine if it's a treatment logging that needs follow-up workflow.

Current date: ${new Date().toLocaleDateString('en-GB')}

User said: "${transcript}"

If this is about logging a treatment (e.g., "I saw Sarah for Botox today"), start a workflow.
Return JSON with action and workflow info.`,
    });

    if (error) throw error;

    // Check if this should start a workflow
    if (shouldStartWorkflow(data, transcript)) {
      return startTreatmentWorkflow(data, transcript);
    }

    // Otherwise handle as simple command
    return {
      message: data.message || "I've processed that for you.",
      navigateTo: data.navigateTo,
    };
  };

  const shouldStartWorkflow = (parsedCommand, transcript) => {
    // Check if transcript mentions logging a treatment
    const treatmentKeywords = ['saw', 'treated', 'did', 'performed', 'gave'];
    const lowerTranscript = transcript.toLowerCase();

    return treatmentKeywords.some(keyword => lowerTranscript.includes(keyword));
  };

  const startTreatmentWorkflow = (parsedData, transcript) => {
    // Extract treatment info from transcript
    const workflow = {
      type: 'treatment_logging',
      step: 'confirm_invoice',
      data: {
        transcript,
        ...parsedData,
      },
    };

    return {
      message: "Got it! Would you like me to create an invoice for this treatment?",
      workflow,
    };
  };

  const processWorkflowStep = async (transcript, workflow) => {
    const lowerTranscript = transcript.toLowerCase();
    const isYes = lowerTranscript.includes('yes') || lowerTranscript.includes('yeah') || lowerTranscript.includes('sure');
    const isNo = lowerTranscript.includes('no') || lowerTranscript.includes('nope');

    if (workflow.type === 'treatment_logging') {
      switch (workflow.step) {
        case 'confirm_invoice':
          if (isYes) {
            return {
              message: "Perfect! Is there any discount?",
              workflow: { ...workflow, step: 'ask_discount' },
            };
          } else {
            return {
              message: "No problem. Treatment recorded. Anything else?",
              workflow: null,
            };
          }

        case 'ask_discount':
          if (isYes) {
            return {
              message: "What percentage discount?",
              workflow: { ...workflow, step: 'get_discount_amount' },
            };
          } else {
            return {
              message: "Got it. Shall I send the invoice now?",
              workflow: { ...workflow, step: 'confirm_send', data: { ...workflow.data, discount: 0 } },
            };
          }

        case 'get_discount_amount':
          // Extract percentage from transcript
          const percentMatch = transcript.match(/(\d+)/);
          const discount = percentMatch ? parseInt(percentMatch[1]) : 0;

          return {
            message: `${discount}% discount applied. Shall I send the invoice now?`,
            workflow: { ...workflow, step: 'confirm_send', data: { ...workflow.data, discount } },
          };

        case 'confirm_send':
          if (isYes) {
            // Extract patient and treatment info from workflow data
            const { patient_name, treatment_name, price, discount } = workflow.data;

            // Calculate discounted amount
            const finalAmount = discount ? price - (price * discount / 100) : price;

            try {
              // Execute the send invoice command
              const result = await parseAndExecuteVoiceCommand(
                `Send invoice to ${patient_name}`,
                {
                  command: {
                    action: 'send_invoice',
                    patient_name: patient_name,
                    treatment_name: treatment_name,
                    amount: finalAmount,
                    discount: discount || 0
                  }
                }
              );

              if (result.success) {
                return {
                  message: "Invoice sent! Would you like me to request a review?",
                  workflow: { ...workflow, step: 'ask_review' },
                };
              } else {
                return {
                  message: `Failed to send invoice: ${result.message}. What would you like to do?`,
                  workflow: null,
                };
              }
            } catch (error) {
              console.error('Error sending invoice:', error);
              return {
                message: `Error sending invoice: ${error.message}`,
                workflow: null,
              };
            }
          } else {
            return {
              message: "No problem. Invoice saved as draft. Anything else?",
              workflow: null,
            };
          }

        case 'ask_review':
          if (isYes) {
            const { patient_name } = workflow.data;

            try {
              // Send review request
              const result = await parseAndExecuteVoiceCommand(
                `Send review request to ${patient_name}`,
                {
                  command: {
                    action: 'send_review_request',
                    patient_name: patient_name
                  }
                }
              );

              return {
                message: result.success
                  ? "Review request sent! All done. What else can I help with?"
                  : `Couldn't send review request: ${result.message}. All done. What else can I help with?`,
                workflow: null,
              };
            } catch (error) {
              console.error('Error sending review request:', error);
              return {
                message: "Review request feature coming soon! All done. What else can I help with?",
                workflow: null,
              };
            }
          } else {
            return {
              message: "No problem. All set! What else can I help with?",
              workflow: null,
            };
          }

        default:
          return {
            message: "I'm not sure what to do next. Let's start over.",
            workflow: null,
          };
      }
    }

    return {
      message: "I'm not sure what you mean. Can you rephrase?",
      workflow,
    };
  };

  const addToConversation = (message, role) => {
    setConversation(prev => [...prev, { message, role, timestamp: new Date() }]);
  };

  const speakAndAddToConversation = async (message, role) => {
    addToConversation(message, role);
    if (role === 'assistant') {
      await speak(message);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const clearConversation = () => {
    setConversation([]);
    setCurrentWorkflow(null);
    setShowConversation(false);
  };

  return (
    <div className="relative mb-12">
      {/* Main Voice Interface */}
      <div className="relative bg-gradient-to-br from-white to-slate-50/50 rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-white/80 backdrop-blur-xl overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-violet-100/40 to-transparent rounded-full blur-3xl transform translate-x-1/4 -translate-y-1/4" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-blue-100/30 to-transparent rounded-full blur-3xl transform -translate-x-1/4 translate-y-1/4" />
        </div>

        <div className="relative z-10 p-12 md:p-16">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-violet-500/10 to-blue-500/10 rounded-xl">
                <Sparkles className="w-5 h-5 text-violet-600" />
              </div>
              <h2 className="text-2xl font-light text-slate-800 tracking-tight">Your AI Assistant</h2>
            </div>
            <p className="text-slate-500 font-light text-lg max-w-md mx-auto">
              Press and hold to speak - I'll handle everything hands-free
            </p>
          </div>

          {/* Main Orb Container */}
          <div className="flex flex-col items-center">
            {/* The Orb */}
            <div className="relative mb-8">
              {/* Outer glow rings */}
              {(isListening || isSpeaking) && (
                <>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-400/30 to-blue-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-[-20px] rounded-full bg-gradient-to-br from-violet-400/20 to-blue-400/20 animate-pulse" />
                  <div className="absolute inset-[-40px] rounded-full bg-gradient-to-br from-violet-400/10 to-blue-400/10 animate-pulse" style={{ animationDelay: '0.5s' }} />
                </>
              )}

              {/* Main orb button */}
              <button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onMouseLeave={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                disabled={isProcessing}
                className={`
                  relative w-64 h-64 rounded-full transition-all duration-500 ease-out
                  flex items-center justify-center group
                  ${isSpeaking
                    ? 'bg-gradient-to-br from-violet-500 via-purple-500 to-blue-500 shadow-[0_0_80px_rgba(139,92,246,0.4)] scale-105'
                    : isListening
                    ? 'bg-gradient-to-br from-violet-500 via-purple-500 to-blue-500 shadow-[0_0_80px_rgba(139,92,246,0.4)] scale-105'
                    : isProcessing
                    ? 'bg-gradient-to-br from-slate-400 to-slate-500 shadow-[0_20px_60px_rgba(0,0,0,0.2)]'
                    : 'bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500 shadow-[0_20px_60px_rgba(0,0,0,0.2)] hover:shadow-[0_25px_70px_rgba(0,0,0,0.25)] hover:scale-105'
                  }
                  disabled:opacity-70
                  before:absolute before:inset-0 before:rounded-full before:bg-white/10 before:opacity-0 group-hover:before:opacity-100 before:transition-opacity
                `}
              >
                {/* Inner glow effect */}
                <div className="absolute inset-4 rounded-full bg-white/5" />

                {/* Icon */}
                <div className="relative z-10 flex flex-col items-center gap-3">
                  {isSpeaking ? (
                    <>
                      <Volume2 className="w-20 h-20 text-white drop-shadow-lg animate-pulse" />
                      <span className="text-white text-sm font-medium opacity-90">AI Speaking...</span>
                    </>
                  ) : isProcessing ? (
                    <>
                      <Loader2 className="w-20 h-20 text-white drop-shadow-lg animate-spin" />
                      <span className="text-white text-sm font-medium opacity-90">Processing...</span>
                    </>
                  ) : isListening ? (
                    <>
                      <Mic className="w-20 h-20 text-white drop-shadow-lg animate-pulse" />
                      <span className="text-white text-sm font-medium opacity-90">Listening...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-20 h-20 text-white drop-shadow-lg group-hover:scale-110 transition-transform" />
                      <span className="text-white text-sm font-medium opacity-90">Hold to Talk</span>
                    </>
                  )}
                </div>

                {/* Ripple effect on press */}
                {isListening && (
                  <div className="absolute inset-0 rounded-full border-4 border-white/30 animate-ping" />
                )}
              </button>

              {/* Audio progress indicator */}
              {isSpeaking && (
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-48">
                  <div className="h-1 bg-slate-200/50 rounded-full overflow-hidden backdrop-blur-sm">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-100 rounded-full"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quick action chips */}
            {!isListening && !isProcessing && conversation.length === 0 && (
              <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
                {[
                  { icon: MessageCircle, text: 'Log a treatment', color: 'from-blue-500/10 to-cyan-500/10 text-blue-600' },
                  { icon: Zap, text: 'Check schedule', color: 'from-violet-500/10 to-purple-500/10 text-violet-600' },
                  { icon: Sparkles, text: 'Send invoices', color: 'from-pink-500/10 to-rose-500/10 text-pink-600' },
                ].map((chip, idx) => (
                  <div
                    key={idx}
                    className={`px-5 py-2.5 rounded-full bg-gradient-to-r ${chip.color} backdrop-blur-sm border border-white/50 shadow-sm flex items-center gap-2 text-sm font-medium`}
                  >
                    <chip.icon className="w-4 h-4" />
                    {chip.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conversation Panel - Slides up when active */}
      {showConversation && conversation.length > 0 && (
        <div className="mt-6 bg-white rounded-[24px] shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-slate-200/50 backdrop-blur-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <h3 className="text-lg font-medium text-slate-800">Active Conversation</h3>
              </div>
              <button
                onClick={clearConversation}
                className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                Clear
              </button>
            </div>

            {/* Messages */}
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              {conversation.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div
                    className={`
                      max-w-[85%] px-5 py-3.5 rounded-2xl shadow-sm
                      ${msg.role === 'user'
                        ? 'bg-gradient-to-br from-slate-700 to-slate-600 text-white'
                        : 'bg-gradient-to-br from-violet-50 to-blue-50 text-slate-800 border border-violet-100/50'
                      }
                    `}
                  >
                    <p className="text-[15px] leading-relaxed font-light">{msg.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Custom scrollbar styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 100px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 100px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
