import React, { useState } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Sparkles, UserCog, Users, Copy } from "lucide-react";
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
    expense_category: '',
    expense_amount: '',
    expense_notes: '',
    recurrence_frequency: 'monthly'
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
        default_duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes, 10) : undefined
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
      const data = {
        name: formData.patient_name,
        phone: formData.patient_phone, // New field
        contact: formData.patient_contact // Now for email
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
      expense_category: '',
      expense_amount: '',
      expense_notes: '',
      recurrence_frequency: 'monthly'
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
          expense_category: '',
          expense_amount: '',
          expense_notes: '',
          recurrence_frequency: 'monthly'
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
          expense_category: '',
          expense_amount: '',
          expense_notes: '',
          recurrence_frequency: 'monthly'
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
          expense_category: '',
          expense_amount: '',
          expense_notes: '',
          recurrence_frequency: 'monthly'
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
          expense_category: item.category,
          expense_amount: item.amount,
          expense_notes: item.notes || '',
          recurrence_frequency: item.recurrence_frequency || 'monthly'
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
      expense_category: '',
      expense_amount: '',
      expense_notes: '',
      recurrence_frequency: 'monthly'
    });
    setIsDialogOpen(true);
  };

  const calculateMargin = (price, cost) => {
    if (!price || price === 0) return 0;
    return ((price - cost) / price * 100).toFixed(0);
  };

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Clinic Management</h1>
            <p className="text-sm text-gray-500 font-light">Manage your treatments, practitioners, and patients</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
          <div className="border-b border-gray-100 p-6 pb-0">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("treatments")}
                className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium transition-colors ${
                  activeTab === "treatments"
                    ? 'bg-[#2C3E50] text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                Treatments
              </button>
              <button
                onClick={() => setActiveTab("practitioners")}
                className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium transition-colors ${
                  activeTab === "practitioners"
                    ? 'bg-[#2C3E50] text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <UserCog className="w-5 h-5" />
                Practitioners
              </button>
              <button
                onClick={() => setActiveTab("patients")}
                className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium transition-colors ${
                  activeTab === "patients"
                    ? 'bg-[#2C3E50] text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-5 h-5" />
                Patients
              </button>
              <button
                onClick={() => setActiveTab("recurring")}
                className={`flex items-center gap-2 px-6 py-3 rounded-t-xl font-medium transition-colors ${
                  activeTab === "recurring"
                    ? 'bg-[#2C3E50] text-white'
                    : 'text-gray-600 hover:text-gray-900'
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
              <div className="flex justify-end mb-6">
                <Button
                  onClick={() => openDialog(null, activeTab === 'treatments' ? 'treatment' : activeTab === 'practitioners' ? 'practitioner' : 'patient')}
                  className="bg-[#2C3E50] hover:bg-[#34495E] text-white rounded-xl"
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
                    className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg mb-1">{treatment.treatment_name}</h3>
                        <p className="text-sm text-gray-500">{treatment.category}</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Price</span>
                        <span className="text-sm font-semibold text-gray-900">£{treatment.default_price?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Cost</span>
                        <span className="text-sm font-semibold text-gray-900">£{(treatment.typical_product_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Margin</span>
                        <span className="text-sm font-semibold text-green-600">
                          {calculateMargin(treatment.default_price, treatment.typical_product_cost || 0)}%
                        </span>
                      </div>
                      {(treatment.duration_minutes ?? treatment.default_duration_minutes) && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Duration</span>
                          <span className="text-sm font-semibold text-gray-900">{treatment.duration_minutes ?? treatment.default_duration_minutes} min</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDuplicateDialog(treatment)}
                        className="flex-1 rounded-lg border-gray-300 hover:bg-white text-gray-700 hover:text-gray-900"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(treatment, 'treatment')}
                        className="rounded-lg border-gray-300 hover:bg-white"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(treatment, 'treatment')}
                        className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {treatments.length === 0 && (
                  <div className="col-span-full text-center py-12">
                    <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No treatments yet</p>
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
                    className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between hover:bg-white transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#2C3E50] rounded-full flex items-center justify-center">
                        <UserCog className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{practitioner.name}</span>
                          {practitioner.is_lead && (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-[#0f1829]">
                              Lead
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Lead Practitioner</span>
                        <button
                          onClick={() => toggleLeadPractitioner(practitioner)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            practitioner.is_lead ? 'bg-[#1a2845]' : 'bg-gray-300'
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
                          className="rounded-lg border-gray-300 hover:bg-white"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(practitioner, 'practitioner')}
                          className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {practitioners.length === 0 && (
                  <div className="text-center py-12">
                    <UserCog className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No practitioners yet</p>
                  </div>
                )}
              </div>
            )}

            {/* Patients List */}
            {activeTab === 'patients' && (
              <div className="space-y-3">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between hover:bg-white transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#2C3E50] rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{patient.name}</p>
                        <div className="flex gap-2 text-sm text-gray-500">
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
                        onClick={() => openDialog(patient, 'patient')}
                        className="rounded-lg border-gray-300 hover:bg-white"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(patient, 'patient')}
                        className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {patients.length === 0 && (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No patients yet</p>
                  </div>
                )}
              </div>
            )}

            {/* Recurring Expenses List */}
            {activeTab === 'recurring' && (
              <div>
                <p className="text-sm text-gray-600 mb-6">
                  Recurring expenses are automatically added to your records each period. Toggle them on/off as needed.
                </p>
                <div className="space-y-3">
                  {recurringExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="bg-gray-50 rounded-xl p-5 border border-gray-200 hover:bg-white transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-900 text-lg">{expense.category}</h3>
                            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                              expense.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {expense.is_active ? 'Active' : 'Paused'}
                            </span>
                            <span className="text-xs font-medium px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                              {expense.recurrence_frequency}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-gray-900">
                              <span className="font-semibold text-lg text-gray-900">£{expense.amount?.toFixed(2)}</span>
                            </p>
                            {expense.notes && (
                              <p className="text-sm text-gray-600">{expense.notes}</p>
                            )}
                            {expense.last_generated_date && (
                              <p className="text-xs text-gray-500">
                                Last generated: {format(new Date(expense.last_generated_date), 'dd MMM yyyy')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleRecurringExpense(expense)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              expense.is_active ? 'bg-[#2C3E50]' : 'bg-gray-300'
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
                            className="rounded-lg border-gray-300 hover:bg-white"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(expense, 'recurring')}
                            className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {recurringExpenses.length === 0 && (
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <p className="text-gray-500 mb-2">No recurring expenses yet</p>
                      <p className="text-sm text-gray-400">Add recurring expenses from Quick Add</p>
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
      </div>
    </div>
  );
}