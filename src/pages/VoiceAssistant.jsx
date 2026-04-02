import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Volume2, Check, AlertCircle, X } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import { useElevenLabs } from '@/hooks/useElevenLabs';
import { planAgentCommand, executePlanStep } from '@/api/agent';

/**
 * Voice Command Center - Immersive cinematic interface
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
  const [pendingPlan, setPendingPlan] = useState(null);
  const [showPlanConfirm, setShowPlanConfirm] = useState(false);
  /** Live agent steps: { action, description, status: 'pending'|'running'|'done'|'error', detailMessage } */
  const [agentStepProgress, setAgentStepProgress] = useState([]);

  // Conversation session management
  const [sessionId, setSessionId] = useState(() => {
    // Generate session ID on mount
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // Patient notes mode
  const [notesMode, setNotesMode] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientSelector, setShowPatientSelector] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');

  // Voice selection
  const [selectedVoiceId, setSelectedVoiceId] = useState('21m00Tcm4TlvDq8ikWAM'); // Default: Rachel
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);

  // Available ElevenLabs voices - Female only
  const voices = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'American - Professional, warm and clear' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', description: 'American - Soft, gentle and friendly' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', description: 'American - Bright, cheerful and energetic' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', description: 'British - Elegant, refined and professional' },
    { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', description: 'British - Clear, articulate and confident' },
    { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', description: 'British - Mature, warm and authoritative' },
    { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', description: 'British - Young, pleasant and natural' },
    { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', description: 'American - Upbeat, friendly and clear' },
  ];

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRafRef = useRef(null);
  const [pulseLevel, setPulseLevel] = useState(0);

  // Orb scale and glow based on audio
  const orbScale = 1 + pulseLevel * 0.12;
  const goldGlowOpacity = 0.4 + pulseLevel * 0.6;
  const ringOpacity = 0.3 + pulseLevel * 0.7;

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
        const norm = Math.min(1, raw * 2.2);
        setPulseLevel((p) => p * 0.65 + norm * 0.35);
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
      setPendingPlan(null);
      setShowPlanConfirm(false);
      setAgentStepProgress([]);
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

          // Handle notes mode differently
          if (notesMode) {
            await processPatientNote(audioBlob);
          } else {
            await processAudio(audioBlob);
          }
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
    setPendingPlan(null);
    setShowPlanConfirm(false);
    setAgentStepProgress([]);
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      await new Promise((resolve, reject) => {
        reader.onload = () => resolve();
        reader.onerror = () => reject(reader.error);
      });
      const base64Audio = reader.result.split(',')[1];

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

      // Detect hallucinations
      const hallucinations = [
        /thank you for watching/i,
        /subscribe to my channel/i,
        /let's get together/i,
        /wonderful place/i,
        /lots of trees/i,
      ];

      const isHallucination = hallucinations.some(pattern => pattern.test(userSaid));
      const isTooLong = userSaid.length > 200;

      if (isHallucination || isTooLong) {
        console.warn('[VOICE] Detected Whisper hallucination:', userSaid);
        setCompletedAction({
          success: false,
          message: "Sorry, I didn't catch that clearly. Please speak again."
        });
        setIsProcessing(false);
        return;
      }

      await processVoiceCommand(userSaid);

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

  const processVoiceCommand = async (transcript) => {
    try {
      console.log('[VOICE ASSISTANT] Planning command:', transcript);
      setParsedIntent('Understanding your request...');
      setIsProcessing(true);

      const planResult = await planAgentCommand(transcript);

      if (!planResult.success || !planResult.plan) {
        const msg = planResult.error || 'Could not understand that command. Please try again.';
        setCompletedAction({ success: false, message: msg });
        setParsedIntent('');
        setIsProcessing(false);

        setActivityFeed((prev) => [
          {
            id: Date.now(),
            timestamp: new Date(),
            action: transcript,
            result: msg,
            success: false,
          },
          ...prev,
        ]);

        await speak(msg, selectedVoiceId);

        setTimeout(() => {
          setFinalTranscript('');
          setCompletedAction(null);
        }, 5000);
        return;
      }

      const plan = planResult.plan;
      if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
        const msg = 'No actions were planned. Try rephrasing your request.';
        setCompletedAction({ success: false, message: msg });
        setParsedIntent('');
        setIsProcessing(false);
        await speak(msg, selectedVoiceId);
        setTimeout(() => {
          setFinalTranscript('');
          setCompletedAction(null);
        }, 5000);
        return;
      }

      setPendingPlan(plan);
      setShowPlanConfirm(true);
      setParsedIntent('');
      setIsProcessing(false);
    } catch (error) {
      console.error('[VOICE ASSISTANT] Command processing error:', error);
      const msg = error.message || 'Failed to process command. Please try again.';
      setCompletedAction({ success: false, message: msg });
      setParsedIntent('');
      setIsProcessing(false);

      setActivityFeed((prev) => [
        {
          id: Date.now(),
          timestamp: new Date(),
          action: transcript,
          result: msg,
          success: false,
        },
        ...prev,
      ]);

      await speak('Sorry, something went wrong. Please try again.', selectedVoiceId);
    }
  };

  const handleCancelPlan = () => {
    setShowPlanConfirm(false);
    setPendingPlan(null);
    setParsedIntent('');
    toast({
      title: 'Cancelled',
      description: 'No changes were made.',
    });
    setFinalTranscript('');
  };

  const handleConfirmPlan = async () => {
    if (!pendingPlan) return;

    const transcriptForFeed = finalTranscript;
    const plan = pendingPlan;
    const actions = plan.actions || [];

    setShowPlanConfirm(false);
    setIsProcessing(true);
    setParsedIntent('Agent is working…');
    setAgentStepProgress(
      actions.map((a) => ({
        action: a.action,
        description: a.description || String(a.action || '').replace(/_/g, ' '),
        status: 'pending',
        detailMessage: '',
      })),
    );

    try {
      let executorState = null;
      const aggregatedResults = [];

      for (let i = 0; i < actions.length; i++) {
        setAgentStepProgress((prev) =>
          prev.map((s, j) => ({
            ...s,
            status: j < i ? 'done' : j === i ? 'running' : 'pending',
          })),
        );

        const stepRes = await executePlanStep(plan, i, executorState);

        if (!stepRes.success) {
          setAgentStepProgress((prev) =>
            prev.map((s, j) =>
              j === i
                ? { ...s, status: 'error', detailMessage: stepRes.error || 'Request failed' }
                : s,
            ),
          );
          aggregatedResults.push({
            action: actions[i].action,
            description: actions[i].description,
            result: { success: false, message: stepRes.error },
          });
          break;
        }

        executorState = stepRes.executor_state;
        const row = stepRes.results[0];
        if (row) aggregatedResults.push(row);

        const ok = row?.result?.success !== false;
        const msg =
          (typeof row?.result?.message === 'string' && row.result.message) ||
          row?.result?.error ||
          '';

        setAgentStepProgress((prev) =>
          prev.map((s, j) =>
            j === i ? { ...s, status: ok ? 'done' : 'error', detailMessage: msg } : s,
          ),
        );

        await new Promise((r) => requestAnimationFrame(() => r()));
      }

      setPendingPlan(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['patients'] }),
        queryClient.invalidateQueries({ queryKey: ['treatments'] }),
        queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      ]);

      const workflow_results = aggregatedResults.map((r, idx) => ({
        step: idx + 1,
        action: r.action,
        description:
          r.description ||
          String(r.action || '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
        success: r.result?.success !== false,
        message:
          typeof r.result?.message === 'string'
            ? r.result.message
            : r.result?.error || JSON.stringify(r.result ?? {}),
      }));

      const ok = aggregatedResults.length > 0 && aggregatedResults.every((r) => r.result?.success !== false);
      const failed = aggregatedResults.filter((r) => r.result?.success === false);
      const failReason =
        failed.length > 0
          ? String(
              failed[0].result?.message ||
                failed[0].result?.error ||
                failed[0].description ||
                '',
            ).trim()
          : '';

      const message = ok
        ? `All ${aggregatedResults.length} steps finished. ${plan.summary || ''}`.trim()
        : [
            failReason ? `Issue: ${failReason}` : `${failed.length} step(s) failed.`,
            'See the Live agent step list for full detail.',
            plan.summary || '',
          ]
            .filter(Boolean)
            .join(' ')
            .trim();

      setCompletedAction({
        success: ok,
        message,
        workflow_results,
      });
      setParsedIntent('');

      setActivityFeed((prev) => [
        {
          id: Date.now(),
          timestamp: new Date(),
          action: transcriptForFeed || 'Confirmed plan',
          result: message,
          success: ok,
          workflow_results: aggregatedResults,
        },
        ...prev,
      ]);

      const speakMsg =
        ok || !failReason
          ? message
          : `Attention: ${failReason.slice(0, 320)}${failReason.length > 320 ? '…' : ''}`;
      await speak(speakMsg, selectedVoiceId);

      setTimeout(() => {
        setFinalTranscript('');
        setParsedIntent('');
        setCompletedAction(null);
        setAgentStepProgress([]);
      }, 12000);
    } catch (error) {
      console.error('[VOICE ASSISTANT] Plan execution error:', error);
      setPendingPlan(null);
      const msg = error.message || 'Failed to run that plan. Please try again.';
      setCompletedAction({ success: false, message: msg });
      setParsedIntent('');
      setAgentStepProgress([]);
      setActivityFeed((prev) => [
        {
          id: Date.now(),
          timestamp: new Date(),
          action: transcriptForFeed || 'Confirmed plan',
          result: msg,
          success: false,
        },
        ...prev,
      ]);
      await speak(msg, selectedVoiceId);
      setTimeout(() => {
        setFinalTranscript('');
        setCompletedAction(null);
      }, 5000);
    } finally {
      setIsProcessing(false);
    }
  };


  const processSuggestion = async (suggestionText) => {
    setIsProcessing(true);
    setFinalTranscript(suggestionText);
    try {
      await processVoiceCommand(suggestionText);
    } catch (error) {
      console.error('Suggestion processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Patient notes functions
  const startPatientNotes = () => {
    setShowPatientSelector(true);
  };

  const selectPatientForNotes = async (patient) => {
    setSelectedPatient(patient);
    setShowPatientSelector(false);
    setNotesMode(true);
    await startListening();
  };

  const exitNotesMode = () => {
    setNotesMode(false);
    setSelectedPatient(null);
    if (isListening) {
      stopListening();
    }
    setFinalTranscript('');
  };

  const savePatientNote = async (noteText) => {
    if (!selectedPatient) return;

    try {
      // Save to clinical_notes table
      await api.entities.ClinicalNote.create({
        patient_id: selectedPatient.id,
        patient_name: selectedPatient.name,
        note: noteText,
        date: format(new Date(), 'yyyy-MM-dd'),
        created_at: new Date().toISOString(),
      });

      // Add to activity feed
      const activityEntry = {
        id: Date.now(),
        timestamp: new Date(),
        action: `Clinical note for ${selectedPatient.name}`,
        result: noteText,
        success: true,
      };
      setActivityFeed(prev => [activityEntry, ...prev]);

      toast({
        title: 'Note saved',
        description: `Clinical note added to ${selectedPatient.name}'s record`,
      });

      queryClient.invalidateQueries(['clinical_notes']);

      return true;
    } catch (error) {
      console.error('Error saving note:', error);
      toast({
        title: 'Failed to save note',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const processPatientNote = async (audioBlob) => {
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      await new Promise((resolve, reject) => {
        reader.onload = () => resolve();
        reader.onerror = () => reject(reader.error);
      });
      const base64Audio = reader.result.split(',')[1];

      const transcribeResult = await api.integrations.Core.TranscribeAudio({
        audioBase64: base64Audio,
        nameHint: selectedPatient.name
      });

      const noteText = transcribeResult.text || '';
      setFinalTranscript(noteText);

      if (!noteText.trim()) {
        setCompletedAction({
          success: false,
          message: "I didn't catch that. Could you try again?"
        });
        setIsProcessing(false);
        return;
      }

      // Save the note
      const saved = await savePatientNote(noteText);

      setCompletedAction({
        success: saved,
        message: saved
          ? `Note saved to ${selectedPatient.name}'s record`
          : 'Failed to save note'
      });

    } catch (error) {
      console.error('Note processing error:', error);
      setCompletedAction({
        success: false,
        message: error.message || 'Failed to process note'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#121829] to-[#1a1f35] relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#d6b164] rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#4d647f] rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
      </div>

      {/* Exit button */}
      <Link
        to={createPageUrl("Dashboard")}
        className="absolute top-8 left-8 z-50 text-white/40 hover:text-white/80 transition-colors duration-300"
      >
        <X className="w-6 h-6" />
      </Link>

      {/* Conversation/Notes status */}
      {inConversation && !notesMode && (
        <div className="absolute top-8 right-8 z-50 flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-white/70 text-sm font-light tracking-wider">ACTIVE SESSION</span>
          <button
            onClick={endConversation}
            className="ml-2 text-white/50 hover:text-white/90 text-sm font-light tracking-wider transition-colors"
          >
            END
          </button>
        </div>
      )}

      {/* Notes mode status */}
      {notesMode && selectedPatient && (
        <div className="absolute top-8 right-8 z-50 flex items-center gap-3 px-5 py-2.5 rounded-full bg-blue-500/10 backdrop-blur-xl border border-blue-400/30">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          <span className="text-blue-300/90 text-sm font-light tracking-wider">RECORDING NOTES: {selectedPatient.name}</span>
          <button
            onClick={exitNotesMode}
            className="ml-2 text-blue-300/60 hover:text-blue-200 text-sm font-light tracking-wider transition-colors"
          >
            EXIT
          </button>
        </div>
      )}

      {/* Voice & Patient Notes buttons - floating */}
      {!notesMode && !inConversation && !isListening && !isProcessing && (
        <div className="absolute top-8 right-8 z-50 flex items-center gap-4">
          {/* Voice Selector */}
          <button
            onClick={() => setShowVoiceSelector(true)}
            className="px-6 py-3 rounded-full bg-purple-500/20 backdrop-blur-xl border border-purple-400/30 hover:bg-purple-500/30 hover:border-purple-400/50 transition-all duration-300 group"
          >
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-purple-300" />
              <span className="text-purple-300/90 text-sm font-light tracking-wider">
                {voices.find(v => v.id === selectedVoiceId)?.name || 'VOICE'}
              </span>
            </div>
          </button>

          {/* Patient Notes */}
          <button
            onClick={startPatientNotes}
            className="px-6 py-3 rounded-full bg-blue-500/20 backdrop-blur-xl border border-blue-400/30 hover:bg-blue-500/30 hover:border-blue-400/50 transition-all duration-300 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-400 rounded-full" />
              <span className="text-blue-300/90 text-sm font-light tracking-wider">PATIENT NOTES</span>
            </div>
          </button>
        </div>
      )}

      {/* Voice Selector Modal */}
      {showVoiceSelector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-gradient-to-br from-[#1a1f35] to-[#0a0e1a] rounded-3xl border border-white/10 p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-white/90 text-xl font-light tracking-wider mb-2">Select AI Voice</h3>
                <p className="text-white/40 text-sm">Choose the voice for AI responses</p>
              </div>
              <button
                onClick={() => setShowVoiceSelector(false)}
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Voice list */}
            <div className="space-y-3">
              {voices.map(voice => (
                <button
                  key={voice.id}
                  onClick={() => {
                    setSelectedVoiceId(voice.id);
                    setShowVoiceSelector(false);
                    toast({
                      title: `Voice changed to ${voice.name}`,
                      description: voice.description,
                    });
                  }}
                  className={`w-full p-5 text-left rounded-2xl transition-all group ${
                    selectedVoiceId === voice.id
                      ? 'bg-purple-500/20 border-2 border-purple-400/50'
                      : 'bg-white/5 hover:bg-white/10 border-2 border-white/10 hover:border-purple-400/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-base font-light mb-1 ${
                        selectedVoiceId === voice.id ? 'text-purple-200' : 'text-white/90'
                      }`}>
                        {voice.name}
                        {selectedVoiceId === voice.id && (
                          <span className="ml-3 text-xs text-purple-300/70 tracking-wider">CURRENT</span>
                        )}
                      </div>
                      <div className="text-white/40 text-sm">{voice.description}</div>
                    </div>
                    <Volume2 className={`w-5 h-5 ${
                      selectedVoiceId === voice.id ? 'text-purple-400' : 'text-white/30'
                    }`} />
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/10">
              <p className="text-white/60 text-sm leading-relaxed">
                Voice changes will apply to all future AI responses. The selected voice will be remembered for your session.
              </p>
            </div>
          </div>
        </div>
      )}

      {showPlanConfirm && pendingPlan && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm"
          onClick={handleCancelPlan}
          role="presentation"
        >
          <div
            className="w-full max-w-lg bg-gradient-to-br from-[#1a1f35] to-[#0a0e1a] rounded-3xl border border-[#d6b164]/30 p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-plan-title"
          >
            <h3 id="voice-plan-title" className="text-white/90 text-xl font-light tracking-wider mb-2">
              Confirm this action
            </h3>
            <p className="text-white/45 text-sm mb-6 leading-relaxed">
              Here is what we understood from your voice command. Confirm to run it, or cancel to make no changes.
              The assistant only runs the steps listed here (patient lookup, treatment row, invoice, calendar, send, etc.) — it cannot change data that is not covered by a step.
            </p>

            {finalTranscript && (
              <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-white/40 text-xs tracking-[0.25em] uppercase mb-2">You said</div>
                <p className="text-white/80 text-sm font-light whitespace-normal break-words">
                  &quot;{finalTranscript}&quot;
                </p>
              </div>
            )}

            <div className="mb-4 p-4 rounded-2xl bg-[#d6b164]/10 border border-[#d6b164]/25">
              <div className="text-[#d6b164]/90 text-xs tracking-[0.25em] uppercase mb-2">Planned summary</div>
              <p className="text-white/90 text-sm font-light leading-relaxed">{pendingPlan.summary}</p>
            </div>

            <div className="mb-4 max-h-48 overflow-y-auto space-y-2 pr-1">
              <div className="text-white/40 text-xs tracking-[0.25em] uppercase mb-2">Steps</div>
              {pendingPlan.actions.map((a, idx) => (
                <div
                  key={`${a.action}-${idx}`}
                  className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/10 text-left"
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-white/85 text-sm font-light">{a.description}</p>
                    {a.result?.price != null && (
                      <p className="text-white/45 text-xs mt-1">Catalogue price: £{a.result.price}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {pendingPlan.warnings?.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-400/25">
                <div className="text-amber-200/90 text-xs tracking-[0.25em] uppercase mb-2">Warnings</div>
                <ul className="text-amber-100/80 text-sm list-disc list-inside space-y-1">
                  {pendingPlan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={handleCancelPlan}
                disabled={isProcessing}
                className="px-6 py-3 rounded-full border border-white/20 text-white/70 hover:bg-white/10 text-sm tracking-[0.2em] uppercase transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPlan}
                disabled={isProcessing}
                className="px-6 py-3 rounded-full bg-[#d6b164] text-[#0a0e1a] hover:bg-[#c4a55a] text-sm font-medium tracking-[0.15em] uppercase transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Selector Modal */}
      {showPatientSelector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-gradient-to-br from-[#1a1f35] to-[#0a0e1a] rounded-3xl border border-white/10 p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-white/90 text-xl font-light tracking-wider">Select Patient</h3>
              <button
                onClick={() => setShowPatientSelector(false)}
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search patients..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full px-6 py-4 mb-6 bg-white/5 border border-white/10 rounded-2xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all"
              autoFocus
            />

            {/* Patient list */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {patients
                .filter(p =>
                  !patientSearch ||
                  p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                  p.email?.toLowerCase().includes(patientSearch.toLowerCase())
                )
                .map(patient => (
                  <button
                    key={patient.id}
                    onClick={() => selectPatientForNotes(patient)}
                    className="w-full p-5 text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/30 rounded-2xl transition-all group"
                  >
                    <div className="text-white/90 text-base font-light mb-1">{patient.name}</div>
                    {patient.email && (
                      <div className="text-white/40 text-sm">{patient.email}</div>
                    )}
                  </button>
                ))}

              {patients.filter(p =>
                !patientSearch ||
                p.name.toLowerCase().includes(patientSearch.toLowerCase())
              ).length === 0 && (
                <div className="text-center py-12 text-white/30">
                  No patients found
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="relative z-10 h-screen grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* LEFT: Orb Command Center */}
        <div className="flex items-center justify-center p-16 relative min-h-screen">
          {/* Orbital stats - positioned around the center where orb is */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[700px] h-[700px]">
              {/* Top stat - Today */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 text-center">
                <div className="text-5xl font-extralight text-white/90 mb-1">{todayTreatments.length}</div>
                <div className="text-xs text-white/40 tracking-[0.3em] uppercase">Patients Today</div>
              </div>

              {/* Bottom left stat - Revenue */}
              <div className="absolute bottom-0 left-8 text-center">
                <div className="text-5xl font-extralight text-white/90 mb-1">£{todayRevenue.toFixed(0)}</div>
                <div className="text-xs text-white/40 tracking-[0.3em] uppercase">Revenue</div>
              </div>

              {/* Bottom right stat - Pending */}
              <div className="absolute bottom-0 right-8 text-center">
                <div className="text-5xl font-extralight text-white/90 mb-1">{pendingInvoices}</div>
                <div className="text-xs text-white/40 tracking-[0.3em] uppercase">Pending</div>
              </div>
            </div>
          </div>

          {/* The Orb */}
          <div className="relative">
            {/* IDLE STATE */}
            {!isListening && !isProcessing && !completedAction && (
              <div
                className="relative w-[500px] h-[500px] flex items-center justify-center transition-all duration-700"
                style={{
                  transform: `scale(${orbScale})`,
                  filter: `brightness(${1 + pulseLevel * 0.3})`
                }}
              >
                {/* Outer glow rings */}
                <div
                  className="absolute inset-[-60%] rounded-full"
                  style={{
                    background: `radial-gradient(circle, rgba(214, 177, 100, ${goldGlowOpacity * 0.3}) 0%, transparent 70%)`,
                    animation: 'pulse 4s ease-in-out infinite',
                  }}
                />

                {/* Gold aura */}
                <div
                  className="absolute rounded-full bg-[#d6b164] blur-[100px]"
                  style={{
                    inset: "-40%",
                    opacity: goldGlowOpacity * 0.5,
                    transition: 'opacity 0.1s ease-out'
                  }}
                />

                {/* Main sphere */}
                <div
                  className="absolute inset-[5%] rounded-full cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={notesMode ? startListening : startConversation}
                  style={{
                    background: "radial-gradient(ellipse 115% 95% at 50% 8%, #7f91aa 0%, #647b98 20%, #4d647f 56%, #3b4f67 100%)",
                    boxShadow: `
                      inset 0 2px 0 rgba(255, 255, 255, 0.25),
                      inset 0 -40px 80px rgba(37, 52, 72, 0.4),
                      inset 0 -12px 30px rgba(37, 52, 72, 0.3),
                      0 0 0 2px rgba(214, 177, 100, ${0.3 + pulseLevel * 0.3}),
                      0 ${12 + pulseLevel * 20}px ${50 + pulseLevel * 60}px -10px rgba(214, 177, 100, ${0.4 + pulseLevel * 0.4}),
                      0 ${20 + pulseLevel * 30}px ${80 + pulseLevel * 80}px rgba(90, 108, 132, ${0.2 + pulseLevel * 0.2})
                    `,
                  }}
                />

                {/* Soft highlight */}
                <div
                  className="absolute inset-[5%] rounded-full pointer-events-none"
                  style={{
                    background: "radial-gradient(circle at 35% 22%, rgba(245, 249, 255, 0.3), transparent 48%)"
                  }}
                />

                {/* Inner ring */}
                <div
                  className="absolute inset-[12%] rounded-full border pointer-events-none"
                  style={{
                    borderColor: `rgba(199, 183, 157, ${ringOpacity})`,
                    boxShadow: `inset 0 0 ${30 + pulseLevel * 30}px rgba(199, 183, 157, ${0.12 + pulseLevel * 0.15})`,
                    transition: 'all 0.1s ease-out',
                  }}
                />

                {/* Center prompt */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    {notesMode && selectedPatient ? (
                      <div>
                        <div className="text-white/60 text-sm tracking-[0.4em] uppercase font-light animate-pulse mb-2">
                          Recording Notes
                        </div>
                        <div className="text-white/40 text-xs tracking-wider">
                          {selectedPatient.name}
                        </div>
                      </div>
                    ) : (
                      <div className="text-white/60 text-sm tracking-[0.4em] uppercase font-light animate-pulse">
                        Click to Begin
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* LISTENING STATE */}
            {isListening && (
              <div
                className="relative w-[500px] h-[500px] flex items-center justify-center transition-all duration-100"
                style={{
                  transform: `scale(${orbScale})`,
                  filter: `brightness(${1 + pulseLevel * 0.5})`
                }}
              >
                {/* Intense glow rings */}
                <div
                  className="absolute inset-[-60%] rounded-full"
                  style={{
                    background: `radial-gradient(circle, rgba(214, 177, 100, ${goldGlowOpacity * 0.6}) 0%, transparent 70%)`,
                  }}
                />

                {/* Pulsing gold aura */}
                <div
                  className="absolute rounded-full bg-[#d6b164] blur-[100px]"
                  style={{
                    inset: "-40%",
                    opacity: goldGlowOpacity,
                    transition: 'opacity 0.08s ease-out'
                  }}
                />

                {/* Main sphere - clickable to stop */}
                <div
                  className="absolute inset-[5%] rounded-full cursor-pointer"
                  onClick={stopListening}
                  style={{
                    background: "radial-gradient(ellipse 115% 95% at 50% 8%, #7f91aa 0%, #647b98 20%, #4d647f 56%, #3b4f67 100%)",
                    boxShadow: `
                      inset 0 2px 0 rgba(255, 255, 255, 0.25),
                      inset 0 -40px 80px rgba(37, 52, 72, 0.4),
                      inset 0 -12px 30px rgba(37, 52, 72, 0.3),
                      0 0 0 2px rgba(214, 177, 100, ${0.5 + pulseLevel * 0.5}),
                      0 ${12 + pulseLevel * 30}px ${50 + pulseLevel * 80}px -10px rgba(214, 177, 100, ${0.6 + pulseLevel * 0.4}),
                      0 ${20 + pulseLevel * 40}px ${80 + pulseLevel * 100}px rgba(90, 108, 132, ${0.3 + pulseLevel * 0.3})
                    `,
                    transition: 'box-shadow 0.08s ease-out'
                  }}
                />

                {/* Soft highlight */}
                <div
                  className="absolute inset-[5%] rounded-full pointer-events-none"
                  style={{
                    background: "radial-gradient(circle at 35% 22%, rgba(245, 249, 255, 0.3), transparent 48%)"
                  }}
                />

                {/* Inner ring - reacts strongly to audio */}
                <div
                  className="absolute inset-[12%] rounded-full border pointer-events-none"
                  style={{
                    borderColor: `rgba(199, 183, 157, ${ringOpacity})`,
                    boxShadow: `inset 0 0 ${40 + pulseLevel * 50}px rgba(199, 183, 157, ${0.15 + pulseLevel * 0.25})`,
                    transition: 'all 0.08s ease-out',
                  }}
                />

                {/* Waveform visualization */}
                <div className="absolute -bottom-[140px] left-1/2 -translate-x-1/2 flex items-end justify-center gap-2 h-24 w-[600px]">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-[#d6b164] via-[#b89a52] to-transparent rounded-full transition-all duration-75"
                      style={{
                        height: `${Math.max(8, 20 + pulseLevel * 60 + Math.sin((i / 40) * Math.PI * 3) * 16)}px`,
                        opacity: 0.6 + pulseLevel * 0.4,
                      }}
                    />
                  ))}
                </div>

                {/* Live transcript */}
                {liveTranscript && (
                  <div className="absolute -bottom-[180px] left-1/2 -translate-x-1/2 text-center w-[600px] px-8">
                    <p className="text-white/80 text-lg font-light tracking-wide whitespace-normal break-words">"{liveTranscript}"</p>
                  </div>
                )}

                {/* Recording indicator - below orb */}
                <div className="absolute -bottom-96 left-1/2 -translate-x-1/2 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse" />
                  <span className="text-white/60 text-sm tracking-[0.4em] uppercase font-light">
                    {notesMode ? 'Recording Notes' : 'Listening'}
                  </span>
                </div>
              </div>
            )}

            {/* PROCESSING STATE */}
            {isProcessing && (
              <div className="flex flex-col items-center gap-8 w-full max-w-[640px]">
                <div className="relative w-[500px] h-[500px] flex items-center justify-center shrink-0">
                  <div className="absolute rounded-full bg-[#d6b164] blur-[100px]" style={{ inset: "-40%", opacity: 0.4 }} />

                  <div
                    className="absolute inset-[5%] rounded-full"
                    style={{
                      background: "radial-gradient(ellipse 115% 95% at 50% 8%, #7f91aa 0%, #647b98 20%, #4d647f 56%, #3b4f67 100%)",
                      boxShadow: `
                        inset 0 2px 0 rgba(255, 255, 255, 0.25),
                        inset 0 -40px 80px rgba(37, 52, 72, 0.4),
                        0 0 0 2px rgba(214, 177, 100, 0.3),
                        0 12px 50px -10px rgba(214, 177, 100, 0.4)
                      `,
                    }}
                  />

                  <div className="absolute inset-[5%] rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle at 35% 22%, rgba(245, 249, 255, 0.3), transparent 48%)" }}
                  />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-16 h-16 text-white/60 animate-spin" style={{ animationDuration: '1.5s' }} />
                  </div>
                </div>

                <div className="w-full px-4 text-center">
                  {finalTranscript && (
                    <div className="mb-4">
                      <div className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2">You said</div>
                      <p className="text-white/70 text-base font-light whitespace-normal break-words">&quot;{finalTranscript}&quot;</p>
                    </div>
                  )}

                  {parsedIntent && (
                    <div className="mb-4 flex items-center justify-center gap-3">
                      <Loader2 className="w-4 h-4 text-[#d6b164] animate-spin" />
                      <span className="text-[#d6b164] text-sm font-light tracking-wide">{parsedIntent}</span>
                    </div>
                  )}

                  {agentStepProgress.length > 0 && (
                    <div className="mt-2 rounded-2xl border border-[#d6b164]/25 bg-black/50 backdrop-blur-md p-5 text-left max-h-80 overflow-y-auto">
                      <div className="text-[#d6b164] text-xs tracking-[0.25em] uppercase mb-4">Live agent</div>
                      <ul className="space-y-3">
                        {agentStepProgress.map((s, idx) => (
                          <li key={`${s.action}-${idx}`} className="flex gap-3 text-sm">
                            <span className="flex-shrink-0 w-6 text-white/30 tabular-nums">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                {s.status === 'running' && (
                                  <Loader2 className="w-4 h-4 text-[#d6b164] animate-spin shrink-0 mt-0.5" />
                                )}
                                {s.status === 'done' && (
                                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                )}
                                {s.status === 'error' && (
                                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                )}
                                {s.status === 'pending' && (
                                  <span className="w-4 h-4 rounded-full border border-white/25 shrink-0 mt-0.5" />
                                )}
                                <span className="text-white/85 font-light leading-snug">{s.description}</span>
                              </div>
                              {s.detailMessage ? (
                                <p className="text-white/50 text-xs mt-1.5 pl-6 whitespace-normal break-words leading-relaxed">
                                  {s.detailMessage}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI SPEAKING */}
            {isSpeaking && !isListening && !isProcessing && (
              <div className="absolute -bottom-[140px] left-1/2 -translate-x-1/2 w-[600px] px-8">
                {/* Show the AI response text */}
                {parsedIntent && (
                  <p className="text-white/70 text-base font-light mb-6 text-center whitespace-normal break-words">
                    {parsedIntent}
                  </p>
                )}

                <div className="flex items-center gap-3 mb-3 justify-center">
                  <Volume2 className="w-5 h-5 text-[#d6b164] animate-pulse" />
                  <span className="text-white/60 text-sm tracking-[0.4em] uppercase font-light">AI Speaking</span>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
                  <div
                    className="h-full bg-gradient-to-r from-[#d6b164] to-[#b89a52] transition-all duration-100"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* COMPLETED ACTION */}
            {completedAction && !isProcessing && !isSpeaking && (
              <div className="absolute -bottom-[96px] left-1/2 -translate-x-1/2 w-[600px] text-center px-8">
                <div className="flex items-center gap-2 justify-center mb-4">
                  {completedAction.success ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                  )}
                  <span className="text-white/60 text-sm tracking-[0.4em] uppercase font-light whitespace-nowrap">
                    {completedAction.success ? 'Complete' : 'Error'}
                  </span>
                </div>
                <p className="text-white/70 text-base font-light mb-6 whitespace-normal break-words">{completedAction.message}</p>

                {/* Show workflow results breakdown */}
                {completedAction.workflow_results && completedAction.workflow_results.length > 0 && (
                  <div className="mb-6 space-y-2 max-h-48 overflow-y-auto">
                    {completedAction.workflow_results.map((result, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-white/5 rounded-lg text-left"
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs">
                          {result.step}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/90 mb-1">{result.description}</p>
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                            )}
                            <p className="text-xs text-white/50">{result.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {notesMode ? (
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => {
                        setCompletedAction(null);
                        setFinalTranscript('');
                        startListening();
                      }}
                      className="px-6 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full text-blue-300 hover:bg-blue-500/30 text-sm tracking-[0.3em] uppercase transition-all"
                    >
                      Record Another
                    </button>
                    <button
                      onClick={exitNotesMode}
                      className="text-white/40 hover:text-white/80 text-sm tracking-[0.3em] uppercase transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : !inConversation && (
                  <button
                    onClick={() => {
                      setCompletedAction(null);
                      setFinalTranscript('');
                      setParsedIntent('');
                    }}
                    className="text-white/40 hover:text-white/80 text-sm tracking-[0.3em] uppercase transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Activity Timeline & Quick Actions */}
        <div className="flex flex-col justify-between p-16 overflow-hidden">
          {/* Activity Timeline */}
          <div className="flex-1 overflow-y-auto">
            <h2 className="text-white/40 text-xs tracking-[0.4em] uppercase mb-12 font-light">Activity Timeline</h2>

            {activityFeed.length === 0 ? (
              <div className="text-center py-32">
                <div className="text-white/20 text-sm font-light tracking-wider">No activity yet</div>
              </div>
            ) : (
              <div className="space-y-8 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-gradient-to-b before:from-transparent before:via-white/20 before:to-transparent">
                {activityFeed.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className="relative pl-10 group"
                    style={{
                      animation: 'slideIn 0.4s ease-out',
                      animationDelay: `${idx * 0.05}s`,
                      opacity: 0,
                      animationFillMode: 'forwards',
                    }}
                  >
                    {/* Timeline dot */}
                    <div className={`absolute left-0 top-2 w-2 h-2 rounded-full ${entry.success ? 'bg-emerald-400' : 'bg-amber-400'} shadow-lg shadow-${entry.success ? 'emerald' : 'amber'}-400/50`} />

                    {/* Time */}
                    <div className="text-white/40 text-xs tracking-wider mb-2">
                      {format(entry.timestamp, 'HH:mm:ss')}
                    </div>

                    {/* Command */}
                    <div className="text-white/90 text-base font-light mb-2 tracking-wide">
                      {entry.action}
                    </div>

                    {/* Result */}
                    <div className="text-white/50 text-sm font-light leading-relaxed">
                      {entry.result}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="mt-12 pt-12 border-t border-white/10">
            <h3 className="text-white/40 text-xs tracking-[0.4em] uppercase mb-8 font-light">Quick Actions</h3>
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
                  disabled={isProcessing || isListening || isSpeaking || showPlanConfirm}
                  className="group relative p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed text-left overflow-hidden"
                >
                  {/* Hover glow effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#d6b164] rounded-full blur-[60px] opacity-20" />
                  </div>

                  <div className="relative">
                    <div className="text-white/90 text-sm font-light mb-2 tracking-wide">{cmd.label}</div>
                    <div className="text-white/40 text-xs tracking-wider">{cmd.sublabel}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
