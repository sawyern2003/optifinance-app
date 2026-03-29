import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { ChevronLeft, ChevronRight, Plus, Clock, User, Stethoscope, Trash2, Edit2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
 * Calendar Page - Day View for Appointments
 *
 * Simple day-by-day view of appointments
 * Voice command integration: "Book Sarah for Botox tomorrow at 2pm"
 */
export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);

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

  // Filter appointments for selected date
  const dayAppointments = useMemo(() => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    return appointments.filter(apt => apt.date === dateStr)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, selectedDate]);

  // Date navigation
  const goToPreviousDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  };

  const goToNextDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // Format date for display
  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Check if date is today
  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Delete appointment mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Appointment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['appointments']);
      toast({
        title: 'Appointment deleted',
        description: 'The appointment has been removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="min-h-screen relative overflow-hidden p-6" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 50%, #0f1419 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#d6b164]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-5xl font-light tracking-wider text-white/90 mb-3">Calendar</h1>
          <p className="text-lg font-light text-white/60">
            Manage your daily appointments
          </p>
        </div>

        {/* Date Navigation Card */}
        <div className="relative group mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#4d647f]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                onClick={goToPreviousDay}
                className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#d6b164]/30 text-white/90 rounded-2xl"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <div className="text-center flex-1 mx-4">
                <h2 className="text-2xl font-light tracking-wider text-white/90">
                  {formatDate(selectedDate)}
                </h2>
                {isToday(selectedDate) && (
                  <span className="inline-block mt-2 px-4 py-1.5 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 text-[#d6b164] text-xs font-light tracking-wider rounded-full">
                    Today
                  </span>
                )}
              </div>

              <Button
                variant="outline"
                onClick={goToNextDay}
                className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#d6b164]/30 text-white/90 rounded-2xl"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex gap-2 justify-center">
              {!isToday(selectedDate) && (
                <Button
                  variant="outline"
                  onClick={goToToday}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl font-light"
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Go to Today
                </Button>
              )}

              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164] rounded-2xl font-light tracking-wider">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Appointment
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] bg-[#0a0e1a] border-white/10">
                  <AddAppointmentDialog
                    selectedDate={selectedDate}
                    patients={patients}
                    onClose={() => setAddDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Appointments List */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-[#d6b164]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
            {/* Summary Header */}
            <div className="px-6 py-5 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-light text-white/40 tracking-[0.2em] uppercase mb-2">Appointments</p>
                  <p className="text-3xl font-light text-white/90">
                    {dayAppointments.length}
                  </p>
                </div>
                {dayAppointments.length > 0 && (
                  <div className="text-right">
                    <p className="text-xs font-light text-white/40 tracking-[0.2em] uppercase mb-2">Total Revenue</p>
                    <p className="text-3xl font-light text-emerald-400">
                      £{dayAppointments.reduce((sum, apt) => sum + (apt.price || 0), 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Appointments */}
            <div className="divide-y divide-white/10">
              {isLoading ? (
                <div className="p-12 text-center text-white/60 font-light">
                  Loading appointments...
                </div>
              ) : dayAppointments.length === 0 ? (
                <div className="p-12 text-center">
                  <CalendarIcon className="w-16 h-16 text-white/20 mx-auto mb-4" />
                  <p className="text-white/60 mb-2 font-light">No appointments scheduled</p>
                  <p className="text-sm text-white/40 font-light">
                    {isToday(selectedDate)
                      ? "Add an appointment or use voice command"
                      : "This day is free"}
                  </p>
                </div>
              ) : (
                dayAppointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onEdit={() => {
                      setEditingAppointment(appointment);
                      setEditDialogOpen(true);
                    }}
                    onDelete={() => deleteMutation.mutate(appointment.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px] bg-[#0a0e1a] border-white/10">
            {editingAppointment && (
              <EditAppointmentDialog
                appointment={editingAppointment}
                patients={patients}
                onClose={() => {
                  setEditDialogOpen(false);
                  setEditingAppointment(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

/**
 * Appointment Card Component
 */
function AppointmentCard({ appointment, onEdit, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getStatusStyle = () => {
    switch (appointment.status) {
      case 'scheduled':
        return 'bg-[#4d647f]/10 text-[#4d647f] border-[#4d647f]/30';
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'cancelled':
        return 'bg-white/10 text-white/60 border-white/20';
      case 'no-show':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  return (
    <div className="p-6 hover:bg-white/5 transition-colors group">
      <div className="flex items-start gap-4">
        {/* Time */}
        <div className="flex-shrink-0 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#4d647f]/20 backdrop-blur-xl border border-[#4d647f]/30 text-white flex items-center justify-center">
            <div>
              <div className="text-xs font-light opacity-75">
                {appointment.time.split(':')[1] === '00' ? '' : appointment.time.split(':')[1]}
              </div>
              <div className="text-xl font-light">
                {parseInt(appointment.time.split(':')[0])}
              </div>
              <div className="text-xs font-light opacity-75">
                {parseInt(appointment.time.split(':')[0]) >= 12 ? 'PM' : 'AM'}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-light tracking-wider text-white/90 mb-1">
                {appointment.treatment_name}
              </h3>
              <div className="flex flex-wrap gap-3 text-sm text-white/60 font-light">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {appointment.patient_name}
                </span>
                {appointment.duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {appointment.duration_minutes} min
                  </span>
                )}
                {appointment.price && (
                  <span className="font-light text-emerald-400">
                    £{appointment.price.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div className={`px-3 py-1.5 rounded-full text-xs font-light tracking-wider border backdrop-blur-xl ${getStatusStyle()}`}>
              {appointment.status}
            </div>
          </div>

          {appointment.notes && (
            <p className="text-sm text-white/50 mb-3 line-clamp-2 font-light">
              {appointment.notes}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl font-light"
            >
              <Edit2 className="w-3 h-3 mr-1" />
              Edit
            </Button>
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 rounded-2xl font-light text-white/70"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Delete
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  className="bg-rose-500/20 backdrop-blur-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 rounded-2xl font-light"
                >
                  Confirm Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl font-light"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Add Appointment Dialog
 */
function AddAppointmentDialog({ selectedDate, patients, onClose }) {
  const [formData, setFormData] = useState({
    patient_id: '',
    patient_name: '',
    treatment_name: '',
    date: selectedDate.toISOString().split('T')[0],
    time: '09:00',
    duration_minutes: 30,
    price: '',
    notes: '',
    status: 'scheduled'
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
    const patient = patients.find(p => p.id === patientId);
    setFormData(prev => ({
      ...prev,
      patient_id: patientId,
      patient_name: patient?.name || ''
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-light tracking-wider text-white/90">Add Appointment</DialogTitle>
        <DialogDescription className="text-white/60 font-light">
          Schedule a new appointment
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="patient" className="text-white/70 font-light">Patient</Label>
          <Select
            value={formData.patient_id}
            onValueChange={handlePatientChange}
          >
            <SelectTrigger className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light">
              <SelectValue placeholder="Select patient" />
            </SelectTrigger>
            <SelectContent>
              {patients.map(patient => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="treatment_name" className="text-white/70 font-light">Treatment</Label>
          <Input
            id="treatment_name"
            value={formData.treatment_name}
            onChange={(e) => setFormData(prev => ({ ...prev, treatment_name: e.target.value }))}
            placeholder="e.g., Botox, Dermal Fillers"
            className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="date" className="text-white/70 font-light">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
              required
            />
          </div>

          <div>
            <Label htmlFor="time" className="text-white/70 font-light">Time</Label>
            <Input
              id="time"
              type="time"
              value={formData.time}
              onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="duration" className="text-white/70 font-light">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              value={formData.duration_minutes}
              onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
              min="0"
              step="15"
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
            />
          </div>

          <div>
            <Label htmlFor="price" className="text-white/70 font-light">Price (£)</Label>
            <Input
              id="price"
              type="number"
              value={formData.price}
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
              min="0"
              step="0.01"
              placeholder="0.00"
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes" className="text-white/70 font-light">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Any additional notes..."
            rows={3}
            className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl font-light">
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164] rounded-2xl font-light tracking-wider"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Appointment'}
          </Button>
        </div>
      </form>
    </>
  );
}

/**
 * Edit Appointment Dialog
 */
function EditAppointmentDialog({ appointment, patients, onClose }) {
  const [formData, setFormData] = useState({
    patient_id: appointment.patient_id || '',
    patient_name: appointment.patient_name || '',
    treatment_name: appointment.treatment_name || '',
    date: appointment.date || '',
    time: appointment.time || '09:00',
    duration_minutes: appointment.duration_minutes || 30,
    price: appointment.price || '',
    notes: appointment.notes || '',
    status: appointment.status || 'scheduled'
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => api.entities.Appointment.update(appointment.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['appointments']);
      toast({
        title: 'Appointment updated',
        description: 'Changes have been saved.',
        className: 'bg-green-50 border-green-200',
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: 'Failed to update appointment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePatientChange = (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    setFormData(prev => ({
      ...prev,
      patient_id: patientId,
      patient_name: patient?.name || ''
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-light tracking-wider text-white/90">Edit Appointment</DialogTitle>
        <DialogDescription className="text-white/60 font-light">
          Update appointment details
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="patient" className="text-white/70 font-light">Patient</Label>
          <Select
            value={formData.patient_id}
            onValueChange={handlePatientChange}
          >
            <SelectTrigger className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light">
              <SelectValue placeholder="Select patient" />
            </SelectTrigger>
            <SelectContent>
              {patients.map(patient => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="treatment_name" className="text-white/70 font-light">Treatment</Label>
          <Input
            id="treatment_name"
            value={formData.treatment_name}
            onChange={(e) => setFormData(prev => ({ ...prev, treatment_name: e.target.value }))}
            className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="date" className="text-white/70 font-light">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
              required
            />
          </div>

          <div>
            <Label htmlFor="time" className="text-white/70 font-light">Time</Label>
            <Input
              id="time"
              type="time"
              value={formData.time}
              onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="duration" className="text-white/70 font-light">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              value={formData.duration_minutes}
              onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
              min="0"
              step="15"
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
            />
          </div>

          <div>
            <Label htmlFor="price" className="text-white/70 font-light">Price (£)</Label>
            <Input
              id="price"
              type="number"
              value={formData.price}
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
              min="0"
              step="0.01"
              className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="status" className="text-white/70 font-light">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
          >
            <SelectTrigger className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no-show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="notes" className="text-white/70 font-light">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={3}
            className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-2xl text-white/90 font-light"
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl font-light">
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164] rounded-2xl font-light tracking-wider"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </>
  );
}
