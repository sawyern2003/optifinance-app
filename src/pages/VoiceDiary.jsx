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
import { resolveInvoiceSendVia } from "@/lib/contactGuards";
import { invoicesAPI, summarizeSendInvoiceResults } from "@/api/invoices";
import { Link } from "react-router-dom";

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

/** Model often returns only treatments[]; user said "send invoice" → still need an invoice row to run PDF/send. */
/**
 * Invoice row with no matching visit: create pending treatment, then invoice/PDF/email can run.
 */
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
  const transcriptRef = useRef("");
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  /** Set after `processTranscript` is defined; used from Whisper `onstop` for auto-parse */
  const processTranscriptRef = useRef(async () => {});
  /** Snapshot when opening Edit text — parse on Done only if transcript changed */
  const transcriptAtEditStartRef = useRef(null);
  /** Live mic: only auto-parse on stop if transcript grew since recording started */
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
  /** Read-only typewriter view vs plain textarea */
  const [diaryEditing, setDiaryEditing] = useState(false);
  const [revealText, setRevealText] = useState("");

  // Keep typewriter display in sync; animate only when not editing
  useEffect(() => {
    if (diaryEditing) {
      setRevealText(transcript);
      return;
    }
    if (!transcript) {
      setRevealText("");
      return;
    }
    setRevealText((prev) => {
      if (transcript.length < prev.length) return transcript;
      if (prev.length > 0 && !transcript.startsWith(prev)) return transcript;
      return prev;
    });
  }, [transcript, diaryEditing]);

  useEffect(() => {
    if (diaryEditing) return;
    if (!transcript) return;
    if (revealText.length >= transcript.length) return;
    const t = setTimeout(() => {
      const behind = transcript.length - revealText.length;
      const chunk = Math.min(Math.max(1, Math.ceil(behind / 8)), 4);
      setRevealText((prev) => transcript.slice(0, prev.length + chunk));
    }, 28);
    return () => clearTimeout(t);
  }, [revealText, transcript, diaryEditing]);

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
            description: "Hold Record and speak, then tap Stop.",
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
        invoiceRows.length === 0 &&
        rawPatients.length === 0 &&
        rawCatalogTreatments.length === 0 &&
        rawExpenses.length === 0
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
        invoices: invoiceRows,
        patients: rawPatients,
        catalog_treatments: rawCatalogTreatments,
        expenses: rawExpenses,
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
            // Default ON: LLM often omits send_after_create; user can turn off in review.
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
        patients: processedData.patients.map(p => ({ ...p, include: true }))
        ,
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

  processTranscriptRef.current = processTranscript;

  const applyChanges = async () => {
    if (!confirmedData) return;

    setProcessing(true);

    try {
      const leadPractitioner = practitioners.find(p => p.is_lead);
      const catalogLookup = [...treatmentCatalog];

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

      // Add new treatments to Catalogue (optional, from voice diary)
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
          const treatment = catalogLookup.find(t => 
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

      // Update payment status for existing treatments
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

          // Keep invoice state in sync when payments are confirmed by voice diary.
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

      // Create expenses from voice diary
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

      /** After voice diary apply: PDF + send-invoice when send_after_create */
      const invoiceSendOutcomes = [];
      const invoiceSkipped = [];
      const batchedPatients = new Set();

      // Create invoices for pending treatments
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

          // Find the treatment (DB or just created this run; case-insensitive names + normalized dates)
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
                catalogLookup,
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
                  return `- ${t.date} | ${t.treatment_name}${coursePart} | £${Number(t.price_paid || 0).toFixed(2)}${notePart}`;
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

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });

      const sendOk = invoiceSendOutcomes.filter((o) => o.ok);
      const sendBad = invoiceSendOutcomes.filter((o) => !o.ok);
      let description =
        "Your diary entry is saved. Open the dashboard or records anytime.";
      if (sendOk.length) {
        description += ` ${sendOk.map((o) => `${o.patient}: ${o.text}`).join(" ")}`;
      }
      if (sendBad.length) {
        description += ` Could not send: ${sendBad.map((o) => `${o.patient} (${o.text})`).join("; ")}.`;
      }
      if (invoiceSkipped.length) {
        description += ` Invoice not created: ${invoiceSkipped.join(" ")}`;
      }

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

  const orbScale = 1 + micReactive * 0.2;
  const idleOrb =
    !isWhisperRecording &&
    !isRecording &&
    !isWhisperTranscribing &&
    !processing;

  const orbSize =
    "h-[min(92vw,22rem)] w-[min(92vw,22rem)] sm:h-96 sm:w-96 md:h-[28rem] md:w-[28rem]";
  const goldGlowOpacity = 0.2 + micReactive * 0.95;
  const goldGlowScale = 1 + micReactive * 0.28;

  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl flex-col px-3 sm:px-5 md:px-8">
        {/* Fill viewport minus mobile tab bar; centre the orb in the remaining space */}
        <div className="flex min-h-[calc(100dvh-5.75rem)] flex-col md:min-h-[calc(100dvh-2rem)]">
          <header className="flex shrink-0 items-center justify-between gap-3 pt-3 pb-2 md:pt-4">
            <h1 className="text-lg font-medium tracking-tight text-[#2f415a] md:text-xl">
              Voice diary
            </h1>
            <div className="flex items-center gap-2">
              {recognition ? (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={inputBusy && !isRecording}
                  title="Live captions (browser)"
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-[#dde3ea] bg-white text-[#334866] transition hover:border-[#b9c4d2] disabled:opacity-40 ${
                    isRecording ? "border-[#9aaec5]" : ""
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
                className="rounded-full border border-[#dde3ea] bg-white px-3 py-1.5 text-xs font-medium text-[#334866] hover:bg-[#f8fafc]"
              >
                Back
              </Link>
            </div>
          </header>

          <div className="relative flex flex-1 flex-col items-center justify-center py-4 md:py-6">
            <div
              className={`relative flex ${orbSize} shrink-0 items-center justify-center`}
              style={{
                transform: `scale(${orbScale})`,
                transition: "transform 0.07s ease-out",
              }}
            >
              {/* Soft depth glow */}
              <div
                className="pointer-events-none absolute inset-[-14%] rounded-full bg-[#5f7492] blur-[40px] md:blur-[52px]"
                style={{
                  opacity: 0.14 + micReactive * 0.22,
                  transform: `scale(${1 + micReactive * 0.08})`,
                  transition: "opacity 0.1s ease-out, transform 0.1s ease-out",
                }}
                aria-hidden
              />
              {/* Warm gold aura behind orb — clearly reacts while speaking */}
              <div
                className={`pointer-events-none absolute rounded-full bg-[#d6b164] blur-[52px] md:blur-[72px] ${
                  idleOrb && !isWhisperTranscribing ? "vd-orb-glow-idle" : ""
                }`}
                style={{
                  inset: "-26%",
                  ...(idleOrb && !isWhisperTranscribing
                    ? {}
                    : {
                        opacity: goldGlowOpacity,
                        transform: `scale(${goldGlowScale})`,
                        transition:
                          "opacity 0.09s ease-out, transform 0.09s ease-out",
                      }),
                }}
                aria-hidden
              />

              {/* Main sphere — muted slate */}
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
                    0 ${8 + micReactive * 14}px ${34 + micReactive * 40}px -${8}px rgba(90, 108, 132, ${0.16 + micReactive * 0.16})
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

              <button
                type="button"
                onClick={toggleWhisperRecording}
                disabled={
                  isWhisperTranscribing || (processing && !isWhisperRecording)
                }
                className="relative z-10 rounded-full bg-gradient-to-b from-[#e8dfd1] via-[#d8cbb7] to-[#c7b79d] px-8 py-3.5 text-[15px] font-medium tracking-tight text-[#2f415a] shadow-[0_4px_18px_rgba(35,50,72,0.2),inset_0_1px_0_rgba(255,255,255,0.45)] transition hover:from-[#ece3d6] hover:via-[#ddd0bd] hover:to-[#cdbda4] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 md:px-10 md:py-4 md:text-base"
              >
                {isWhisperTranscribing ? (
                  <span className="flex items-center gap-2.5">
                    <Loader2 className="h-[1.1rem] w-[1.1rem] animate-spin" />
                    Transcribing
                  </span>
                ) : isWhisperRecording ? (
                  <span className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#3f5778]/85 shadow-sm" />
                    Stop
                  </span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    <AudioLines className="h-[1.1rem] w-[1.1rem]" />
                    Dictate
                  </span>
                )}
              </button>
            </div>
          </div>

          <section className="shrink-0 border-t border-slate-200/70 pt-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-[#1a2845]">
                Today&apos;s diary
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (processing) return;
                  if (diaryEditing) {
                    const start = transcriptAtEditStartRef.current;
                    transcriptAtEditStartRef.current = null;
                    setDiaryEditing(false);
                    const changed = start !== transcript;
                    if (transcript.trim() && changed) {
                      void processTranscript();
                    }
                  } else {
                    transcriptAtEditStartRef.current = transcript;
                    setDiaryEditing(true);
                  }
                }}
                disabled={processing}
                className="h-8 shrink-0 px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-[#1a2845]"
              >
                {diaryEditing ? "Done" : "Edit"}
              </Button>
            </div>

            {diaryEditing ? (
              <Textarea
                id="voice-diary-input"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="e.g. …please send an invoice to Jane for her facial…"
                className="min-h-[140px] w-full resize-y border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-[15px] leading-7 text-[#1a2845] shadow-none placeholder:text-slate-400 focus-visible:border-[#1a2845]/40 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                disabled={processing}
                autoFocus
              />
            ) : (
              <div
                className="min-h-[120px] py-2"
                aria-live="polite"
                aria-label="Diary transcript"
              >
                {transcript.trim() || revealText ? (
                  <p className="text-[15px] font-normal leading-7 tracking-normal text-slate-800 antialiased whitespace-pre-wrap">
                    {revealText}
                    <span
                      className={`ml-px inline-block h-[1.05em] w-0.5 translate-y-px bg-[#1a2845]/35 align-middle ${
                        revealText.length >= transcript.length
                          ? "animate-pulse"
                          : ""
                      }`}
                      aria-hidden
                    />
                  </p>
                ) : (
                  <p className="text-[15px] leading-7 text-slate-400">
                    Your transcript appears here as you use Dictate or the mic.
                  </p>
                )}
              </div>
            )}

            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {processing ? (
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Updating records from this diary…
                </span>
              ) : (
                "Updates run automatically when you stop speaking or finish editing."
              )}
            </p>
          </section>

          <div className="mt-4 flex shrink-0 justify-center gap-6 pb-2 text-xs text-slate-400">
            <Link
              to={createPageUrl("Dashboard")}
              className="hover:text-[#1a2845]"
            >
              Dashboard
            </Link>
            <Link
              to={createPageUrl("Records")}
              className="hover:text-[#1a2845]"
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
                Toggle items off if something looks wrong, then apply. If you ask to
                send an invoice and there is no matching visit yet, we create a{" "}
                <strong>pending</strong> treatment for that patient, then the invoice,
                PDF, and email (patient needs email or phone on file, or say it in the
                diary). You can also add new catalogue treatments and expenses from this
                review.
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
                              {invoice.send_after_create ? (
                                <div className="col-span-2">
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                                    After save
                                  </span>
                                  <p className="text-emerald-800 font-medium text-sm">
                                    Auto-send via{" "}
                                    {invoice.send_via === "email"
                                      ? "email"
                                      : invoice.send_via === "sms"
                                        ? "SMS"
                                        : "email + SMS"}{" "}
                                    (PDF generated first)
                                  </p>
                                  {invoice.patient_contact ? (
                                    <p className="text-xs text-gray-600 mt-0.5">
                                      Contact: {invoice.patient_contact}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="col-span-2">
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                                    After save
                                  </span>
                                  <p className="text-gray-600 text-sm font-light">
                                    Invoice only — send from Communications or
                                    Invoices when ready
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Catalogue Treatments */}
                {confirmedData.catalog_treatments.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                        Add to Catalogue
                      </h3>
                      <span className="text-xs text-gray-500 font-light">
                        {confirmedData.catalog_treatments.filter(t => t.include).length} selected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {confirmedData.catalog_treatments.map((t, index) => (
                        <div
                          key={index}
                          className={`bg-white rounded-lg p-4 border transition-all ${
                            t.include ? 'border-[#1a2845] bg-gray-50/50' : 'border-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={t.include}
                              onChange={() => toggleInclude('catalog_treatments', index)}
                              className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-[#1a2845] mt-0.5"
                            />
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Treatment</span>
                                <p className="text-gray-900 font-light">{t.treatment_name}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Category</span>
                                <p className="text-gray-900 font-light">{t.category || "Other"}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Default price</span>
                                <p className="text-gray-900 font-light">
                                  {t.default_price != null ? `£${Number(t.default_price).toFixed(2)}` : "Not set"}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Duration</span>
                                <p className="text-gray-900 font-light">
                                  {t.default_duration_minutes ? `${t.default_duration_minutes} min` : "Not set"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expenses */}
                {confirmedData.expenses.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 uppercase tracking-wide">
                        Expenses
                      </h3>
                      <span className="text-xs text-gray-500 font-light">
                        {confirmedData.expenses.filter(e => e.include).length} selected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {confirmedData.expenses.map((expense, index) => (
                        <div
                          key={index}
                          className={`bg-white rounded-lg p-4 border transition-all ${
                            expense.include ? 'border-[#1a2845] bg-gray-50/50' : 'border-gray-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={expense.include}
                              onChange={() => toggleInclude('expenses', index)}
                              className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-[#1a2845] mt-0.5"
                            />
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Category</span>
                                <p className="text-gray-900 font-light">{expense.category}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Amount</span>
                                <p className="text-gray-900 font-light">£{Number(expense.amount || 0).toFixed(2)}</p>
                              </div>
                              <div>
                                <span className="text-xs text-gray-500 uppercase tracking-wide">Date</span>
                                <p className="text-gray-900 font-light">{expense.date}</p>
                              </div>
                              {expense.notes && (
                                <div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">Notes</span>
                                  <p className="text-gray-900 font-light">{expense.notes}</p>
                                </div>
                              )}
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