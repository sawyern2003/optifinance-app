
import React, { useState } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Sparkles, UserCog, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function Catalog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("treatments");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    treatment_name: '',
    category: '',
    default_price: '',
    typical_product_cost: '',
    practitioner_name: '',
    patient_name: '',
    patient_contact: ''
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

  // Treatment Mutations
  const createTreatmentMutation = useMutation({
    mutationFn: (data) => api.entities.TreatmentCatalog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] });
      toast({
        title: "Treatment added",
        description: "New treatment added to your catalog",
        className: "bg-green-50 border-green-200"
      });
      resetForm();
    },
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
  });

  const deleteTreatmentMutation = useMutation({
    mutationFn: (id) => api.entities.TreatmentCatalog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treatmentCatalog'] });
      toast({
        title: "Treatment deleted",
        className: "bg-red-50 border-red-200"
      });
    },
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
  });

  const deletePractitionerMutation = useMutation({
    mutationFn: (id) => api.entities.Practitioner.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      toast({
        title: "Practitioner deleted",
        className: "bg-red-50 border-red-200"
      });
    },
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
  });

  const deletePatientMutation = useMutation({
    mutationFn: (id) => api.entities.Patient.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast({
        title: "Patient deleted",
        className: "bg-red-50 border-red-200"
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (activeTab === 'treatments') {
      const data = {
        treatment_name: formData.treatment_name,
        category: formData.category,
        default_price: parseFloat(formData.default_price),
        typical_product_cost: parseFloat(formData.typical_product_cost || 0)
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
        contact: formData.patient_contact
      };
      if (editingItem) {
        updatePatientMutation.mutate({ id: editingItem.id, data });
      } else {
        createPatientMutation.mutate(data);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      treatment_name: '',
      category: '',
      default_price: '',
      typical_product_cost: '',
      practitioner_name: '',
      patient_name: '',
      patient_contact: ''
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
          typical_product_cost: item.typical_product_cost || '',
          practitioner_name: '',
          patient_name: '',
          patient_contact: ''
        });
      } else if (type === 'practitioner') {
        setFormData({
          ...formData,
          practitioner_name: item.name
        });
      } else if (type === 'patient') {
        setFormData({
          ...formData,
          patient_name: item.name,
          patient_contact: item.contact || ''
        });
      }
    }
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
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Clinic Management</h1>
            <p className="text-gray-600">Manage your treatments, practitioners, and patients</p>
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
            </div>
          </div>

          <div className="p-6">
            <div className="flex justify-end mb-6">
              <Button
                onClick={() => openDialog(null, activeTab === 'treatments' ? 'treatment' : activeTab === 'practitioners' ? 'practitioner' : 'patient')}
                className="bg-[#2C3E50] hover:bg-[#34495E] text-white rounded-xl"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add {activeTab === 'treatments' ? 'Treatment' : activeTab === 'practitioners' ? 'Practitioner' : 'Patient'}
              </Button>
            </div>

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
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(treatment, 'treatment')}
                        className="flex-1 rounded-lg border-gray-300 hover:bg-white"
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteTreatmentMutation.mutate(treatment.id)}
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
                      <span className="font-medium text-gray-900">{practitioner.name}</span>
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
                        onClick={() => deletePractitionerMutation.mutate(practitioner.id)}
                        className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
                        {patient.contact && <p className="text-sm text-gray-500">{patient.contact}</p>}
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
                        onClick={() => deletePatientMutation.mutate(patient.id)}
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
          </div>
        </div>

        {/* Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {editingItem ? 'Edit' : 'Add'} {activeTab === 'treatments' ? 'Treatment' : activeTab === 'practitioners' ? 'Practitioner' : 'Patient'}
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
                        <SelectItem value="Anti-Wrinkle">Anti-Wrinkle</SelectItem>
                        <SelectItem value="Fillers">Fillers</SelectItem>
                        <SelectItem value="Hydration">Hydration</SelectItem>
                        <SelectItem value="Bio-remodelling">Bio-remodelling</SelectItem>
                        <SelectItem value="Skin Treatments">Skin Treatments</SelectItem>
                        <SelectItem value="Laser">Laser</SelectItem>
                        <SelectItem value="Thread Lift">Thread Lift</SelectItem>
                        <SelectItem value="Body Contouring">Body Contouring</SelectItem>
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
                    <Label htmlFor="patient_contact" className="text-sm font-medium text-gray-700">
                      Contact (Optional)
                    </Label>
                    <Input
                      id="patient_contact"
                      value={formData.patient_contact}
                      onChange={(e) => setFormData({...formData, patient_contact: e.target.value})}
                      placeholder="Phone or email"
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
      </div>
    </div>
  );
}
