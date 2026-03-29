import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/api";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Sparkles, UserCog, Users, Copy, FileText, LayoutGrid } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from 'date-fns';

export default function Catalogue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("treatments");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [clinicalFilePatient, setClinicalFilePatient] = useState(null);
  const [clinicalNoteDraft, setClinicalNoteDraft] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    treatment_entry_id: "",
    raw_narrative: "",
  });
  const [formData, setFormData] = useState({
    treatment_name: '',
    category: '',
    default_price: '',
    typical_product_cost: '',
    duration_minutes: '',
    practitioner_name: '',
    patient_name: '',
    patient_phone: '', // New field for patient phone
    patient_contact: '', // This will now be for patient email
    patient_address: '',
    expense_category: '',
    expense_amount: '',
    expense_notes: '',
    recurrence_frequency: 'monthly',
    friends_family_discount_percent: ''
  });

  const { data: treatments, isLoading: loadingTreatments } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => api.entities.TreatmentCatalog.list('treatment_name'),
    initialData: [],
  });

  const { data: practitioners, isLoading: loadingPractitioners } = useQuery({
    queryKey: ['practitioners'],
    queryFn: () => api.entities.Practitioner.list('name'),
    initialData: [],
  });

  const { data: patients, isLoading: loadingPatients } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api.entities.Patient.list('name'),
    initialData: [],
  });

  const { data: treatmentEntriesAll } = useQuery({
    queryKey: ['treatmentEntriesCatalogue'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: clinicalNotesAll } = useQuery({
    queryKey: ['clinicalNotes'],
    queryFn: () => api.entities.ClinicalNote.list('-visit_date'),
    initialData: [],
  });

  const { data: recurringExpenses, isLoading: loadingRecurringExpenses } = useQuery({
    queryKey: ['recurringExpenses'],
    queryFn: () => api.entities.Expense.filter({ is_recurring: true }, '-created_date'),
    initialData: [],
  });

  const showError = (title, err) => {
    toast({
      title: title || "Error",
      description: err?.message || String(err),
      variant: "destructive",
    });
  };

  // Treatment Mutations
  const createTreatmentMutation = useMutation({
    mutationFn: (data) => api.entities.TreatmentCatalog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] });
      toast({
        title: "Treatment added",
        description: "New treatment added to your catalogue",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
    onError: (err) => showError("Could not add treatment", err),
  });

  const updateTreatmentMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.TreatmentCatalog.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] });
      toast({
        title: "Treatment updated",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
    onError: (err) => showError("Could not update treatment", err),
  });

  const deleteTreatmentMutation = useMutation({
    mutationFn: (id) => api.entities.TreatmentCatalog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] });
      toast({
        title: "Treatment deleted",
        className: "bg-red-50 border-red-200"
      });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    },
    onError: (err) => showError("Could not delete treatment", err),
  });

  // Practitioner Mutations
  const createPractitionerMutation = useMutation({
    mutationFn: (data) => api.entities.Practitioner.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast({
        title: "Practitioner added",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
    onError: (err) => showError("Could not add practitioner", err),
  });

  const updatePractitionerMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Practitioner.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast({
        title: "Practitioner updated",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
    onError: (err) => showError("Could not update practitioner", err),
  });

  const deletePractitionerMutation = useMutation({
    mutationFn: (id) => api.entities.Practitioner.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast({
        title: "Practitioner deleted",
        className: "bg-red-50 border-red-200"
      });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    },
    onError: (err) => showError("Could not delete practitioner", err),
  });

  // Patient Mutations
  const createPatientMutation = useMutation({
    mutationFn: (data) => api.entities.Patient.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast({
        title: "Patient added",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
    onError: (err) => showError("Could not add patient", err),
  });

  const updatePatientMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Patient.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast({
        title: "Patient updated",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
    onError: (err) => showError("Could not update patient", err),
  });

  const deletePatientMutation = useMutation({
    mutationFn: (id) => api.entities.Patient.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast({
        title: "Patient deleted",
        className: "bg-red-50 border-red-200"
      });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    },
    onError: (err) => showError("Could not delete patient", err),
  });

  const createClinicalNoteMutation = useMutation({
    mutationFn: (payload) => api.entities.ClinicalNote.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinicalNotes'] });
      toast({
        title: "Clinical note saved",
        description: "Added to this patient’s file.",
        className: "bg-green-50 border-green-200",
      });
    },
    onError: (err) =>
      showError(
        "Could not save clinical note",
        err?.message?.includes("clinical_notes")
          ? { message: "Run database/add-clinical-notes.sql in Supabase first, then try again." }
          : err,
      ),
  });

  const updateRecurringExpenseMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Expense.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringExpenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({
        title: "Recurring expense updated",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
    onError: (err) => showError("Could not update recurring expense", err),
  });

  const deleteRecurringExpenseMutation = useMutation({
    mutationFn: (id) => api.entities.Expense.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringExpenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({
        title: "Recurring expense deleted",
        className: "bg-red-50 border-red-200"
      });
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    },
    onError: (err) => showError("Could not delete recurring expense", err),
  });

  const handleDeleteClick = (item, type) => {
    setItemToDelete({ ...item, type });
    setDeleteConfirmOpen(true);
  };

  const openClinicalFile = (patient) => {
    setClinicalFilePatient(patient);
    setClinicalNoteDraft({
      visit_date: format(new Date(), "yyyy-MM-dd"),
      treatment_entry_id: "",
      raw_narrative: "",
    });
  };

  const handleClinicalNoteSubmit = (e) => {
    e.preventDefault();
    if (!clinicalFilePatient) return;
    const text = clinicalNoteDraft.raw_narrative.trim();
    if (!text) {
      showError("Add a note", { message: "Enter what was done and how the patient responded." });
      return;
    }
    createClinicalNoteMutation.mutate({
      patient_id: clinicalFilePatient.id,
      treatment_entry_id: clinicalNoteDraft.treatment_entry_id || null,
      visit_date: clinicalNoteDraft.visit_date,
      source: "manual",
      raw_narrative: text,
      structured: { clinical_summary: text },
    });
    setClinicalNoteDraft((prev) => ({ ...prev, raw_narrative: "" }));
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;
    
    switch (itemToDelete.type) {
      case 'treatment':
        deleteTreatmentMutation.mutate(itemToDelete.id);
        break;
      case 'practitioner':
        deletePractitionerMutation.mutate(itemToDelete.id);
        break;
      case 'patient':
        deletePatientMutation.mutate(itemToDelete.id);
        break;
      case 'recurring':
        deleteRecurringExpenseMutation.mutate(itemToDelete.id);
        break;
    }
  };

  const toggleRecurringExpense = (expense) => {
    updateRecurringExpenseMutation.mutate({
      id: expense.id,
      data: { ...expense, is_active: !expense.is_active }
    });
  };

  const toggleLeadPractitioner = async (practitioner) => {
    // If marking as lead, first unmark all other practitioners
    if (!practitioner.is_lead) {
      const leadPractitioners = practitioners.filter(p => p.is_lead && p.id !== practitioner.id);
      for (const leadPrac of leadPractitioners) {
        await updatePractitionerMutation.mutateAsync({
          id: leadPrac.id,
          data: { ...leadPrac, is_lead: false }
        });
      }
    }
    
    // Toggle this practitioner
    updatePractitionerMutation.mutate({
      id: practitioner.id,
      data: { ...practitioner, is_lead: !practitioner.is_lead }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (activeTab === 'treatments') {
      const data = {
        treatment_name: formData.treatment_name,
        category: formData.category,
        default_price: parseFloat(formData.default_price),
        typical_product_cost: parseFloat(formData.typical_product_cost || 0),
        default_duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes, 10) : undefined,
      };
      if (editingItem) {
        updateTreatmentMutation.mutate({ id: editingItem.id, data });
      } else {
        createTreatmentMutation.mutate(data);
      }
    } else if (activeTab === 'practitioners') {
      const data = { name: formData.practitioner_name };
      if (editingItem) {
        updatePractitionerMutation.mutate({ id: editingItem.id, data });
      } else {
        createPractitionerMutation.mutate(data);
      }
    } else if (activeTab === 'patients') {
      const ffRaw = String(formData.friends_family_discount_percent ?? "").trim();
      let friends_family_discount_percent = null;
      if (ffRaw !== "") {
        const n = parseFloat(ffRaw);
        if (Number.isFinite(n) && n >= 0 && n <= 100) {
          friends_family_discount_percent = n;
        }
      }
      const data = {
        name: formData.patient_name,
        phone: formData.patient_phone, // New field
        contact: formData.patient_contact, // Now for email
        address: formData.patient_address,
        friends_family_discount_percent,
      };
      if (editingItem) {
        updatePatientMutation.mutate({ id: editingItem.id, data });
      } else {
        createPatientMutation.mutate(data);
      }
    } else if (activeTab === 'recurring') {
      const data = {
        ...editingItem,
        category: formData.expense_category,
        amount: parseFloat(formData.expense_amount),
        notes: formData.expense_notes,
        recurrence_frequency: formData.recurrence_frequency
      };
      updateRecurringExpenseMutation.mutate({ id: editingItem.id, data });
    }
  };

  const resetForm = () => {
    setFormData({
      treatment_name: '',
      category: '',
      default_price: '',
      typical_product_cost: '',
      duration_minutes: '',
      practitioner_name: '',
      patient_name: '',
      patient_phone: '', // Reset new field
      patient_contact: '', // Reset new field
      patient_address: '',
      expense_category: '',
      expense_amount: '',
      expense_notes: '',
      recurrence_frequency: 'monthly',
      friends_family_discount_percent: ''
    });
    setEditingItem(null);
    setIsDialogOpen(false);
  };

  const openDialog = (item = null, type) => {
    setEditingItem(item);
    if (item) {
      if (type === 'treatment') {
        setFormData({
          treatment_name: item.treatment_name,
          category: item.category,
          default_price: item.default_price,
          typical_product_cost: item.typical_product_cost ?? '',
          duration_minutes: item.duration_minutes ?? item.default_duration_minutes ?? '',
          practitioner_name: '',
          patient_name: '',
          patient_phone: '', // Added for consistency
          patient_contact: '', // Added for consistency
          patient_address: '',
          expense_category: '',
          expense_amount: '',
          expense_notes: '',
          recurrence_frequency: 'monthly',
          friends_family_discount_percent: '',
        });
      } else if (type === 'practitioner') {
        setFormData({
          treatment_name: '',
          category: '',
          default_price: '',
          typical_product_cost: '',
          duration_minutes: '',
          practitioner_name: item.name,
          patient_name: '',
          patient_phone: '', // Added for consistency
          patient_contact: '', // Added for consistency
          patient_address: '',
          expense_category: '',
          expense_amount: '',
          expense_notes: '',
          recurrence_frequency: 'monthly',
          friends_family_discount_percent: '',
        });
      } else if (type === 'patient') {
        setFormData({
          treatment_name: '',
          category: '',
          default_price: '',
          typical_product_cost: '',
          duration_minutes: '',
          practitioner_name: '',
          patient_name: item.name,
          patient_phone: item.phone || '', // New field
          patient_contact: item.contact || '', // Now for email
          patient_address: item.address || '',
          expense_category: '',
          expense_amount: '',
          expense_notes: '',
          recurrence_frequency: 'monthly',
          friends_family_discount_percent:
            item.friends_family_discount_percent != null &&
            item.friends_family_discount_percent !== ""
              ? String(item.friends_family_discount_percent)
              : "",
        });
      } else if (type === 'recurring') {
        setFormData({
          treatment_name: '',
          category: '',
          default_price: '',
          typical_product_cost: '',
          duration_minutes: '',
          practitioner_name: '',
          patient_name: '',
          patient_phone: '', // Added for consistency
          patient_contact: '', // Added for consistency
          patient_address: '',
          expense_category: item.category,
          expense_amount: item.amount,
          expense_notes: item.notes || '',
          recurrence_frequency: item.recurrence_frequency || 'monthly',
          friends_family_discount_percent: '',
        });
      }
    }
    setIsDialogOpen(true);
  };

  const openDuplicateDialog = (treatment) => {
    setEditingItem(null); // Set to null so it creates a new treatment
    setFormData({
      treatment_name: `${treatment.treatment_name} (Copy)`,
      category: treatment.category,
      default_price: treatment.default_price,
      typical_product_cost: treatment.typical_product_cost ?? '',
      duration_minutes: treatment.duration_minutes ?? treatment.default_duration_minutes ?? '',
      practitioner_name: '',
      patient_name: '',
      patient_phone: '', // Added for consistency
      patient_contact: '', // Added for consistency
      patient_address: '',
      expense_category: '',
      expense_amount: '',
      expense_notes: '',
      recurrence_frequency: 'monthly',
      friends_family_discount_percent: '',
    });
    setIsDialogOpen(true);
  };

  const calculateMargin = (price, cost) => {
    if (!price || price === 0) return 0;
    return ((price - cost) / price * 100).toFixed(0);
  };

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.auth.me(),
    initialData: null,
  });

  // Group treatments by category and sort alphabetically within each category
  const groupedTreatmentsCatalog = treatments.reduce((acc, treatment) => {
    const category = treatment.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(treatment);
    return acc;
  }, {});

  // Sort treatments alphabetically within each category
  Object.keys(groupedTreatmentsCatalog).forEach(category => {
    groupedTreatmentsCatalog[category].sort((a, b) =>
      a.treatment_name.localeCompare(b.treatment_name)
    );
  });

  // Sort categories alphabetically
  const sortedCategoriesCatalog = Object.keys(groupedTreatmentsCatalog).sort();

  const downloadPriceList = async () => {
    const clinicName = user?.clinic_name || 'OptiFinance Clinic';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Price List - ${clinicName}</title>
        <style>
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            padding: 60px;
            color: #1e293b;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            margin-bottom: 50px;
            padding-bottom: 30px;
            border-bottom: 3px solid #2C3E50;
          }
          .header h1 {
            color: #2C3E50;
            font-size: 32px;
            margin: 0 0 10px 0;
          }
          .header p {
            color: #64748b;
            margin: 4px 0;
          }
          .category-section {
            margin: 40px 0;
          }
          .category-title {
            font-size: 24px;
            font-weight: 700;
            color: #2C3E50;
            margin: 0 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #e2e8f0;
          }
          .treatment-item {
            display: flex;
            justify-content: space-between;
            padding: 15px 0;
            border-bottom: 1px solid #f1f5f9;
          }
          .treatment-name {
            font-weight: 600;
            color: #1e293b;
          }
          .treatment-duration {
            color: #64748b;
            font-size: 14px;
            margin-top: 4px;
          }
          .treatment-price {
            font-size: 20px;
            font-weight: 700;
            color: #2C3E50;
          }
          .footer {
            margin-top: 60px;
            padding-top: 30px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            color: #64748b;
            font-size: 12px;
          }
          .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            background: #2C3E50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 1000;
          }
          .print-button:hover {
            background: #34495E;
          }
        </style>
      </head>
      <body>
        <button class="print-button no-print" onclick="window.print()">Print / Save as PDF</button>

        <div class="header">
          <h1>${clinicName}</h1>
          <p>Treatment Price List</p>
          <p>Updated: ${format(new Date(), 'dd MMMM yyyy')}</p>
        </div>

        ${sortedCategoriesCatalog.map(category => `
          <div class="category-section">
            <h2 class="category-title">${category}</h2>
            ${groupedTreatmentsCatalog[category].map(treatment => `
              <div class="treatment-item">
                <div>
                  <div class="treatment-name">${treatment.treatment_name}</div>
                  ${treatment.duration_minutes || treatment.default_duration_minutes ? `<div class="treatment-duration">${treatment.duration_minutes || treatment.default_duration_minutes} minutes</div>` : ''}
                </div>
                <div class="treatment-price">£${treatment.default_price.toFixed(2)}</div>
              </div>
            `).join('')}
          </div>
        `).join('')}

        <div class="footer">
          <p>All prices are subject to consultation and may vary based on individual requirements.</p>
          <p>${clinicName} • ${format(new Date(), 'yyyy')}</p>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    toast({
      title: "Price list opened",
      description: "Use your browser's print dialog to save as PDF",
      className: "bg-green-50 border-green-200"
    });
  };

  return (
    <div className="min-h-screen relative overflow-hidden p-6" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 50%, #0f1419 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#d6b164]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-5xl font-light tracking-wider text-white/90 mb-3">Clinic Management</h1>
            <p className="text-lg font-light text-white/60">Manage your treatments, practitioners, and patients</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="relative group mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#4d647f]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="border-b border-white/10 p-6 pb-0">
              <div className="flex gap-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("treatments")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-2xl font-light tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === "treatments"
                      ? 'bg-[#d6b164]/20 backdrop-blur-xl border-l border-r border-t border-[#d6b164]/30 text-[#d6b164]'
                      : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  Treatments
                </button>
                <button
                  onClick={() => setActiveTab("practitioners")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-2xl font-light tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === "practitioners"
                      ? 'bg-[#d6b164]/20 backdrop-blur-xl border-l border-r border-t border-[#d6b164]/30 text-[#d6b164]'
                      : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  <UserCog className="w-5 h-5" />
                  Practitioners
                </button>
                <button
                  onClick={() => setActiveTab("patients")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-2xl font-light tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === "patients"
                      ? 'bg-[#d6b164]/20 backdrop-blur-xl border-l border-r border-t border-[#d6b164]/30 text-[#d6b164]'
                      : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  Patients
                </button>
                <button
                  onClick={() => setActiveTab("recurring")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-2xl font-light tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === "recurring"
                      ? 'bg-[#d6b164]/20 backdrop-blur-xl border-l border-r border-t border-[#d6b164]/30 text-[#d6b164]'
                      : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recurring Expenses
                </button>
              </div>
            </div>

            <div className="p-6">
              {activeTab !== "recurring" && (
                <div className="flex justify-between items-center mb-6">
                  <div>
                    {activeTab === 'treatments' && (
                      <Button
                        onClick={downloadPriceList}
                        variant="outline"
                        className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#d6b164]/30 text-white/70 hover:text-white/90 rounded-2xl font-light"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Price List PDF
                      </Button>
                    )}
                  </div>
                  <Button
                    onClick={() => openDialog(null, activeTab === 'treatments' ? 'treatment' : activeTab === 'practitioners' ? 'practitioner' : 'patient')}
                    className="bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164] rounded-2xl font-light tracking-wider"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add {activeTab === 'treatments' ? 'Treatment' : activeTab === 'practitioners' ? 'Practitioner' : 'Patient'}
                  </Button>
                </div>
              )}

            {/* Treatments Grid */}
            {activeTab === 'treatments' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {treatments.map((treatment) => (
                  <div
                    key={treatment.id}
                    className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 hover:border-[#d6b164]/30 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-light text-white/90 text-lg mb-1 tracking-wider">{treatment.treatment_name}</h3>
                        <p className="text-sm text-white/50 font-light">{treatment.category}</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-white/50 font-light">Price</span>
                        <span className="text-sm font-light text-white/90">£{treatment.default_price?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-white/50 font-light">Cost</span>
                        <span className="text-sm font-light text-white/90">£{(treatment.typical_product_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-white/50 font-light">Margin</span>
                        <span className="text-sm font-light text-emerald-400">
                          {calculateMargin(treatment.default_price, treatment.typical_product_cost || 0)}%
                        </span>
                      </div>
                      {(treatment.duration_minutes ?? treatment.default_duration_minutes) && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-white/50 font-light">Duration</span>
                          <span className="text-sm font-light text-white/90">{treatment.duration_minutes ?? treatment.default_duration_minutes} min</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDuplicateDialog(treatment)}
                        className="flex-1 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 font-light"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(treatment, 'treatment')}
                        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(treatment, 'treatment')}
                        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-rose-500/30 text-white/70 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {treatments.length === 0 && (
                  <div className="col-span-full text-center py-12">
                    <Sparkles className="w-12 h-12 text-white/20 mx-auto mb-3" />
                    <p className="text-white/50 font-light">No treatments yet</p>
                  </div>
                )}
              </div>
            )}

            {/* Practitioners List */}
            {activeTab === 'practitioners' && (
              <div className="space-y-3">
                {practitioners.map((practitioner) => (
                  <div
                    key={practitioner.id}
                    className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 flex items-center justify-between hover:border-[#d6b164]/30 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#4d647f]/20 backdrop-blur-xl border border-[#4d647f]/30 rounded-full flex items-center justify-center">
                        <UserCog className="w-5 h-5 text-[#4d647f]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-light text-white/90 tracking-wider">{practitioner.name}</span>
                          {practitioner.is_lead && (
                            <span className="text-xs font-light px-3 py-1 rounded-full bg-purple-500/10 backdrop-blur-xl border border-purple-500/30 text-purple-400 tracking-wider">
                              Lead
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white/50 font-light">Lead Practitioner</span>
                        <button
                          onClick={() => toggleLeadPractitioner(practitioner)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            practitioner.is_lead ? 'bg-[#d6b164]' : 'bg-white/10'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              practitioner.is_lead ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDialog(practitioner, 'practitioner')}
                          className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(practitioner, 'practitioner')}
                          className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-rose-500/30 text-white/70 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {practitioners.length === 0 && (
                  <div className="text-center py-12">
                    <UserCog className="w-12 h-12 text-white/20 mx-auto mb-3" />
                    <p className="text-white/50 font-light">No practitioners yet</p>
                  </div>
                )}
              </div>
            )}

            {/* Patients List */}
            {activeTab === 'patients' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 backdrop-blur-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-light text-white/90 flex items-center gap-2 tracking-wider">
                      <LayoutGrid className="w-4 h-4 text-violet-400" />
                      Swipeable patient cards
                    </p>
                    <p className="text-xs text-white/60 mt-1 max-w-xl font-light">
                      Open the full-screen card deck to review treatments, clinical notes, paid amounts and balances
                      for each patient in one place.
                    </p>
                  </div>
                  <Button
                    asChild
                    className="shrink-0 rounded-2xl bg-violet-500/20 backdrop-blur-xl border border-violet-500/30 hover:bg-violet-500/30 text-violet-400 font-light tracking-wider"
                  >
                    <Link to={createPageUrl("PatientCards")}>Open patient cards</Link>
                  </Button>
                </div>
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 flex items-center justify-between hover:border-[#d6b164]/30 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#4d647f]/20 backdrop-blur-xl border border-[#4d647f]/30 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-[#4d647f]" />
                      </div>
                      <div>
                        <p className="font-light text-white/90 flex items-center gap-2 flex-wrap tracking-wider">
                          {patient.name}
                          {patient.friends_family_discount_percent != null &&
                            patient.friends_family_discount_percent !== "" && (
                              <span className="text-[10px] font-light uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-500/10 backdrop-blur-xl border border-indigo-500/30 text-indigo-400">
                                F&amp;F {Number(patient.friends_family_discount_percent)}%
                              </span>
                            )}
                        </p>
                        <div className="flex gap-2 text-sm text-white/50 font-light">
                          {patient.phone && <span>{patient.phone}</span>}
                          {patient.phone && patient.contact && <span>•</span>}
                          {patient.contact && <span>{patient.contact}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openClinicalFile(patient)}
                        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90"
                        title="Clinical notes & visit record"
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(patient, 'patient')}
                        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(patient, 'patient')}
                        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-rose-500/30 text-white/70 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {patients.length === 0 && (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
                    <p className="text-white/50 font-light">No patients yet</p>
                  </div>
                )}
              </div>
            )}

            {/* Recurring Expenses List */}
            {activeTab === 'recurring' && (
              <div>
                <p className="text-sm text-white/60 mb-6 font-light">
                  Recurring expenses are automatically added to your records each period. Toggle them on/off as needed.
                </p>
                <div className="space-y-3">
                  {recurringExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:border-[#d6b164]/30 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-light text-white/90 text-lg tracking-wider">{expense.category}</h3>
                            <span className={`text-xs font-light px-3 py-1.5 rounded-full backdrop-blur-xl tracking-wider ${
                              expense.is_active ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-white/10 border border-white/20 text-white/50'
                            }`}>
                              {expense.is_active ? 'Active' : 'Paused'}
                            </span>
                            <span className="text-xs font-light px-3 py-1.5 rounded-full bg-blue-500/10 backdrop-blur-xl border border-blue-500/30 text-blue-400 tracking-wider">
                              {expense.recurrence_frequency}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-white/90 font-light">
                              <span className="font-light text-lg text-white/90">£{expense.amount?.toFixed(2)}</span>
                            </p>
                            {expense.notes && (
                              <p className="text-sm text-white/60 font-light">{expense.notes}</p>
                            )}
                            {expense.last_generated_date && (
                              <p className="text-xs text-white/40 font-light">
                                Last generated: {format(new Date(expense.last_generated_date), 'dd MMM yyyy')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleRecurringExpense(expense)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              expense.is_active ? 'bg-[#d6b164]' : 'bg-white/10'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                expense.is_active ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(expense, 'recurring')}
                            className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(expense, 'recurring')}
                            className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-rose-500/30 text-white/70 hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {recurringExpenses.length === 0 && (
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 text-white/20 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <p className="text-white/50 mb-2 font-light">No recurring expenses yet</p>
                      <p className="text-sm text-white/40 font-light">Add recurring expenses from Quick Add</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {editingItem ? 'Edit' : 'Add'} {activeTab === 'treatments' ? 'Treatment' : activeTab === 'practitioners' ? 'Practitioner' : activeTab === 'patients' ? 'Patient' : 'Recurring Expense'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5 mt-4">
              {activeTab === 'treatments' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="treatment_name" className="text-sm font-medium text-gray-700">
                      Treatment Name *
                    </Label>
                    <Input
                      id="treatment_name"
                      value={formData.treatment_name}
                      onChange={(e) => setFormData({...formData, treatment_name: e.target.value})}
                      placeholder="e.g. Botox, Dermal Filler"
                      className="rounded-xl border-gray-300"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-sm font-medium text-gray-700">
                      Category *
                    </Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({...formData, category: value})}
                      required
                    >
                      <SelectTrigger className="rounded-xl border-gray-300">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Face">Face</SelectItem>
                        <SelectItem value="Body">Body</SelectItem>
                        <SelectItem value="Skin">Skin</SelectItem>
                        <SelectItem value="Wellness">Wellness</SelectItem>
                        <SelectItem value="Consultation">Consultation</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="default_price" className="text-sm font-medium text-gray-700">
                        Default Price (£) *
                      </Label>
                      <Input
                        id="default_price"
                        type="number"
                        step="0.01"
                        value={formData.default_price}
                        onChange={(e) => setFormData({...formData, default_price: e.target.value})}
                        placeholder="0.00"
                        className="rounded-xl border-gray-300"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="typical_product_cost" className="text-sm font-medium text-gray-700">
                        Product Cost (£)
                      </Label>
                      <Input
                        id="typical_product_cost"
                        type="number"
                        step="0.01"
                        value={formData.typical_product_cost}
                        onChange={(e) => setFormData({...formData, typical_product_cost: e.target.value})}
                        placeholder="0.00"
                        className="rounded-xl border-gray-300"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration_minutes" className="text-sm font-medium text-gray-700">
                      Duration (minutes)
                    </Label>
                    <Input
                      id="duration_minutes"
                      type="number"
                      value={formData.duration_minutes}
                      onChange={(e) => setFormData({...formData, duration_minutes: e.target.value})}
                      placeholder="e.g. 30, 60, 90"
                      className="rounded-xl border-gray-300"
                    />
                  </div>

                  {formData.default_price && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Profit Margin</span>
                        <span className="text-lg font-semibold text-green-600">
                          {calculateMargin(parseFloat(formData.default_price), parseFloat(formData.typical_product_cost || 0))}%
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'practitioners' && (
                <div className="space-y-2">
                  <Label htmlFor="practitioner_name" className="text-sm font-medium text-gray-700">
                    Practitioner Name *
                  </Label>
                  <Input
                    id="practitioner_name"
                    value={formData.practitioner_name}
                    onChange={(e) => setFormData({...formData, practitioner_name: e.target.value})}
                    placeholder="e.g. Dr. Sarah Johnson"
                    className="rounded-xl border-gray-300"
                    required
                  />
                </div>
              )}

              {activeTab === 'patients' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="patient_name" className="text-sm font-medium text-gray-700">
                      Patient Name *
                    </Label>
                    <Input
                      id="patient_name"
                      value={formData.patient_name}
                      onChange={(e) => setFormData({...formData, patient_name: e.target.value})}
                      placeholder="e.g. Emma Thompson"
                      className="rounded-xl border-gray-300"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patient_phone" className="text-sm font-medium text-gray-700">
                      Phone Number
                    </Label>
                    <Input
                      id="patient_phone"
                      value={formData.patient_phone}
                      onChange={(e) => setFormData({...formData, patient_phone: e.target.value})}
                      placeholder="e.g. 07123 456789"
                      className="rounded-xl border-gray-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patient_contact" className="text-sm font-medium text-gray-700">
                      Email Address
                    </Label>
                    <Input
                      id="patient_contact"
                      type="email"
                      value={formData.patient_contact}
                      onChange={(e) => setFormData({...formData, patient_contact: e.target.value})}
                      placeholder="e.g. emma@example.com"
                      className="rounded-xl border-gray-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patient_address" className="text-sm font-medium text-gray-700">
                      Patient Address
                    </Label>
                    <Input
                      id="patient_address"
                      value={formData.patient_address}
                      onChange={(e) => setFormData({...formData, patient_address: e.target.value})}
                      placeholder="e.g. 22 Market St, London, SW1A 1AA"
                      className="rounded-xl border-gray-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patient_friends_family_discount_percent" className="text-sm font-medium text-gray-700">
                      Friends &amp; family discount (%)
                    </Label>
                    <Input
                      id="patient_friends_family_discount_percent"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.friends_family_discount_percent}
                      onChange={(e) =>
                        setFormData({ ...formData, friends_family_discount_percent: e.target.value })
                      }
                      placeholder="Leave blank — patient not eligible"
                      className="rounded-xl border-gray-300"
                    />
                    <p className="text-xs text-gray-500">
                      Only for patients you offer friends &amp; family rates. When set, you can mark each of their visits for invoice disclosure; other patients never see this option.
                    </p>
                  </div>
                </>
              )}

              {activeTab === 'recurring' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="expense_category" className="text-sm font-medium text-gray-700">
                      Category *
                    </Label>
                    <Select 
                      value={formData.expense_category} 
                      onValueChange={(value) => setFormData({...formData, expense_category: value})}
                      required
                    >
                      <SelectTrigger className="rounded-xl border-gray-300">
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

                  <div className="space-y-2">
                    <Label htmlFor="expense_amount" className="text-sm font-medium text-gray-700">
                      Amount (£) *
                    </Label>
                    <Input
                      id="expense_amount"
                      type="number"
                      step="0.01"
                      value={formData.expense_amount}
                      onChange={(e) => setFormData({...formData, expense_amount: e.target.value})}
                      placeholder="0.00"
                      className="rounded-xl border-gray-300"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recurrence_frequency" className="text-sm font-medium text-gray-700">
                      Frequency *
                    </Label>
                    <Select 
                      value={formData.recurrence_frequency} 
                      onValueChange={(value) => setFormData({...formData, recurrence_frequency: value})}
                      required
                    >
                      <SelectTrigger className="rounded-xl border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expense_notes" className="text-sm font-medium text-gray-700">
                      Notes
                    </Label>
                    <Input
                      id="expense_notes"
                      value={formData.expense_notes}
                      onChange={(e) => setFormData({...formData, expense_notes: e.target.value})}
                      placeholder="Optional notes..."
                      className="rounded-xl border-gray-300"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="flex-1 rounded-xl border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl"
                >
                  {editingItem ? 'Update' : 'Add'}
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
                Are you sure you want to delete this {
                  itemToDelete?.type === 'treatment' ? 'treatment' :
                  itemToDelete?.type === 'practitioner' ? 'practitioner' :
                  itemToDelete?.type === 'patient' ? 'patient' :
                  'recurring expense'
                }?
              </p>
              {itemToDelete && (
                <div className="bg-gray-50 rounded-lg p-3">
                  {itemToDelete.type === 'treatment' && (
                    <>
                      <p className="text-sm text-gray-600">Treatment: <span className="font-semibold text-gray-900">{itemToDelete.treatment_name}</span></p>
                      <p className="text-sm text-gray-600">Category: <span className="font-semibold text-gray-900">{itemToDelete.category}</span></p>
                    </>
                  )}
                  {(itemToDelete.type === 'practitioner' || itemToDelete.type === 'patient') && (
                    <p className="text-sm text-gray-600">Name: <span className="font-semibold text-gray-900">{itemToDelete.name}</span></p>
                  )}
                  {itemToDelete.type === 'recurring' && (
                    <>
                      <p className="text-sm text-gray-600">Category: <span className="font-semibold text-gray-900">{itemToDelete.category}</span></p>
                      <p className="text-sm text-gray-600">Amount: <span className="font-semibold text-gray-900">£{itemToDelete.amount?.toFixed(2)}</span></p>
                    </>
                  )}
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

        <Sheet
          open={!!clinicalFilePatient}
          onOpenChange={(open) => {
            if (!open) setClinicalFilePatient(null);
          }}
        >
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            {clinicalFilePatient && (
              <>
                <SheetHeader>
                  <SheetTitle className="text-[#1a2845]">
                    Clinical file — {clinicalFilePatient.name}
                  </SheetTitle>
                  <SheetDescription>
                    Structured visit notes for compliance and continuity. Add manually or use the Voice Diary to dictate the day’s visits.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  <form onSubmit={handleClinicalNoteSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Add clinical note
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="cn-date">Visit date</Label>
                      <Input
                        id="cn-date"
                        type="date"
                        value={clinicalNoteDraft.visit_date}
                        onChange={(e) =>
                          setClinicalNoteDraft((p) => ({
                            ...p,
                            visit_date: e.target.value,
                          }))
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Link to visit (optional)</Label>
                      <Select
                        value={clinicalNoteDraft.treatment_entry_id || "none"}
                        onValueChange={(v) =>
                          setClinicalNoteDraft((p) => ({
                            ...p,
                            treatment_entry_id: v === "none" ? "" : v,
                          }))
                        }
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Not linked" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not linked to a visit</SelectItem>
                          {(treatmentEntriesAll || [])
                            .filter((t) => t.patient_id === clinicalFilePatient.id)
                            .slice(0, 40)
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {format(new Date(t.date), "dd MMM yyyy")} —{" "}
                                {t.treatment_name || "Treatment"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cn-text">Clinical narrative</Label>
                      <Textarea
                        id="cn-text"
                        rows={4}
                        placeholder="e.g. Botox — 3 areas, 50 units. No complications. Patient happy. Review 2 weeks."
                        value={clinicalNoteDraft.raw_narrative}
                        onChange={(e) =>
                          setClinicalNoteDraft((p) => ({
                            ...p,
                            raw_narrative: e.target.value,
                          }))
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full rounded-xl bg-[#1a2845] hover:bg-[#0f1829]"
                      disabled={createClinicalNoteMutation.isPending}
                    >
                      {createClinicalNoteMutation.isPending ? "Saving…" : "Save to patient file"}
                    </Button>
                  </form>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">
                      History
                    </p>
                    <div className="space-y-3">
                      {(clinicalNotesAll || [])
                        .filter((n) => n.patient_id === clinicalFilePatient.id)
                        .map((note) => {
                          const s =
                            note.structured && typeof note.structured === "object"
                              ? note.structured
                              : {};
                          return (
                            <div
                              key={note.id}
                              className="rounded-xl border border-gray-200 bg-white p-3 text-sm"
                            >
                              <div className="flex justify-between gap-2 text-xs text-gray-500 mb-2">
                                <span>
                                  {format(new Date(note.visit_date), "dd MMM yyyy")}
                                </span>
                                <span className="capitalize">
                                  {(note.source || "").replace(/_/g, " ")}
                                </span>
                              </div>
                              <p className="font-medium text-gray-900">
                                {s.clinical_summary || note.raw_narrative || "—"}
                              </p>
                              {(s.procedure_summary ||
                                s.areas ||
                                s.units != null ||
                                s.complications ||
                                s.patient_feedback ||
                                s.next_steps) && (
                                <dl className="mt-2 space-y-1 text-xs text-gray-600">
                                  {s.procedure_summary && (
                                    <div>
                                      <dt className="font-medium text-gray-700 inline">Procedure: </dt>
                                      <dd className="inline">{s.procedure_summary}</dd>
                                    </div>
                                  )}
                                  {s.areas && (
                                    <div>
                                      <dt className="font-medium text-gray-700 inline">Areas: </dt>
                                      <dd className="inline">{s.areas}</dd>
                                    </div>
                                  )}
                                  {s.units != null && s.units !== "" && (
                                    <div>
                                      <dt className="font-medium text-gray-700 inline">Units: </dt>
                                      <dd className="inline">{s.units}</dd>
                                    </div>
                                  )}
                                  {s.complications && (
                                    <div>
                                      <dt className="font-medium text-gray-700 inline">Complications: </dt>
                                      <dd className="inline">{s.complications}</dd>
                                    </div>
                                  )}
                                  {s.patient_feedback && (
                                    <div>
                                      <dt className="font-medium text-gray-700 inline">Patient: </dt>
                                      <dd className="inline">{s.patient_feedback}</dd>
                                    </div>
                                  )}
                                  {s.next_steps && (
                                    <div>
                                      <dt className="font-medium text-gray-700 inline">Next steps: </dt>
                                      <dd className="inline">{s.next_steps}</dd>
                                    </div>
                                  )}
                                </dl>
                              )}
                              {note.raw_narrative &&
                                s.clinical_summary &&
                                note.raw_narrative !== s.clinical_summary && (
                                  <p className="mt-2 text-xs text-gray-500 italic border-t pt-2">
                                    Original: {note.raw_narrative}
                                  </p>
                                )}
                            </div>
                          );
                        })}
                      {(clinicalNotesAll || []).filter(
                        (n) => n.patient_id === clinicalFilePatient.id,
                      ).length === 0 && (
                        <p className="text-sm text-gray-500 py-4 text-center">
                          No clinical notes yet. Add one above or dictate in Voice Diary.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  </div>
  );
}