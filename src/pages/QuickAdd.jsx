import React, { useState, useEffect } from "react";
import { api } from "@/api/api";
import { invoicesAPI } from "@/api/invoices";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Save, Sparkles, CreditCard, Loader2, AlertCircle, Check, Upload, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function QuickAdd() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("treatment");
  const [aiMode, setAiMode] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [processingAI, setProcessingAI] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [pendingTreatments, setPendingTreatments] = useState([]);
  const [confirmedTreatments, setConfirmedTreatments] = useState([]);
  const [useLeadPractitioner, setUseLeadPractitioner] = useState(true);
  const [newPractitionerName, setNewPractitionerName] = useState(null);
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [expenseConfirmDialogOpen, setExpenseConfirmDialogOpen] = useState(false);
  const [extractedExpenses, setExtractedExpenses] = useState([]);
  const [confirmedExpenses, setConfirmedExpenses] = useState([]);
  const [sendInvoiceSMS, setSendInvoiceSMS] = useState(false);

  const { data: treatmentCatalog } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => api.entities.TreatmentCatalog.list('treatment_name'),
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
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setAiInput(prev => prev + finalTranscript);
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      setRecognition(recognitionInstance);
    }
  }, [toast]);

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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.auth.me(),
    initialData: null,
  });

  const [treatmentForm, setTreatmentForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    patient_id: '',
    patient_name: '',
    treatment_id: '',
    price_paid: '',
    payment_status: 'paid',
    amount_paid: '',
    practitioner_id: '',
    duration_minutes: '',
    notes: ''
  });

  // Auto-select lead practitioner when component mounts or practitioners change
  useEffect(() => {
    const leadPractitioner = practitioners.find(p => p.is_lead);
    if (leadPractitioner && !treatmentForm.practitioner_id && useLeadPractitioner) {
      setTreatmentForm(prev => ({
        ...prev,
        practitioner_id: leadPractitioner.id
      }));
    }
  }, [practitioners, useLeadPractitioner, treatmentForm.practitioner_id]);

  const handleLeadPractitionerToggle = (checked) => {
    setUseLeadPractitioner(checked);
    if (checked) {
      const leadPractitioner = practitioners.find(p => p.is_lead);
      if (leadPractitioner) {
        setTreatmentForm({
          ...treatmentForm,
          practitioner_id: leadPractitioner.id
        });
        setNewPractitionerName(null);
      } else {
        toast({
          title: "No lead practitioner",
          description: "Please set a lead practitioner in Catalogue first",
          className: "bg-yellow-50 border-yellow-200"
        });
        setUseLeadPractitioner(false);
      }
    } else {
      setTreatmentForm({
        ...treatmentForm,
        practitioner_id: ''
      });
    }
  };

  const [expenseForm, setExpenseForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    category: '',
    amount: '',
    notes: '',
    is_recurring: false,
    recurrence_frequency: 'monthly'
  });

  const [newPatientName, setNewPatientName] = useState(null);

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  };

  const canSendSMS = () => {
    if (!treatmentForm.patient_id) return false;
    const patient = patients.find(p => p.id === treatmentForm.patient_id);
    return !!patient?.phone;
  };

  const automateInvoiceAndPayment = async (treatment, patient) => {
    console.log('🚀 Step 1: Starting automation for treatment:', treatment);

    try {
      console.log('📞 Step 2: Patient data:', patient);

      const invoiceNumber = generateInvoiceNumber();
      console.log('📝 Step 3: Generated invoice number:', invoiceNumber);

      // Create GoCardless payment link
      console.log('💳 Step 4: Creating GoCardless payment link...');
      const gcPayload = {
        amount: treatment.price_paid,
        description: `${treatment.treatment_name} - ${user?.clinic_name || 'Treatment'}`,
        invoice_id: invoiceNumber,
        patient_name: treatment.patient_name || 'Patient',
        patient_email: patient?.contact || ''
      };
      console.log('📦 Step 4.1: Payload:', JSON.stringify(gcPayload, null, 2));

      let paymentResponse;
      try {
        console.log('🔄 Step 4.2: Calling createGoCardlessPayment...');
        paymentResponse = await api.functions.invoke('createGoCardlessPayment', gcPayload);
        console.log('✅ Step 5: Got response:', paymentResponse);
        console.log('✅ Step 5.1: Response status:', paymentResponse?.status);
        console.log('✅ Step 5.2: Response data:', paymentResponse?.data);
      } catch (gcError) {
        console.error('❌ Step 4 FAILED: GoCardless error:', gcError);
        console.error('❌ Error message:', gcError.message);
        console.error('❌ Error response:', gcError.response?.data);
        throw new Error(`GoCardless failed: ${gcError.message || 'Unknown error'}`);
      }

      if (!paymentResponse?.data?.payment_link) {
        console.error('❌ No payment link in response');
        throw new Error('No payment link returned from GoCardless');
      }

      const paymentLink = paymentResponse.data.payment_link;
      console.log('🔗 Step 6: Payment link:', paymentLink);

        console.log('🔗 Step 8: Payment link:', paymentLink);

      // Create invoice record with payment link
      console.log('📄 Step 9: Creating invoice record...');
      let createdInvoice;
      try {
        createdInvoice = await api.entities.Invoice.create({
          invoice_number: invoiceNumber,
          treatment_entry_id: treatment.id,
          patient_name: treatment.patient_name || 'Patient',
          patient_contact: patient?.contact || patient?.phone || '',
          treatment_name: treatment.treatment_name,
          treatment_date: treatment.date,
          amount: treatment.price_paid,
          practitioner_name: treatment.practitioner_name || '',
          issue_date: format(new Date(), 'yyyy-MM-dd'),
          status: 'sent',
          notes: treatment.notes || '',
          payment_link: paymentLink
        });
        console.log('✅ Step 10: Invoice created successfully');
      } catch (invoiceError) {
        console.error('❌ Step 10 FAILED: Invoice creation error:', invoiceError);
        throw new Error(`Failed to create invoice: ${invoiceError.message}`);
      }

      // Generate PDF then send SMS so the link is in the message
      console.log('📄 Generating PDF...');
      await invoicesAPI.generateInvoicePDF(createdInvoice.id);
      console.log('📲 Sending SMS to', patient.phone);
      await api.functions.invoke('sendInvoiceSMS', { invoiceId: createdInvoice.id });
      console.log('✅ Step 10: SMS sent! Response:', JSON.stringify(smsResponse?.data, null, 2));

      toast({
        title: "Payment link sent",
        description: `SMS sent to ${treatment.patient_name}`,
        className: "bg-green-50 border-green-200"
      });

      } catch (error) {
      console.error('❌ FAILED:', error);
      toast({
        title: "Failed",
        description: error.message,
        className: "bg-red-50 border-red-200",
        duration: 7000
      });
      throw error;
      }
      };

  const createTreatmentMutation = useMutation({
    mutationFn: async (data) => {
      let patientId = data.patient_id;
      let patientName = data.patient_name;

      if (newPatientName !== null && newPatientName !== '') {
        const newPatient = await api.entities.Patient.create({ name: newPatientName });
        patientId = newPatient.id;
        patientName = newPatient.name;
      }

      let practitionerId = data.practitioner_id;
      let practitionerName = data.practitioner_name;

      if (newPractitionerName !== null && newPractitionerName !== '') {
        const newPractitioner = await api.entities.Practitioner.create({ name: newPractitionerName });
        practitionerId = newPractitioner.id;
        practitionerName = newPractitioner.name;
      } else if (data.practitioner_id) {
        const existingPractitioner = practitioners.find(p => p.id === data.practitioner_id);
        practitionerName = existingPractitioner?.name;
      }

      const treatment = treatmentCatalog.find(t => t.id === data.treatment_id);

      const productCost = treatment?.typical_product_cost || 0;
      const pricePaid = parseFloat(data.price_paid);
      const amountPaid = data.payment_status === 'partially_paid' 
        ? parseFloat(data.amount_paid) 
        : (data.payment_status === 'paid' ? pricePaid : 0);
      const profit = amountPaid - productCost;

      const createdTreatment = await api.entities.TreatmentEntry.create({
        date: data.date,
        patient_id: patientId,
        patient_name: patientName,
        treatment_id: data.treatment_id,
        treatment_name: treatment?.treatment_name,
        duration_minutes: data.duration_minutes ? parseFloat(data.duration_minutes) : undefined,
        price_paid: pricePaid,
        payment_status: data.payment_status,
        amount_paid: amountPaid,
        product_cost: productCost,
        profit: profit,
        practitioner_id: practitionerId,
        practitioner_name: practitionerName,
        notes: data.notes
      });

      // If sendInvoiceSMS is checked AND payment is pending, send it NOW
      if (data.sendSMS && createdTreatment.payment_status === 'pending') {
        const patient = patients.find(p => p.id === createdTreatment.patient_id);
        if (patient?.phone) {
          console.log('🎯 TRIGGERING SMS from mutation with patient:', patient);
          await automateInvoiceAndPayment(createdTreatment, patient);
        }
      }

      return createdTreatment;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });

      const leadPractitioner = practitioners.find(p => p.is_lead);
      setTreatmentForm({
        date: format(new Date(), 'yyyy-MM-dd'),
        patient_name: '',
        treatment_id: '',
        price_paid: '',
        payment_status: 'paid',
        amount_paid: '',
        practitioner_id: useLeadPractitioner ? (leadPractitioner?.id || '') : '',
        duration_minutes: '',
        notes: ''
      });
      setNewPatientName(null);
      setNewPractitionerName(null);
      setSendInvoiceSMS(false);

      if (variables?.addAnother !== true) {
        toast({
          title: "Treatment saved",
          description: "Successfully added treatment",
          className: "bg-green-50 border-green-200"
        });
        setTimeout(() => navigate(createPageUrl("Dashboard")), 800);
      }
    },
    onError: (err) => {
      toast({
        title: "Could not save treatment",
        description: err?.message || String(err),
        variant: "destructive"
      });
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: (data) => api.entities.Expense.create({
      date: data.date,
      category: data.category,
      amount: parseFloat(data.amount),
      notes: data.notes,
      is_recurring: data.is_recurring,
      recurrence_frequency: data.recurrence_frequency,
      is_active: data.is_recurring ? true : undefined,
      last_generated_date: data.is_recurring ? data.date : undefined,
    }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setExpenseForm({
        date: format(new Date(), 'yyyy-MM-dd'),
        category: '',
        amount: '',
        notes: '',
        is_recurring: false,
        recurrence_frequency: 'monthly'
      });
      if (variables?.addAnother !== true) {
        toast({
          title: "Expense saved",
          description: "Successfully added expense",
          className: "bg-green-50 border-green-200"
        });
        setTimeout(() => navigate(createPageUrl("Dashboard")), 800);
      }
    },
    onError: (err) => {
      toast({
        title: "Could not save expense",
        description: err?.message || String(err),
        variant: "destructive"
      });
    },
  });

  const handleBankStatementUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingStatement(true);

    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });

      const currentDate = format(new Date(), 'yyyy-MM-dd');
      const currentYear = format(new Date(), 'yyyy');

      const prompt = `TODAY'S DATE: ${currentDate}

    Extract ALL expenses from this bank statement. For each expense:

    1. DATE: Extract the transaction date in YYYY-MM-DD format. Look for dates in ANY format (dd/mm/yyyy, dd-mm-yy, mmm dd, etc.) and convert to YYYY-MM-DD.
    IMPORTANT: If the year is abbreviated (e.g., "25"), assume it's ${currentYear} (20${currentYear.slice(2)}). If only month/day is shown, assume the current year (${currentYear}).
    2. DESCRIPTION: Extract the merchant/transaction description
    3. AMOUNT: Extract the expense amount (positive number, ignore currency symbols)
    4. CATEGORY: Intelligently categorize based on the description:
    - "Rent" for property/lease/rent payments
    - "Products" for supplies, inventory, stock purchases
    - "Wages" for salaries, payroll, staff payments
    - "Insurance" for insurance payments
    - "Marketing" for advertising, social media, promotion costs
    - "Utilities" for electricity, water, gas, internet, phone bills
    - "Equipment" for tools, machines, furniture purchases
    - "Other" if uncertain

    Only extract OUTGOING expenses (debits), ignore incoming payments (credits).

    Return in this exact JSON format:
    {
    "expenses": [
    {
    "date": "YYYY-MM-DD",
    "description": "merchant name",
    "amount": 123.45,
    "category": "category name"
    }
    ]
    }`;

      const extractionResult = await api.integrations.Core.InvokeLLM({
        prompt: prompt,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            expenses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  description: { type: "string" },
                  amount: { type: "number" },
                  category: { type: "string" }
                },
                required: ["date", "amount", "category"]
              }
            }
          }
        }
      });

      const expenses = extractionResult?.expenses || [];

      if (expenses.length === 0) {
        setUploadingStatement(false);
        return;
      }

      setExtractedExpenses(expenses);
      setConfirmedExpenses(expenses.map(e => ({
        ...e,
        include: true,
        category: e.category || 'Other'
      })));
      setExpenseConfirmDialogOpen(true);
      setUploadingStatement(false);

    } catch (error) {
      console.error('Bank statement processing failed:', error);
      setUploadingStatement(false);
    }

    e.target.value = '';
  };

  const updateConfirmedExpense = (index, field, value) => {
    const updated = [...confirmedExpenses];
    updated[index] = { ...updated[index], [field]: value };
    setConfirmedExpenses(updated);
  };

  const toggleExpenseInclusion = (index) => {
    const updated = [...confirmedExpenses];
    updated[index].include = !updated[index].include;
    setConfirmedExpenses(updated);
  };

  const proceedWithExpenses = async () => {
    const expensesToCreate = confirmedExpenses.filter(e => e.include);

    if (expensesToCreate.length === 0) {
      setExpenseConfirmDialogOpen(false);
      return;
    }

    try {
      for (const expense of expensesToCreate) {
        await createExpenseMutation.mutateAsync({
          date: expense.date,
          category: expense.category,
          amount: expense.amount,
          notes: expense.description || '',
          is_recurring: false,
          is_auto_generated: true
        });
      }

      setExpenseConfirmDialogOpen(false);
      setExtractedExpenses([]);
      setConfirmedExpenses([]);

      toast({
        title: "Expenses added",
        description: "Successfully added expenses from bank statement",
        className: "bg-green-50 border-green-200"
      });

      navigate(createPageUrl("Dashboard"));

    } catch (error) {
      console.error('Expense creation failed:', error);
    }
  };

  const handleTreatmentSubmit = async (e, addAnother = false) => {
    e.preventDefault();

    const selectedTreatment = treatmentCatalog.find(t => t.id === treatmentForm.treatment_id);
    const formData = {
      ...treatmentForm,
      price_paid: treatmentForm.price_paid || selectedTreatment?.default_price || 0,
      sendSMS: sendInvoiceSMS,
      addAnother
    };

    createTreatmentMutation.mutate(formData);
  };

  const handleExpenseSubmit = (e, addAnother = false) => {
    e.preventDefault();
    const expenseData = {
      date: expenseForm.date,
      category: expenseForm.category,
      amount: parseFloat(expenseForm.amount),
      notes: expenseForm.notes,
      is_recurring: expenseForm.is_recurring,
      recurrence_frequency: expenseForm.is_recurring ? expenseForm.recurrence_frequency : undefined,
      is_active: expenseForm.is_recurring ? true : undefined,
      last_generated_date: expenseForm.is_recurring ? expenseForm.date : undefined,
      addAnother
    };
    createExpenseMutation.mutate(expenseData);
  };

  const handleAISubmit = async (e) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    
    setProcessingAI(true);
    
    const treatmentsList = treatmentCatalog.map(t => 
      `${t.treatment_name} (£${t.default_price}, ${t.duration_minutes || 'N/A'} min)`
    ).join(', ');
    
    const practitionersList = practitioners.map(p => p.name).join(', ');
    const patientsList = patients.map(p => p.name).join(', ');
    
    const prompt = `You are an assistant helping a beauty clinic log treatment entries. Parse the following natural language input and extract treatment information.

AVAILABLE TREATMENTS: ${treatmentsList}
AVAILABLE PRACTITIONERS: ${practitionersList}
KNOWN PATIENTS: ${patientsList}

USER INPUT: "${aiInput}"

Extract ALL treatments mentioned. For each treatment, provide:
- date (default to today if not specified: ${format(new Date(), 'yyyy-MM-dd')})
- patient_name (extract from input, or use null if not mentioned)
- treatment_name (match to available treatments list above)
- price_paid (extract amount, or use default from treatment list if not mentioned)
- payment_status (default to "paid" unless specified as pending/partial)
- amount_paid (same as price_paid unless partially paid)
- practitioner_name (extract from input or null if not specified)
- duration_minutes (extract if mentioned, or use default from treatment list)
- notes (any additional context or notes)

If multiple treatments are mentioned for the same or different patients, return multiple entries.
Be smart about matching treatment names to the available list even if wording is slightly different.
Return an array of treatment objects, even if there's only one treatment.`;

    try {
      const response = await api.integrations.Core.InvokeLLM({
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
                  patient_name: { type: ["string", "null"] },
                  treatment_name: { type: "string" },
                  price_paid: { type: "number" },
                  payment_status: { type: "string" },
                  amount_paid: { type: "number" },
                  practitioner_name: { type: ["string", "null"] },
                  duration_minutes: { type: ["number", "null"] },
                  notes: { type: ["string", "null"] }
                }
              }
            }
          }
        }
      });
      
      const treatmentsToCreate = response.treatments || [];

      if (treatmentsToCreate.length === 0) {
        setProcessingAI(false);
        return;
      }
      
      // Check for ambiguous or missing treatments
      const treatmentsNeedingConfirmation = [];
      
      for (let i = 0; i < treatmentsToCreate.length; i++) {
        const treatmentData = treatmentsToCreate[i];
        const exactMatch = treatmentCatalog.find(t => 
          t.treatment_name.toLowerCase() === treatmentData.treatment_name.toLowerCase()
        );
        
        if (!exactMatch) {
          // Look for similar treatments
          const similarTreatments = treatmentCatalog.filter(t => 
            t.treatment_name.toLowerCase().includes(treatmentData.treatment_name.toLowerCase()) ||
            treatmentData.treatment_name.toLowerCase().includes(t.treatment_name.toLowerCase())
          );
          
          if (similarTreatments.length > 0) {
            treatmentsNeedingConfirmation.push({
              index: i,
              original: treatmentData,
              matches: similarTreatments,
              needsConfirmation: true
            });
          } else {
            treatmentsNeedingConfirmation.push({
              index: i,
              original: treatmentData,
              matches: [],
              needsConfirmation: true,
              noMatch: true
            });
          }
        } else {
          treatmentsNeedingConfirmation.push({
            index: i,
            original: treatmentData,
            confirmed: exactMatch,
            needsConfirmation: false
          });
        }
      }
      
      // If any treatments need confirmation, show dialog
      const hasAmbiguous = treatmentsNeedingConfirmation.some(t => t.needsConfirmation);
      
      if (hasAmbiguous) {
        setPendingTreatments(treatmentsNeedingConfirmation);
        setConfirmedTreatments(treatmentsNeedingConfirmation.map(t => 
          t.needsConfirmation ? null : t.confirmed
        ));
        setConfirmationDialogOpen(true);
        setProcessingAI(false);
        return;
      }
      
      // All treatments matched exactly, proceed with creation
      await createConfirmedTreatments(treatmentsToCreate);
      
    } catch (error) {
      console.error('AI processing failed:', error);
      setProcessingAI(false);
    }
  };

  const createConfirmedTreatments = async (treatmentsToCreate) => {
    setProcessingAI(true);
    
    try {
      // Create all treatments
      for (const treatmentData of treatmentsToCreate) {
        const treatment = treatmentCatalog.find(t => 
          t.treatment_name.toLowerCase() === treatmentData.treatment_name.toLowerCase()
        );
        
        const practitioner = practitioners.find(p => 
          treatmentData.practitioner_name && p.name.toLowerCase() === treatmentData.practitioner_name.toLowerCase()
        );
        
        const productCost = treatment?.typical_product_cost || 0;
        const pricePaid = treatmentData.price_paid || treatment?.default_price || 0;
        const amountPaid = treatmentData.payment_status === 'partially_paid' 
          ? treatmentData.amount_paid 
          : (treatmentData.payment_status === 'paid' ? pricePaid : 0);
        const profit = amountPaid - productCost;

        await createTreatmentMutation.mutateAsync({
          date: treatmentData.date,
          patient_id: null, // Will be set by mutationFn if a new patient is created
          patient_name: treatmentData.patient_name,
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
          notes: treatmentData.notes
        });
      }

      setAiInput('');
      setProcessingAI(false);
      
      toast({
        title: "Treatments added",
        description: "Successfully added treatments",
        className: "bg-green-50 border-green-200"
      });

      setTimeout(() => navigate(createPageUrl("Dashboard")), 1000);
      
    } catch (error) {
      console.error('Treatment creation failed:', error);
      setProcessingAI(false);
    }
  };

  const handleConfirmTreatment = (index, treatment) => {
    const newConfirmed = [...confirmedTreatments];
    newConfirmed[index] = treatment;
    setConfirmedTreatments(newConfirmed);
  };

  const handleSkipTreatment = (index) => {
    const newConfirmed = [...confirmedTreatments];
    newConfirmed[index] = 'SKIP';
    setConfirmedTreatments(newConfirmed);
  };

  const proceedWithConfirmedTreatments = async () => {
    const treatmentsToCreate = pendingTreatments
      .map((pending, index) => {
        const confirmed = confirmedTreatments[index];
        if (confirmed === 'SKIP' || confirmed === null) return null;

        return {
          ...pending.original,
          treatment_name: confirmed.treatment_name,
          price_paid: pending.original.price_paid || confirmed.default_price,
          treatment_id: confirmed.id
        };
      })
      .filter(t => t !== null);

    if (treatmentsToCreate.length === 0) {
      setConfirmationDialogOpen(false);
      return;
    }
    
    setConfirmationDialogOpen(false);
    await createConfirmedTreatments(treatmentsToCreate);
  };

  const toggleRecording = () => {
    if (!recognition) {
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      setAiInput('');
      recognition.start();
      setIsRecording(true);
    }
  };

  const handleTreatmentChange = (treatmentId) => {
    const treatment = treatmentCatalog.find(t => t.id === treatmentId);
    setTreatmentForm({
      ...treatmentForm,
      treatment_id: treatmentId,
      price_paid: treatment?.default_price || '',
      amount_paid: treatment?.default_price || '',
      duration_minutes: treatment?.duration_minutes || ''
    });
  };

  const leadPractitioner = practitioners.find(p => p.is_lead);

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Quick Add</h1>
          <p className="text-sm text-gray-500 font-light">Add treatments or expenses</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-light text-[#1a2845] mb-1 tracking-tight">Quick Add</h3>
              <p className="text-sm text-gray-500 font-light">
                Type naturally: "Saw Emma today, botox £300, paid in full"
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAiMode(!aiMode)}
              className={`px-5 py-2 rounded-lg text-sm font-light tracking-wide uppercase transition-colors ${
                aiMode 
                  ? 'bg-[#1a2845] text-white' 
                  : 'bg-white text-[#1a2845] border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {aiMode ? 'Manual Form' : 'AI Mode'}
            </button>
          </div>
        </div>

        {aiMode ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-all ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-purple-100'
                }`}>
                  {isRecording ? (
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                    </div>
                  ) : (
                    <Sparkles className="w-8 h-8 text-purple-600" />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {isRecording ? 'Listening...' : 'Tell me what happened'}
                </h2>
                <p className="text-gray-600">
                  {isRecording 
                    ? 'Speak clearly about your treatments - I\'m recording'
                    : 'Type or use voice to describe your day naturally'
                  }
                </p>
              </div>

              <form onSubmit={handleAISubmit} className="space-y-4">
                <div className="relative">
                  <Textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder={isRecording 
                      ? "Listening... speak naturally about your treatments" 
                      : "Example: Saw Sarah Johnson at 10am, did botox for £250 and lip filler for £180. Both paid in full. Also saw Mark Davis, dermal filler £200, he'll pay next week."
                    }
                    className={`rounded-xl border-gray-300 min-h-32 text-base pr-20 ${
                      isRecording ? 'border-red-500 border-2' : ''
                    }`}
                    disabled={processingAI}
                  />
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={processingAI}
                    className={`absolute right-3 bottom-3 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isRecording 
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                        : 'bg-purple-600 hover:bg-purple-700'
                    } text-white shadow-lg disabled:opacity-50`}
                    title={isRecording ? 'Stop recording' : 'Start voice recording'}
                  >
                    {isRecording ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2h2v2a5 5 0 0 0 10 0v-2h2z" />
                        <path d="M11 20h2v3h-2z" />
                        <path d="M8 23h8v2H8z" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2h2v2a5 5 0 0 0 10 0v-2h2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Guidelines</p>
                      <ul className="text-sm text-gray-700 space-y-1.5 leading-relaxed">
                        <li className="flex items-start">
                          <span className="text-gray-400 mr-2">•</span>
                          <span>Click the microphone and speak naturally</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-gray-400 mr-2">•</span>
                          <span>Say patient names, treatments, prices, and payment status</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-gray-400 mr-2">•</span>
                          <span>You can mention multiple treatments in one recording</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={processingAI || !aiInput.trim() || isRecording}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-12 text-base"
                >
                  {processingAI ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isRecording ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Stop recording to continue...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Add Treatments with AI
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="border-b border-gray-100 p-6 pb-0">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("treatment")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium transition-colors ${
                    activeTab === "treatment"
                      ? 'bg-[#2C3E50] text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  Treatment
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("expense")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium transition-colors ${
                    activeTab === "expense"
                      ? 'bg-[#2C3E50] text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  Expense
                </button>
              </div>
            </div>

          <div className="p-8">
            {activeTab === "treatment" ? (
              <form onSubmit={(e) => handleTreatmentSubmit(e, false)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="date" className="text-sm font-medium text-gray-700">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={treatmentForm.date}
                      onChange={(e) => setTreatmentForm({...treatmentForm, date: e.target.value})}
                      className="rounded-xl border-gray-300 h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patient" className="text-sm font-medium text-gray-700">Patient Name</Label>
                    {newPatientName !== null ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter patient name"
                          value={newPatientName}
                          onChange={(e) => setNewPatientName(e.target.value)}
                          className="rounded-xl border-gray-300 h-11"
                          required={newPatientName !== null && newPatientName !== ''}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setNewPatientName(null);
                            setTreatmentForm({...treatmentForm, patient_id: '', patient_name: ''});
                          }}
                          className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <Select 
                        value={treatmentForm.patient_id}
                        onValueChange={(value) => {
                          if (value === 'new') {
                            setNewPatientName('');
                            setTreatmentForm({...treatmentForm, patient_id: '', patient_name: ''});
                          } else {
                            const patient = patients.find(p => p.id === value);
                            setTreatmentForm({...treatmentForm, patient_id: value, patient_name: patient?.name});
                          }
                        }}
                      >
                        <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">+ Add New Patient</SelectItem>
                          {patients.map((patient) => (
                            <SelectItem key={patient.id} value={patient.id}>
                              {patient.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="treatment" className="text-sm font-medium text-gray-700">Treatment *</Label>
                    <Select 
                      value={treatmentForm.treatment_id} 
                      onValueChange={handleTreatmentChange}
                      required
                    >
                      <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900">
                        <SelectValue placeholder="Select treatment" />
                      </SelectTrigger>
                      <SelectContent>
                        {treatmentCatalog.map((treatment) => (
                          <SelectItem key={treatment.id} value={treatment.id}>
                            {treatment.treatment_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price" className="text-sm font-medium text-gray-700">Price (£) *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={treatmentForm.price_paid}
                      onChange={(e) => setTreatmentForm({...treatmentForm, price_paid: e.target.value, amount_paid: treatmentForm.payment_status === 'paid' ? e.target.value : treatmentForm.amount_paid})}
                      className="rounded-xl border-gray-300 h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration" className="text-sm font-medium text-gray-700">Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      placeholder="e.g. 30, 60, 90"
                      value={treatmentForm.duration_minutes}
                      onChange={(e) => setTreatmentForm({...treatmentForm, duration_minutes: e.target.value})}
                      className="rounded-xl border-gray-300 h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment_status" className="text-sm font-medium text-gray-700">Payment Status *</Label>
                    <Select 
                      value={treatmentForm.payment_status} 
                      onValueChange={(value) => setTreatmentForm({...treatmentForm, payment_status: value, amount_paid: value === 'paid' ? treatmentForm.price_paid : (value === 'pending' ? '0' : treatmentForm.amount_paid)})}
                      required
                    >
                      <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">Paid in Full</SelectItem>
                        <SelectItem value="pending">Payment Pending</SelectItem>
                        <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {treatmentForm.payment_status === 'partially_paid' && (
                    <div className="space-y-2">
                      <Label htmlFor="amount_paid" className="text-sm font-medium text-gray-700">Amount Paid (£) *</Label>
                      <Input
                        id="amount_paid"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={treatmentForm.amount_paid}
                        onChange={(e) => setTreatmentForm({...treatmentForm, amount_paid: e.target.value})}
                        className="rounded-xl border-gray-300 h-11"
                        required
                      />
                    </div>
                  )}

                  <div className={`space-y-3 ${treatmentForm.payment_status === 'partially_paid' ? 'md:col-span-2' : 'md:col-span-2'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="use-lead-practitioner"
                        checked={useLeadPractitioner}
                        onChange={(e) => handleLeadPractitionerToggle(e.target.checked)}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-600"
                      />
                      <Label htmlFor="use-lead-practitioner" className="text-sm font-medium text-gray-700 cursor-pointer">
                        Use Lead Practitioner {leadPractitioner && `(${leadPractitioner.name})`}
                      </Label>
                    </div>

                    {!useLeadPractitioner && (
                      <>
                        {newPractitionerName !== null ? (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Enter practitioner name"
                              value={newPractitionerName}
                              onChange={(e) => setNewPractitionerName(e.target.value)}
                              className="rounded-xl border-gray-300 h-11"
                              required={newPractitionerName !== null && newPractitionerName !== ''}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setNewPractitionerName(null);
                                setTreatmentForm({...treatmentForm, practitioner_id: ''});
                              }}
                              className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label htmlFor="practitioner" className="text-sm font-medium text-gray-700">Practitioner *</Label>
                            <Select 
                              value={treatmentForm.practitioner_id} 
                              onValueChange={(value) => {
                                if (value === 'new') {
                                  setNewPractitionerName('');
                                  setTreatmentForm({...treatmentForm, practitioner_id: ''});
                                } else {
                                  setTreatmentForm({...treatmentForm, practitioner_id: value});
                                }
                              }}
                              required
                            >
                              <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900">
                                <SelectValue placeholder="Select practitioner" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">+ Add New Practitioner</SelectItem>
                                {practitioners.map((practitioner) => (
                                  <SelectItem key={practitioner.id} value={practitioner.id}>
                                    {practitioner.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    )}

                    {useLeadPractitioner && leadPractitioner && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <p className="text-sm text-purple-900">
                          <span className="font-semibold">Using:</span> {leadPractitioner.name}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes" className="text-sm font-medium text-gray-700">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Optional notes..."
                      value={treatmentForm.notes}
                      onChange={(e) => setTreatmentForm({...treatmentForm, notes: e.target.value})}
                      className="rounded-xl border-gray-300"
                      rows={3}
                    />
                  </div>
                </div>

                {treatmentForm.payment_status === 'pending' && (
                  <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 border-2 rounded-xl p-4 ${
                    canSendSMS() ? 'border-blue-200' : 'border-gray-200 opacity-60'
                  }`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="send-invoice-sms"
                        checked={sendInvoiceSMS}
                        onChange={(e) => setSendInvoiceSMS(e.target.checked)}
                        disabled={!canSendSMS()}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-600 mt-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div className="flex-1">
                        <Label htmlFor="send-invoice-sms" className={`text-sm font-semibold cursor-pointer block mb-1 ${
                          canSendSMS() ? 'text-gray-900' : 'text-gray-500'
                        }`}>
                          Send payment link via SMS after saving
                        </Label>
                        <p className="text-xs text-gray-700 mb-2">
                          Automatically generate invoice, create payment link, and send SMS to patient
                        </p>



                        {!canSendSMS() && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-2">
                            <p className="text-xs font-medium text-yellow-900">Requirements:</p>
                            <ul className="text-xs text-yellow-800 mt-1 space-y-1">
                              {!treatmentForm.patient_id && (
                                <li>• Select a patient first</li>
                              )}
                              {treatmentForm.patient_id && !patients.find(p => p.id === treatmentForm.patient_id)?.phone && (
                                <li>• Add phone number to patient in Catalogue</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {treatmentForm.payment_status === 'pending' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Payment Outstanding</p>
                      <p className="text-sm text-blue-700 mt-1">This treatment will not count toward revenue until marked as paid.</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button 
                    type="submit" 
                    className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl h-12"
                    disabled={createTreatmentMutation.isPending}
                  >
                    <Save className="w-5 h-5 mr-2" />
                    Save Treatment
                  </Button>
                  <Button 
                    type="button"
                    onClick={(e) => handleTreatmentSubmit(e, true)}
                    variant="outline"
                    className="flex-1 border-gray-300 hover:bg-gray-50 rounded-xl h-12 text-[#2C3E50] hover:text-[#2C3E50]"
                    disabled={createTreatmentMutation.isPending}
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Save & Add Another
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload Bank Statement</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Upload your bank statement (PDF, CSV, or image) and AI will extract all expenses automatically
                      </p>
                      <div className="flex gap-3">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept=".pdf,.csv,.png,.jpg,.jpeg"
                            onChange={handleBankStatementUpload}
                            className="hidden"
                            disabled={uploadingStatement}
                          />
                          <div className={`px-6 py-3 rounded-xl font-semibold transition-colors inline-flex items-center ${
                            uploadingStatement
                              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}>
                            {uploadingStatement ? (
                              <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <Upload className="w-5 h-5 mr-2" />
                                Upload Statement
                              </>
                            )}
                          </div>
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        Supported formats: PDF, CSV, PNG, JPG
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-4 text-sm text-gray-500">or add manually</span>
                  </div>
                </div>

                <form onSubmit={(e) => handleExpenseSubmit(e, false)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="expense-date" className="text-sm font-medium text-gray-700">Date *</Label>
                      <Input
                        id="expense-date"
                        type="date"
                        value={expenseForm.date}
                        onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                        className="rounded-xl border-gray-300 h-11"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category" className="text-sm font-medium text-gray-700">Category *</Label>
                      <Select 
                        value={expenseForm.category} 
                        onValueChange={(value) => setExpenseForm({...expenseForm, category: value})}
                        required
                      >
                        <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Rent">Rent</SelectItem>
                          <SelectItem value="Products">Products</SelectItem>
                          <SelectItem value="Wages">Wages</SelectItem>
                          <SelectItem value="Insurance">Insurance</SelectItem>
                          <SelectItem value="Marketing">Marketing</SelectItem>
                          <SelectItem value="Utilities">Utilities</SelectItem>
                          <SelectItem value="Equipment">Equipment</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="amount" className="text-sm font-medium text-gray-700">Amount (£) *</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={expenseForm.amount}
                        onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                        className="rounded-xl border-gray-300 h-11"
                        required
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="expense-notes" className="text-sm font-medium text-gray-700">Notes</Label>
                      <Textarea
                        id="expense-notes"
                        placeholder="Optional notes..."
                        value={expenseForm.notes}
                        onChange={(e) => setExpenseForm({...expenseForm, notes: e.target.value})}
                        className="rounded-xl border-gray-300"
                        rows={3}
                      />
                    </div>

                    <div className="space-y-4 md:col-span-2 border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="is-recurring"
                          checked={expenseForm.is_recurring}
                          onChange={(e) => setExpenseForm({...expenseForm, is_recurring: e.target.checked})}
                          className="w-4 h-4 text-[#2C3E50] border-gray-300 rounded focus:ring-[#2C3E50]"
                        />
                        <Label htmlFor="is-recurring" className="text-sm font-medium text-gray-700 cursor-pointer">
                          Make this a recurring expense
                        </Label>
                      </div>

                      {expenseForm.is_recurring && (
                        <div className="space-y-2 ml-7">
                          <Label htmlFor="frequency" className="text-sm font-medium text-gray-700">Frequency</Label>
                          <Select 
                            value={expenseForm.recurrence_frequency} 
                            onValueChange={(value) => setExpenseForm({...expenseForm, recurrence_frequency: value})}
                          >
                            <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900 w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-500 mt-1">
                            This expense will be automatically added each {expenseForm.recurrence_frequency === 'monthly' ? 'month' : expenseForm.recurrence_frequency === 'weekly' ? 'week' : 'year'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button 
                      type="submit" 
                      className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl h-12"
                      disabled={createExpenseMutation.isPending}
                    >
                      <Save className="w-5 h-5 mr-2" />
                      Save Expense
                    </Button>
                    <Button 
                      type="button"
                      onClick={(e) => handleExpenseSubmit(e, true)}
                      variant="outline"
                      className="flex-1 border-gray-300 hover:bg-gray-50 rounded-xl h-12 text-[#2C3E50] hover:text-[#2C3E50]"
                      disabled={createExpenseMutation.isPending}
                    >
                      <Plus className="w-5 h-5 mr-2" />
                      Save & Add Another
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
        )}

        <Dialog open={expenseConfirmDialogOpen} onOpenChange={setExpenseConfirmDialogOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-600" />
                Review Extracted Expenses
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <p className="text-sm text-gray-600">
                Found {extractedExpenses.length} expense{extractedExpenses.length > 1 ? 's' : ''} from your bank statement. 
                Review and adjust before adding:
              </p>

              <div className="space-y-3">
                {confirmedExpenses.map((expense, index) => (
                  <div 
                    key={index} 
                    className={`bg-gray-50 rounded-xl p-4 border-2 transition-all ${
                      expense.include ? 'border-green-300 bg-green-50' : 'border-gray-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={expense.include}
                        onChange={() => toggleExpenseInclusion(index)}
                        className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-600 mt-1"
                      />
                      
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-600">Date</Label>
                          <Input
                            type="date"
                            value={expense.date}
                            onChange={(e) => updateConfirmedExpense(index, 'date', e.target.value)}
                            className="rounded-lg border-gray-300 h-10 text-sm"
                            disabled={!expense.include}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-gray-600">Category</Label>
                          <Select
                            value={expense.category}
                            onValueChange={(value) => updateConfirmedExpense(index, 'category', value)}
                            disabled={!expense.include}
                          >
                            <SelectTrigger className="rounded-lg border-gray-300 h-10 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Rent">Rent</SelectItem>
                              <SelectItem value="Products">Products</SelectItem>
                              <SelectItem value="Wages">Wages</SelectItem>
                              <SelectItem value="Insurance">Insurance</SelectItem>
                              <SelectItem value="Marketing">Marketing</SelectItem>
                              <SelectItem value="Utilities">Utilities</SelectItem>
                              <SelectItem value="Equipment">Equipment</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-gray-600">Amount (£)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={expense.amount}
                            onChange={(e) => updateConfirmedExpense(index, 'amount', parseFloat(e.target.value))}
                            className="rounded-lg border-gray-300 h-10 text-sm"
                            disabled={!expense.include}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-gray-600">Description</Label>
                          <Input
                            value={expense.description || ''}
                            onChange={(e) => updateConfirmedExpense(index, 'description', e.target.value)}
                            placeholder="Notes..."
                            className="rounded-lg border-gray-300 h-10 text-sm"
                            disabled={!expense.include}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-900">
                  <strong>{confirmedExpenses.filter(e => e.include).length}</strong> of {confirmedExpenses.length} expenses will be added
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setExpenseConfirmDialogOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={proceedWithExpenses}
                  disabled={confirmedExpenses.filter(e => e.include).length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  Add {confirmedExpenses.filter(e => e.include).length} Expense{confirmedExpenses.filter(e => e.include).length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
                Please Confirm Treatments
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 mt-4">
              <p className="text-sm text-gray-600">
                I found some treatments that need clarification. Please select the correct treatment for each:
              </p>

              {pendingTreatments.map((pending, index) => {
                if (!pending.needsConfirmation) return null;
                
                const isConfirmed = confirmedTreatments[index] !== null;
                const isSkipped = confirmedTreatments[index] === 'SKIP';
                
                return (
                  <div key={index} className="bg-gray-50 rounded-xl p-5 border-2 border-gray-200">
                    <div className="mb-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">Treatment {index + 1}</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            From your input: <span className="font-medium text-gray-900">"{pending.original.treatment_name}"</span>
                          </p>
                          {pending.original.patient_name && (
                            <p className="text-sm text-gray-500">
                              Patient: {pending.original.patient_name}
                            </p>
                          )}
                        </div>
                        {isConfirmed && !isSkipped && (
                          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1 rounded-full">
                            <Check className="w-4 h-4" />
                            <span className="text-sm font-medium">Confirmed</span>
                          </div>
                        )}
                        {isSkipped && (
                          <div className="flex items-center gap-2 text-gray-600 bg-gray-200 px-3 py-1 rounded-full">
                            <span className="text-sm font-medium">Skipped</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {pending.noMatch ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-800 mb-3">
                          No matching treatment found in your catalog. Please add this treatment to your catalog first, or skip it.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleSkipTreatment(index)}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                        >
                          Skip This Treatment
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-700 mb-3">
                          Which treatment did you mean?
                        </p>
                        {pending.matches.map((treatment) => {
                         const isSelected = confirmedTreatments[index]?.id === treatment.id;
                         return (
                           <button
                             type="button"
                             key={treatment.id}
                             onClick={() => handleConfirmTreatment(index, treatment)}
                             className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                               isSelected
                                 ? 'border-green-500 bg-green-50'
                                 : 'border-gray-300 bg-white hover:border-purple-300 hover:bg-purple-50'
                             }`}
                           >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold text-gray-900">{treatment.treatment_name}</p>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {treatment.category} • £{treatment.default_price.toFixed(2)}
                                    {treatment.duration_minutes && ` • ${treatment.duration_minutes} min`}
                                  </p>
                                </div>
                                {isSelected && (
                                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Check className="w-4 h-4 text-white" />
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => handleSkipTreatment(index)}
                          className="w-full mt-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                        >
                          Skip This Treatment
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setConfirmationDialogOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={proceedWithConfirmedTreatments}
                  disabled={confirmedTreatments.every(t => t === null)}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  Confirm & Add Treatments
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}