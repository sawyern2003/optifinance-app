import React, { useState, useEffect, useMemo } from "react";
import { api } from "@/api/api";
import { invoicesAPI } from "@/api/invoices";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, CreditCard, Search, FileCheck, Loader2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { RecordsGrid } from "@/components/records/RecordsGrid";
import Invoices from "./Invoices";

export default function RecordsLuxury() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState("treatments");
  const [dateRangePreset, setDateRangePreset] = useState('all-time');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');

  // Modal/Dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [generatingInvoice, setGeneratingInvoice] = useState(null);

  // Selection state
  const [selectedTreatments, setSelectedTreatments] = useState([]);
  const [selectedExpenses, setSelectedExpenses] = useState([]);

  // Fetch data
  const { data: treatments = [], isLoading: loadingTreatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.entities.Expense.list('-date'),
    initialData: [],
  });

  const { data: treatmentCatalog = [] } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => api.entities.TreatmentCatalog.list('treatment_name'),
    initialData: [],
  });

  const { data: practitioners = [] } = useQuery({
    queryKey: ['practitioners'],
    queryFn: () => api.entities.Practitioner.list('name'),
    initialData: [],
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.entities.Invoice.list('-created_date'),
    initialData: [],
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api.entities.Patient.list('name'),
    initialData: [],
  });

  // Set active tab from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const tab = params.get("tab");
    if (tab === "invoices") setActiveTab("invoices");
    if (tab === "treatments") setActiveTab("treatments");
    if (tab === "expenses") setActiveTab("expenses");
  }, [location.search]);

  // Delete mutations
  const deleteTreatmentMutation = useMutation({
    mutationFn: (id) => api.entities.TreatmentEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      setSelectedTreatments([]);
      toast({
        title: 'Treatment deleted',
        description: 'The treatment has been removed.',
        className: 'bg-green-50 border-green-200',
      });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id) => api.entities.Expense.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      setSelectedExpenses([]);
      toast({
        title: 'Expense deleted',
        description: 'The expense has been removed.',
        className: 'bg-green-50 border-green-200',
      });
    },
  });

  // Delete handlers
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

  // Generate invoice
  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  };

  const generateInvoice = async (treatment) => {
    setGeneratingInvoice(treatment.id);
    const invoiceNumber = generateInvoiceNumber();
    const patient = patients.find((p) => p.id === treatment.patient_id);

    try {
      // Create invoice record
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

      // Generate PDF
      const result = await invoicesAPI.generateInvoicePDF(createdInvoice.id);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });

      if (result?.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      }

      toast({
        title: 'Invoice generated',
        description: 'Invoice PDF has been created successfully.',
        className: 'bg-green-50 border-green-200',
      });
    } catch (error) {
      console.error('Failed to generate invoice:', error);
      toast({
        title: 'Invoice generation failed',
        description: error?.message || 'Could not create PDF. Please try again.',
        variant: 'destructive',
      });
    }
    setGeneratingInvoice(null);
  };

  // Date range calculation
  const getDateRange = () => {
    const now = new Date();
    switch(dateRangePreset) {
      case 'this-month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last-month':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'last-3-months':
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case 'last-6-months':
        return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
      case 'year-to-date':
        return { start: startOfYear(now), end: now };
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

  // Filter treatments
  const filteredTreatments = useMemo(() => {
    return treatments.filter(t => {
      const matchesSearch = t.treatment_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.practitioner_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPaymentStatus = paymentStatusFilter === 'all' || t.payment_status === paymentStatusFilter;

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
  }, [treatments, searchTerm, paymentStatusFilter, dateRange]);

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
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
  }, [expenses, searchTerm, dateRange]);

  // Toggle selection
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

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Records</h1>
          <p className="text-sm text-gray-500 font-light">View and manage all your transactions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
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
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                activeTab === "invoices"
                  ? 'bg-[#2C3E50] text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileCheck className="w-5 h-5" />
              Invoices
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {activeTab !== 'invoices' && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-xl border-gray-300 h-11"
                />
              </div>

              {/* Date Range */}
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
                </SelectContent>
              </Select>

              {/* Payment Status Filter (Treatments only) */}
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
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === "treatments" ? (
          <RecordsGrid
            items={filteredTreatments}
            type="treatments"
            isLoading={loadingTreatments}
            selectedItems={selectedTreatments}
            onSelectItem={toggleSelectItem}
            onEdit={() => {
              toast({
                title: 'Coming soon',
                description: 'Edit functionality will be added in Phase 2',
              });
            }}
            onDelete={handleDeleteClick}
            onGenerateInvoice={generateInvoice}
            practitioners={practitioners}
            invoices={invoices}
          />
        ) : activeTab === "expenses" ? (
          <RecordsGrid
            items={filteredExpenses}
            type="expenses"
            isLoading={loadingExpenses}
            selectedItems={selectedExpenses}
            onSelectItem={toggleSelectItem}
            onEdit={() => {
              toast({
                title: 'Coming soon',
                description: 'Edit functionality will be added in Phase 2',
              });
            }}
            onDelete={handleDeleteClick}
          />
        ) : (
          <div className="p-6">
            <Invoices embedded />
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-700">
              Are you sure you want to delete this {itemToDelete?.type === 'treatment' ? 'treatment' : 'expense'}?
            </p>
            {itemToDelete?.type === 'treatment' && itemToDelete?.treatment_name && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  Treatment: <span className="font-semibold text-gray-900">{itemToDelete.treatment_name}</span>
                </p>
                {itemToDelete.patient_name && (
                  <p className="text-sm text-gray-600">
                    Patient: <span className="font-semibold text-gray-900">{itemToDelete.patient_name}</span>
                  </p>
                )}
              </div>
            )}
            {itemToDelete?.type === 'expense' && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  Category: <span className="font-semibold text-gray-900">{itemToDelete.category}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Amount: <span className="font-semibold text-gray-900">£{itemToDelete.amount?.toFixed(2)}</span>
                </p>
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
  );
}
