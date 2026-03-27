import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { supabase } from '@/config/supabase';
import { ChevronLeft, ChevronRight, Plus, X, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
 * Calendar Page - Calendly-style Week View
 *
 * Professional week grid showing time slots and appointments
 */
export default function CalendarWeek() {
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState('week'); // week, day

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch appointments
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => api.entities.Appointment.list('-date')
  });

  // Fetch patients for dropdown
  const { data: patients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api.entities.Patient.list('name')
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

  // Filter appointments for current week
  const weekAppointments = useMemo(() => {
    const weekEnd = new Date(currentWeek);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59);

    return appointments.filter(apt => {
      const aptDate = new Date(apt.date);
      return aptDate >= currentWeek && aptDate <= weekEnd;
    });
  }, [appointments, currentWeek]);

  // Navigate weeks
  const goToPreviousWeek = () => {
    setCurrentWeek(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return getWeekStart(newDate);
    });
  };

  const goToNextWeek = () => {
    setCurrentWeek(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return getWeekStart(newDate);
    });
  };

  const goToToday = () => {
    setCurrentWeek(getWeekStart(new Date()));
  };

  // Handle time slot click
  const handleSlotClick = (day, hour) => {
    setSelectedSlot({ day, hour });
    setAddDialogOpen(true);
  };

  // Delete appointment mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // First, find and delete associated treatment entry
      const { data: treatments } = await supabase
        .from('treatment_entries')
        .select('id')
        .eq('appointment_id', id);

      if (treatments && treatments.length > 0) {
        for (const treatment of treatments) {
          await api.entities.TreatmentEntry.delete(treatment.id);
        }
      }

      // Then delete the appointment
      return api.entities.Appointment.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['treatments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast({
        title: 'Appointment deleted',
        description: 'The appointment and associated records have been removed.',
      });
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-semibold text-[#1a2845]">Calendar</h1>
              <p className="text-gray-600 font-light mt-1">
                {formatWeekRange(weekDays[0], weekDays[6])}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={goToPreviousWeek}
                className="hover:bg-[#fef9f0]"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <Button
                variant="outline"
                onClick={goToToday}
                className="hover:bg-[#fef9f0]"
              >
                Today
              </Button>

              <Button
                variant="outline"
                onClick={goToNextWeek}
                className="hover:bg-[#fef9f0]"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>

              <Button
                className="bg-[#1a2845] hover:bg-[#2C3E50] ml-2"
                onClick={() => {
                  setSelectedSlot(null);
                  setAddDialogOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Appointment
              </Button>
            </div>
          </div>
        </div>

        {/* Week Grid */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
            <div className="p-4 text-sm font-medium text-gray-500">Time</div>
            {weekDays.map((day, i) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  className={`p-4 text-center border-l border-gray-200 ${
                    isToday ? 'bg-[#fef9f0]' : ''
                  }`}
                >
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </div>
                  <div
                    className={`text-lg font-semibold mt-1 ${
                      isToday ? 'text-[#d4a740]' : 'text-[#1a2845]'
                    }`}
                  >
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Slots */}
          <div className="relative">
            {BUSINESS_HOURS.map((hour, hourIndex) => (
              <div key={hour} className="grid grid-cols-8 border-b border-gray-100">
                {/* Time Label */}
                <div className="p-3 text-sm text-gray-500 text-right pr-4 bg-gray-50">
                  {formatHour(hour)}
                </div>

                {/* Day Cells */}
                {weekDays.map((day, dayIndex) => {
                  const dayAppointments = getAppointmentsForDayAndHour(
                    weekAppointments,
                    day,
                    hour
                  );

                  return (
                    <div
                      key={dayIndex}
                      className="relative border-l border-gray-100 min-h-[80px] p-1 hover:bg-[#fef9f0] transition-colors cursor-pointer group"
                      onClick={() => handleSlotClick(day, hour)}
                    >
                      {/* Add button on hover */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="w-8 h-8 rounded-full bg-[#1a2845] text-white flex items-center justify-center">
                          <Plus className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Appointments */}
                      {dayAppointments.map((apt) => (
                        <AppointmentBlock
                          key={apt.id}
                          appointment={apt}
                          onDelete={() => deleteMutation.mutate(apt.id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <AddAppointmentDialog
              selectedSlot={selectedSlot}
              patients={patients}
              onClose={() => {
                setAddDialogOpen(false);
                setSelectedSlot(null);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

/**
 * Appointment Block Component
 */
function AppointmentBlock({ appointment, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);

  const getTreatmentColor = (treatmentName) => {
    const name = treatmentName?.toLowerCase() || '';
    if (name.includes('botox')) return 'bg-purple-100 border-purple-300 text-purple-800';
    if (name.includes('filler')) return 'bg-pink-100 border-pink-300 text-pink-800';
    if (name.includes('laser')) return 'bg-blue-100 border-blue-300 text-blue-800';
    if (name.includes('facial')) return 'bg-green-100 border-green-300 text-green-800';
    return 'bg-amber-100 border-amber-300 text-amber-800';
  };

  const duration = appointment.duration_minutes || 30;
  const height = Math.max((duration / 60) * 80, 60); // 80px per hour minimum

  return (
    <div
      className={`relative rounded-lg border-l-4 p-2 mb-1 ${getTreatmentColor(
        appointment.treatment_name
      )}`}
      style={{ minHeight: `${height}px` }}
      onClick={(e) => {
        e.stopPropagation();
        setShowMenu(!showMenu);
      }}
    >
      <div className="text-xs font-semibold line-clamp-1">
        {appointment.treatment_name}
      </div>
      <div className="text-xs opacity-75 line-clamp-1">
        {appointment.patient_name}
      </div>
      <div className="text-xs opacity-75 flex items-center gap-1 mt-1">
        <Clock className="w-3 h-3" />
        {appointment.time}
      </div>

      {showMenu && (
        <div
          className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-10 min-w-[120px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setShowMenu(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Add Appointment Dialog
 */
function AddAppointmentDialog({ selectedSlot, patients, onClose }) {
  const [formData, setFormData] = useState({
    patient_id: '',
    patient_name: '',
    treatment_name: '',
    date: selectedSlot?.day
      ? selectedSlot.day.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    time: selectedSlot?.hour ? `${selectedSlot.hour}:00` : '09:00',
    duration_minutes: 30,
    price: '',
    notes: '',
    status: 'scheduled',
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Appointment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['appointments']);
      toast({
        title: 'Appointment created',
        description: 'The appointment has been added to your calendar.',
        className: 'bg-green-50 border-green-200',
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: 'Failed to create appointment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePatientChange = (patientId) => {
    const patient = patients.find((p) => p.id === patientId);
    setFormData((prev) => ({
      ...prev,
      patient_id: patientId,
      patient_name: patient?.name || '',
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-[#1a2845]">Add Appointment</DialogTitle>
        <DialogDescription>
          {selectedSlot
            ? `Creating appointment for ${selectedSlot.day.toLocaleDateString()} at ${formatHour(
                selectedSlot.hour
              )}`
            : 'Schedule a new appointment'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="patient">Patient</Label>
          <Select value={formData.patient_id} onValueChange={handlePatientChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select patient" />
            </SelectTrigger>
            <SelectContent>
              {patients.map((patient) => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="treatment_name">Treatment</Label>
          <Input
            id="treatment_name"
            value={formData.treatment_name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, treatment_name: e.target.value }))
            }
            placeholder="e.g., Botox, Dermal Fillers"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={formData.time}
              onChange={(e) => setFormData((prev) => ({ ...prev, time: e.target.value }))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              value={formData.duration_minutes}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  duration_minutes: parseInt(e.target.value) || 0,
                }))
              }
              min="0"
              step="15"
            />
          </div>

          <div>
            <Label htmlFor="price">Price (£)</Label>
            <Input
              id="price"
              type="number"
              value={formData.price}
              onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Any additional notes..."
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-[#1a2845] hover:bg-[#2C3E50]"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Appointment'}
          </Button>
        </div>
      </form>
    </>
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
  const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function getAppointmentsForDayAndHour(appointments, day, hour) {
  const dayStr = day.toISOString().split('T')[0];
  return appointments.filter((apt) => {
    if (apt.date !== dayStr) return false;
    const aptHour = parseInt(apt.time.split(':')[0]);
    return aptHour === hour;
  });
}

const BUSINESS_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
