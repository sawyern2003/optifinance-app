import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mic, MicOff, AudioLines, ClipboardList, TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { friendsFamilyInvoiceFields } from "@/lib/invoiceFriendsFamily";
import { resolveInvoiceSendVia } from "@/lib/contactGuards";
import { invoicesAPI, summarizeSendInvoiceResults } from "@/api/invoices";
import { Link } from "react-router-dom";
import { useElevenLabs } from '@/hooks/useElevenLabs';

/** Match voice invoice rows to treatments (same session or DB). */
function normalizeDiaryDate(d) {
  if (d == null || d === "") return "";
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    return format(parseISO(s), "yyyy-MM-dd");
  } catch {
    return s.slice(0, 10);
  }
}

function diaryTreatmentLookupKey(patientName, treatmentName, date) {
  return `${String(patientName || "").trim().toLowerCase()}|${String(treatmentName || "").trim().toLowerCase()}|${normalizeDiaryDate(date)}`;
}

const COURSE_NOTE_RE = /^\s*Course\s*(\d{1,2})\s*[:\-]\s*/i;

function parseCourseNumberFromNotes(notes) {
  const m = String(notes || "").match(COURSE_NOTE_RE);
  return m?.[1] || "";
}

function stripCoursePrefix(notes) {
  return String(notes || "").replace(COURSE_NOTE_RE, "").trim();
}

function batchInvoicePriceLabel(treatment) {
  const charged = Number(treatment?.price_paid || 0);
  const ffApplied =
    treatment?.friends_family_discount_applied === true ||
    treatment?.friends_family_discount_applied === "true";
  const listPrice =
    treatment?.friends_family_list_price != null &&
    treatment?.friends_family_list_price !== ""
      ? Number(treatment.friends_family_list_price)
      : null;
  if (ffApplied && Number.isFinite(listPrice) && listPrice > charged + 0.005) {
    return `£${charged.toFixed(2)} (£${listPrice.toFixed(2)} -> £${charged.toFixed(2)} after discount)`;
  }
  if (ffApplied) {
    return `£${charged.toFixed(2)} (after discount)`;
  }
  return `£${charged.toFixed(2)}`;
}

async function createPendingTreatmentForVoiceInvoice({
  api,
  invoiceData,
  patient,
  treatmentCatalog,
  leadPractitioner,
  treatmentMap,
  invKey,
}) {
  const nameLower = String(invoiceData.treatment_name || "").trim().toLowerCase();
  const catExact = treatmentCatalog.find(
    (t) => t.treatment_name.toLowerCase() === nameLower,
  );
  const catFuzzy =
    catExact ||
    treatmentCatalog.find((t) =>
      nameLower.includes(t.treatment_name.toLowerCase()),
    ) ||
    treatmentCatalog.find((t) =>
      t.treatment_name.toLowerCase().includes(nameLower),
    ) ||
    null;

  const pricePaid =
    Number(invoiceData.amount) > 0
      ? Number(invoiceData.amount)
      : Number(catFuzzy?.default_price) || 0;
  if (!Number.isFinite(pricePaid) || pricePaid <= 0) {
    throw new Error(
      "Add a price on the invoice line or a default price for this treatment in your catalogue.",
    );
  }

  const productCost = Number(catFuzzy?.typical_product_cost) || 0;

  const createdTreatment = await api.entities.TreatmentEntry.create({
    date: invoiceData.date,
    patient_id: patient.id,
    patient_name: patient.name,
    treatment_id: catFuzzy?.id ?? null,
    treatment_name:
      catFuzzy?.treatment_name ||
      String(invoiceData.treatment_name || "").trim(),
    duration_minutes: catFuzzy?.duration_minutes ?? null,
    price_paid: pricePaid,
    payment_status: "pending",
    amount_paid: 0,
    product_cost: productCost,
    profit: 0 - productCost,
    practitioner_id: leadPractitioner?.id ?? null,
    practitioner_name: leadPractitioner?.name || "",
    notes: null,
  });

  treatmentMap.set(invKey, createdTreatment);
  return createdTreatment;
}

