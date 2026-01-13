import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mic, MicOff } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function VoiceDiary() {
  const { toast } = useToast();
  const navigate = useNavigate();
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
    queryFn: () => base44.entities.TreatmentCatalog.list('treatment_name'),
    initialData: [],
  });

  const { data: practitioners } = useQuery({
    queryKey: ['practitioners'],
    queryFn: () => base44.entities.Practitioner.list('name'),
    initialData: [],
  });

  const { data: patients } = useQuery({
    queryKey: ['patients'],
    queryFn: () => base44.entities.Patient.list('name'),
    initialData: [],
  });

  const { data: treatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => base44.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
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
      const treatmentsList = treatmentCatalog.map(t => 
        `${t.treatment_name} (£${t.default_price || 0}, ${t.duration_minutes || 'N/A'} min)`
      ).join(', ');

      const practitionersList = practitioners.map(p => p.name).join(', ');
      const patientsList = patients.map(p => p.name).join(', ');
      const todayDate = format(new Date(), 'yyyy-MM-dd');

      // Get recent pending treatments for context
      const recentPendingTreatments = treatments
        .filter(t => t.payment_status === 'pending')
        .slice(0, 10)
        .map(t => `${t.patient_name} - ${t.treatment_name} - £${t.price_paid} (${t.date})`)
        .join(', ');

      const prompt = `You are an assistant helping a beauty clinic manage their daily operations. Parse the following comprehensive voice diary entry and extract ALL relevant information.

TODAY'S DATE: ${todayDate}

AVAILABLE TREATMENTS: ${treatmentsList}
AVAILABLE PRACTITIONERS: ${practitionersList}
KNOWN PATIENTS: ${patientsList}
RECENT PENDING TREATMENTS: ${recentPendingTreatments || 'None'}

USER VOICE DIARY ENTRY: "${transcript}"

Extract the following information:

1. NEW TREATMENTS: Create treatment entries for patients seen today (or date mentioned)
   - For each treatment, extract: date, patient_name, treatment_name, price_paid, payment_status (paid/pending/partially_paid), amount_paid, practitioner_name, duration_minutes, notes

2. PAYMENT UPDATES: Identify payments received for EXISTING treatments
   - Look for phrases like "paid", "payment received", "settled", "cleared"
   - Extract: patient_name, treatment_name (or description), amount_paid, date_hint (last week, yesterday, etc.)
   - Match to existing pending treatments

3. INVOICES TO CREATE: Identify treatments that need invoices
   - Any treatment with payment_status "pending"
   - Extract: patient_name, treatment_name, amount, date

4. NEW PATIENTS: Identify new patients mentioned
   - Extract: name, contact (if mentioned), phone (if mentioned)

For date parsing:
- "today" = ${todayDate}
- "yesterday" = ${format(subDays(new Date(), 1), 'yyyy-MM-dd')}
- "last week" = approximately 7 days ago
- Relative dates should be converted to actual dates

Return in this JSON format:
{
  "treatments": [
    {
      "date": "YYYY-MM-DD",
      "patient_name": "string",
      "treatment_name": "string",
      "price_paid": number,
      "payment_status": "paid|pending|partially_paid",
      "amount_paid": number,
      "practitioner_name": "string or null",
      "duration_minutes": number or null,
      "notes": "string or null"
    }
  ],
  "payment_updates": [
    {
      "patient_name": "string",
      "treatment_name": "string or null",
      "amount_paid": number,
      "date_hint": "string or null"
    }
  ],
  "invoices": [
    {
      "patient_name": "string",
      "treatment_name": "string",
      "amount": number,
      "date": "YYYY-MM-DD"
    }
  ],
  "patients": [
    {
      "name": "string",
      "contact": "string or null",
      "phone": "string or null"
    }
  ]
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        add_context_from_internet: false,
        response_json_schema: {
          type: "object",
          properties: {
            treatments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  patient_name: { type: "string" },
                  treatment_name: { type: "string" },
                  price_paid: { type: "number" },
                  payment_status: { type: "string" },
                  amount_paid: { type: "number" },
                  practitioner_name: { type: ["string", "null"] },
                  duration_minutes: { type: ["number", "null"] },
                  notes: { type: ["string", "null"] }
                },
                required: ["date", "patient_name", "treatment_name", "price_paid", "payment_status"]
              }
            },
            payment_updates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  patient_name: { type: "string" },
                  treatment_name: { type: ["string", "null"] },
                  amount_paid: { type: "number" },
                  date_hint: { type: ["string", "null"] }
                },
                required: ["patient_name", "amount_paid"]
              }
            },
            invoices: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  patient_name: { type: "string" },
                  treatment_name: { type: "string" },
                  amount: { type: "number" },
                  date: { type: "string" }
                },
                required: ["patient_name", "treatment_name", "amount"]
              }
            },
            patients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  contact: { type: ["string", "null"] },
                  phone: { type: ["string", "null"] }
                },
                required: ["name"]
              }
            }
          }
        }
      });

      // Process payment updates to match with existing treatments
      const processedPaymentUpdates = (response.payment_updates || []).map(update => {
        const matchedTreatment = matchTreatmentToExisting(
          update.patient_name,
          update.treatment_name,
          update.date_hint,
          update.amount_paid
        );
        return {
          ...update,
          matched_treatment: matchedTreatment
        };
      });

      const processedData = {
        treatments: response.treatments || [],
        payment_updates: processedPaymentUpdates,
        invoices: response.invoices || [],
        patients: response.patients || []
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
          const newPatient = await base44.entities.Patient.create({
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

          const createdTreatment = await base44.entities.TreatmentEntry.create({
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

          await base44.entities.TreatmentEntry.update(treatment.id, {
            payment_status: isFullyPaid ? 'paid' : 'partially_paid',
            amount_paid: Math.min(updatedAmountPaid, treatment.price_paid),
            profit: Math.min(updatedAmountPaid, treatment.price_paid) - (treatment.product_cost || 0)
          });
        } catch (error) {
          console.error('Failed to update payment:', error);
        }
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
          await base44.entities.Invoice.create({
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
            notes: ''
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
        description: "Successfully processed voice diary entry",
        className: "bg-green-50 border-green-200"
      });

      setReviewDialogOpen(false);
      setTranscript('');
      setExtractedData(null);
      setConfirmedData(null);
      setProcessing(false);

      setTimeout(() => navigate(createPageUrl("Dashboard")), 1500);

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
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Voice Diary</h1>
          <p className="text-sm text-gray-500 font-light">Record your daily summary</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-xl font-light text-[#1a2845] mb-3 tracking-tight">
                {isRecording ? 'Recording' : 'Daily Summary'}
              </h2>
              <p className="text-sm text-gray-500 font-light">
                {isRecording 
                  ? 'Speak naturally about your day'
                  : 'Record treatments, payments, and invoices'
                }
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Click the microphone to record, or type your summary here.

Example: Today I saw Sarah Johnson for botox at £250, she paid in full. Mark Davis came for dermal filler at £200, he'll pay next week. Emma Smith paid her outstanding invoice from last week - that was the botox treatment for £250."
                  className="rounded-lg border-gray-300 min-h-48 text-sm leading-relaxed pr-20 font-light"
                  disabled={processing}
                />
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={processing}
                  className={`absolute right-4 bottom-4 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    isRecording 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-[#1a2845] hover:bg-[#0f1829]'
                  } text-white shadow-md disabled:opacity-50`}
                  title={isRecording ? 'Stop recording' : 'Start voice recording'}
                >
                  {isRecording ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Guidelines</p>
                <ul className="text-sm text-gray-700 space-y-1.5 leading-relaxed">
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2">•</span>
                    <span>Mention patient names, treatments, and amounts</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2">•</span>
                    <span>State payment status (paid, pending, partial)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2">•</span>
                    <span>Reference existing treatments when updating payments</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2">•</span>
                    <span>You can mention multiple patients and treatments in one recording</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={processTranscript}
                disabled={processing || !transcript.trim() || isRecording}
                className="w-full bg-[#1a2845] hover:bg-[#0f1829] text-white rounded-lg h-11 text-sm font-light tracking-wide uppercase"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing
                  </>
                ) : isRecording ? (
                  'Stop recording to continue'
                ) : (
                  'Process & Review'
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Review Dialog */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-light text-[#1a2845] tracking-tight">
                Review Extracted Data
              </DialogTitle>
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