import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Volume2, Check, X, Mic, AlertCircle, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import { useElevenLabs } from '@/hooks/useElevenLabs';

/**
 * Voice Command Center - Professional clinic command interface
 * Not a chatbot - a voice-controlled ERP for clinicians
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

      // Clear after 5 seconds
      setTimeout(() => {
        setFinalTranscript('');
        setParsedIntent('');
        setCompletedAction(null);
      }, 5000);

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
    <div className="min-h-screen bg-gray-50">
      {/* TOP BAR */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to={createPageUrl("Dashboard")} className="text-lg font-semibold text-[#2f415a]">
            OptiFinance
          </Link>
          <div className="flex items-center gap-8 text-sm text-[#2f415a]">
            <div>
              <span className="text-gray-500">Today:</span>{' '}
              <span className="font-medium">{todayTreatments.length} patients</span>
            </div>
            <div>
              <span className="text-gray-500">Revenue:</span>{' '}
              <span className="font-medium">£{todayRevenue.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500">Pending:</span>{' '}
              <span className="font-medium">{pendingInvoices} invoices</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT COLUMN: Voice Command Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              {/* IDLE STATE */}
              {!isListening && !isProcessing && !completedAction && (
                <div className="text-center">
                  <p className="text-lg text-[#2f415a] font-medium mb-8">
                    What would you like to do?
                  </p>

                  {/* ORBED */}
                  <div className="relative w-64 h-64 md:w-72 md:h-72 flex items-center justify-center mx-auto mb-8">
                    {/* Warm gold aura */}
                    <div
                      className="pointer-events-none absolute rounded-full bg-[#d6b164] blur-[52px] md:blur-[72px]"
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

                    {/* Center button */}
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={isSpeaking}
                      className="relative z-10 rounded-full bg-gradient-to-b from-[#e8dfd1] via-[#d8cbb7] to-[#c7b79d] px-8 py-3.5 text-[15px] font-medium tracking-tight text-[#2f415a] shadow-[0_4px_18px_rgba(35,50,72,0.2),inset_0_1px_0_rgba(255,255,255,0.45)] transition hover:from-[#ece3d6] hover:via-[#ddd0bd] hover:to-[#cdbda4] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 md:px-10 md:py-4 md:text-base"
                    >
                      <span className="flex items-center gap-2.5">
                        <Mic className="h-[1.1rem] w-[1.1rem]" />
                        Start Command
                      </span>
                    </button>
                  </div>

                  <p className="text-sm text-gray-500">
                    Try: "Send all pending invoices"
                  </p>
                </div>
              )}

              {/* LISTENING STATE */}
              {isListening && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-4 text-red-600">
                    <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
                    <span className="font-medium">Recording</span>
                  </div>

                  {/* ORB WITH RECORDING STATE */}
                  <div className="relative w-64 h-64 md:w-72 md:h-72 flex items-center justify-center mx-auto mb-6" style={{ transform: `scale(${orbScale})`, transition: 'transform 0.1s ease-out' }}>
                    {/* Pulsing gold aura */}
                    <div
                      className="pointer-events-none absolute rounded-full bg-[#d6b164] blur-[52px] md:blur-[72px]"
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

                    {/* Center button */}
                    <button
                      type="button"
                      onClick={stopListening}
                      className="relative z-10 rounded-full bg-gradient-to-b from-[#e8dfd1] via-[#d8cbb7] to-[#c7b79d] px-8 py-3.5 text-[15px] font-medium tracking-tight text-[#2f415a] shadow-[0_4px_18px_rgba(35,50,72,0.2),inset_0_1px_0_rgba(255,255,255,0.45)] transition hover:from-[#ece3d6] hover:via-[#ddd0bd] hover:to-[#cdbda4] active:scale-[0.98] md:px-10 md:py-4 md:text-base"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shadow-sm" />
                        Stop Recording
                      </span>
                    </button>
                  </div>

                  {/* Waveform below orb */}
                  <div className="mb-4">
                    {liveTranscript ? (
                      <p className="text-base text-[#2f415a]">"{liveTranscript}"</p>
                    ) : (
                      <div className="flex items-center justify-center gap-1 h-12">
                        {Array.from({ length: 20 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-1 bg-gradient-to-t from-[#d6b164] to-[#b89a52] rounded-full transition-all duration-100"
                            style={{
                              height: `${Math.max(4, 12 + pulseLevel * 32 + Math.sin((i / 20) * Math.PI * 2) * 8)}px`,
                              opacity: 0.6 + pulseLevel * 0.4,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PROCESSING STATE */}
              {isProcessing && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-4 text-[#2f415a]">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="font-medium">Processing</span>
                  </div>

                  {/* ORB WITH PROCESSING STATE */}
                  <div className="relative w-64 h-64 md:w-72 md:h-72 flex items-center justify-center mx-auto mb-6">
                    {/* Gentle gold aura */}
                    <div
                      className="pointer-events-none absolute rounded-full bg-[#d6b164] blur-[52px] md:blur-[72px]"
                      style={{ inset: "-26%", opacity: 0.3 }}
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

                    {/* Center - spinner */}
                    <div className="relative z-10">
                      <Loader2 className="w-12 h-12 text-[#c7b79d] animate-spin" />
                    </div>
                  </div>

                  {finalTranscript && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg text-left">
                      <p className="text-xs font-medium text-gray-500 mb-1">You said:</p>
                      <p className="text-sm text-[#2f415a]">"{finalTranscript}"</p>
                    </div>
                  )}

                  {parsedIntent && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg text-left">
                      <p className="text-xs font-medium text-gray-500 mb-1">Understanding:</p>
                      <p className="text-sm text-[#2f415a]">{parsedIntent}</p>
                    </div>
                  )}

                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#c7b79d] transition-all duration-300"
                      style={{ width: `${isProcessing ? '70%' : '100%'}` }}
                    />
                  </div>
                </div>
              )}

              {/* COMPLETED STATE */}
              {completedAction && !isProcessing && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    {completedAction.success ? (
                      <>
                        <Check className="w-5 h-5 text-[#4a6b5c]" />
                        <span className="font-medium text-[#4a6b5c]">Completed</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-[#c7925e]" />
                        <span className="font-medium text-[#c7925e]">Error</span>
                      </>
                    )}
                  </div>

                  <div className="mb-6 p-4 bg-gray-50 rounded-lg text-left">
                    <p className="text-sm text-[#2f415a]">{completedAction.message}</p>
                  </div>

                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => {
                        setCompletedAction(null);
                        setFinalTranscript('');
                        setParsedIntent('');
                      }}
                      className="px-6 py-2 bg-[#e8dfd1] text-[#2f415a] rounded-lg font-medium hover:bg-[#ddd0bd] transition"
                    >
                      Done
                    </button>
                    {completedAction.success && (
                      <button
                        className="px-6 py-2 border border-gray-300 text-[#2f415a] rounded-lg font-medium hover:bg-gray-50 transition flex items-center gap-2"
                      >
                        <Undo2 className="w-4 h-4" />
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* AI Speaking Indicator */}
              {isSpeaking && (
                <div className="mt-6 p-4 bg-[#f8f6f3] rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Volume2 className="w-4 h-4 text-[#c7925e] animate-pulse" />
                    <span className="text-sm font-medium text-[#c7925e]">AI Speaking</span>
                  </div>
                  <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#c7b79d] transition-all duration-100"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Activity Feed */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-[#2f415a] mb-6">ACTIVITY</h2>

              {activityFeed.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Commands will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activityFeed.map((entry) => (
                    <div
                      key={entry.id}
                      className="pb-4 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          {entry.success ? (
                            <Check className="w-5 h-5 text-[#4a6b5c] flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-[#c7925e] flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-gray-500">
                                {format(entry.timestamp, 'HH:mm')}
                              </span>
                              <span className={`text-sm font-medium ${entry.success ? 'text-[#2f415a]' : 'text-[#c7925e]'}`}>
                                {entry.action}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">{entry.result}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="text-xs text-gray-500 hover:text-[#2f415a] font-medium">
                            View
                          </button>
                          {entry.success && (
                            <button className="text-xs text-gray-500 hover:text-[#2f415a] font-medium">
                              Undo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM: Quick Commands */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              QUICK COMMANDS
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: '📋', label: 'Finish Clinic', desc: `${pendingInvoices} tasks` },
                { icon: '💷', label: 'Send Invoices', desc: `${pendingInvoices} pending` },
                { icon: '👥', label: 'Follow-ups', desc: 'Schedule' },
                { icon: '❓', label: "Who Hasn't Paid", desc: 'Check status' },
              ].map((cmd, idx) => (
                <button
                  key={idx}
                  onClick={() => processSuggestion(cmd.label)}
                  disabled={isProcessing || isListening || isSpeaking}
                  className="p-4 bg-gray-50 border border-gray-200 rounded-lg hover:border-[#c7b79d] hover:shadow-md transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-2xl mb-2">{cmd.icon}</div>
                  <div className="text-sm font-medium text-[#2f415a]">{cmd.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{cmd.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
