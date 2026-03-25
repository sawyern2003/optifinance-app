import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, User, DollarSign, Stethoscope, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  effectiveFriendsFamilyPercent,
  patientEligibleForFriendsFamily,
} from '@/lib/invoiceFriendsFamily';
import { computeTreatmentFriendsFamilyPricing } from '@/lib/friendsFamilyPricing';

// Helper functions for course number parsing
const COURSE_NOTE_RE = /^\s*Course\s*(\d{1,2})\s*[:\-]\s*/i;

function parseCourseNumberFromNotes(notes) {
  const m = String(notes || "").match(COURSE_NOTE_RE);
  return m?.[1] || "";
}

function stripCoursePrefix(notes) {
  return String(notes || "").replace(COURSE_NOTE_RE, "").trim();
}

function composeNotesWithCourse(notes, courseNumber) {
  const clean = stripCoursePrefix(notes);
  if (!courseNumber) return clean;
  return clean ? `Course ${courseNumber}: ${clean}` : `Course ${courseNumber}`;
}

/**
 * Slide-in edit panel for treatments
 */
export function TreatmentEditPanel({
  treatment,
  isOpen,
  onClose,
  onSave,
  patients = [],
  treatmentCatalog = [],
  practitioners = [],
  isSaving = false
}) {
  const [formData, setFormData] = useState({
    date: '',
    patient_id: '',
    patient_name: '',
    treatment_id: '',
    treatment_name: '',
    price_paid: '',
    payment_status: 'pending',
    amount_paid: '',
    duration_minutes: '',
    practitioner_id: '',
    practitioner_name: '',
    course_number: '',
    notes: '',
    friends_family_discount_applied: false,
    friends_family_discount_percent: ''
  });

  const [useLeadPractitioner, setUseLeadPractitioner] = useState(false);
  const [newPractitionerName, setNewPractitionerName] = useState(null);

  // Initialize form data when treatment changes
  useEffect(() => {
    if (treatment && isOpen) {
      const patient = patients.find(p => p.name === treatment.patient_name);
      const leadPractitioner = practitioners.find(p => p.is_lead);
      const isCurrentPractitionerLead = treatment.practitioner_id && leadPractitioner?.id === treatment.practitioner_id;

      setUseLeadPractitioner(isCurrentPractitionerLead);
      setNewPractitionerName(null);

      setFormData({
        date: format(new Date(treatment.date), 'yyyy-MM-dd'),
        patient_id: patient?.id || '',
        patient_name: treatment.patient_name || '',
        treatment_id: treatment.treatment_id || '',
        treatment_name: treatment.treatment_name,
        price_paid: treatment.price_paid,
        payment_status: treatment.payment_status,
        amount_paid: treatment.amount_paid || treatment.price_paid,
        duration_minutes: treatment.duration_minutes || '',
        practitioner_id: treatment.practitioner_id || '',
        practitioner_name: treatment.practitioner_name || '',
        course_number: parseCourseNumberFromNotes(treatment.notes || ""),
        notes: stripCoursePrefix(treatment.notes || ""),
        friends_family_discount_applied: !!treatment.friends_family_discount_applied,
        friends_family_discount_percent: (() => {
          if (treatment.friends_family_discount_percent != null && treatment.friends_family_discount_percent !== "") {
            return String(treatment.friends_family_discount_percent);
          }
          const p = patients.find((x) => x.id === patient?.id);
          return patientEligibleForFriendsFamily(p)
            ? String(p.friends_family_discount_percent)
            : "";
        })()
      });
    }
  }, [treatment, isOpen, patients, practitioners]);

  // Auto-calculate F&F pricing when relevant fields change
  useEffect(() => {
    if (!isOpen || !formData.friends_family_discount_applied || !formData.treatment_id) return;

    const cat = treatmentCatalog.find((t) => t.id === formData.treatment_id);
    const pat = formData.patient_id && formData.patient_id !== "none"
      ? patients.find((p) => p.id === formData.patient_id)
      : null;
    const pct = effectiveFriendsFamilyPercent(formData.friends_family_discount_percent, pat);

    if (pct == null) return;

    const res = computeTreatmentFriendsFamilyPricing({
      ffApplied: true,
      effectivePct: pct,
      catalogEntry: cat,
      paymentStatus: formData.payment_status,
      currentAmountPaidInput: formData.amount_paid,
    });

    if (!res.ok || res.chargedPrice == null) return;

    const newPrice = String(res.chargedPrice);
    const newAmt = formData.payment_status === "paid"
      ? newPrice
      : formData.payment_status === "pending"
        ? "0"
        : String(res.amountPaid);

    setFormData((prev) => {
      if (!prev.friends_family_discount_applied || !prev.treatment_id) return prev;
      const samePrice = Math.abs(parseFloat(prev.price_paid) - parseFloat(newPrice)) < 0.005;
      const sameAmt = Math.abs(parseFloat(prev.amount_paid) - parseFloat(newAmt)) < 0.005;
      if (samePrice && sameAmt) return prev;
      return { ...prev, price_paid: newPrice, amount_paid: newAmt };
    });
  }, [
    isOpen,
    formData.friends_family_discount_applied,
    formData.friends_family_discount_percent,
    formData.treatment_id,
    formData.patient_id,
    formData.payment_status,
    formData.amount_paid,
    treatmentCatalog,
    patients,
  ]);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Prepare final data
    const selectedPatient = patients.find(p => p.id === formData.patient_id);
    const selectedTreatment = treatmentCatalog.find(t => t.id === formData.treatment_id);
    const leadPractitioner = practitioners.find(p => p.is_lead);

    let finalPractitionerId = formData.practitioner_id;
    let finalPractitionerName = formData.practitioner_name;

    if (newPractitionerName !== null && newPractitionerName.trim() !== '') {
      // Will be handled by parent component
      finalPractitionerId = 'new';
      finalPractitionerName = newPractitionerName;
    } else if (useLeadPractitioner) {
      finalPractitionerId = leadPractitioner?.id || null;
      finalPractitionerName = leadPractitioner?.name || '';
    } else if (formData.practitioner_id === 'none') {
      finalPractitionerId = null;
      finalPractitionerName = '';
    } else {
      const selectedPractitioner = practitioners.find(p => p.id === formData.practitioner_id);
      finalPractitionerName = selectedPractitioner?.name || '';
    }

    const parsedPricePaid = parseFloat(formData.price_paid);
    const parsedAmountPaid = parseFloat(formData.amount_paid);

    let amountPaid = parsedAmountPaid;
    if (formData.payment_status === 'paid') {
      amountPaid = parsedPricePaid;
    } else if (formData.payment_status === 'pending') {
      amountPaid = 0;
    }

    const finalTreatmentId = formData.treatment_id && formData.treatment_id !== "none"
      ? formData.treatment_id
      : treatment?.treatment_id || null;

    const finalTreatmentName = selectedTreatment?.treatment_name || formData.treatment_name || treatment?.treatment_name || "";

    const finalPatientId = formData.patient_id && formData.patient_id !== "none"
      ? formData.patient_id
      : null;

    const finalPractitionerIdNormalized = finalPractitionerId && String(finalPractitionerId).trim() !== ""
      ? finalPractitionerId
      : null;

    const effectiveFfPct = effectiveFriendsFamilyPercent(
      formData.friends_family_discount_percent,
      selectedPatient,
    );

    const ffApplied = !!formData.friends_family_discount_applied && effectiveFfPct !== null;

    const ffPricing = computeTreatmentFriendsFamilyPricing({
      ffApplied,
      effectivePct: effectiveFfPct,
      catalogEntry: selectedTreatment,
      paymentStatus: formData.payment_status,
      currentAmountPaidInput: formData.amount_paid,
    });

    let pricePaid = parsedPricePaid;
    if (ffApplied && ffPricing.chargedPrice != null) {
      pricePaid = ffPricing.chargedPrice;
      amountPaid = ffPricing.amountPaid != null ? ffPricing.amountPaid : amountPaid;
    }

    const productCost = selectedTreatment?.typical_product_cost || 0;
    const profit = amountPaid - productCost;

    const saveData = {
      date: formData.date,
      patient_id: finalPatientId,
      patient_name: selectedPatient?.name || formData.patient_name,
      treatment_id: finalTreatmentId,
      treatment_name: finalTreatmentName,
      duration_minutes: formData.duration_minutes ? parseFloat(formData.duration_minutes) : undefined,
      price_paid: pricePaid,
      payment_status: formData.payment_status,
      amount_paid: amountPaid,
      product_cost: productCost,
      profit: profit,
      practitioner_id: finalPractitionerIdNormalized,
      practitioner_name: finalPractitionerName,
      notes: composeNotesWithCourse(formData.notes, String(formData.course_number || "")),
      friends_family_discount_applied: ffApplied,
      friends_family_discount_percent: ffApplied ? effectiveFfPct : null,
      friends_family_list_price: ffApplied ? ffPricing.listSnapshot : null,
    };

    onSave(saveData, newPractitionerName);
  };

  const handleLeadPractitionerToggle = (checked) => {
    setUseLeadPractitioner(checked);
    if (checked) {
      const leadPractitioner = practitioners.find(p => p.is_lead);
      if (leadPractitioner) {
        setFormData(prev => ({
          ...prev,
          practitioner_id: leadPractitioner.id,
          practitioner_name: leadPractitioner.name
        }));
        setNewPractitionerName(null);
      } else {
        setUseLeadPractitioner(false);
        setFormData(prev => ({
          ...prev,
          practitioner_id: '',
          practitioner_name: ''
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        practitioner_id: '',
        practitioner_name: ''
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full md:w-[600px] bg-white shadow-2xl z-50 overflow-y-auto animate-slide-in">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-semibold text-[#1a2845]">Edit Treatment</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 px-6 py-6 space-y-8">
            {/* Section 1: Basic Information */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-[#d4a740]" />
                <h3 className="text-lg font-semibold text-[#1a2845]">Basic Information</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div>
                  <Label htmlFor="date" className="text-sm font-medium text-gray-700">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="rounded-xl border-gray-300 h-11 mt-1"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="patient" className="text-sm font-medium text-gray-700">Patient</Label>
                  <Select
                    value={formData.patient_id}
                    onValueChange={(value) => {
                      const patient = value === "none" ? null : patients.find((p) => p.id === value);
                      const defaultFf = value === "none"
                        ? ""
                        : patientEligibleForFriendsFamily(patient)
                          ? String(patient.friends_family_discount_percent)
                          : "";
                      setFormData({
                        ...formData,
                        patient_id: value,
                        patient_name: patient?.name || "",
                        friends_family_discount_percent: defaultFf,
                      });
                    }}
                  >
                    <SelectTrigger className="rounded-xl border-gray-300 h-11 mt-1">
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

                <div>
                  <Label htmlFor="treatment" className="text-sm font-medium text-gray-700">Treatment *</Label>
                  <Select
                    value={formData.treatment_id}
                    onValueChange={(value) => {
                      const treatment = treatmentCatalog.find(t => t.id === value);
                      const list = treatment?.default_price != null ? String(treatment.default_price) : "";
                      const ap = formData.payment_status === "paid"
                        ? list
                        : formData.payment_status === "pending"
                          ? "0"
                          : formData.amount_paid;
                      setFormData({
                        ...formData,
                        treatment_id: value,
                        treatment_name: treatment?.treatment_name || "",
                        price_paid: list || formData.price_paid,
                        amount_paid: ap,
                      });
                    }}
                    required
                  >
                    <SelectTrigger className="rounded-xl border-gray-300 h-11 mt-1">
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
              </div>
            </div>

            {/* Section 2: Pricing & Payment */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-[#d4a740]" />
                <h3 className="text-lg font-semibold text-[#1a2845]">Pricing & Payment</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price" className="text-sm font-medium text-gray-700">
                      {formData.friends_family_discount_applied ? "Amount charged (£) *" : "Price (£) *"}
                    </Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price_paid}
                      onChange={(e) => setFormData({...formData, price_paid: e.target.value})}
                      className="rounded-xl border-gray-300 h-11 mt-1"
                      required
                      disabled={formData.friends_family_discount_applied}
                    />
                  </div>

                  <div>
                    <Label htmlFor="status" className="text-sm font-medium text-gray-700">Status *</Label>
                    <Select
                      value={formData.payment_status}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          payment_status: value,
                          amount_paid: value === "paid"
                            ? formData.price_paid
                            : value === "pending"
                              ? "0"
                              : formData.amount_paid,
                        })
                      }
                    >
                      <SelectTrigger className="rounded-xl border-gray-300 h-11 mt-1">
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

                {formData.payment_status === 'partially_paid' && (
                  <div>
                    <Label htmlFor="amount-paid" className="text-sm font-medium text-gray-700">Amount Paid (£) *</Label>
                    <Input
                      id="amount-paid"
                      type="number"
                      step="0.01"
                      value={formData.amount_paid}
                      onChange={(e) => setFormData({...formData, amount_paid: e.target.value})}
                      className="rounded-xl border-gray-300 h-11 mt-1"
                      required
                    />
                  </div>
                )}

                {/* Friends & Family Discount */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="friends-family"
                      checked={!!formData.friends_family_discount_applied}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const cat = treatmentCatalog.find((t) => t.id === formData.treatment_id);
                        const list = cat?.default_price != null ? String(cat.default_price) : "";
                        setFormData({
                          ...formData,
                          friends_family_discount_applied: checked,
                          friends_family_discount_percent: checked ? formData.friends_family_discount_percent : "",
                          price_paid: !checked && list ? list : formData.price_paid,
                          amount_paid: !checked && list
                            ? formData.payment_status === "paid"
                              ? list
                              : formData.payment_status === "pending"
                                ? "0"
                                : formData.amount_paid
                            : formData.amount_paid,
                        });
                      }}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded mt-1 shrink-0"
                    />
                    <div className="flex-1 space-y-3 min-w-0">
                      <Label htmlFor="friends-family" className="text-sm font-medium text-gray-900 cursor-pointer">
                        Apply friends & family discount to this visit
                      </Label>
                      {formData.friends_family_discount_applied && (
                        <div>
                          <Label htmlFor="ff-percent" className="text-xs font-medium text-gray-700">
                            Discount for this visit (%)
                          </Label>
                          <Input
                            id="ff-percent"
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            placeholder="e.g. 10"
                            value={formData.friends_family_discount_percent}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                friends_family_discount_percent: e.target.value,
                              })
                            }
                            className="rounded-xl border-gray-300 h-11 max-w-[200px] mt-1"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Practitioner */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Stethoscope className="w-5 h-5 text-[#d4a740]" />
                <h3 className="text-lg font-semibold text-[#1a2845]">Practitioner</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="use-lead"
                    checked={useLeadPractitioner}
                    onChange={(e) => handleLeadPractitionerToggle(e.target.checked)}
                    className="w-4 h-4 text-[#1a2845] border-gray-300 rounded focus:ring-purple-600"
                  />
                  <Label htmlFor="use-lead" className="text-sm font-medium text-gray-700 cursor-pointer">
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
                            setFormData({...formData, practitioner_id: '', practitioner_name: ''});
                          }}
                          className="rounded-xl border-gray-300"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="practitioner" className="text-sm font-medium text-gray-700">Practitioner</Label>
                        <Select
                          value={formData.practitioner_id}
                          onValueChange={(value) => {
                            if (value === 'new') {
                              setNewPractitionerName('');
                              setFormData({...formData, practitioner_id: '', practitioner_name: ''});
                            } else {
                              const practitioner = practitioners.find(p => p.id === value);
                              setFormData({
                                ...formData,
                                practitioner_id: value === 'none' ? null : value,
                                practitioner_name: value === 'none' ? '' : practitioner?.name || ''
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="rounded-xl border-gray-300 h-11 mt-1">
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
                      <span className="font-semibold">Lead Practitioner:</span> {formData.practitioner_name || 'Not set'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Additional Details */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-[#d4a740]" />
                <h3 className="text-lg font-semibold text-[#1a2845]">Additional Details</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div>
                  <Label htmlFor="duration" className="text-sm font-medium text-gray-700">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({...formData, duration_minutes: e.target.value})}
                    placeholder="e.g. 30, 60, 90"
                    className="rounded-xl border-gray-300 h-11 mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="course-number" className="text-sm font-medium text-gray-700">Course Number</Label>
                  <Select
                    value={formData.course_number || "none"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        course_number: value === "none" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger className="rounded-xl border-gray-300 h-11 mt-1">
                      <SelectValue placeholder="Select course number (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No course number</SelectItem>
                      {Array.from({ length: 12 }).map((_, idx) => {
                        const n = String(idx + 1);
                        return (
                          <SelectItem key={n} value={n}>
                            Course {n}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes" className="text-sm font-medium text-gray-700">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Optional notes..."
                    className="rounded-xl border-gray-300 mt-1"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-xl border-gray-300"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
