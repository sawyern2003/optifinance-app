import React, { useState, useEffect } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, Mic, MicOff, Sparkles, ExternalLink, ChevronDown } from "lucide-react";
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
  const [processing, setProcessing] = useState(false);
  const [recognition, setRecognition] = useState(null);
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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.auth.me(),
    initialData: null,
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
    if (!recognition) {
      toast({
        title: "Speech recognition not available",
        description: "Your browser doesn't support speech recognition",
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

  return (
    <div className="p-6 md:p-10 bg-gradient-to-b from-slate-50 to-slate-100/80 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#1a2845]">
            Voice diary
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-xl">
            Dictate your day with{" "}
            <a
              href="https://wisprflow.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 hover:text-indigo-700 underline underline-offset-2 inline-flex items-center gap-0.5"
            >
              Wispr Flow
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
            — focus this text box and speak. Then we parse visits, payments, and invoice requests in one step.
          </p>
        </div>

        <Card className="border-slate-200/80 shadow-md shadow-slate-200/50 overflow-hidden rounded-2xl">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
            <div className="flex gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-sm sm:text-base">
                  Recommended: Wispr Flow for voice
                </p>
                <p className="text-xs sm:text-sm text-indigo-100 leading-snug">
                  Install Flow on Mac, Windows, iPhone, or Android. Click inside the box below, use your Flow shortcut, and talk naturally—it writes clean text into Optifinance. No API key needed in the app.
                </p>
                <a
                  href="https://wisprflow.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white hover:underline mt-1"
                >
                  Download Wispr Flow
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <CardContent className="p-6 md:p-8 space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="voice-diary-input"
                className="text-sm font-medium text-slate-800"
              >
                Your diary entry
              </label>
              <Textarea
                id="voice-diary-input"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={`Example: Today I saw Sarah for Botox at £250, paid in full. Mark had filler at £200, paying next week. Please invoice Emma for Tuesday's facial.`}
                className="rounded-xl border-slate-200 min-h-[220px] sm:min-h-[260px] text-[15px] leading-relaxed resize-y focus-visible:ring-indigo-500"
                disabled={processing}
              />
              <p className="text-xs text-slate-500">
                Say who you saw, which treatment, prices, and paid / pending. Ask to invoice in plain English—we&apos;ll match it in review.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Collapsible className="group sm:max-w-md">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-slate-600 -ml-2 h-9 px-2"
                  >
                    <ChevronDown className="w-4 h-4 mr-1 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
                    Quick tips
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 pb-2">
                  <ul className="text-xs text-slate-600 space-y-1.5 pl-1 border-l-2 border-indigo-200 ml-1">
                    <li className="pl-3">Use patient and treatment names from your catalogue when you can.</li>
                    <li className="pl-3">Mention paid, pending, or partial and amounts.</li>
                    <li className="pl-3">Several patients in one entry is fine.</li>
                  </ul>
                </CollapsibleContent>
              </Collapsible>

              {recognition ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleRecording}
                  disabled={processing}
                  className={`shrink-0 rounded-xl border-slate-200 ${isRecording ? "border-red-200 bg-red-50 text-red-700" : ""}`}
                >
                  {isRecording ? (
                    <>
                      <MicOff className="w-4 h-4 mr-2" />
                      Stop browser mic
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 mr-2" />
                      Browser mic (fallback)
                    </>
                  )}
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <Button
                onClick={processTranscript}
                disabled={processing || !transcript.trim() || isRecording}
                className="w-full rounded-xl h-12 text-sm font-semibold bg-[#1a2845] hover:bg-[#0f1829] text-white shadow-sm"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Understanding your entry…
                  </>
                ) : isRecording ? (
                  "Stop the browser mic to continue"
                ) : (
                  "Parse & review"
                )}
              </Button>
              {processing && (
                <p className="text-center text-xs text-slate-500">
                  Matching patients, treatments, and invoices—usually a few seconds.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs text-slate-500 pt-1">
              <Link
                to={createPageUrl("Dashboard")}
                className="text-indigo-600 hover:underline"
              >
                Dashboard
              </Link>
              <span className="text-slate-300">·</span>
              <Link
                to={createPageUrl("Records")}
                className="text-indigo-600 hover:underline"
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