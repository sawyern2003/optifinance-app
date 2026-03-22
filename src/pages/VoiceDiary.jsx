import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mic, MicOff, AudioLines } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { friendsFamilyInvoiceFields } from "@/lib/invoiceFriendsFamily";
import { Link } from "react-router-dom";

/** Bar heights for the horizontal waveform (deterministic, not random per render). */
const WAVE_HEIGHTS = Array.from({ length: 56 }, (_, i) => {
  const wobble =
    Math.sin(i * 0.51) * 10 + Math.cos(i * 0.19) * 7 + Math.sin(i * 0.11) * 4;
  return Math.max(5, Math.round(12 + wobble + (i % 5) * 2));
});

export default function VoiceDiary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isWhisperRecording, setIsWhisperRecording] = useState(false);
  const [isWhisperTranscribing, setIsWhisperTranscribing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [confirmedData, setConfirmedData] = useState(null);

  const { data: treatmentCatalog } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => api.entities.TreatmentCatalog.list('treatment_name'),
    initialData: [],
  });

  const { data: practitioners } = useQuery({
    queryKey: ['practitioners'],
    queryFn: () => api.entities.Practitioner.list('name'),
    initialData: [],
  });

  const { data: patients } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api.entities.Patient.list('name'),
    initialData: [],
  });

  const { data: treatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-GB';

      recognitionInstance.onresult = (event) => {
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          }
        }

        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript);
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        if (event.error === 'no-speech') {
          toast({
            title: "No speech detected",
            description: "Please try speaking again",
            variant: "destructive"
          });
        }
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      setRecognition(recognitionInstance);
    }
  }, [toast]);

  const toggleRecording = () => {
    if (isWhisperRecording || isWhisperTranscribing) return;
    if (!recognition) {
      toast({
        title: "Speech not available",
        description: "Use Record (accurate) or try Chrome on desktop.",
        variant: "destructive"
      });
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      recognition.start();
      setIsRecording(true);
    }
  };

  const pickRecorderMime = () => {
    if (typeof MediaRecorder === "undefined") return "";
    const c = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    for (const t of c) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  };

  const buildNameHint = useCallback(() => {
    const names = (patients || [])
      .map((p) => p.name)
      .filter(Boolean)
      .slice(0, 24);
    const tail = names.length
      ? `Likely patient names: ${names.join(", ")}.`
      : "";
    return `UK aesthetic clinic diary. ${tail}`.trim().slice(0, 220);
  }, [patients]);

  const stopWhisperAndTranscribe = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") return;
    rec.stop();
  }, []);

  const startWhisperRecording = useCallback(async () => {
    if (isRecording) {
      recognition?.stop?.();
      setIsRecording(false);
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        title: "Microphone not supported",
        description: "Try another browser or device.",
        variant: "destructive",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];
      const mime = pickRecorderMime();
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        setIsWhisperRecording(false);
        const streamDone = mediaStreamRef.current;
        mediaStreamRef.current = null;
        streamDone?.getTracks().forEach((t) => t.stop());

        const blob = new Blob(mediaChunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        mediaChunksRef.current = [];
        mediaRecorderRef.current = null;

        if (blob.size < 200) {
          toast({
            title: "Too short",
            description: "Hold Record and speak, then tap Stop.",
            variant: "destructive",
          });
          return;
        }

        setIsWhisperTranscribing(true);
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result);
            r.onerror = () => reject(new Error("read failed"));
            r.readAsDataURL(blob);
          });
          const base64 = String(dataUrl).split(",")[1];
          if (!base64) throw new Error("Could not read audio");

          const { text } = await api.integrations.Core.TranscribeAudio({
            audioBase64: base64,
            mimeType: blob.type || "audio/webm",
            nameHint: buildNameHint(),
          });

          if (text) {
            setTranscript((prev) =>
              (prev ? `${prev.trimEnd()} ` : "") + text.trim(),
            );
          }
        } catch (err) {
          console.error(err);
          toast({
            title: "Transcription failed",
            description: err?.message || "Try again or type instead.",
            variant: "destructive",
          });
        } finally {
          setIsWhisperTranscribing(false);
        }
      };

      mr.start(250);
      setIsWhisperRecording(true);
    } catch (e) {
      console.error(e);
      toast({
        title: "Microphone blocked",
        description: "Allow mic access for this site and try again.",
        variant: "destructive",
      });
    }
  }, [buildNameHint, isRecording, recognition, toast]);

  const toggleWhisperRecording = useCallback(() => {
    if (isWhisperTranscribing) return;
    if (isWhisperRecording) {
      stopWhisperAndTranscribe();
    } else {
      startWhisperRecording();
    }
  }, [
    isWhisperRecording,
    isWhisperTranscribing,
    startWhisperRecording,
    stopWhisperAndTranscribe,
  ]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  };

  // Match voice input to existing treatments for payment updates
  const matchTreatmentToExisting = (patientName, treatmentName, dateHint, amount) => {
    if (!patientName) return null;

    const patient = patients.find(p => 
      p.name.toLowerCase().includes(patientName.toLowerCase()) ||
      patientName.toLowerCase().includes(p.name.toLowerCase())
    );

    if (!patient) return null;

    // Find treatments for this patient
    const patientTreatments = treatments.filter(t => 
      t.patient_id === patient.id && t.payment_status === 'pending'
    );

    if (patientTreatments.length === 0) return null;

    // Try to match by treatment name and amount
    let matched = patientTreatments.find(t => {
      const nameMatch = treatmentName && (
        t.treatment_name.toLowerCase().includes(treatmentName.toLowerCase()) ||
        treatmentName.toLowerCase().includes(t.treatment_name.toLowerCase())
      );
      const amountMatch = amount && Math.abs(t.price_paid - amount) < 0.01;
      return nameMatch && amountMatch;
    });

    if (!matched && patientTreatments.length === 1) {
      matched = patientTreatments[0];
    }

    // If date hint provided, try to match by date
    if (!matched && dateHint) {
      const hintDate = parseDateHint(dateHint);
      if (hintDate) {
        matched = patientTreatments.find(t => {
          const treatmentDate = parseISO(t.date);
          const diffDays = Math.abs((treatmentDate - hintDate) / (1000 * 60 * 60 * 24));
          return diffDays <= 7; // Within 7 days
        });
      }
    }

    return matched || patientTreatments[0] || null;
  };

  const parseDateHint = (hint) => {
    const today = new Date();
    const lowerHint = hint.toLowerCase();

    if (lowerHint.includes('today')) return today;
    if (lowerHint.includes('yesterday')) return subDays(today, 1);
    if (lowerHint.includes('last week')) return subDays(today, 7);
    if (lowerHint.includes('week ago')) return subDays(today, 7);
    if (lowerHint.includes('last month')) return subDays(today, 30);

    return null;
  };

  const processTranscript = async () => {
    if (!transcript.trim()) {
      toast({
        title: "No transcript",
        description: "Please record or enter some text first",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);

    try {
      const todayDate = format(new Date(), 'yyyy-MM-dd');
      const yesterdayDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      const response = await api.integrations.Core.ParseVoiceDiary({
        transcript: transcript.trim(),
        todayDate,
        yesterdayDate,
        treatmentsCatalog: treatmentCatalog.map((t) => ({
          treatment_name: t.treatment_name,
          default_price: t.default_price ?? null,
          duration_minutes: t.duration_minutes ?? null,
        })),
        practitionerNames: practitioners.map((p) => p.name),
        patientNames: patients.map((p) => p.name),
        recentPending: treatments
          .filter((t) => t.payment_status === 'pending')
          .slice(0, 10)
          .map((t) => ({
            patient_name: t.patient_name,
            treatment_name: t.treatment_name,
            price_paid: Number(t.price_paid) || 0,
            date: t.date,
          })),
      });

      const rawTreatments = (response.treatments || []).filter(
        (t) =>
          String(t.patient_name || "").trim() &&
          String(t.treatment_name || "").trim(),
      );
      const rawPatients = (response.patients || []).filter((p) =>
        String(p.name || "").trim(),
      );
      const rawInvoices = (response.invoices || []).filter(
        (i) =>
          String(i.patient_name || "").trim() &&
          String(i.treatment_name || "").trim(),
      );

      // Process payment updates to match with existing treatments
      const processedPaymentUpdates = (response.payment_updates || [])
        .filter(
          (u) => String(u.patient_name || "").trim() && u.amount_paid != null,
        )
        .map((update) => {
          const matchedTreatment = matchTreatmentToExisting(
            update.patient_name,
            update.treatment_name,
            update.date_hint,
            update.amount_paid,
          );
          return {
            ...update,
            matched_treatment: matchedTreatment,
          };
        });

      if (
        rawTreatments.length === 0 &&
        processedPaymentUpdates.length === 0 &&
        rawInvoices.length === 0 &&
        rawPatients.length === 0
      ) {
        toast({
          title: "Nothing extracted",
          description:
            "Try naming patients and treatments, amounts, and paid or pending. Check your catalogue has those treatments.",
          variant: "destructive",
        });
        setProcessing(false);
        return;
      }

      const processedData = {
        treatments: rawTreatments,
        payment_updates: processedPaymentUpdates,
        invoices: rawInvoices,
        patients: rawPatients,
      };

      setExtractedData(processedData);
      setConfirmedData({
        treatments: processedData.treatments.map(t => ({ ...t, include: true })),
        payment_updates: processedPaymentUpdates.map(u => ({ ...u, include: true })),
        invoices: processedData.invoices.map(i => ({ ...i, include: true })),
        patients: processedData.patients.map(p => ({ ...p, include: true }))
      });
      setReviewDialogOpen(true);
      setProcessing(false);

    } catch (error) {
      console.error('Processing failed:', error);
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process voice diary entry",
        variant: "destructive"
      });
      setProcessing(false);
    }
  };

  const applyChanges = async () => {
    if (!confirmedData) return;

    setProcessing(true);

    try {
      const leadPractitioner = practitioners.find(p => p.is_lead);

      // Create new patients first
      const patientMap = new Map();
      for (const patientData of confirmedData.patients.filter(p => p.include)) {
        try {
          const newPatient = await api.entities.Patient.create({
            name: patientData.name,
            contact: patientData.contact || null,
            phone: patientData.phone || null
          });
          patientMap.set(patientData.name.toLowerCase(), newPatient);
        } catch (error) {
          console.error('Failed to create patient:', error);
        }
      }

      // Create new treatments
      const treatmentMap = new Map();
      for (const treatmentData of confirmedData.treatments.filter(t => t.include)) {
        try {
          // Find or create patient
          let patientId = null;
          let patientName = treatmentData.patient_name;
          const existingPatient = patients.find(p => 
            p.name.toLowerCase() === treatmentData.patient_name.toLowerCase()
          ) || patientMap.get(treatmentData.patient_name.toLowerCase());

          if (existingPatient) {
            patientId = existingPatient.id;
            patientName = existingPatient.name;
          } else if (patientMap.has(treatmentData.patient_name.toLowerCase())) {
            const newPatient = patientMap.get(treatmentData.patient_name.toLowerCase());
            patientId = newPatient.id;
            patientName = newPatient.name;
          }

          // Find treatment from catalog
          const treatment = treatmentCatalog.find(t => 
            t.treatment_name.toLowerCase() === treatmentData.treatment_name.toLowerCase()
          );

          // Find practitioner
          const practitioner = treatmentData.practitioner_name
            ? practitioners.find(p => 
                p.name.toLowerCase() === treatmentData.practitioner_name.toLowerCase()
              ) || leadPractitioner
            : leadPractitioner;

          const productCost = treatment?.typical_product_cost || 0;
          const pricePaid = treatmentData.price_paid || treatment?.default_price || 0;
          const amountPaid = treatmentData.payment_status === 'partially_paid'
            ? treatmentData.amount_paid
            : (treatmentData.payment_status === 'paid' ? pricePaid : 0);
          const profit = amountPaid - productCost;

          const createdTreatment = await api.entities.TreatmentEntry.create({
            date: treatmentData.date,
            patient_id: patientId,
            patient_name: patientName,
            treatment_id: treatment?.id,
            treatment_name: treatment?.treatment_name || treatmentData.treatment_name,
            duration_minutes: treatmentData.duration_minutes || treatment?.duration_minutes,
            price_paid: pricePaid,
            payment_status: treatmentData.payment_status,
            amount_paid: amountPaid,
            product_cost: productCost,
            profit: profit,
            practitioner_id: practitioner?.id,
            practitioner_name: practitioner?.name || treatmentData.practitioner_name,
            notes: treatmentData.notes || null
          });

          treatmentMap.set(`${treatmentData.patient_name}-${treatmentData.treatment_name}-${treatmentData.date}`, createdTreatment);
        } catch (error) {
          console.error('Failed to create treatment:', error);
        }
      }

      // Update payment status for existing treatments
      for (const update of confirmedData.payment_updates.filter(u => u.include && u.matched_treatment)) {
        try {
          const treatment = update.matched_treatment;
          const updatedAmountPaid = treatment.amount_paid + update.amount_paid;
          const isFullyPaid = updatedAmountPaid >= treatment.price_paid;

          await api.entities.TreatmentEntry.update(treatment.id, {
            payment_status: isFullyPaid ? 'paid' : 'partially_paid',
            amount_paid: Math.min(updatedAmountPaid, treatment.price_paid),
            profit: Math.min(updatedAmountPaid, treatment.price_paid) - (treatment.product_cost || 0)
          });
        } catch (error) {
          console.error('Failed to update payment:', error);
        }
      }

      const patientsForFf = [...patients];
      for (const p of patientMap.values()) {
        if (!patientsForFf.some((x) => x.id === p.id)) patientsForFf.push(p);
      }

      // Create invoices for pending treatments
      for (const invoiceData of confirmedData.invoices.filter(i => i.include)) {
        try {
          const patient = patients.find(p => 
            p.name.toLowerCase() === invoiceData.patient_name.toLowerCase()
          ) || patientMap.get(invoiceData.patient_name.toLowerCase());

          if (!patient) continue;

          // Find the treatment
          const treatment = treatments.find(t => 
            t.patient_id === patient.id &&
            t.treatment_name.toLowerCase() === invoiceData.treatment_name.toLowerCase() &&
            t.date === invoiceData.date &&
            t.payment_status === 'pending'
          ) || treatmentMap.get(`${invoiceData.patient_name}-${invoiceData.treatment_name}-${invoiceData.date}`);

          if (!treatment) continue;

          const invoiceNumber = generateInvoiceNumber();
          await api.entities.Invoice.create({
            invoice_number: invoiceNumber,
            treatment_entry_id: treatment.id,
            patient_name: invoiceData.patient_name,
            patient_contact: patient.contact || patient.phone || '',
            treatment_name: invoiceData.treatment_name,
            treatment_date: invoiceData.date,
            amount: invoiceData.amount,
            practitioner_name: treatment.practitioner_name || '',
            issue_date: format(new Date(), 'yyyy-MM-dd'),
            status: 'sent',
            notes: '',
            ...friendsFamilyInvoiceFields(
              treatment,
              treatmentCatalog,
              patientsForFf,
            ),
          });
        } catch (error) {
          console.error('Failed to create invoice:', error);
        }
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });

      toast({
        title: "Changes applied",
        description: "Your diary entry is saved. Open the dashboard or records anytime.",
        className: "bg-green-50 border-green-200"
      });

      setReviewDialogOpen(false);
      setTranscript('');
      setExtractedData(null);
      setConfirmedData(null);
      setProcessing(false);

    } catch (error) {
      console.error('Failed to apply changes:', error);
      toast({
        title: "Failed to apply changes",
        description: error.message || "An error occurred",
        variant: "destructive"
      });
      setProcessing(false);
    }
  };

  const toggleInclude = (type, index) => {
    const newData = { ...confirmedData };
    newData[type][index].include = !newData[type][index].include;
    setConfirmedData(newData);
  };

  const inputBusy =
    processing || isWhisperRecording || isWhisperTranscribing;
  const orbEnergized =
    isWhisperRecording || isRecording || isWhisperTranscribing;

  return (
    <>
      <div className="relative min-h-screen overflow-x-hidden bg-[#030708] text-white selection:bg-cyan-500/30">
        {/* Atmosphere */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#071218] via-[#0d2529] to-[#050a0c]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,rgba(45,212,191,0.14),transparent_58%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_45%_at_100%_80%,rgba(56,189,248,0.08),transparent)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_0%_60%,rgba(99,102,241,0.06),transparent)]"
          aria-hidden
        />

        {/* Top bar */}
        <header className="relative z-30 flex items-center justify-between px-5 pt-5 md:px-10 md:pt-8">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Voice
          </span>
          <div className="flex items-center gap-2">
            {recognition ? (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={inputBusy && !isRecording}
                title="Browser live captions — less accurate for names"
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30 ${
                  isRecording ? "border-cyan-400/40 text-cyan-200" : ""
                }`}
              >
                {isRecording ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            ) : null}
            <Link
              to={createPageUrl("Dashboard")}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/55 transition hover:border-white/20 hover:text-white/90"
            >
              Done
            </Link>
          </div>
        </header>

        {/* Waveform strip (crosses the stage) */}
        <div
          className={`pointer-events-none absolute left-0 right-0 top-[38%] z-10 flex h-16 -translate-y-1/2 items-end justify-center gap-[3px] px-6 opacity-90 md:top-[40%] md:px-16 ${
            orbEnergized ? "" : "vd-wave-calm opacity-55"
          }`}
          aria-hidden
        >
          {WAVE_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="vd-wave-bar w-[2px] shrink-0 rounded-full bg-gradient-to-t from-teal-300/25 via-cyan-200/80 to-white"
              style={{
                height: `${h}px`,
                animationDelay: `${i * 0.035}s`,
              }}
            />
          ))}
        </div>

        {/* Interactive orb */}
        <div className="relative z-20 mx-auto flex max-w-lg flex-col items-center px-6 pt-4 pb-2 md:pt-10">
          <div className="relative grid h-[min(72vw,17.5rem)] w-[min(72vw,17.5rem)] place-items-center md:h-[19rem] md:w-[19rem]">
            <div
              className={`absolute inset-[-22%] rounded-full blur-[56px] ${
                isWhisperRecording
                  ? "bg-rose-500/25 vd-orb-glow-intense"
                  : "bg-cyan-400/20 vd-orb-glow"
              }`}
              aria-hidden
            />
            <div
              className="vd-orb-ring absolute inset-[-8%] rounded-full opacity-[0.55]"
              style={{
                background:
                  "conic-gradient(from 200deg, transparent 0%, rgba(34,211,238,0.35) 18%, transparent 38%, rgba(129,140,248,0.35) 58%, transparent 78%, rgba(45,212,191,0.2) 100%)",
              }}
              aria-hidden
            />
            <div
              className="absolute inset-0 rounded-full border border-white/[0.09] bg-gradient-to-br from-cyan-500/[0.12] via-slate-950/50 to-[#020617]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_0_100px_-20px_rgba(34,211,238,0.35)] backdrop-blur-[2px]"
              aria-hidden
            >
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(165,243,252,0.18),transparent_52%)]" />
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_72%_68%,rgba(129,140,248,0.15),transparent_48%)]" />
              <div
                className="absolute inset-[12%] rounded-full opacity-40 mix-blend-screen"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.07), transparent 70%)",
                }}
              />
            </div>

            <button
              type="button"
              onClick={toggleWhisperRecording}
              disabled={isWhisperTranscribing || (processing && !isWhisperRecording)}
              className="relative z-10 flex items-center gap-2 rounded-full bg-[#0a0a0a] px-5 py-2.5 text-[13px] font-medium tracking-tight text-white shadow-[0_12px_40px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.12] transition hover:ring-white/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
            >
              {isWhisperTranscribing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                  Working…
                </>
              ) : isWhisperRecording ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
                  </span>
                  Stop
                </>
              ) : (
                <>
                  <AudioLines className="h-4 w-4 text-cyan-300" />
                  Dictate
                </>
              )}
            </button>
          </div>

          <p className="mt-7 max-w-[14rem] text-center text-[11px] leading-relaxed text-white/32">
            {isWhisperTranscribing
              ? "Transcribing…"
              : isWhisperRecording
                ? "Tap stop when finished"
                : "Whisper + your patient names as hints"}
          </p>
        </div>

        {/* Glass dock */}
        <div className="relative z-20 mx-auto mt-6 w-full max-w-lg px-5 pb-10 md:px-6">
          <div className="rounded-[1.25rem] border border-white/[0.08] bg-white/[0.04] p-4 shadow-[0_-8px_48px_-12px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <Textarea
              id="voice-diary-input"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your note appears here — or type directly."
              className="min-h-[140px] resize-y rounded-xl border-white/10 bg-black/25 text-[14px] leading-relaxed text-white/90 placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-cyan-400/40"
              disabled={processing}
            />
            <Button
              type="button"
              onClick={processTranscript}
              disabled={
                processing ||
                !transcript.trim() ||
                isRecording ||
                isWhisperRecording ||
                isWhisperTranscribing
              }
              className="mt-3 h-11 w-full rounded-xl border-0 bg-gradient-to-r from-teal-400 via-cyan-400 to-sky-400 text-[13px] font-semibold text-slate-950 shadow-[0_0_24px_-4px_rgba(34,211,238,0.45)] hover:from-teal-300 hover:via-cyan-300 hover:to-sky-300 disabled:from-white/10 disabled:via-white/10 disabled:to-white/10 disabled:text-white/25 disabled:shadow-none"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parse…
                </>
              ) : isRecording ? (
                "Stop live mic first"
              ) : isWhisperRecording ? (
                "Stop dictate first"
              ) : (
                "Parse & review"
              )}
            </Button>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-[11px] text-white/30">
            <Link
              to={createPageUrl("Dashboard")}
              className="hover:text-white/60"
            >
              Dashboard
            </Link>
            <Link
              to={createPageUrl("Records")}
              className="hover:text-white/60"
            >
              Records
            </Link>
          </div>
        </div>
      </div>

      {/* Review Dialog */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border-slate-200">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-[#1a2845] tracking-tight">
                Review before saving
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 pt-1">
                Toggle items off if something looks wrong, then apply.
              </DialogDescription>
            </DialogHeader>

            {confirmedData && (
              <div className="space-y-6 mt-4">
                {/* New Treatments */}
                {confirmedData.treatments.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                        New Treatments
                      </h3>
                      <span className="text-xs text-gray-500 font-light">
                        {confirmedData.treatments.filter(t => t.include).length} selected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {confirmedData.treatments.map((treatment, index) => (
                        <div
                          key={index}
                          className={`bg-white rounded-lg p-4 border transition-all ${
                            treatment.include ? 'border-[#1a2845] bg-gray-50/50' : 'border-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={treatment.include}
                              onChange={() => toggleInclude('treatments', index)}
                              className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-[#1a2845] mt-0.5"
                            />
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Patient</span>
                                <p className="text-gray-900 font-light">{treatment.patient_name}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Treatment</span>
                                <p className="text-gray-900 font-light">{treatment.treatment_name}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Date</span>
                                <p className="text-gray-900 font-light">{treatment.date}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Amount</span>
                                <p className="text-gray-900 font-light">£{treatment.price_paid?.toFixed(2)}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Status</span>
                                <p className="text-gray-900 font-light capitalize">{treatment.payment_status}</p>
                              </div>
                              {treatment.practitioner_name && (
                                <div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">Practitioner</span>
                                  <p className="text-gray-900 font-light">{treatment.practitioner_name}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment Updates */}
                {confirmedData.payment_updates.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                        Payment Updates
                      </h3>
                      <span className="text-xs text-gray-500 font-light">
                        {confirmedData.payment_updates.filter(u => u.include).length} selected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {confirmedData.payment_updates.map((update, index) => (
                        <div
                          key={index}
                          className={`bg-white rounded-lg p-4 border transition-all ${
                            update.include ? 'border-[#1a2845] bg-gray-50/50' : 'border-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={update.include}
                              onChange={() => toggleInclude('payment_updates', index)}
                              className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-[#1a2845] mt-0.5"
                            />
                            <div className="flex-1">
                              {update.matched_treatment ? (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                  <div>
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Patient</span>
                                    <p className="text-gray-900 font-light">{update.patient_name}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Amount</span>
                                    <p className="text-gray-900 font-light">£{update.amount_paid?.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Treatment</span>
                                    <p className="text-gray-900 font-light">{update.matched_treatment.treatment_name}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Date</span>
                                    <p className="text-gray-900 font-light">{update.matched_treatment.date}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm">
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-2">
                                    <div>
                                      <span className="text-xs text-gray-500 uppercase tracking-wide">Patient</span>
                                      <p className="text-gray-900 font-light">{update.patient_name}</p>
                                    </div>
                                    <div>
                                      <span className="text-xs text-gray-500 uppercase tracking-wide">Amount</span>
                                      <p className="text-gray-900 font-light">£{update.amount_paid?.toFixed(2)}</p>
                                    </div>
                                  </div>
                                  <p className="text-xs text-amber-600 font-light">No matching treatment found</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Invoices */}
                {confirmedData.invoices.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                        Invoices to Create
                      </h3>
                      <span className="text-xs text-gray-500 font-light">
                        {confirmedData.invoices.filter(i => i.include).length} selected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {confirmedData.invoices.map((invoice, index) => (
                        <div
                          key={index}
                          className={`bg-white rounded-lg p-4 border transition-all ${
                            invoice.include ? 'border-[#1a2845] bg-gray-50/50' : 'border-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={invoice.include}
                              onChange={() => toggleInclude('invoices', index)}
                              className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-[#1a2845] mt-0.5"
                            />
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Patient</span>
                                <p className="text-gray-900 font-light">{invoice.patient_name}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Treatment</span>
                                <p className="text-gray-900 font-light">{invoice.treatment_name}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Amount</span>
                                <p className="text-gray-900 font-light">£{invoice.amount?.toFixed(2)}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Date</span>
                                <p className="text-gray-900 font-light">{invoice.date}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Patients */}
                {confirmedData.patients.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                        New Patients
                      </h3>
                      <span className="text-xs text-gray-500 font-light">
                        {confirmedData.patients.filter(p => p.include).length} selected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {confirmedData.patients.map((patient, index) => (
                        <div
                          key={index}
                          className={`bg-white rounded-lg p-4 border transition-all ${
                            patient.include ? 'border-[#1a2845] bg-gray-50/50' : 'border-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={patient.include}
                              onChange={() => toggleInclude('patients', index)}
                              className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-[#1a2845] mt-0.5"
                            />
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Name</span>
                                <p className="text-gray-900 font-light">{patient.name}</p>
                              </div>
                              {patient.contact && (
                                <div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">Contact</span>
                                  <p className="text-gray-900 font-light">{patient.contact}</p>
                                </div>
                              )}
                              {patient.phone && (
                                <div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">Phone</span>
                                  <p className="text-gray-900 font-light">{patient.phone}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <Button
                    onClick={() => setReviewDialogOpen(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={applyChanges}
                    disabled={processing}
                    className="flex-1 bg-[#1a2845] hover:bg-[#0f1829] text-white font-light tracking-wide uppercase text-sm h-10"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Applying
                      </>
                    ) : (
                      'Apply All Changes'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
    </>
  );
}