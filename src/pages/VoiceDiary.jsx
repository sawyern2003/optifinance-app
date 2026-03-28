import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Volume2, Check, X, AlertCircle, Undo2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import { useElevenLabs } from '@/hooks/useElevenLabs';

/**
 * Voice Command Center - Professional clinical interface
 */
export default function VoiceDiary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { speak, isSpeaking, progress } = useElevenLabs();

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [parsedIntent, setParsedIntent] = useState('');
  const [activityFeed, setActivityFeed] = useState([]);
  const [completedAction, setCompletedAction] = useState(null);
  const [inConversation, setInConversation] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRafRef = useRef(null);
  const [pulseLevel, setPulseLevel] = useState(0);

  // Orb scale based on audio
  const orbScale = 1 + pulseLevel * 0.08;
  const goldGlowOpacity = 0.3 + pulseLevel * 0.4;

  const { data: patients } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api.entities.Patient.list('name'),
    initialData: [],
  });

  const { data: treatmentCatalog } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => api.entities.TreatmentCatalog.list('treatment_name'),
    initialData: [],
  });

  const { data: treatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  // Calculate today's stats
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayTreatments = treatments.filter(t => t.date === todayStr);
  const todayRevenue = todayTreatments.reduce((sum, t) => sum + (Number(t.amount_paid) || 0), 0);
  const pendingInvoices = treatments.filter(t => t.payment_status === 'pending').length;

  // Cleanup
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      if (analyserRafRef.current) {
        cancelAnimationFrame(analyserRafRef.current);
      }
      audioContextRef.current?.close();
    };
  }, []);

  const attachMicAnalyser = useCallback((stream) => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.88;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = ctx;
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < bins.length; i++) sum += bins[i];
        const raw = sum / bins.length / 255;
        const norm = Math.min(1, raw * 1.8);
        setPulseLevel((p) => p * 0.7 + norm * 0.3);
        analyserRafRef.current = requestAnimationFrame(loop);
      };
      analyserRafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.warn("Audio analyser unavailable:", e);
    }
  }, []);

  const detachMicAnalyser = useCallback(() => {
    if (analyserRafRef.current) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setPulseLevel(0);
  }, []);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setLiveTranscript('');
      setFinalTranscript('');
      setParsedIntent('');
      setCompletedAction(null);
      attachMicAnalyser(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        detachMicAnalyser();

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await processAudio(audioBlob);
        }
      };

      mediaRecorder.start(250);
      setIsListening(true);
    } catch (error) {
      console.error('Microphone error:', error);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access.',
        variant: 'destructive',
      });
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startConversation = async () => {
    setInConversation(true);
    await startListening();
  };

  const endConversation = () => {
    setInConversation(false);
    if (isListening) {
      stopListening();
    }
    setLiveTranscript('');
    setFinalTranscript('');
    setParsedIntent('');
    setCompletedAction(null);
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      await new Promise((resolve, reject) => {
        reader.onload = () => resolve();
        reader.onerror = () => reject(reader.error);
      });
      const base64Audio = reader.result.split(',')[1];

      // Transcribe with Whisper
      const transcribeResult = await api.integrations.Core.TranscribeAudio({
        audioBase64: base64Audio,
        nameHint: patients.map(p => p.name).join(', ')
      });

      const userSaid = transcribeResult.text || '';
      setFinalTranscript(userSaid);

      if (!userSaid.trim()) {
        setCompletedAction({
          success: false,
          message: "I didn't catch that. Could you try again?"
        });
        setIsProcessing(false);
        return;
      }

      // Process with conversational AI
      await processConversation(userSaid);

    } catch (error) {
      console.error('Processing error:', error);
      setCompletedAction({
        success: false,
        message: error.message || 'Failed to process. Please try again.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const processConversation = async (userMessage) => {
    try {
      setParsedIntent('Processing command...');

      // Gather current app data for context
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

      const thisWeekTreatments = treatments.filter(t => {
        const treatmentDate = new Date(t.date);
        return treatmentDate >= startOfWeek;
      });

      const revenue = thisWeekTreatments.reduce((sum, t) => sum + (Number(t.amount_paid) || 0), 0);
      const pending = treatments.filter(t => t.payment_status === 'pending');

      const appContext = {
        todayDate: format(today, 'yyyy-MM-dd'),
        currentPage: window.location.pathname,
        stats: {
          totalPatients: patients.length,
          totalTreatments: treatments.length,
          thisWeekTreatments: thisWeekTreatments.length,
          thisWeekRevenue: revenue,
          pendingPayments: pending.length,
          pendingAmount: pending.reduce((sum, t) => sum + (Number(t.price_paid) || 0), 0),
        },
        recentTreatments: treatments.slice(0, 5).map(t => ({
          date: t.date,
          patient: t.patient_name,
          treatment: t.treatment_name,
          amount: t.price_paid,
          status: t.payment_status,
        })),
      };

      // Call AI
      const data = await api.integrations.Core.ProcessVoiceConversation({
        userMessage,
        currentContext: appContext,
        conversationHistory: [],
        patientNames: patients.map(p => p.name),
        treatmentNames: treatmentCatalog.map(t => t.treatment_name),
        todayDate: format(today, 'yyyy-MM-dd'),
      });

      const aiResponse = data.response || "I'm here to help!";

      setParsedIntent(aiResponse);

      // Add to activity feed
      const activityEntry = {
        id: Date.now(),
        timestamp: new Date(),
        action: userMessage,
        result: aiResponse,
        success: true,
      };
      setActivityFeed(prev => [activityEntry, ...prev]);

      // Show completed state
      setCompletedAction({
        success: true,
        message: aiResponse,
        details: []
      });

      // Speak response
      await speak(aiResponse);

      // Auto-restart listening if in conversation mode
      if (inConversation) {
        setFinalTranscript('');
        setParsedIntent('');
        setCompletedAction(null);

        // Wait a moment, then start listening again
        setTimeout(async () => {
          if (inConversation) {
            await startListening();
          }
        }, 500);
      } else {
        // Clear after 5 seconds if not in conversation
        setTimeout(() => {
          setFinalTranscript('');
          setParsedIntent('');
          setCompletedAction(null);
        }, 5000);
      }

    } catch (error) {
      console.error('Conversation processing error:', error);
      setParsedIntent('');
      setCompletedAction({
        success: false,
        message: error.message || "I'm having trouble understanding. Could you rephrase that?"
      });

      // Add error to activity feed
      setActivityFeed(prev => [{
        id: Date.now(),
        timestamp: new Date(),
        action: userMessage,
        result: error.message,
        success: false,
      }, ...prev]);
    }
  };

  const processSuggestion = async (suggestionText) => {
    setIsProcessing(true);
    setFinalTranscript(suggestionText);
    try {
      await processConversation(suggestionText);
    } catch (error) {
      console.error('Suggestion processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      {/* Minimal Top Bar - No Branding */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <Link to={createPageUrl("Dashboard")} className="text-gray-400 hover:text-gray-600 transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-12 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">Today</span>
              <span className="text-lg font-light text-gray-900">{todayTreatments.length}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">Revenue</span>
              <span className="text-lg font-light text-gray-900">£{todayRevenue.toFixed(0)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">Pending</span>
              <span className="text-lg font-light text-gray-900">{pendingInvoices}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Voice Interface - Left */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 relative">
              {/* Conversation Indicator */}
              {inConversation && (
                <div className="absolute top-6 right-6 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs tracking-wide uppercase text-gray-500">Active</span>
                  <button
                    onClick={endConversation}
                    className="ml-3 text-xs tracking-wide uppercase text-gray-400 hover:text-gray-600 transition"
                  >
                    End
                  </button>
                </div>
              )}

              {/* IDLE STATE */}
              {!isListening && !isProcessing && !completedAction && (
                <div className="text-center">
                  {/* Orb */}
                  <div className="relative w-80 h-80 flex items-center justify-center mx-auto mb-12">
                    {/* Gold aura */}
                    <div
                      className="pointer-events-none absolute rounded-full bg-[#d6b164] blur-[80px]"
                      style={{ inset: "-26%" }}
                      aria-hidden
                    />

                    {/* Main blue sphere */}
                    <div
                      className="pointer-events-none absolute inset-[5%] rounded-full"
                      style={{
                        background:
                          "radial-gradient(ellipse 115% 95% at 50% 8%, #7f91aa 0%, #647b98 20%, #4d647f 56%, #3b4f67 100%)",
                        boxShadow: `
                          inset 0 1px 0 rgba(255, 255, 255, 0.2),
                          inset 0 -24px 50px rgba(37, 52, 72, 0.35),
                          inset 0 -8px 20px rgba(37, 52, 72, 0.22),
                          0 0 0 1px rgba(214, 177, 100, 0.22),
                          0 8px 34px -8px rgba(90, 108, 132, 0.16)
                        `,
                      }}
                      aria-hidden
                    />

                    {/* Soft highlight */}
                    <div
                      className="pointer-events-none absolute inset-[5%] rounded-full bg-[radial-gradient(circle_at_35%_22%,rgba(245,249,255,0.22),transparent_48%)]"
                      aria-hidden
                    />

                    {/* Inner ring */}
                    <div
                      className="pointer-events-none absolute inset-[10%] rounded-full border border-[#c7b79d]/45"
                      style={{
                        opacity: 0.42,
                        boxShadow: `inset 0 0 20px rgba(199, 183, 157, 0.08)`,
                      }}
                      aria-hidden
                    />

                    {/* Clickable orb - no button visible */}
                    <button
                      type="button"
                      onClick={startConversation}
                      disabled={isSpeaking}
                      className="absolute inset-0 rounded-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Start voice command"
                    />
                  </div>

                  <p className="text-sm text-gray-400 tracking-wide">
                    Click to begin
                  </p>
                </div>
              )}

              {/* LISTENING STATE */}
              {isListening && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs uppercase tracking-wide text-gray-500">Listening</span>
                  </div>

                  {/* Orb with audio reaction */}
                  <div className="relative w-80 h-80 flex items-center justify-center mx-auto mb-12" style={{ transform: `scale(${orbScale})`, transition: 'transform 0.1s ease-out' }}>
                    {/* Pulsing gold aura */}
                    <div
                      className="pointer-events-none absolute rounded-full bg-[#d6b164] blur-[80px]"
                      style={{ inset: "-26%", opacity: goldGlowOpacity, transition: 'opacity 0.09s ease-out' }}
                      aria-hidden
                    />

                    {/* Main blue sphere */}
                    <div
                      className="pointer-events-none absolute inset-[5%] rounded-full"
                      style={{
                        background:
                          "radial-gradient(ellipse 115% 95% at 50% 8%, #7f91aa 0%, #647b98 20%, #4d647f 56%, #3b4f67 100%)",
                        boxShadow: `
                          inset 0 1px 0 rgba(255, 255, 255, 0.2),
                          inset 0 -24px 50px rgba(37, 52, 72, 0.35),
                          inset 0 -8px 20px rgba(37, 52, 72, 0.22),
                          0 0 0 1px rgba(214, 177, 100, ${0.22 + pulseLevel * 0.22}),
                          0 ${8 + pulseLevel * 14}px ${34 + pulseLevel * 40}px -8px rgba(90, 108, 132, ${0.16 + pulseLevel * 0.16})
                        `,
                        transition: 'box-shadow 0.09s ease-out',
                      }}
                      aria-hidden
                    />

                    {/* Soft highlight */}
                    <div
                      className="pointer-events-none absolute inset-[5%] rounded-full bg-[radial-gradient(circle_at_35%_22%,rgba(245,249,255,0.22),transparent_48%)]"
                      aria-hidden
                    />

                    {/* Inner ring - reacts to audio */}
                    <div
                      className="pointer-events-none absolute inset-[10%] rounded-full border border-[#c7b79d]/45"
                      style={{
                        opacity: 0.42 + pulseLevel * 0.5,
                        boxShadow: `inset 0 0 ${20 + pulseLevel * 24}px rgba(199, 183, 157, ${0.08 + pulseLevel * 0.12})`,
                        transition: 'opacity 0.08s ease-out, box-shadow 0.08s ease-out',
                      }}
                      aria-hidden
                    />

                    {/* Stop button overlay */}
                    <button
                      type="button"
                      onClick={stopListening}
                      className="absolute inset-0 rounded-full cursor-pointer"
                      aria-label="Stop recording"
                    />
                  </div>

                  {/* Waveform */}
                  {!liveTranscript && (
                    <div className="flex items-center justify-center gap-1 h-16 mb-4">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-0.5 bg-gradient-to-t from-[#d6b164] to-[#b89a52] rounded-full transition-all duration-100"
                          style={{
                            height: `${Math.max(4, 16 + pulseLevel * 32 + Math.sin((i / 24) * Math.PI * 2) * 8)}px`,
                            opacity: 0.5 + pulseLevel * 0.5,
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {liveTranscript && (
                    <p className="text-base text-gray-600 font-light">"{liveTranscript}"</p>
                  )}
                </div>
              )}

              {/* PROCESSING STATE */}
              {isProcessing && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-8">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-xs uppercase tracking-wide text-gray-500">Processing</span>
                  </div>

                  {/* Static orb */}
                  <div className="relative w-80 h-80 flex items-center justify-center mx-auto mb-12">
                    <div
                      className="pointer-events-none absolute rounded-full bg-[#d6b164] blur-[80px]"
                      style={{ inset: "-26%", opacity: 0.3 }}
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute inset-[5%] rounded-full"
                      style={{
                        background:
                          "radial-gradient(ellipse 115% 95% at 50% 8%, #7f91aa 0%, #647b98 20%, #4d647f 56%, #3b4f67 100%)",
                        boxShadow: `
                          inset 0 1px 0 rgba(255, 255, 255, 0.2),
                          inset 0 -24px 50px rgba(37, 52, 72, 0.35),
                          inset 0 -8px 20px rgba(37, 52, 72, 0.22),
                          0 0 0 1px rgba(214, 177, 100, 0.22),
                          0 8px 34px -8px rgba(90, 108, 132, 0.16)
                        `,
                      }}
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute inset-[5%] rounded-full bg-[radial-gradient(circle_at_35%_22%,rgba(245,249,255,0.22),transparent_48%)]"
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute inset-[10%] rounded-full border border-[#c7b79d]/45"
                      style={{
                        opacity: 0.42,
                        boxShadow: `inset 0 0 20px rgba(199, 183, 157, 0.08)`,
                      }}
                      aria-hidden
                    />
                  </div>

                  {finalTranscript && (
                    <div className="mb-6">
                      <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">You said</p>
                      <p className="text-sm text-gray-600 font-light">"{finalTranscript}"</p>
                    </div>
                  )}

                  {parsedIntent && (
                    <p className="text-sm text-gray-500 font-light">{parsedIntent}</p>
                  )}
                </div>
              )}

              {/* COMPLETED STATE */}
              {completedAction && !isProcessing && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-8">
                    {completedAction.success ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs uppercase tracking-wide text-gray-500">Complete</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span className="text-xs uppercase tracking-wide text-gray-500">Error</span>
                      </>
                    )}
                  </div>

                  <div className="mb-8">
                    <p className="text-sm text-gray-600 font-light">{completedAction.message}</p>
                  </div>

                  {!inConversation && (
                    <button
                      onClick={() => {
                        setCompletedAction(null);
                        setFinalTranscript('');
                        setParsedIntent('');
                      }}
                      className="text-sm text-gray-400 hover:text-gray-600 transition uppercase tracking-wide"
                    >
                      Close
                    </button>
                  )}
                </div>
              )}

              {/* AI Speaking Indicator */}
              {isSpeaking && (
                <div className="mt-8 pt-8 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Volume2 className="w-4 h-4 text-gray-400 animate-pulse" />
                    <span className="text-xs uppercase tracking-wide text-gray-400">Speaking</span>
                  </div>
                  <div className="w-full h-px bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#c7b79d] transition-all duration-100"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity Log - Right */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
              <h2 className="text-xs uppercase tracking-wide text-gray-400 mb-8">Activity</h2>

              {activityFeed.length === 0 ? (
                <div className="text-center py-24 text-gray-300">
                  <p className="text-sm font-light">No commands yet</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {activityFeed.map((entry) => (
                    <div
                      key={entry.id}
                      className="pb-6 border-b border-gray-50 last:border-0"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          {entry.success ? (
                            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-1" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-1" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-3 mb-2">
                              <span className="text-xs text-gray-400">
                                {format(entry.timestamp, 'HH:mm')}
                              </span>
                              <span className="text-sm text-gray-900 font-light">
                                {entry.action}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 font-light">{entry.result}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-6">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Send All Invoices', sublabel: `${pendingInvoices} pending` },
                  { label: 'Schedule Follow-ups', sublabel: 'Review patients' },
                  { label: 'Outstanding Payments', sublabel: 'Check status' },
                  { label: 'End of Day Report', sublabel: 'Generate summary' },
                ].map((cmd, idx) => (
                  <button
                    key={idx}
                    onClick={() => processSuggestion(cmd.label)}
                    disabled={isProcessing || isListening || isSpeaking}
                    className="p-5 text-left border border-gray-100 rounded-xl hover:border-gray-200 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-sm text-gray-900 font-light mb-1">{cmd.label}</div>
                    <div className="text-xs text-gray-400">{cmd.sublabel}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
