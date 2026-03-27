import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { bookingAPI } from '@/api/booking';
import { api } from '@/api/api';
import { Calendar, Clock, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Public Booking Page - No login required
 * Allows patients to book appointments online
 */
export default function PublicBooking() {
  const { slug } = useParams();
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [step, setStep] = useState(1); // 1: Select Date/Time, 2: Enter Details, 3: Confirmation
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));

  // Fetch clinic profile
  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['public-profile', slug],
    queryFn: () => bookingAPI.getProfileBySlug(slug),
    retry: false,
  });

  // Fetch availability settings
  const { data: availabilitySettings } = useQuery({
    queryKey: ['availability', profile?.id],
    queryFn: () => bookingAPI.getAvailabilitySettings(profile.id),
    enabled: !!profile?.id,
  });

  // Fetch appointments for availability checking
  const weekStart = currentWeek.toISOString().split('T')[0];
  const weekEnd = new Date(currentWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const { data: existingAppointments = [] } = useQuery({
    queryKey: ['public-appointments', profile?.id, weekStart, weekEndStr],
    queryFn: () => bookingAPI.getAppointmentsForRange(profile.id, weekStart, weekEndStr),
    enabled: !!profile?.id,
  });

  // Fetch treatment catalog
  const { data: treatments = [] } = useQuery({
    queryKey: ['public-treatments', profile?.id],
    queryFn: async () => {
      // This needs to be public, for now we'll just show a default list
      return [
        { id: '1', treatment_name: 'Botox', duration: 30 },
        { id: '2', treatment_name: 'Dermal Fillers', duration: 45 },
        { id: '3', treatment_name: 'Lip Fillers', duration: 30 },
        { id: '4', treatment_name: 'Consultation', duration: 30 },
      ];
    },
    enabled: !!profile?.id,
  });

  // Generate week days
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeek);
      day.setDate(currentWeek.getDate() + i);
      days.push(day);
    }
    return days;
  }, [currentWeek]);

  // Calculate available slots for selected date
  const availableSlots = useMemo(() => {
    if (!selectedDate || !availabilitySettings) return [];

    return bookingAPI.calculateAvailableSlots(
      selectedDate,
      availabilitySettings.working_hours,
      existingAppointments,
      availabilitySettings
    );
  }, [selectedDate, availabilitySettings, existingAppointments]);

  // Navigate weeks
  const goToNextWeek = () => {
    setCurrentWeek((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return getWeekStart(newDate);
    });
  };

  const goToPreviousWeek = () => {
    setCurrentWeek((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return getWeekStart(newDate);
    });
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fef9f0] to-white">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#1a2845] mx-auto mb-4" />
          <p className="text-gray-600">Loading booking page...</p>
        </div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fef9f0] to-white">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-semibold text-[#1a2845] mb-2">Booking Page Not Found</h1>
          <p className="text-gray-600">
            The booking page you're looking for doesn't exist or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fef9f0] to-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#1a2845] text-white flex items-center justify-center text-2xl font-semibold">
              {profile.clinic_name?.charAt(0) || 'C'}
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-[#1a2845]">{profile.clinic_name}</h1>
              <p className="text-gray-600 font-light">Book Your Appointment</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {step === 1 && (
          <DateTimeSelector
            weekDays={weekDays}
            currentWeek={currentWeek}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            availableSlots={availableSlots}
            onSelectDate={setSelectedDate}
            onSelectTime={setSelectedTime}
            onNext={() => setStep(2)}
            onPreviousWeek={goToPreviousWeek}
            onNextWeek={goToNextWeek}
          />
        )}

        {step === 2 && (
          <BookingForm
            profile={profile}
            treatments={treatments}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onBack={() => setStep(1)}
            onSuccess={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Confirmation
            profile={profile}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Step 1: Date and Time Selection
 */
function DateTimeSelector({
  weekDays,
  currentWeek,
  selectedDate,
  selectedTime,
  availableSlots,
  onSelectDate,
  onSelectTime,
  onNext,
  onPreviousWeek,
  onNextWeek,
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Week Navigation */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <Button variant="outline" onClick={onPreviousWeek} className="hover:bg-[#fef9f0]">
          <ChevronLeft className="w-5 h-5" />
        </Button>

        <h2 className="text-xl font-semibold text-[#1a2845]">
          {formatWeekRange(weekDays[0], weekDays[6])}
        </h2>

        <Button variant="outline" onClick={onNextWeek} className="hover:bg-[#fef9f0]">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2 p-6">
        {weekDays.map((day, i) => {
          const isSelected =
            selectedDate && day.toDateString() === selectedDate.toDateString();
          const isToday = day.toDateString() === new Date().toDateString();
          const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

          return (
            <button
              key={i}
              onClick={() => !isPast && onSelectDate(day)}
              disabled={isPast}
              className={`p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-[#d4a740] bg-[#fef9f0]'
                  : isPast
                  ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 hover:border-[#d4a740] hover:bg-[#fef9f0]'
              }`}
            >
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                {day.toLocaleDateString('en-GB', { weekday: 'short' })}
              </div>
              <div
                className={`text-2xl font-semibold mt-1 ${
                  isToday ? 'text-[#d4a740]' : 'text-[#1a2845]'
                }`}
              >
                {day.getDate()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Time Slots */}
      {selectedDate && (
        <div className="p-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-[#1a2845] mb-4">Select a Time</h3>
          {availableSlots.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No available slots for this date. Please select another date.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {availableSlots.map((slot, i) => {
                const isSelected = selectedTime === slot.time;
                return (
                  <button
                    key={i}
                    onClick={() => onSelectTime(slot.time)}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      isSelected
                        ? 'border-[#d4a740] bg-[#d4a740] text-white'
                        : 'border-gray-200 hover:border-[#d4a740] hover:bg-[#fef9f0]'
                    }`}
                  >
                    {slot.time}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Next Button */}
      {selectedDate && selectedTime && (
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <Button
            onClick={onNext}
            className="w-full bg-[#1a2845] hover:bg-[#2C3E50] text-white"
          >
            Continue to Details
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Step 2: Booking Form
 */
function BookingForm({ profile, treatments, selectedDate, selectedTime, onBack, onSuccess }) {
  const [formData, setFormData] = useState({
    treatment_id: '',
    treatment_name: '',
    patient_name: '',
    patient_email: '',
    patient_phone: '',
    notes: '',
  });

  const bookingMutation = useMutation({
    mutationFn: async (data) => {
      return await bookingAPI.createPublicBooking({
        user_id: profile.id,
        patient_name: data.patient_name,
        patient_email: data.patient_email,
        patient_phone: data.patient_phone,
        treatment_name: data.treatment_name,
        date: selectedDate.toISOString().split('T')[0],
        time: selectedTime,
        duration_minutes: 30,
        notes: data.notes,
      });
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleTreatmentChange = (treatmentId) => {
    const treatment = treatments.find((t) => t.id === treatmentId);
    setFormData((prev) => ({
      ...prev,
      treatment_id: treatmentId,
      treatment_name: treatment?.treatment_name || '',
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    bookingMutation.mutate(formData);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[#1a2845] mb-2">Your Details</h2>
        <p className="text-gray-600">
          {selectedDate.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}{' '}
          at {selectedTime}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="treatment">Treatment *</Label>
          <Select value={formData.treatment_id} onValueChange={handleTreatmentChange} required>
            <SelectTrigger>
              <SelectValue placeholder="Select treatment" />
            </SelectTrigger>
            <SelectContent>
              {treatments.map((treatment) => (
                <SelectItem key={treatment.id} value={treatment.id}>
                  {treatment.treatment_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            value={formData.patient_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, patient_name: e.target.value }))}
            placeholder="John Smith"
            required
          />
        </div>

        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={formData.patient_email}
            onChange={(e) => setFormData((prev) => ({ ...prev, patient_email: e.target.value }))}
            placeholder="john@example.com"
            required
          />
        </div>

        <div>
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.patient_phone}
            onChange={(e) => setFormData((prev) => ({ ...prev, patient_phone: e.target.value }))}
            placeholder="07XXX XXXXXX"
            required
          />
        </div>

        <div>
          <Label htmlFor="notes">Additional Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Any questions or special requirements..."
            rows={3}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            type="submit"
            disabled={bookingMutation.isPending}
            className="flex-1 bg-[#1a2845] hover:bg-[#2C3E50]"
          >
            {bookingMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Booking...
              </>
            ) : (
              'Confirm Booking'
            )}
          </Button>
        </div>

        {bookingMutation.isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {bookingMutation.error.message || 'Failed to create booking. Please try again.'}
          </div>
        )}
      </form>
    </div>
  );
}

/**
 * Step 3: Confirmation
 */
function Confirmation({ profile, selectedDate, selectedTime }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-600" />
      </div>

      <h2 className="text-2xl font-semibold text-[#1a2845] mb-2">Booking Confirmed!</h2>

      <p className="text-gray-600 mb-6">
        Your appointment at <strong>{profile.clinic_name}</strong> has been booked for:
      </p>

      <div className="bg-[#fef9f0] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-center gap-2 text-[#1a2845] font-semibold mb-2">
          <Calendar className="w-5 h-5" />
          <span>
            {selectedDate.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 text-[#1a2845] font-semibold">
          <Clock className="w-5 h-5" />
          <span>{selectedTime}</span>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        You'll receive a confirmation email shortly. If you need to reschedule or cancel, please
        contact the clinic directly.
      </p>
    </div>
  );
}

// Helper functions
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatWeekRange(start, end) {
  const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endStr = end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${startStr} - ${endStr}`;
}
