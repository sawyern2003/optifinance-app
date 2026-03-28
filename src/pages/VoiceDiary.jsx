import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, Check, X, AudioLines } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import { useElevenLabs } from '@/hooks/useElevenLabs';

/**
 * Conversational Voice Diary
 * Talk naturally, AI responds with voice + shows action options
 */
export default function VoiceDiary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { speak, isSpeaking, progress } = useElevenLabs();

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [actionOptions, setActionOptions] = useState([]);
  const [currentContext, setCurrentContext] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRafRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const [pulseLevel, setPulseLevel] = useState(0);

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
        const norm = Math.min(1, raw * 2.4);
        setPulseLevel((p) => p * 0.74 + norm * 0.26);
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
      recordingStartTimeRef.current = Date.now();
      attachMicAnalyser(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        detachMicAnalyser();

        // Only process if held for at least 300ms
        const recordingDuration = Date.now() - (recordingStartTimeRef.current || 0);
        if (recordingDuration < 300) {
          toast({
            title: 'Too quick',
            description: 'Hold the button and speak, then release',
          });
          return;
        }

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
      if (!userSaid.trim()) {
        await speakAndRespond("I didn't catch that. Could you try again?", []);
        setIsProcessing(false);
        return;
      }

      // Process with conversational AI
      await processConversation(userSaid);

    } catch (error) {
      console.error('Processing error:', error);
      console.error('Error details:', error.message, error.stack);
      toast({
        title: 'Processing error',
        description: error.message || 'Please try again',
        variant: 'destructive'
      });
      await speakAndRespond("Sorry, something went wrong. Please try again.", []);
    } finally {
      setIsProcessing(false);
    }
  };

  const processConversation = async (userMessage) => {
    try {
      console.log('Processing conversation:', userMessage);

      // Gather current app data for context
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

      const thisWeekTreatments = treatments.filter(t => {
        const treatmentDate = new Date(t.date);
        return treatmentDate >= startOfWeek;
      });

      const revenue = thisWeekTreatments.reduce((sum, t) => sum + (Number(t.amount_paid) || 0), 0);
      const pending = treatments.filter(t => t.payment_status === 'pending');

      // Build rich context with actual data
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

      // Call AI to understand intent and respond
      const data = await api.integrations.Core.ProcessVoiceConversation({
        userMessage,
        currentContext: { ...currentContext, ...appContext },
        conversationHistory: conversation.slice(-5),
        patientNames: patients.map(p => p.name),
        treatmentNames: treatmentCatalog.map(t => t.treatment_name),
        todayDate: format(today, 'yyyy-MM-dd'),
      });

      console.log('AI response data:', data);

      // AI response + action options
      const aiResponse = data.response || "I'm here to help!";
      const options = data.actionOptions || [];
      const context = data.context || null;

      // Add to conversation
      setConversation(prev => [
        ...prev,
        { role: 'user', content: userMessage, timestamp: new Date() },
        { role: 'assistant', content: aiResponse, timestamp: new Date() }
      ]);

      // Update context
      setCurrentContext(context);

      // Show action options
      setActionOptions(options);

      // Speak response
      await speak(aiResponse);
    } catch (error) {
      console.error('Conversation processing error:', error);
      console.error('Error details:', error.message, error.stack);
      toast({
        title: 'AI error',
        description: error.message || 'Could not process conversation',
        variant: 'destructive'
      });
      await speakAndRespond("I'm having trouble understanding. Could you rephrase that?", []);
    }
  };

  const speakAndRespond = async (message, options = []) => {
    setConversation(prev => [...prev, { role: 'assistant', content: message, timestamp: new Date() }]);
    setActionOptions(options);
    await speak(message);
  };

  const processSuggestion = async (suggestionText) => {
    setIsProcessing(true);
    try {
      await processConversation(suggestionText);
    } catch (error) {
      console.error('Suggestion processing error:', error);
      await speakAndRespond("Sorry, I couldn't process that suggestion.", []);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActionOption = async (option) => {
    setIsProcessing(true);

    try {
      // Execute the action
      const result = await executeAction(option);

      // AI responds to action
      await speakAndRespond(result.message, result.nextOptions || []);

      if (result.completed) {
        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['treatments'] });
        queryClient.invalidateQueries({ queryKey: ['patients'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    } catch (error) {
      console.error('Action error:', error);
      await speakAndRespond("Sorry, I couldn't complete that action.", []);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeAction = async (option) => {
    // Execute based on action type
    switch (option.action) {
      case 'create_treatment':
        return await createTreatment(option.data);
      case 'create_invoice':
        return await createInvoice(option.data);
      case 'mark_paid':
        return await markPaid(option.data);
      case 'add_clinical_note':
      case 'add_note':
        return await addNote(option.data);
      case 'navigate':
        return await navigateTo(option.data);
      case 'done':
      case 'start_over':
        return { message: "All set! What else can I help with?", nextOptions: [], completed: true };
      default:
        return { message: `${option.label} - I'll work on implementing this action.`, nextOptions: [], completed: false };
    }
  };

  const createTreatment = async (data) => {
    const patient = patients.find(p =>
      p.name.toLowerCase().includes(data.patientName?.toLowerCase())
    );

    const treatment = treatmentCatalog.find(t =>
      t.treatment_name.toLowerCase().includes(data.treatmentName?.toLowerCase())
    );

    await api.entities.TreatmentEntry.create({
      date: format(new Date(), 'yyyy-MM-dd'),
      patient_id: patient?.id,
      patient_name: patient?.name || data.patientName,
      treatment_id: treatment?.id,
      treatment_name: treatment?.treatment_name || data.treatmentName,
      price_paid: data.amount || treatment?.default_price || 0,
      payment_status: data.paymentStatus || 'pending',
      amount_paid: data.paymentStatus === 'paid' ? (data.amount || 0) : 0,
      product_cost: treatment?.typical_product_cost || 0,
      profit: (data.paymentStatus === 'paid' ? (data.amount || 0) : 0) - (treatment?.typical_product_cost || 0)
    });

    return {
      message: `Treatment logged for ${patient?.name || data.patientName}. Anything else?`,
      nextOptions: [
        { label: 'Create invoice', action: 'create_invoice', data },
        { label: 'Add another treatment', action: 'start_over', data: {} },
        { label: 'That\'s all', action: 'done', data: {} }
      ],
      completed: true
    };
  };

  const createInvoice = async (data) => {
    try {
      const patient = patients.find(p =>
        p.name.toLowerCase().includes(data.patient?.toLowerCase() || data.patientName?.toLowerCase())
      );

      if (!patient) {
        return {
          message: `I couldn't find a patient record for ${data.patient || data.patientName}. Please check the name and try again.`,
          nextOptions: [],
          completed: false
        };
      }

      // Find recent unpaid treatment for this patient
      const treatment = treatments.find(t =>
        t.patient_name === patient.name &&
        (t.payment_status === 'pending' || t.payment_status === 'partially_paid')
      );

      if (!treatment) {
        return {
          message: `No unpaid treatments found for ${patient.name}. Would you like to create a treatment entry first?`,
          nextOptions: [
            { label: 'Create treatment', action: 'create_treatment', data: { patientName: patient.name } }
          ],
          completed: false
        };
      }

      // Create invoice
      const invoiceNumber = `INV-${Date.now()}`;
      await api.entities.Invoice.create({
        invoice_number: invoiceNumber,
        treatment_entry_id: treatment.id,
        patient_name: patient.name,
        patient_contact: patient.contact || patient.email || '',
        treatment_name: treatment.treatment_name,
        treatment_date: treatment.date,
        amount: treatment.price_paid,
        issue_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'draft'
      });

      return {
        message: `Invoice ${invoiceNumber} created for ${patient.name}. Would you like me to send it?`,
        nextOptions: [
          { label: 'Send invoice now', action: 'send_invoice', data: { patientName: patient.name, invoiceNumber } },
          { label: 'Done', action: 'done', data: {} }
        ],
        completed: true
      };
    } catch (error) {
      console.error('Invoice creation error:', error);
      return {
        message: "Sorry, I couldn't create the invoice. Please try again.",
        nextOptions: [],
        completed: false
      };
    }
  };

  const markPaid = async (data) => {
    try {
      const patient = patients.find(p =>
        p.name.toLowerCase().includes(data.patient?.toLowerCase() || data.patientName?.toLowerCase())
      );

      if (!patient) {
        return {
          message: `I couldn't find ${data.patient || data.patientName}.`,
          nextOptions: [],
          completed: false
        };
      }

      // Find unpaid treatment
      const treatment = treatments.find(t =>
        t.patient_name === patient.name &&
        (t.payment_status === 'pending' || t.payment_status === 'partially_paid')
      );

      if (!treatment) {
        return {
          message: `No unpaid treatments found for ${patient.name}.`,
          nextOptions: [],
          completed: false
        };
      }

      // Update treatment
      await api.entities.TreatmentEntry.update(treatment.id, {
        payment_status: 'paid',
        amount_paid: treatment.price_paid,
        profit: treatment.price_paid - (treatment.product_cost || 0)
      });

      // Update invoice if exists
      const invoices = await api.entities.Invoice.list();
      const invoice = invoices.find(inv => inv.treatment_entry_id === treatment.id);
      if (invoice) {
        await api.entities.Invoice.update(invoice.id, { status: 'paid' });
      }

      return {
        message: `Perfect! Payment of £${treatment.price_paid} marked as received from ${patient.name}.`,
        nextOptions: [],
        completed: true
      };
    } catch (error) {
      console.error('Mark paid error:', error);
      return {
        message: "Sorry, I couldn't update the payment status.",
        nextOptions: [],
        completed: false
      };
    }
  };

  const addNote = async (data) => {
    try {
      const patient = patients.find(p =>
        p.name.toLowerCase().includes(data.patient?.toLowerCase() || data.patientName?.toLowerCase())
      );

      if (!patient) {
        return {
          message: `I couldn't find a patient record for ${data.patient || data.patientName}.`,
          nextOptions: [],
          completed: false
        };
      }

      // Create clinical note
      await api.entities.ClinicalNote.create({
        patient_id: patient.id,
        patient_name: patient.name,
        visit_date: format(new Date(), 'yyyy-MM-dd'),
        treatment_name: data.treatment || null,
        raw_narrative: data.note || 'Voice note added',
        clinical_summary: data.note || 'Voice note added',
        created_at: new Date().toISOString()
      });

      return {
        message: `Note added to ${patient.name}'s record.`,
        nextOptions: [],
        completed: true
      };
    } catch (error) {
      console.error('Add note error:', error);
      return {
        message: "Sorry, I couldn't save the note.",
        nextOptions: [],
        completed: false
      };
    }
  };

  const navigateTo = async (data) => {
    const pageMap = {
      'dashboard': '/',
      'calendar': '/Calendar',
      'patients': '/Patients',
      'records': '/Records',
      'settings': '/Settings',
    };

    const page = (data.page || '').toLowerCase();
    const route = pageMap[page] || '/';

    setTimeout(() => {
      navigate(route);
    }, 500);

    return {
      message: `Opening ${data.page || 'dashboard'}...`,
      nextOptions: [],
      completed: true
    };
  };

  const startNewConversation = () => {
    setConversation([]);
    setActionOptions([]);
    setCurrentContext(null);
  };

  const micReactive = isListening ? pulseLevel : 0;
  const orbScale = 1 + micReactive * 0.15;
  const goldGlowOpacity = 0.3 + micReactive * 0.5;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex flex-col">
      {/* Header */}
      <header className="flex shrink-0 flex-col items-center text-center pt-8 pb-6 md:pt-12 md:pb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 mb-3">
          Voice Diary
        </h1>
        <p className="text-lg text-gray-500 font-light">
          {conversation.length === 0 ? "How can I help you today?" : "I'm listening..."}
        </p>
        {/* Back button - top right corner */}
        <Link
          to={createPageUrl("Dashboard")}
          className="absolute top-6 right-6 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ← Back
        </Link>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Voice Orb */}
        <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center mb-12">
          {/* Warm gold aura behind orb */}
          <div
            className="pointer-events-none absolute rounded-full bg-[#d6b164] blur-[52px] md:blur-[72px]"
            style={{
              inset: "-26%",
              opacity: goldGlowOpacity,
              transform: `scale(${orbScale})`,
              transition: "opacity 0.09s ease-out, transform 0.09s ease-out",
            }}
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
                0 0 0 1px rgba(214, 177, 100, ${0.22 + micReactive * 0.22}),
                0 ${8 + micReactive * 14}px ${34 + micReactive * 40}px -8px rgba(90, 108, 132, ${0.16 + micReactive * 0.16})
              `,
              transition: "box-shadow 0.09s ease-out",
            }}
            aria-hidden
          />

          {/* Soft cool highlight */}
          <div
            className="pointer-events-none absolute inset-[5%] rounded-full bg-[radial-gradient(circle_at_35%_22%,rgba(245,249,255,0.22),transparent_48%)]"
            aria-hidden
          />

          {/* Inner muted ring */}
          <div
            className="pointer-events-none absolute inset-[10%] rounded-full border border-[#c7b79d]/45"
            style={{
              opacity: 0.42 + micReactive * 0.5,
              boxShadow: `inset 0 0 ${20 + micReactive * 24}px rgba(199, 183, 157, ${0.08 + micReactive * 0.12})`,
              transition: "opacity 0.08s ease-out, box-shadow 0.08s ease-out",
            }}
            aria-hidden
          />

          {/* Center button */}
          <button
            type="button"
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={isProcessing || isSpeaking}
            className="relative z-10 rounded-full bg-gradient-to-b from-[#e8dfd1] via-[#d8cbb7] to-[#c7b79d] px-8 py-3.5 text-[15px] font-medium tracking-tight text-[#2f415a] shadow-[0_4px_18px_rgba(35,50,72,0.2),inset_0_1px_0_rgba(255,255,255,0.45)] transition hover:from-[#ece3d6] hover:via-[#ddd0bd] hover:to-[#cdbda4] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 md:px-10 md:py-4 md:text-base"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2.5">
                <Loader2 className="h-[1.1rem] w-[1.1rem] animate-spin" />
                Processing
              </span>
            ) : isSpeaking ? (
              <span className="flex items-center gap-2.5">
                <Volume2 className="h-[1.1rem] w-[1.1rem] animate-pulse" />
                Speaking
              </span>
            ) : isListening ? (
              <span className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3f5778]/85 shadow-sm" />
                Stop
              </span>
            ) : (
              <span className="flex items-center gap-2.5">
                <AudioLines className="h-[1.1rem] w-[1.1rem]" />
                Hold to speak
              </span>
            )}
          </button>

          {/* Progress bar */}
          {isSpeaking && (
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-48">
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#d6b164] transition-all duration-100"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Suggestion Prompts */}
        {conversation.length === 0 && !isListening && !isProcessing && !isSpeaking && (
          <div className="w-full max-w-2xl mb-12 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <p className="text-xs font-medium text-gray-500 text-center mb-4 uppercase tracking-wide">Try asking:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { text: "What's my schedule today?", icon: "📅" },
                { text: "Show me this week's revenue", icon: "💰" },
                { text: "Sarah had Botox for £300", icon: "💉" },
                { text: "Send invoice to last patient", icon: "📄" },
              ].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => processSuggestion(suggestion.text)}
                  disabled={isProcessing || isListening || isSpeaking}
                  className="px-5 py-4 bg-white border border-gray-200 rounded-xl hover:border-[#c7b79d] hover:shadow-md transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{suggestion.icon}</span>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-[#2f415a]">
                      {suggestion.text}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Options */}
        {actionOptions.length > 0 && !isListening && !isProcessing && (
          <div className="w-full max-w-md space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <p className="text-sm font-medium text-gray-700 text-center mb-4">Choose an action:</p>
            {actionOptions.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleActionOption(option)}
                className="w-full px-6 py-4 bg-white border-2 border-gray-200 rounded-2xl hover:border-[#d4a740] hover:bg-gray-50 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-gray-900 group-hover:text-[#d4a740]">
                    {option.label}
                  </span>
                  <Check className="w-5 h-5 text-gray-400 group-hover:text-[#d4a740]" />
                </div>
                {option.description && (
                  <p className="text-sm text-gray-500 mt-1">{option.description}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Conversation History */}
        {conversation.length > 0 && (
          <div className="w-full max-w-2xl mt-12">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Conversation</h3>
              <button
                onClick={startNewConversation}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                New conversation
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 max-h-96 overflow-y-auto">
              {conversation.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-5 py-3 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-[#1a2845] text-white'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