function transcriptImpliesInvoiceSend(text) {
  const s = String(text || "").toLowerCase();
  if (
    /\b(don't|do not|dont)\s+send\b/.test(s) ||
    /\bwithout\s+sending\b/.test(s)
  ) {
    return false;
  }
  return (
    /\b(send|email|text|sms)\b[^.]{0,100}\b(invoice|invoices|bill)\b/.test(s) ||
    /\b(invoice|invoices|bill)\b[^.]{0,100}\b(send|email|text)\b/.test(s) ||
    /\bplease\s+send\s+(an?\s+)?(invoice|bill)\b/.test(s)
  );
}

export default function VoiceDiary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transcript, setTranscript] = useState('');
  const [conversation, setConversation] = useState([]);
  const transcriptRef = useRef("");
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const processTranscriptRef = useRef(async () => {});
  const transcriptAtEditStartRef = useRef(null);
  const liveMicBaselineRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isWhisperRecording, setIsWhisperRecording] = useState(false);
  const [isWhisperTranscribing, setIsWhisperTranscribing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRafRef = useRef(null);
  const [pulseLevel, setPulseLevel] = useState(0);
  const [browserSpeechActive, setBrowserSpeechActive] = useState(false);

  // ElevenLabs TTS
  const { speak, isSpeaking, progress } = useElevenLabs();

  const detachMicAnalyser = useCallback(() => {
    if (analyserRafRef.current != null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    try {
      audioContextRef.current?.close?.();
    } catch {
      /* ignore */
    }
    audioContextRef.current = null;
    setPulseLevel(0);
  }, []);

  const attachMicAnalyser = useCallback(
    (stream) => {
      detachMicAnalyser();
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
    },
    [detachMicAnalyser],
  );

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [confirmedData, setConfirmedData] = useState(null);
  const [diaryEditing, setDiaryEditing] = useState(false);

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

  // Calculate today's stats
  const todayStats = React.useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayTreatments = treatments.filter(t => t.date === today);
    const pending = treatments.filter(t => t.payment_status === 'pending').length;

    return {
      treatmentsToday: todayTreatments.length,
      revenueToday: todayTreatments.reduce((sum, t) => sum + (t.amount_paid || 0), 0),
      pendingPayments: pending,
    };
  }, [treatments]);

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
          setTranscript((prev) => {
            const next = prev + finalTranscript;
            transcriptRef.current = next;
            return next;
          });
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
        setBrowserSpeechActive(false);
        const full = (transcriptRef.current || "").trim();
        const grew =
          (transcriptRef.current || "").length > liveMicBaselineRef.current;
        if (full && grew) {
          void processTranscriptRef.current(transcriptRef.current);
        }
      };

      recognitionInstance.onsoundstart = () => setBrowserSpeechActive(true);
      recognitionInstance.onsoundend = () => setBrowserSpeechActive(false);

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
      liveMicBaselineRef.current = (transcriptRef.current || "").length;
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
      attachMicAnalyser(stream);
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
        detachMicAnalyser();
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
            description: "Hold and speak, then release.",
            variant: "destructive",
          });
          return;
        }

        setIsWhisperTranscribing(true);
        let mergedAfterDictate = null;
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

          if (text?.trim()) {
            const trimmed = text.trim();
            const prev = transcriptRef.current || "";
            mergedAfterDictate = (prev.trimEnd() ? `${prev.trimEnd()} ` : "") + trimmed;
            transcriptRef.current = mergedAfterDictate;
            setTranscript(mergedAfterDictate);

            // Add to conversation
            setConversation(prev => [...prev, { role: 'user', content: trimmed, timestamp: new Date() }]);
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
        if (mergedAfterDictate?.trim()) {
          void processTranscriptRef.current(mergedAfterDictate);
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
  }, [
    attachMicAnalyser,
    buildNameHint,
    detachMicAnalyser,
    isRecording,
    recognition,
    toast,
  ]);

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
      detachMicAnalyser();
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
  }, [detachMicAnalyser]);

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  };

  const matchTreatmentToExisting = (patientName, treatmentName, dateHint, amount) => {
    if (!patientName) return null;

    const patient = patients.find(p =>
      p.name.toLowerCase().includes(patientName.toLowerCase()) ||
      patientName.toLowerCase().includes(p.name.toLowerCase())
    );

    if (!patient) return null;

    const patientTreatments = treatments.filter(t =>
      t.patient_id === patient.id && t.payment_status === 'pending'
    );

    if (patientTreatments.length === 0) return null;

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

    if (!matched && dateHint) {
      const hintDate = parseDateHint(dateHint);
      if (hintDate) {
        matched = patientTreatments.find(t => {
          const treatmentDate = parseISO(t.date);
          const diffDays = Math.abs((treatmentDate - hintDate) / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
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

  const processTranscript = async (transcriptOverride) => {
    const textToParse = (
      transcriptOverride != null ? String(transcriptOverride) : transcript
    ).trim();
    if (!textToParse) {
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
        transcript: textToParse,
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
      const rawCatalogTreatments = (response.catalog_treatments || []).filter(
        (t) => String(t.treatment_name || "").trim(),
      );
      const rawExpenses = (response.expenses || []).filter(
        (e) =>
          String(e.category || "").trim() &&
          Number(e.amount ?? 0) > 0,
      );
      const rawClinicalNotes = (response.clinical_notes || []).filter(
        (c) =>
          String(c.patient_name || "").trim() &&
          (String(c.clinical_summary || "").trim() ||
            String(c.raw_narrative || "").trim()),
      );
      let invoiceRows = (response.invoices || []).filter(
        (i) =>
          String(i.patient_name || "").trim() &&
          String(i.treatment_name || "").trim(),
      );

      if (
        invoiceRows.length === 0 &&
        transcriptImpliesInvoiceSend(textToParse) &&
        rawTreatments.some(
          (t) => String(t.payment_status || "").toLowerCase() === "pending",
        )
      ) {
        invoiceRows = rawTreatments
          .filter(
            (t) => String(t.payment_status || "").toLowerCase() === "pending",
          )
          .map((t) => ({
            patient_name: t.patient_name,
            treatment_name: t.treatment_name,
            amount: Number(t.price_paid) || 0,
            date: t.date,
            send_after_create: true,
            send_via: "email",
            patient_contact: null,
          }));
      }

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
        invoiceRows.length === 0 &&
        rawPatients.length === 0 &&
        rawCatalogTreatments.length === 0 &&
        rawExpenses.length === 0 &&
        rawClinicalNotes.length === 0
      ) {
        toast({
          title: "Nothing extracted",
          description:
            "Try naming patients and treatments, amounts, and paid or pending.",
          variant: "destructive",
        });
        setProcessing(false);
        return;
      }

      const processedData = {
        treatments: rawTreatments,
        payment_updates: processedPaymentUpdates,
        invoices: invoiceRows,
        patients: rawPatients,
        catalog_treatments: rawCatalogTreatments,
        expenses: rawExpenses,
        clinical_notes: rawClinicalNotes,
      };

      setExtractedData(processedData);
      setConfirmedData({
        treatments: processedData.treatments.map(t => ({ ...t, include: true })),
        payment_updates: processedPaymentUpdates.map(u => ({ ...u, include: true })),
        invoices: processedData.invoices.map((i) => {
          const explicitNoSend =
            i.send_after_create === false ||
            String(i.send_after_create).toLowerCase() === "false";
          return {
            ...i,
            send_after_create: explicitNoSend ? false : true,
            send_via:
              i.send_via === "sms"
                ? "sms"
                : i.send_via === "both"
                  ? "both"
                  : "email",
            patient_contact: i.patient_contact || null,
            include: true,
          };
        }),
        patients: processedData.patients.map(p => ({ ...p, include: true })),
        catalog_treatments: processedData.catalog_treatments.map((t) => ({
          ...t,
          category: t.category || "Other",
          default_price:
            t.default_price != null && t.default_price !== ""
              ? Number(t.default_price)
              : null,
          typical_product_cost:
            t.typical_product_cost != null && t.typical_product_cost !== ""
              ? Number(t.typical_product_cost)
              : 0,
          default_duration_minutes:
            t.default_duration_minutes != null &&
            t.default_duration_minutes !== ""
              ? Number(t.default_duration_minutes)
              : null,
          include: true,
        })),
        expenses: processedData.expenses.map((e) => ({
          ...e,
          amount: Number(e.amount) || 0,
          date: e.date || format(new Date(), "yyyy-MM-dd"),
          notes: e.notes || null,
          include: true,
        })),
        clinical_notes: (processedData.clinical_notes || []).map((c) => ({
          ...c,
          visit_date: c.visit_date || format(new Date(), "yyyy-MM-dd"),
          include: true,
        })),
      });

      // AI speaks response
      const summary = `I found ${rawTreatments.length} treatment${rawTreatments.length !== 1 ? 's' : ''}, ${invoiceRows.length} invoice${invoiceRows.length !== 1 ? 's' : ''}, and ${rawClinicalNotes.length} clinical note${rawClinicalNotes.length !== 1 ? 's' : ''}. Review and apply when ready.`;
      setConversation(prev => [...prev, { role: 'assistant', content: summary, timestamp: new Date() }]);
      await speak(summary);

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

  processTranscriptRef.current = processTranscript;

  const applyChanges = async () => {
    if (!confirmedData) return;
    setProcessing(true);

    try {
      const leadPractitioner = practitioners.find(p => p.is_lead);
      const catalogLookup = [...treatmentCatalog];

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

      for (const catData of confirmedData.catalog_treatments.filter((t) => t.include)) {
        try {
          const exists = catalogLookup.find(
            (t) =>
              t.treatment_name?.toLowerCase() ===
              String(catData.treatment_name || "").toLowerCase(),
          );
          if (exists) continue;
          const createdCatalog = await api.entities.TreatmentCatalog.create({
            treatment_name: String(catData.treatment_name || "").trim(),
            category: String(catData.category || "Other").trim() || "Other",
            default_price:
              catData.default_price != null ? Number(catData.default_price) : null,
            typical_product_cost: Number(catData.typical_product_cost || 0),
            default_duration_minutes:
              catData.default_duration_minutes != null
                ? Number(catData.default_duration_minutes)
                : null,
          });
          catalogLookup.push(createdCatalog);
        } catch (error) {
          console.error("Failed to create catalogue treatment:", error);
        }
      }

      const treatmentMap = new Map();
      for (const treatmentData of confirmedData.treatments.filter(t => t.include)) {
        try {
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

          const treatment = catalogLookup.find(t =>
            t.treatment_name.toLowerCase() === treatmentData.treatment_name.toLowerCase()
          );

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

          treatmentMap.set(
            diaryTreatmentLookupKey(
              treatmentData.patient_name,
              treatmentData.treatment_name,
              treatmentData.date,
            ),
            createdTreatment,
          );
        } catch (error) {
          console.error('Failed to create treatment:', error);
        }
      }

      for (const cn of (confirmedData.clinical_notes || []).filter((c) => c.include)) {
        try {
          const nameKey = String(cn.patient_name || "").toLowerCase().trim();
          const patient =
            patients.find((p) => p.name.toLowerCase() === nameKey) ||
            patientMap.get(nameKey);
          if (!patient?.id) {
            console.warn("Clinical note skipped: unknown patient", cn.patient_name);
            continue;
          }
          const visitDate = cn.visit_date || format(new Date(), "yyyy-MM-dd");
          let treatmentEntryId = null;
          if (cn.treatment_name && String(cn.treatment_name).trim()) {
            const mapKey = diaryTreatmentLookupKey(
              cn.patient_name,
              cn.treatment_name,
              visitDate,
            );
            const fromMap = treatmentMap.get(mapKey);
            if (fromMap?.id) {
              treatmentEntryId = fromMap.id;
            } else {
              const fromDb = treatments.find(
                (t) =>
                  t.patient_id === patient.id &&
                  normalizeDiaryDate(t.date) === normalizeDiaryDate(visitDate) &&
                  String(t.treatment_name || "").toLowerCase() ===
                    String(cn.treatment_name || "").toLowerCase(),
              );
              treatmentEntryId = fromDb?.id ?? null;
            }
          }
          const structured = {
            procedure_summary: cn.procedure_summary ?? null,
            areas: cn.areas ?? null,
            units: cn.units ?? null,
            complications: cn.complications ?? null,
            patient_feedback: cn.patient_feedback ?? null,
            next_steps: cn.next_steps ?? null,
            clinical_summary:
              String(cn.clinical_summary || "").trim() ||
              String(cn.raw_narrative || "").trim(),
          };
          await api.entities.ClinicalNote.create({
            patient_id: patient.id,
            treatment_entry_id: treatmentEntryId,
            visit_date: visitDate,
            source: "voice_diary",
            raw_narrative: String(cn.raw_narrative || "").trim() || null,
            structured,
          });
        } catch (error) {
          console.error("Failed to save clinical note:", error);
        }
      }

      for (const update of confirmedData.payment_updates.filter(u => u.include && u.matched_treatment)) {
        try {
          const treatment = update.matched_treatment;
          const updatedAmountPaid = treatment.amount_paid + update.amount_paid;
          const isFullyPaid = updatedAmountPaid >= treatment.price_paid;
          const settledAmount = Math.min(updatedAmountPaid, treatment.price_paid);

          await api.entities.TreatmentEntry.update(treatment.id, {
            payment_status: isFullyPaid ? 'paid' : 'partially_paid',
            amount_paid: settledAmount,
            profit: settledAmount - (treatment.product_cost || 0)
          });

          const linkedInvoices = await api.entities.Invoice.filter({
            treatment_entry_id: treatment.id,
          });
          for (const inv of linkedInvoices || []) {
            const nextStatus = isFullyPaid ? 'paid' : 'sent';
            if (inv.status !== nextStatus) {
              await api.entities.Invoice.update(inv.id, {
                ...inv,
                status: nextStatus,
              });
            }
          }
        } catch (error) {
          console.error('Failed to update payment:', error);
        }
      }

      for (const expenseData of confirmedData.expenses.filter((e) => e.include)) {
        try {
          await api.entities.Expense.create({
            date: expenseData.date,
            category: expenseData.category,
            amount: Number(expenseData.amount) || 0,
            notes: expenseData.notes || null,
          });
        } catch (error) {
          console.error("Failed to create expense:", error);
        }
      }

      const patientsForFf = [...patients];
      for (const p of patientMap.values()) {
        if (!patientsForFf.some((x) => x.id === p.id)) patientsForFf.push(p);
      }

      const invoiceSendOutcomes = [];
      const invoiceSkipped = [];
      const batchedPatients = new Set();

      for (const invoiceData of confirmedData.invoices.filter(i => i.include)) {
        try {
          const patient = patients.find(p =>
            p.name.toLowerCase() === invoiceData.patient_name.toLowerCase()
          ) || patientMap.get(invoiceData.patient_name.toLowerCase());

          if (!patient) {
            invoiceSkipped.push(
              `${invoiceData.patient_name}: no patient match (check spelling or add patient first).`,
            );
            continue;
          }

          const invKey = diaryTreatmentLookupKey(
            invoiceData.patient_name,
            invoiceData.treatment_name,
            invoiceData.date,
          );

          let treatment =
            treatments.find((t) => {
              if (t.patient_id !== patient.id) return false;
              if (t.payment_status !== "pending") return false;
              if (
                String(t.treatment_name || "").toLowerCase() !==
                String(invoiceData.treatment_name || "").toLowerCase()
              ) {
                return false;
              }
              return (
                normalizeDiaryDate(t.date) ===
                normalizeDiaryDate(invoiceData.date)
              );
            }) || treatmentMap.get(invKey);

          if (!treatment) {
            try {
              treatment = await createPendingTreatmentForVoiceInvoice({
                api,
                invoiceData,
                patient,
                treatmentCatalog: catalogLookup,
                leadPractitioner,
                treatmentMap,
                invKey,
              });
            } catch (createErr) {
              invoiceSkipped.push(
                `${invoiceData.patient_name} — ${invoiceData.treatment_name} (${normalizeDiaryDate(invoiceData.date)}): ${createErr?.message || "Could not create visit."}`,
              );
              continue;
            }
          }

          const finalContact =
            (invoiceData.patient_contact &&
              String(invoiceData.patient_contact).trim()) ||
            patient.contact ||
            patient.phone ||
            "";

          if (batchedPatients.has(patient.id)) {
            continue;
          }

          const pendingDb = (treatments || [])
            .filter(
              (t) =>
                t.patient_id === patient.id &&
                t.payment_status === "pending",
            );
          const pendingCreated = Array.from(treatmentMap.values()).filter(
            (t) =>
              t.patient_id === patient.id &&
              t.payment_status === "pending",
          );
          const pendingAll = [...pendingDb, ...pendingCreated].sort((a, b) =>
            String(a.date || "").localeCompare(String(b.date || "")),
          );
          const dedup = [];
          const seen = new Set();
          for (const p of pendingAll) {
            const k = String(p.id || `${p.patient_id}|${p.treatment_name}|${p.date}`);
            if (seen.has(k)) continue;
            seen.add(k);
            dedup.push(p);
          }
          const invoiceItems = dedup.length > 0 ? dedup : [treatment];
          const isBatch = invoiceItems.length > 1;
          const totalAmount = invoiceItems.reduce(
            (sum, t) => sum + Number(t.price_paid || 0),
            0,
          );
          const earliestDate = invoiceItems[0]?.date || invoiceData.date;
          const uniqueNames = Array.from(
            new Set(invoiceItems.map((t) => String(t.treatment_name || "").trim()).filter(Boolean)),
          );
          const singleCourse = parseCourseNumberFromNotes(
            treatment?.notes || "",
          );
          const treatmentLabel = isBatch
            ? uniqueNames.length <= 2
              ? uniqueNames.join(" + ")
              : `${uniqueNames.slice(0, 2).join(" + ")} +${uniqueNames.length - 2} more`
            : `${invoiceData.treatment_name}${singleCourse ? ` (Course ${singleCourse})` : ""}`;
          const batchNotes = isBatch
            ? [
                "Batch invoice items:",
                ...invoiceItems.map((t) => {
                  const note = String(t.notes || "").trim();
                  const course = parseCourseNumberFromNotes(note);
                  const cleanNote = stripCoursePrefix(note);
                  const coursePart = course ? ` (Course ${course})` : "";
                  const notePart = cleanNote ? ` | Notes: ${cleanNote}` : "";
                  return `- ${t.date} | ${t.treatment_name}${coursePart} | ${batchInvoicePriceLabel(t)}${notePart}`;
                }),
                `Batch treatment IDs: ${invoiceItems.map((t) => t.id).filter(Boolean).join(",")}`,
              ].join("\n")
            : (treatment.notes || "");

          const invoiceNumber = generateInvoiceNumber();
          const createdInvoice = await api.entities.Invoice.create({
            invoice_number: invoiceNumber,
            treatment_entry_id: invoiceItems[0]?.id || treatment.id,
            patient_name: invoiceData.patient_name,
            patient_contact: finalContact,
            treatment_name: treatmentLabel,
            treatment_date: earliestDate,
            amount: totalAmount > 0 ? totalAmount : invoiceData.amount,
            practitioner_name: treatment.practitioner_name || '',
            issue_date: format(new Date(), 'yyyy-MM-dd'),
            status: 'pending',
            notes: batchNotes,
            ...friendsFamilyInvoiceFields(
              treatment,
              catalogLookup,
              patientsForFf,
            ),
          });
          if (isBatch) batchedPatients.add(patient.id);

          if (invoiceData.send_after_create && createdInvoice?.id) {
            const sendVia = resolveInvoiceSendVia(
              invoiceData.send_via || "both",
              finalContact,
            );
            try {
              await invoicesAPI.generateInvoicePDF(createdInvoice.id);
              const sendData = await invoicesAPI.sendInvoice(
                createdInvoice.id,
                sendVia,
              );
              const summary = summarizeSendInvoiceResults(sendVia, sendData);
              invoiceSendOutcomes.push({
                ok: true,
                patient: invoiceData.patient_name,
                text: summary.description || "Sent.",
              });
            } catch (sendErr) {
              console.error("Voice diary auto-send invoice:", sendErr);
              invoiceSendOutcomes.push({
                ok: false,
                patient: invoiceData.patient_name,
                text: sendErr?.message || "Send failed",
              });
            }
          }
        } catch (error) {
          console.error('Failed to create invoice:', error);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['clinicalNotes'] });

      const sendOk = invoiceSendOutcomes.filter((o) => o.ok);
      const sendBad = invoiceSendOutcomes.filter((o) => !o.ok);
      let description =
        "Your diary entry is saved.";
      if (sendOk.length) {
        description += ` ${sendOk.map((o) => `${o.patient}: ${o.text}`).join(" ")}`;
      }
      if (sendBad.length) {
        description += ` Could not send: ${sendBad.map((o) => `${o.patient} (${o.text})`).join("; ")}.`;
      }
      if (invoiceSkipped.length) {
        description += ` Invoice not created: ${invoiceSkipped.join(" ")}`;
      }

      // AI speaks confirmation
      const confirmMsg = "All changes applied successfully. Your clinic records are updated.";
      setConversation(prev => [...prev, { role: 'assistant', content: confirmMsg, timestamp: new Date() }]);
      await speak(confirmMsg);

      toast({
        title: "Changes applied",
        description,
        className:
          (invoiceSendOutcomes.length > 0 &&
            sendBad.length &&
            !sendOk.length) ||
          (invoiceSkipped.length > 0 &&
            !sendOk.length &&
            confirmedData.invoices.some((i) => i.include))
            ? undefined
            : "bg-green-50 border-green-200",
        variant:
          (sendBad.length && !sendOk.length && invoiceSendOutcomes.length > 0) ||
          (invoiceSkipped.length > 0 &&
            confirmedData.invoices.filter((i) => i.include).length > 0 &&
            !sendOk.length)
            ? "destructive"
            : undefined,
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
    if (!Array.isArray(newData[type]) || !newData[type][index]) return;
    newData[type][index].include = !newData[type][index].include;
    setConfirmedData(newData);
  };

  const inputBusy =
    processing || isWhisperRecording || isWhisperTranscribing;

  const micReactive = isWhisperTranscribing
    ? 0.22
    : isWhisperRecording
      ? pulseLevel
      : isRecording && browserSpeechActive
        ? Math.max(0.38, pulseLevel)
        : isRecording
          ? 0.1
          : 0;

  const orbScale = 1 + micReactive * 0.15;

  return (
    <>
      {/* Professional Cockpit Layout */}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-light text-slate-900 tracking-tight">Clinic Copilot</h1>
              <p className="text-sm text-slate-500 mt-1">Your AI-powered clinical assistant</p>
            </div>
            <Link
              to={createPageUrl("Dashboard")}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
              ← Dashboard
            </Link>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Main Voice Interface - Center Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Voice Orb Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 md:p-12">
                  {/* Stats Bar */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="text-center">
                      <div className="text-2xl font-semibold text-slate-900">{todayStats.treatmentsToday}</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wide mt-1">Treatments Today</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold text-[#d4a740]">£{todayStats.revenueToday.toFixed(0)}</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wide mt-1">Revenue Today</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold text-amber-600">{todayStats.pendingPayments}</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wide mt-1">Pending</div>
                    </div>
                  </div>

                  {/* Voice Orb */}
                  <div className="flex justify-center mb-8">
                    <div className="relative">
                      {/* Outer glow rings */}
                      {(isWhisperRecording || isWhisperTranscribing || isSpeaking) && (
                        <>
                          <div className="absolute inset-[-30px] rounded-full bg-gradient-to-br from-[#d4a740]/20 to-[#1a2845]/20 animate-ping" style={{ animationDuration: '2s' }} />
                          <div className="absolute inset-[-20px] rounded-full bg-gradient-to-br from-[#d4a740]/10 to-[#1a2845]/10 blur-2xl" />
                        </>
                      )}

                      {/* Main orb */}
                      <button
                        onMouseDown={startWhisperRecording}
                        onMouseUp={stopWhisperAndTranscribe}
                        onMouseLeave={stopWhisperAndTranscribe}
                        onTouchStart={startWhisperRecording}
                        onTouchEnd={stopWhisperAndTranscribe}
                        disabled={isWhisperTranscribing || processing}
                        className="relative w-48 h-48 rounded-full transition-all duration-300 disabled:opacity-70 group"
                        style={{
                          transform: `scale(${orbScale})`,
                          background: 'radial-gradient(ellipse 120% 95% at 50% 10%, #4d5f7e 0%, #3a4d68 30%, #2a3b53 60%, #1a2845 100%)',
                          boxShadow: `
                            inset 0 2px 0 rgba(255, 255, 255, 0.15),
                            inset 0 -20px 40px rgba(26, 40, 69, 0.4),
                            0 0 0 1px rgba(212, 167, 64, ${0.2 + micReactive * 0.3}),
                            0 ${10 + micReactive * 20}px ${40 + micReactive * 60}px -10px rgba(212, 167, 64, ${0.15 + micReactive * 0.25})
                          `,
                        }}
                      >
                        {/* Inner highlight */}
                        <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_40%_25%,rgba(255,255,255,0.2),transparent_55%)]" />

                        {/* Gold ring */}
                        <div
                          className="absolute inset-[12%] rounded-full border border-[#d4a740]/40"
                          style={{
                            opacity: 0.5 + micReactive * 0.5,
                            boxShadow: `inset 0 0 ${15 + micReactive * 20}px rgba(212, 167, 64, ${0.1 + micReactive * 0.2})`,
                          }}
                        />

                        {/* Status indicator */}
                        {isWhisperTranscribing ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-12 h-12 text-[#d4a740] animate-spin drop-shadow-lg" />
                          </div>
                        ) : isSpeaking ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-[#d4a740] drop-shadow-lg">
                              <svg className="w-12 h-12 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                              </svg>
                            </div>
                          </div>
                        ) : isWhisperRecording ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 rounded-full bg-[#d4a740] animate-pulse shadow-lg shadow-[#d4a740]/50" />
                          </div>
                        ) : null}
                      </button>

                      {/* Audio progress */}
                      {isSpeaking && (
                        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-32">
                          <div className="h-0.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#d4a740] transition-all duration-100"
                              style={{ width: `${progress * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Text */}
                  <div className="text-center">
                    <p className="text-sm text-slate-600">
                      {isWhisperTranscribing ? (
                        "Processing your voice..."
                      ) : isSpeaking ? (
                        "AI speaking..."
                      ) : isWhisperRecording ? (
                        "Listening - release to process"
                      ) : processing ? (
                        "Analyzing clinic data..."
                      ) : (
                        "Press and hold to speak"
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Conversation Display */}
              {conversation.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-slate-900">Conversation</h3>
                      <button
                        onClick={() => setConversation([])}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {conversation.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                              msg.role === 'user'
                                ? 'bg-slate-100 text-slate-900'
                                : 'bg-[#1a2845] text-white'
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Context Sidebar - Right Column */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-sm font-medium text-slate-900 mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <Link to={createPageUrl("Patients")} className="block p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="text-sm font-medium text-slate-900">View Patients</div>
                    <div className="text-xs text-slate-500 mt-0.5">{patients.length} total patients</div>
                  </Link>
                  <Link to={createPageUrl("Records")} className="block p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="text-sm font-medium text-slate-900">View Records</div>
                    <div className="text-xs text-slate-500 mt-0.5">{treatments.length} total treatments</div>
                  </Link>
                  <Link to={createPageUrl("Calendar")} className="block p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="text-sm font-medium text-slate-900">View Calendar</div>
                    <div className="text-xs text-slate-500 mt-0.5">Manage appointments</div>
                  </Link>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-sm font-medium text-slate-900 mb-4">Recent Treatments</h3>
                <div className="space-y-3">
                  {treatments.slice(0, 5).map((t, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${
                        t.payment_status === 'paid' ? 'bg-green-500' :
                        t.payment_status === 'partially_paid' ? 'bg-amber-500' :
                        'bg-slate-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{t.patient_name}</div>
                        <div className="text-xs text-slate-500">{t.treatment_name} • {format(new Date(t.date), 'MMM d')}</div>
                      </div>
                      <div className="text-sm font-medium text-slate-900">£{(t.amount_paid || 0).toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div className="bg-gradient-to-br from-[#1a2845] to-[#2a3b53] rounded-2xl p-6 text-white">
                <h3 className="text-sm font-medium mb-3">Try saying:</h3>
                <ul className="space-y-2 text-sm opacity-90">
                  <li>"I saw Sarah for Botox today, £250, paid"</li>
                  <li>"Create invoice for John's filler treatment"</li>
                  <li>"Mark Emma's payment as received"</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Review Dialog - Keep existing functionality */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1a2845] tracking-tight">
              Review before saving
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1">
              Toggle items off if something looks wrong, then apply changes to your clinic records.
            </DialogDescription>
          </DialogHeader>

          {confirmedData && (
            <div className="space-y-6 mt-4">
              {/* Treatments */}
              {confirmedData.treatments.length > 0 && (
                <div className="space-y-3">
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
                        className={`bg-white rounded-xl p-4 border transition-all ${
                          treatment.include ? 'border-[#1a2845]' : 'border-gray-200 opacity-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={treatment.include}
                            onChange={() => toggleInclude('treatments', index)}
                            className="w-4 h-4 text-[#1a2845] border-gray-300 rounded mt-0.5"
                          />
                          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div>
                              <span className="text-xs text-gray-500 uppercase tracking-wide">Patient</span>
                              <p className="text-gray-900">{treatment.patient_name}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 uppercase tracking-wide">Treatment</span>
                              <p className="text-gray-900">{treatment.treatment_name}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 uppercase tracking-wide">Date</span>
                              <p className="text-gray-900">{treatment.date}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 uppercase tracking-wide">Amount</span>
                              <p className="text-gray-900">£{treatment.price_paid?.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoices */}
              {confirmedData.invoices.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                      Invoices
                    </h3>
                    <span className="text-xs text-gray-500">
                      {confirmedData.invoices.filter(i => i.include).length} selected
                    </span>
                  </div>
                  <div className="space-y-2">
                    {confirmedData.invoices.map((invoice, index) => (
                      <div
                        key={index}
                        className={`bg-white rounded-xl p-4 border transition-all ${
                          invoice.include ? 'border-[#1a2845]' : 'border-gray-200 opacity-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={invoice.include}
                            onChange={() => toggleInclude('invoices', index)}
                            className="w-4 h-4 text-[#1a2845] border-gray-300 rounded mt-0.5"
                          />
                          <div className="flex-1 text-sm">
                            <div className="font-medium text-gray-900">{invoice.patient_name}</div>
                            <div className="text-gray-600 mt-1">{invoice.treatment_name} • £{invoice.amount?.toFixed(2)}</div>
                            {invoice.send_after_create && (
                              <div className="text-xs text-green-700 mt-2">
                                Will send via {invoice.send_via}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clinical Notes */}
              {(confirmedData.clinical_notes || []).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                      Clinical Notes
                    </h3>
                    <span className="text-xs text-gray-500">
                      {(confirmedData.clinical_notes || []).filter((c) => c.include).length} selected
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(confirmedData.clinical_notes || []).map((cn, index) => (
                      <div
                        key={index}
                        className={`bg-white rounded-xl p-4 border transition-all ${
                          cn.include ? "border-[#1a2845]" : "border-gray-200 opacity-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={cn.include}
                            onChange={() => toggleInclude("clinical_notes", index)}
                            className="w-4 h-4 text-[#1a2845] border-gray-300 rounded mt-0.5"
                          />
                          <div className="flex-1 text-sm">
                            <div className="font-medium text-gray-900">{cn.patient_name}</div>
                            <div className="text-gray-600 mt-1">{cn.clinical_summary || cn.raw_narrative}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
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
                  className="flex-1 bg-[#1a2845] hover:bg-[#0f1829] text-white"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Applying
                    </>
                  ) : (
                    'Apply Changes'
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
