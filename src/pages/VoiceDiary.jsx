import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, Sparkles, Check, X } from "lucide-react";
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

      mediaRecorder.start();
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
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsListening(false);
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
      await speakAndRespond("Sorry, something went wrong. Please try again.", []);
    } finally {
      setIsProcessing(false);
    }
  };

  const processConversation = async (userMessage) => {
    // Call AI to understand intent and respond
    const { data, error } = await api.integrations.Core._invokeClinicLlm('voice_conversation', {
      userMessage,
      currentContext,
      conversationHistory: conversation.slice(-5),
      patientNames: patients.map(p => p.name),
      treatmentNames: treatmentCatalog.map(t => t.treatment_name),
      todayDate: format(new Date(), 'yyyy-MM-dd'),
    });

    if (error) {
      await speakAndRespond("I'm having trouble understanding. Could you rephrase that?", []);
      return;
    }

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
  };

  const speakAndRespond = async (message, options = []) => {
    setConversation(prev => [...prev, { role: 'assistant', content: message, timestamp: new Date() }]);
    setActionOptions(options);
    await speak(message);
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
      <header className="relative flex flex-col items-center text-center pt-12 pb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-50 to-blue-50 rounded-full border border-violet-100 mb-6">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <span className="text-sm font-medium text-violet-900">AI Assistant</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4">
          Voice Diary
        </h1>
        <p className="text-xl text-gray-500 font-light">
          {conversation.length === 0 ? "How can I help you today?" : "I'm listening..."}
        </p>

        <Link
          to={createPageUrl("Dashboard")}
          className="absolute top-8 right-8 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          ← Dashboard
        </Link>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Voice Orb */}
        <div className="relative mb-12">
          {/* Outer glow */}
          {(isListening || isSpeaking) && (
            <>
              <div className="absolute inset-[-40px] rounded-full bg-gradient-to-br from-[#d4a740]/20 to-[#5f7492]/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-[-30px] rounded-full bg-gradient-to-br from-[#d4a740]/10 to-[#5f7492]/10 blur-3xl" />
            </>
          )}

          {/* Main Orb */}
          <button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={isProcessing || isSpeaking}
            className="relative w-64 h-64 md:w-80 md:h-80 rounded-full transition-all duration-300 disabled:opacity-70"
            style={{
              transform: `scale(${orbScale})`,
              background: 'radial-gradient(ellipse 115% 95% at 50% 8%, #7f91aa 0%, #647b98 20%, #4d647f 56%, #3b4f67 100%)',
              boxShadow: `
                inset 0 1px 0 rgba(255, 255, 255, 0.2),
                inset 0 -24px 50px rgba(37, 52, 72, 0.35),
                inset 0 -8px 20px rgba(37, 52, 72, 0.22),
                0 0 0 1px rgba(214, 177, 100, ${0.22 + micReactive * 0.22}),
                0 ${8 + micReactive * 14}px ${34 + micReactive * 40}px -8px rgba(90, 108, 132, ${0.16 + micReactive * 0.16})
              `,
            }}
          >
            {/* Gold aura */}
            <div
              className="absolute rounded-full bg-[#d6b164] blur-[72px] pointer-events-none"
              style={{
                inset: '-26%',
                opacity: goldGlowOpacity,
                transition: 'opacity 0.09s ease-out'
              }}
            />

            {/* Inner highlight */}
            <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_40%_25%,rgba(255,255,255,0.2),transparent_55%)]" />

            {/* Gold ring */}
            <div
              className="absolute inset-[12%] rounded-full border border-[#d4a740]/40"
              style={{
                opacity: 0.5 + micReactive * 0.5,
                boxShadow: `inset 0 0 ${15 + micReactive * 20}px rgba(212, 167, 64, ${0.1 + micReactive * 0.2})`
              }}
            />

            {/* Status indicator */}
            {isProcessing ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-[#d4a740] animate-spin drop-shadow-lg" />
              </div>
            ) : isSpeaking ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Volume2 className="w-16 h-16 text-[#d4a740] animate-pulse drop-shadow-lg" />
              </div>
            ) : isListening ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-[#d4a740] animate-pulse shadow-lg shadow-[#d4a740]/50" />
              </div>
            ) : null}
          </button>

          {/* Progress bar */}
          {isSpeaking && (
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-48">
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#d4a740] transition-all duration-100"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Status Text */}
        <p className="text-sm text-gray-600 mb-8">
          {isProcessing ? "Processing..." : isSpeaking ? "AI speaking..." : isListening ? "Listening..." : "Hold to speak"}
        </p>

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
