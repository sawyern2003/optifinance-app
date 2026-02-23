import React, { useState } from "react";
import { api } from "@/api/api";
import { invoicesAPI } from "@/api/invoices";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Search, Sparkles, CreditCard, Pencil, FileText, Loader2, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

export default function Records() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState("treatments");
  const [dateRangePreset, setDateRangePreset] = useState('all-time');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all'); // Added state for payment status filter
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [generatingInvoice, setGeneratingInvoice] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [useLeadPractitioner, setUseLeadPractitioner] = useState(false);
  const [newPractitionerName, setNewPractitionerName] = useState(null);
  const [partialPaymentDialogOpen, setPartialPaymentDialogOpen] = useState(false);
  const [partialPaymentTreatment, setPartialPaymentTreatment] = useState(null);
  const [partialPaymentAmount, setPartialPaymentAmount] = useState('');
  const [selectedTreatments, setSelectedTreatments] = useState([]);
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [downloadingPdfId, setDownloadingPdfId] = useState(null);



  const { data: treatments, isLoading: loadingTreatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.entities.Expense.list('-date'),
    initialData: [],
  });

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

  const { data: invoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.entities.Invoice.list('-created_date'),
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

  const deleteTreatmentMutation = useMutation({
    mutationFn: (id) => api.entities.TreatmentEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      setSelectedTreatments([]);
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id) => api.entities.Expense.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      setSelectedExpenses([]);
    },
  });

  const handleDeleteClick = (item, type) => {
    setItemToDelete({ ...item, type });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (itemToDelete.type === 'treatment') {
      deleteTreatmentMutation.mutate(itemToDelete.id);
    } else {
      deleteExpenseMutation.mutate(itemToDelete.id);
    }
  };

  const handleBulkDelete = async () => {
    const itemsToDelete = activeTab === 'treatments' ? selectedTreatments : selectedExpenses;
    
    if (itemsToDelete.length === 0) return;

    try {
      for (const id of itemsToDelete) {
        if (activeTab === 'treatments') {
          await deleteTreatmentMutation.mutateAsync(id);
        } else {
          await deleteExpenseMutation.mutateAsync(id);
        }
      }

      if (activeTab === 'treatments') {
        setSelectedTreatments([]);
      } else {
        setSelectedExpenses([]);
      }
    } catch (error) {
      console.error('Failed to delete some items:', error);
    }
  };

  const toggleSelectAll = () => {
    if (activeTab === 'treatments') {
      if (selectedTreatments.length === filteredTreatments.length) {
        setSelectedTreatments([]);
      } else {
        setSelectedTreatments(filteredTreatments.map(t => t.id));
      }
    } else {
      if (selectedExpenses.length === filteredExpenses.length) {
        setSelectedExpenses([]);
      } else {
        setSelectedExpenses(filteredExpenses.map(e => e.id));
      }
    }
  };

  const toggleSelectItem = (id) => {
    if (activeTab === 'treatments') {
      setSelectedTreatments(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else {
      setSelectedExpenses(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    }
  };

  const updateTreatmentMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.TreatmentEntry.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      setEditDialogOpen(false);
      setEditingItem(null);
      setPartialPaymentDialogOpen(false);
      setPartialPaymentTreatment(null);
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Expense.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setEditDialogOpen(false);
      setEditingItem(null);
    },
  });

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  };

  const automateInvoiceAndPayment = async (treatment) => {
      try {
        console.log('🚀 Starting invoice automation...', { treatment_id: treatment.id });
        
        const patient = patients.find(p => p.id === treatment.patient_id);
        if (!patient?.phone) {
          console.error('❌ No phone number for patient');
          return;
        }

        console.log('📞 Patient found:', { name: patient.name, phone: patient.phone });

        const invoiceNumber = generateInvoiceNumber();
        console.log('📝 Invoice number:', invoiceNumber);

        console.log('📄 Creating invoice...');
        const createdInvoice = await api.entities.Invoice.create({
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
          notes: treatment.notes || ''
        });
        console.log('✅ Invoice created');

        console.log('📄 Generating PDF...');
        await invoicesAPI.generateInvoicePDF(createdInvoice.id);
        console.log('📲 Sending SMS via Twilio...');
        await api.functions.invoke('sendInvoiceSMS', { invoiceId: createdInvoice.id });
        
        console.log('✅ SMS Response:', smsResponse);
        console.log('✅ SMS sent successfully');

        queryClient.invalidateQueries({ queryKey: ['invoices'] });

      } catch (error) {
        console.error('❌ Invoice automation failed:', error);
        console.error('❌ Error details:', error.message, error.response?.data);
      }
    };

  const handlePaymentStatusChange = async (treatment, newStatus) => {
    if (newStatus === 'partially_paid') {
      setPartialPaymentTreatment(treatment);
      setPartialPaymentAmount('');
      setPartialPaymentDialogOpen(true);
      return;
    }

    let updatedAmountPaid = treatment.amount_paid;
    if (newStatus === 'paid') {
      updatedAmountPaid = treatment.price_paid;

      // Check if patient has phone for automated invoice SMS
      const patient = patients.find(p => p.id === treatment.patient_id);
      if (patient?.phone) {
        await automateInvoiceAndPayment(treatment);
      }
    } else if (newStatus === 'pending') {
      updatedAmountPaid = 0;
    }

    const profit = updatedAmountPaid - (treatment.product_cost || 0);

    updateTreatmentMutation.mutate({
      id: treatment.id,
      data: {
        ...treatment,
        payment_status: newStatus,
        amount_paid: updatedAmountPaid,
        profit: profit
      }
    });
  };



  const handlePartialPaymentSubmit = (e) => {
    e.preventDefault();
    
    if (!partialPaymentTreatment) return;
    
    const amount = parseFloat(partialPaymentAmount);
    if (isNaN(amount) || amount <= 0 || amount > partialPaymentTreatment.price_paid) {
      return;
    }

    const profit = amount - (partialPaymentTreatment.product_cost || 0);
    
    updateTreatmentMutation.mutate({
      id: partialPaymentTreatment.id,
      data: {
        ...partialPaymentTreatment,
        payment_status: 'partially_paid',
        amount_paid: amount,
        profit: profit
      }
    });
  };

  const handleLeadPractitionerToggle = (checked) => {
    setUseLeadPractitioner(checked);
    if (checked) {
      const leadPractitioner = practitioners.find(p => p.is_lead);
      if (leadPractitioner) {
        setEditForm(prev => ({
          ...prev,
          practitioner_id: leadPractitioner.id,
          practitioner_name: leadPractitioner.name
        }));
        setNewPractitionerName(null);
      } else {
        setUseLeadPractitioner(false);
        setEditForm(prev => ({
          ...prev,
          practitioner_id: '',
          practitioner_name: ''
        }));
      }
    } else {
      setEditForm(prev => ({
        ...prev,
        practitioner_id: '',
        practitioner_name: ''
      }));
    }
  };

  const autoAssignLeadPractitioner = async () => {
    const leadPractitioner = practitioners.find(p => p.is_lead);
    
    if (!leadPractitioner) {
      return;
    }

    const treatmentsWithoutPractitioner = treatments.filter(t => !t.practitioner_id && !t.practitioner_name);
    
    if (treatmentsWithoutPractitioner.length === 0) {
      return;
    }

    try {
      // Update all treatments without a practitioner
      for (const treatment of treatmentsWithoutPractitioner) {
        await updateTreatmentMutation.mutateAsync({
          id: treatment.id,
          data: {
            ...treatment,
            practitioner_id: leadPractitioner.id,
            practitioner_name: leadPractitioner.name
          }
        });
      }
    } catch (error) {
      console.error('Failed to auto-assign practitioner:', error);
    }
  };

  const openEditDialog = (item, type) => {
    setEditingItem({ ...item, type });
    if (type === 'treatment') {
      const patient = patients.find(p => p.name === item.patient_name);
      const leadPractitioner = practitioners.find(p => p.is_lead);
      const isCurrentPractitionerLead = item.practitioner_id && leadPractitioner?.id === item.practitioner_id;
      setUseLeadPractitioner(isCurrentPractitionerLead);
      setNewPractitionerName(null); // Reset new practitioner input when opening dialog
      
      // Determine initial practitioner_id for the form
      let initialPractitionerId = item.practitioner_id || '';
      if (isCurrentPractitionerLead && leadPractitioner) { // Ensure leadPractitioner exists before using its ID
        initialPractitionerId = leadPractitioner.id;
      }
      
      setEditForm({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        patient_id: patient?.id || '',
        patient_name: item.patient_name || '',
        treatment_id: item.treatment_id || '',
        treatment_name: item.treatment_name,
        price_paid: item.price_paid,
        payment_status: item.payment_status,
        amount_paid: item.amount_paid || item.price_paid,
        duration_minutes: item.duration_minutes || '',
        practitioner_id: initialPractitionerId,
        practitioner_name: item.practitioner_name || '',
        notes: item.notes || ''
      });
    } else {
      setEditForm({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        category: item.category,
        amount: item.amount,
        notes: item.notes || ''
      });
    }
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => { // Made async to handle practitioner creation
    e.preventDefault();
    
    if (editingItem.type === 'treatment') {
      let finalPractitionerId = editForm.practitioner_id;
      let finalPractitionerName = editForm.practitioner_name;
      
      if (newPractitionerName !== null && newPractitionerName.trim() !== '') {
        try {
          const newPractitioner = await api.entities.Practitioner.create({ name: newPractitionerName });
          finalPractitionerId = newPractitioner.id;
          finalPractitionerName = newPractitioner.name;
          queryClient.invalidateQueries({ queryKey: ['practitioners'] });
          setNewPractitionerName(null);
        } catch (error) {
          console.error('Failed to create new practitioner:', error);
          return;
        }
      } else if (useLeadPractitioner) {
        const leadPractitioner = practitioners.find(p => p.is_lead);
        finalPractitionerId = leadPractitioner?.id || null;
        finalPractitionerName = leadPractitioner?.name || '';
      } else if (editForm.practitioner_id === 'none') {
        finalPractitionerId = null;
        finalPractitionerName = '';
      } else {
        const selectedPractitioner = practitioners.find(p => p.id === editForm.practitioner_id);
        finalPractitionerName = selectedPractitioner?.name || '';
      }
      
      const parsedPricePaid = parseFloat(editForm.price_paid);
      const parsedAmountPaid = parseFloat(editForm.amount_paid);

      let amountPaid = parsedAmountPaid;
      if (editForm.payment_status === 'paid') {
        amountPaid = parsedPricePaid;
      } else if (editForm.payment_status === 'pending') {
        amountPaid = 0;
      }
      
      const selectedTreatment = treatmentCatalog.find(t => t.id === editForm.treatment_id);
      const selectedPatient = patients.find(p => p.id === editForm.patient_id);
      
      const productCost = selectedTreatment?.typical_product_cost || 0;
      const profit = amountPaid - productCost;
      
      updateTreatmentMutation.mutate({
        id: editingItem.id,
        data: {
          ...editingItem,
          date: editForm.date,
          patient_id: editForm.patient_id === 'none' ? null : editForm.patient_id,
          patient_name: selectedPatient?.name || editForm.patient_name,
          treatment_id: editForm.treatment_id,
          treatment_name: selectedTreatment?.treatment_name || editForm.treatment_name,
          duration_minutes: editForm.duration_minutes ? parseFloat(editForm.duration_minutes) : undefined,
          price_paid: parsedPricePaid,
          payment_status: editForm.payment_status,
          amount_paid: amountPaid,
          product_cost: productCost,
          profit: profit,
          practitioner_id: finalPractitionerId,
          practitioner_name: finalPractitionerName,
          notes: editForm.notes
        }
      });
    } else {
      updateExpenseMutation.mutate({
        id: editingItem.id,
        data: {
          ...editingItem,
          date: editForm.date,
          category: editForm.category,
          amount: parseFloat(editForm.amount),
          notes: editForm.notes
        }
      });
    }
  };

  const generateInvoice = async (treatment) => {
    setGeneratingInvoice(treatment.id);
    const invoiceNumber = generateInvoiceNumber();
    const patient = patients.find((p) => p.id === treatment.patient_id);

    try {
      // Create invoice record first (no PDF yet)
      const createdInvoice = await api.entities.Invoice.create({
        invoice_number: invoiceNumber,
        treatment_entry_id: treatment.id,
        patient_name: treatment.patient_name || 'Patient',
        patient_contact: patient?.contact || '',
        treatment_name: treatment.treatment_name,
        treatment_date: treatment.date,
        amount: treatment.price_paid,
        practitioner_name: treatment.practitioner_name || '',
        issue_date: format(new Date(), 'yyyy-MM-dd'),
        status: treatment.payment_status === 'paid' ? 'paid' : 'draft',
        notes: treatment.notes || '',
      });

      // Generate real PDF (clinic name, patient, price, bank details) via Edge Function and upload to Storage
      const result = await invoicesAPI.generateInvoicePDF(createdInvoice.id);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });

      if (result?.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      }
      toast({
        title: 'Invoice PDF ready',
        description: 'A proper PDF with your clinic name, patient, amount and bank details has been generated.',
        className: 'bg-green-50 border-green-200',
      });
    } catch (error) {
      console.error('Failed to generate invoice PDF:', error);
      toast({
        title: 'Failed to generate invoice',
        description: error?.message || 'Could not create PDF. Please try again.',
        variant: 'destructive',
      });
    }
    setGeneratingInvoice(null);
  };

  const openPdfDownload = async (invoice) => {
    if (!invoice?.id) return;
    setDownloadingPdfId(invoice.id);
    try {
      const url = await invoicesAPI.getInvoicePdfDownloadUrl(invoice);
      window.open(url, '_blank');
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err?.message || 'Could not open PDF',
        variant: 'destructive',
      });
    }
    setDownloadingPdfId(null);
  };

  const getDateRange = () => {
    const now = new Date();
    switch(dateRangePreset) {
      case 'this-month':
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
      case 'last-month':
        const lastMonth = subMonths(now, 1);
        return {
          start: startOfMonth(lastMonth),
          end: endOfMonth(lastMonth)
        };
      case 'last-3-months':
        return {
          start: startOfMonth(subMonths(now, 2)),
          end: endOfMonth(now)
        };
      case 'last-6-months':
        return {
          start: startOfMonth(subMonths(now, 5)),
          end: endOfMonth(now)
        };
      case 'year-to-date':
        return {
          start: startOfYear(now),
          end: now
        };
      case 'custom':
        return {
          start: customStartDate ? new Date(customStartDate) : null,
          end: customEndDate ? new Date(customEndDate) : null
        };
      case 'all-time':
      default:
        return null;
    }
  };

  const dateRange = getDateRange();

  const filteredTreatments = treatments.filter(t => {
    const matchesSearch = t.treatment_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.practitioner_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPaymentStatus = paymentStatusFilter === 'all' || t.payment_status === paymentStatusFilter; // Added payment status filter

    if (dateRange && dateRange.start && dateRange.end) {
      const tDate = new Date(t.date);
      const rangeStart = new Date(dateRange.start);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(dateRange.end);
      rangeEnd.setHours(23, 59, 59, 999);
      return matchesSearch && matchesPaymentStatus && tDate >= rangeStart && tDate <= rangeEnd;
    }
    
    return matchesSearch && matchesPaymentStatus;
  });

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (dateRange && dateRange.start && dateRange.end) {
      const eDate = new Date(e.date);
      const rangeStart = new Date(dateRange.start);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(dateRange.end);
      rangeEnd.setHours(23, 59, 59, 999);
      return matchesSearch && eDate >= rangeStart && eDate <= rangeEnd;
    }
    
    return matchesSearch;
  });

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Records</h1>
          <p className="text-sm text-gray-500 font-light">View and manage all your transactions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Tabs and Search */}
          <div className="border-b border-gray-100 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("treatments")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                    activeTab === "treatments"
                      ? 'bg-[#2C3E50] text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  Treatments
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("expenses")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                    activeTab === "expenses"
                      ? 'bg-[#2C3E50] text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  Expenses
                </button>
              </div>
              
              <div className="flex gap-3 items-center w-full md:w-auto">
                {activeTab === "treatments" && (
                  <Button
                    onClick={autoAssignLeadPractitioner}
                    variant="outline"
                    className="border-[#f0e9d8] text-[#1a2845] hover:bg-[#fef9f0] rounded-xl whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Auto-assign Lead
                  </Button>
                )}
                <div className="relative flex-1 md:w-80">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    placeholder="Search records..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 rounded-xl border-gray-300 h-11"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {((activeTab === 'treatments' && selectedTreatments.length > 0) || 
              (activeTab === 'expenses' && selectedExpenses.length > 0)) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-blue-900">
                    {activeTab === 'treatments' ? selectedTreatments.length : selectedExpenses.length} selected
                  </span>
                  <Button
                    onClick={() => activeTab === 'treatments' ? setSelectedTreatments([]) : setSelectedExpenses([])}
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                  >
                    Clear
                  </Button>
                </div>
                <Button
                  onClick={handleBulkDelete}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </Button>
              </div>
            )}

            {/* Date Range and Payment Status Filters */}
            <div className="flex flex-col md:flex-row md:items-end gap-4 mt-4">
              <Select value={dateRangePreset} onValueChange={setDateRangePreset}>
                <SelectTrigger className="w-full md:w-48 rounded-xl border-gray-300 h-11">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-time">All Time</SelectItem>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                  <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                  <SelectItem value="year-to-date">Year to Date</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {activeTab === "treatments" && (
                <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                  <SelectTrigger className="w-full md:w-48 rounded-xl border-gray-300 h-11">
                    <SelectValue placeholder="Payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payments</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partially_paid">Partial</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {dateRangePreset === 'custom' && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="start-date" className="text-xs text-gray-600">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="rounded-xl border-gray-300 h-11"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="end-date" className="text-xs text-gray-600">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="rounded-xl border-gray-300 h-11"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Selection Controls */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {activeTab === 'treatments' 
                  ? `${filteredTreatments.length} treatment${filteredTreatments.length !== 1 ? 's' : ''}`
                  : `${filteredExpenses.length} expense${filteredExpenses.length !== 1 ? 's' : ''}`
                }
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {((activeTab === 'treatments' && selectedTreatments.length === filteredTreatments.length && filteredTreatments.length > 0) ||
                (activeTab === 'expenses' && selectedExpenses.length === filteredExpenses.length && filteredExpenses.length > 0))
                ? 'Deselect All'
                : 'Select All'}
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {activeTab === "treatments" ? (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedTreatments.length === filteredTreatments.length && filteredTreatments.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Treatment</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Paid</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Practitioner</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTreatments.map((treatment) => (
                    <tr key={treatment.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedTreatments.includes(treatment.id)}
                          onChange={() => toggleSelectItem(treatment.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{format(new Date(treatment.date), 'dd MMM yyyy')}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{treatment.patient_name || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{treatment.treatment_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {treatment.duration_minutes ? `${treatment.duration_minutes} min` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">£{treatment.price_paid?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-green-600">£{(treatment.amount_paid || 0).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <select
                          value={treatment.payment_status}
                          onChange={(e) => handlePaymentStatusChange(treatment, e.target.value)}
                          className={`text-xs font-medium px-3 py-1 rounded-full border-0 focus:ring-2 focus:ring-offset-0 ${
                            treatment.payment_status === 'paid' 
                              ? 'bg-green-100 text-green-800' 
                              : treatment.payment_status === 'pending'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          <option value="paid">Paid</option>
                          <option value="pending">Pending</option>
                          <option value="partially_paid">Partial</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          {treatment.practitioner_name || '-'}
                          {treatment.practitioner_id && practitioners.find(p => p.id === treatment.practitioner_id)?.is_lead && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-[#0f1829]">
                              Lead
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                       <div className="flex gap-2">
                         {(() => {
                           const inv = invoices?.find((i) => i.treatment_entry_id === treatment.id);
                           const hasPdf = inv?.invoice_pdf_url;
                           return hasPdf ? (
                             <button
                               type="button"
                               onClick={() => openPdfDownload(inv)}
                               disabled={downloadingPdfId === inv.id}
                               className="p-2 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
                               title="Download PDF"
                             >
                               {downloadingPdfId === inv.id ? (
                                 <Loader2 className="w-4 h-4 animate-spin" />
                               ) : (
                                 <Download className="w-4 h-4" />
                               )}
                             </button>
                           ) : null;
                         })()}
                         <button
                           type="button"
                           onClick={() => generateInvoice(treatment)}
                           disabled={generatingInvoice === treatment.id}
                           className="p-2 hover:bg-[#fef9f0] rounded-lg text-gray-400 hover:text-[#1a2845] transition-colors disabled:opacity-50"
                           title="Generate Invoice"
                         >
                           {generatingInvoice === treatment.id ? (
                             <Loader2 className="w-4 h-4 animate-spin" />
                           ) : (
                             <FileText className="w-4 h-4" />
                           )}
                         </button>
                         <button
                           type="button"
                           onClick={() => openEditDialog(treatment, 'treatment')}
                           className="p-2 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                         >
                           <Pencil className="w-4 h-4" />
                         </button>
                         <button
                           type="button"
                           onClick={() => handleDeleteClick(treatment, 'treatment')}
                           className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTreatments.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                        No treatments found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedExpenses.length === filteredExpenses.length && filteredExpenses.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Notes</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedExpenses.includes(expense.id)}
                          onChange={() => toggleSelectItem(expense.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{format(new Date(expense.date), 'dd MMM yyyy')}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{expense.category}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-red-600">£{expense.amount?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{expense.notes || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(expense, 'expense')}
                            className="p-2 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(expense, 'expense')}
                            className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No expenses found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Partial Payment Dialog */}
        <Dialog open={partialPaymentDialogOpen} onOpenChange={setPartialPaymentDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Enter Partial Payment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handlePartialPaymentSubmit} className="space-y-5 mt-4">
              {partialPaymentTreatment && (
                <>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Treatment: <span className="font-semibold text-gray-900">{partialPaymentTreatment.treatment_name}</span></p>
                    <p className="text-sm text-gray-600">Total Price: <span className="font-semibold text-gray-900">£{partialPaymentTreatment.price_paid?.toFixed(2)}</span></p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="partial-amount" className="text-sm font-medium text-gray-700">Amount Paid (£) *</Label>
                    <Input
                      id="partial-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      max={partialPaymentTreatment.price_paid}
                      value={partialPaymentAmount}
                      onChange={(e) => setPartialPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      className="rounded-xl border-gray-300 h-11"
                      required
                      autoFocus
                    />
                    <p className="text-xs text-gray-500">
                      Outstanding will be: £{partialPaymentAmount ? (partialPaymentTreatment.price_paid - parseFloat(partialPaymentAmount)).toFixed(2) : partialPaymentTreatment.price_paid?.toFixed(2)}
                    </p>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPartialPaymentDialogOpen(false);
                    setPartialPaymentTreatment(null);
                  }}
                  className="flex-1 rounded-xl border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl"
                >
                  Update Payment
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                Edit {editingItem?.type === 'treatment' ? 'Treatment' : 'Expense'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-5 mt-4">
              {editingItem?.type === 'treatment' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-date" className="text-sm font-medium text-gray-700">Date *</Label>
                    <Input
                      id="edit-date"
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                      className="rounded-xl border-gray-300 h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-patient" className="text-sm font-medium text-gray-700">Patient</Label>
                    <Select 
                      value={editForm.patient_id} 
                      onValueChange={(value) => {
                        const patient = patients.find(p => p.id === value);
                        setEditForm({
                          ...editForm, 
                          patient_id: value,
                          patient_name: patient?.name || ''
                        });
                      }}
                    >
                      <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900">
                        <SelectValue placeholder="Select patient (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Patient</SelectItem>
                        {patients.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id}>
                            {patient.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-treatment" className="text-sm font-medium text-gray-700">Treatment *</Label>
                    <Select 
                      value={editForm.treatment_id} 
                      onValueChange={(value) => {
                        const treatment = treatmentCatalog.find(t => t.id === value);
                        setEditForm({
                          ...editForm, 
                          treatment_id: value,
                          treatment_name: treatment?.treatment_name || '',
                          price_paid: treatment?.default_price || editForm.price_paid
                        });
                      }}
                      required
                    >
                      <SelectTrigger className="rounded-xl border-gray-300 h-11">
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
                    <Label htmlFor="edit-duration" className="text-sm font-medium text-gray-700">Duration (minutes)</Label>
                    <Input
                      id="edit-duration"
                      type="number"
                      value={editForm.duration_minutes}
                      onChange={(e) => setEditForm({...editForm, duration_minutes: e.target.value})}
                      placeholder="e.g. 30, 60, 90"
                      className="rounded-xl border-gray-300 h-11"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-price" className="text-sm font-medium text-gray-700">Price (£) *</Label>
                      <Input
                        id="edit-price"
                        type="number"
                        step="0.01"
                        value={editForm.price_paid}
                        onChange={(e) => setEditForm({...editForm, price_paid: e.target.value})}
                        className="rounded-xl border-gray-300 h-11"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-status" className="text-sm font-medium text-gray-700">Status *</Label>
                      <Select 
                        value={editForm.payment_status} 
                        onValueChange={(value) => setEditForm({...editForm, payment_status: value})}
                      >
                        <SelectTrigger className="rounded-xl border-gray-300 h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="partially_paid">Partial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {editForm.payment_status === 'partially_paid' && (
                    <div className="space-y-2">
                      <Label htmlFor="edit-amount-paid" className="text-sm font-medium text-gray-700">Amount Paid (£) *</Label>
                      <Input
                        id="edit-amount-paid"
                        type="number"
                        step="0.01"
                        value={editForm.amount_paid}
                        onChange={(e) => setEditForm({...editForm, amount_paid: e.target.value})}
                        className="rounded-xl border-gray-300 h-11"
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="use-lead-practitioner"
                        checked={useLeadPractitioner}
                        onChange={(e) => handleLeadPractitionerToggle(e.target.checked)}
                        className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-purple-600"
                      />
                      <Label htmlFor="use-lead-practitioner" className="text-sm font-medium text-gray-700 cursor-pointer">
                        Use Lead Practitioner
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
                              required={newPractitionerName !== null}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setNewPractitionerName(null);
                                setEditForm({...editForm, practitioner_id: '', practitioner_name: ''});
                              }}
                              className="rounded-xl border-gray-300"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label htmlFor="edit-practitioner" className="text-sm font-medium text-gray-700">Practitioner</Label>
                            <Select 
                              value={editForm.practitioner_id} 
                              onValueChange={(value) => {
                                if (value === 'new') {
                                  setNewPractitionerName('');
                                  setEditForm({...editForm, practitioner_id: '', practitioner_name: ''});
                                } else {
                                  const practitioner = practitioners.find(p => p.id === value);
                                  setEditForm({
                                    ...editForm, 
                                    practitioner_id: value === 'none' ? null : value,
                                    practitioner_name: value === 'none' ? '' : practitioner?.name || ''
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="rounded-xl border-gray-300 h-11 text-gray-900">
                                <SelectValue placeholder="Select practitioner (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">+ Add New Practitioner</SelectItem>
                                <SelectItem value="none">No Practitioner</SelectItem>
                                {practitioners.map((practitioner) => (
                                  <SelectItem key={practitioner.id} value={practitioner.id}>
                                    <div className="flex items-center gap-2">
                                      {practitioner.name}
                                      {practitioner.is_lead && (
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-[#0f1829]">
                                          Lead
                                        </span>
                                                                              )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    )}

                    {useLeadPractitioner && (
                      <div className="bg-[#fef9f0] border border-[#f0e9d8] rounded-lg p-3">
                        <p className="text-sm text-purple-900">
                          <span className="font-semibold">Lead Practitioner:</span> {editForm.practitioner_name || 'Not set'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-notes" className="text-sm font-medium text-gray-700">Notes</Label>
                    <Textarea
                      id="edit-notes"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                      placeholder="Optional notes..."
                      className="rounded-xl border-gray-300"
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-expense-date" className="text-sm font-medium text-gray-700">Date *</Label>
                    <Input
                      id="edit-expense-date"
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                      className="rounded-xl border-gray-300 h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-category" className="text-sm font-medium text-gray-700">Category *</Label>
                    <Select 
                      value={editForm.category} 
                      onValueChange={(value) => setEditForm({...editForm, category: value})}
                    >
                      <SelectTrigger className="rounded-xl border-gray-300 h-11">
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

                  <div className="space-y-2">
                    <Label htmlFor="edit-amount" className="text-sm font-medium text-gray-700">Amount (£) *</Label>
                    <Input
                      id="edit-amount"
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                      className="rounded-xl border-gray-300 h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-expense-notes" className="text-sm font-medium text-gray-700">Notes</Label>
                    <Textarea
                      id="edit-expense-notes"
                      value={editForm.notes}
                      onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                      placeholder="Optional notes..."
                      className="rounded-xl border-gray-300"
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  className="flex-1 rounded-xl border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>



        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <Trash2 className="w-6 h-6 text-red-600" />
                Confirm Deletion
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-gray-700">
                Are you sure you want to delete this {itemToDelete?.type === 'treatment' ? 'treatment' : 'expense'}?
              </p>
              {itemToDelete?.type === 'treatment' && itemToDelete?.treatment_name && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Treatment: <span className="font-semibold text-gray-900">{itemToDelete.treatment_name}</span></p>
                  {itemToDelete.patient_name && (
                    <p className="text-sm text-gray-600">Patient: <span className="font-semibold text-gray-900">{itemToDelete.patient_name}</span></p>
                  )}
                </div>
              )}
              {itemToDelete?.type === 'expense' && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Category: <span className="font-semibold text-gray-900">{itemToDelete.category}</span></p>
                  <p className="text-sm text-gray-600">Amount: <span className="font-semibold text-gray-900">£{itemToDelete.amount?.toFixed(2)}</span></p>
                </div>
              )}
              <p className="text-sm text-red-600 font-medium">This action cannot be undone.</p>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="flex-1 rounded-xl border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl"
                >
                  Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}