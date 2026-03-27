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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[#1a2845] mb-2">Calendar</h1>
          <p className="text-gray-600 font-light">
            Manage your daily appointments
          </p>
        </div>

        {/* Date Navigation Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              onClick={goToPreviousDay}
              className="hover:bg-[#fef9f0]"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <div className="text-center flex-1 mx-4">
              <h2 className="text-2xl font-semibold text-[#1a2845]">
                {formatDate(selectedDate)}
              </h2>
              {isToday(selectedDate) && (
                <span className="inline-block mt-1 px-3 py-1 bg-[#d4a740] text-white text-xs font-medium rounded-full">
                  Today
                </span>
              )}
            </div>

            <Button
              variant="outline"
              onClick={goToNextDay}
              className="hover:bg-[#fef9f0]"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex gap-2 justify-center">
            {!isToday(selectedDate) && (
              <Button
                variant="outline"
                onClick={goToToday}
                className="hover:bg-[#fef9f0]"
              >
                <CalendarIcon className="w-4 h-4 mr-2" />
                Go to Today
              </Button>
            )}

            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#1a2845] hover:bg-[#2C3E50]">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Appointment
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <AddAppointmentDialog
                  selectedDate={selectedDate}
                  patients={patients}
                  onClose={() => setAddDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          {/* Summary Header */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Appointments</p>
                <p className="text-2xl font-semibold text-[#1a2845]">
                  {dayAppointments.length}
                </p>
              </div>
              {dayAppointments.length > 0 && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-semibold text-[#1a2845]">
                    £{dayAppointments.reduce((sum, apt) => sum + (apt.price || 0), 0).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Appointments */}
          <div className="divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-12 text-center text-gray-500">
                Loading appointments...
              </div>
            ) : dayAppointments.length === 0 ? (
              <div className="p-12 text-center">
                <CalendarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">No appointments scheduled</p>
                <p className="text-sm text-gray-400">
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

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
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
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'cancelled':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'no-show':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="p-6 hover:bg-[#fef9f0] transition-colors group">
      <div className="flex items-start gap-4">
        {/* Time */}
        <div className="flex-shrink-0 text-center">
          <div className="w-16 h-16 rounded-xl bg-[#1a2845] text-white flex items-center justify-center">
            <div>
              <div className="text-xs font-medium opacity-75">
                {appointment.time.split(':')[1] === '00' ? '' : appointment.time.split(':')[1]}
              </div>
              <div className="text-lg font-semibold">
                {parseInt(appointment.time.split(':')[0])}
              </div>
              <div className="text-xs opacity-75">
                {parseInt(appointment.time.split(':')[0]) >= 12 ? 'PM' : 'AM'}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-semibold text-[#1a2845] mb-1">
                {appointment.treatment_name}
              </h3>
              <div className="flex flex-wrap gap-3 text-sm text-gray-600">
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
                  <span className="font-medium text-[#1a2845]">
                    £{appointment.price.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusStyle()}`}>
              {appointment.status}
            </div>
          </div>

          {appointment.notes && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {appointment.notes}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="hover:bg-white"
            >
              <Edit2 className="w-3 h-3 mr-1" />
              Edit
            </Button>
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="hover:bg-red-50 hover:text-red-600 hover:border-red-200"
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
                >
                  Confirm Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
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
        <DialogTitle className="text-[#1a2845]">Add Appointment</DialogTitle>
        <DialogDescription>
          Schedule a new appointment
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="patient">Patient</Label>
          <Select
            value={formData.patient_id}
            onValueChange={handlePatientChange}
          >
            <SelectTrigger>
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
          <Label htmlFor="treatment_name">Treatment</Label>
          <Input
            id="treatment_name"
            value={formData.treatment_name}
            onChange={(e) => setFormData(prev => ({ ...prev, treatment_name: e.target.value }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={formData.time}
              onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
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
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
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
        <DialogTitle className="text-[#1a2845]">Edit Appointment</DialogTitle>
        <DialogDescription>
          Update appointment details
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="patient">Patient</Label>
          <Select
            value={formData.patient_id}
            onValueChange={handlePatientChange}
          >
            <SelectTrigger>
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
          <Label htmlFor="treatment_name">Treatment</Label>
          <Input
            id="treatment_name"
            value={formData.treatment_name}
            onChange={(e) => setFormData(prev => ({ ...prev, treatment_name: e.target.value }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={formData.time}
              onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
          >
            <SelectTrigger>
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
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
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
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </>
  );
}
