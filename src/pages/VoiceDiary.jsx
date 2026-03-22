import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Mic, MicOff, AudioLines } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { friendsFamilyInvoiceFields } from "@/lib/invoiceFriendsFamily";
import { Link } from "react-router-dom";

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

  return (
    <div className="p-6 md:p-10 bg-[#f4f5f7] min-h-screen">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-[#1a2845] tracking-tight">
            Voice diary
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Type or record, then parse to update visits and invoices.
          </p>
        </header>

        <Card className="border border-slate-200/90 shadow-sm rounded-2xl bg-white">
          <CardContent className="p-5 md:p-6 space-y-4">
            <Textarea
              id="voice-diary-input"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="e.g. Today: Sarah — Botox £250 paid. Mark — filler £200 pending."
              className="rounded-xl border-slate-200 min-h-[200px] text-[15px] leading-relaxed resize-y focus-visible:ring-[#1a2845]/20"
              disabled={processing}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-lg bg-[#1a2845] hover:bg-[#0f1829]"
                onClick={toggleWhisperRecording}
                disabled={processing || isWhisperTranscribing}
                title="Accurate transcription — we send audio to be transcribed (OpenAI Whisper). Patient names from your list are used as hints."
              >
                {isWhisperTranscribing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Transcribing…
                  </>
                ) : isWhisperRecording ? (
                  <>
                    <MicOff className="w-4 h-4 mr-2" />
                    Stop & transcribe
                  </>
                ) : (
                  <>
                    <AudioLines className="w-4 h-4 mr-2" />
                    Record
                  </>
                )}
              </Button>
              {recognition ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-slate-200 text-slate-600"
                  onClick={toggleRecording}
                  disabled={inputBusy || isWhisperRecording}
                  title="Live captions in the browser — often mishears names. Prefer Record for accuracy."
                >
                  {isRecording ? (
                    <>
                      <MicOff className="w-3.5 h-3.5 mr-1.5" />
                      Stop live mic
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 mr-1.5" />
                      Live mic
                    </>
                  )}
                </Button>
              ) : null}
            </div>

            <Button
              onClick={processTranscript}
              disabled={
                processing ||
                !transcript.trim() ||
                isRecording ||
                isWhisperRecording ||
                isWhisperTranscribing
              }
              className="w-full rounded-xl h-11 text-sm font-medium bg-[#1a2845] hover:bg-[#0f1829] text-white"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Parsing…
                </>
              ) : isRecording ? (
                "Stop live mic to parse"
              ) : isWhisperRecording ? (
                "Stop recording to parse"
              ) : (
                "Parse & review"
              )}
            </Button>

            <div className="flex justify-center gap-3 text-xs text-slate-400 pt-1">
              <Link
                to={createPageUrl("Dashboard")}
                className="text-slate-600 hover:text-[#1a2845]"
              >
                Dashboard
              </Link>
              <span>·</span>
              <Link
                to={createPageUrl("Records")}
                className="text-slate-600 hover:text-[#1a2845]"
              >
                Records
              </Link>
            </div>
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
}