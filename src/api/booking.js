import { backend, supabase } from './backendClient';

/**
 * Booking API - Public and private booking operations
 */

/**
 * Get practitioner profile by booking slug (public)
 */
export async function getProfileBySlug(slug) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('booking_slug', slug)
    .eq('booking_enabled', true)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get availability settings by user_id (public for booking page)
 */
export async function getAvailabilitySettings(userId) {
  const { data, error } = await supabase
    .from('availability_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code === 'PGRST116') {
    // No settings found, return defaults
    return {
      working_hours: {
        monday: { start: '09:00', end: '17:00', enabled: true },
        tuesday: { start: '09:00', end: '17:00', enabled: true },
        wednesday: { start: '09:00', end: '17:00', enabled: true },
        thursday: { start: '09:00', end: '17:00', enabled: true },
        friday: { start: '09:00', end: '17:00', enabled: true },
        saturday: { start: '09:00', end: '17:00', enabled: false },
        sunday: { start: '09:00', end: '17:00', enabled: false },
      },
      breaks: [],
      buffer_time: 15,
      default_duration: 30,
      min_booking_notice: 60,
      max_booking_advance: 60,
    };
  }

  if (error) throw error;
  return data;
}

/**
 * Get appointments for a specific date range (public, for availability checking)
 */
export async function getAppointmentsForRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .neq('status', 'cancelled');

  if (error) throw error;
  return data || [];
}

/**
 * Calculate available time slots for a given date
 */
export function calculateAvailableSlots(date, workingHours, existingAppointments, settings) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const daySettings = workingHours[dayName];

  if (!daySettings?.enabled) {
    return [];
  }

  const slots = [];
  const [startHour, startMin] = daySettings.start.split(':').map(Number);
  const [endHour, endMin] = daySettings.end.split(':').map(Number);

  const slotDuration = settings.default_duration || 30;
  const bufferTime = settings.buffer_time || 15;
  const minNotice = settings.min_booking_notice || 60;

  // Create slots
  let currentTime = new Date(date);
  currentTime.setHours(startHour, startMin, 0, 0);

  const endTime = new Date(date);
  endTime.setHours(endHour, endMin, 0, 0);

  const now = new Date();
  const minBookingTime = new Date(now.getTime() + minNotice * 60000);

  while (currentTime < endTime) {
    const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);

    // Check if slot is in the past or too soon
    if (slotEnd <= minBookingTime) {
      currentTime = new Date(currentTime.getTime() + slotDuration * 60000);
      continue;
    }

    // Check if slot conflicts with existing appointments
    const hasConflict = existingAppointments.some(apt => {
      const aptDate = new Date(apt.date + 'T' + apt.time);
      const aptDuration = apt.duration_minutes || slotDuration;
      const aptEnd = new Date(aptDate.getTime() + aptDuration * 60000);

      return (
        (currentTime >= aptDate && currentTime < aptEnd) ||
        (slotEnd > aptDate && slotEnd <= aptEnd) ||
        (currentTime <= aptDate && slotEnd >= aptEnd)
      );
    });

    // Check if slot conflicts with breaks
    const hasBreakConflict = (settings.breaks || []).some(breakTime => {
      const [breakStartHour, breakStartMin] = breakTime.start.split(':').map(Number);
      const [breakEndHour, breakEndMin] = breakTime.end.split(':').map(Number);

      const breakStart = new Date(date);
      breakStart.setHours(breakStartHour, breakStartMin, 0, 0);

      const breakEnd = new Date(date);
      breakEnd.setHours(breakEndHour, breakEndMin, 0, 0);

      return (
        (currentTime >= breakStart && currentTime < breakEnd) ||
        (slotEnd > breakStart && slotEnd <= breakEnd) ||
        (currentTime <= breakStart && slotEnd >= breakEnd)
      );
    });

    if (!hasConflict && !hasBreakConflict) {
      slots.push({
        time: currentTime.toTimeString().slice(0, 5),
        available: true,
      });
    }

    currentTime = new Date(currentTime.getTime() + (slotDuration + bufferTime) * 60000);
  }

  return slots;
}

/**
 * Create a public booking (no auth required)
 */
export async function createPublicBooking(bookingData) {
  // Try to find existing patient by email or name
  let patientId = bookingData.patient_id || null;

  if (!patientId && (bookingData.patient_email || bookingData.patient_name)) {
    const { data: existingPatients } = await supabase
      .from('patients')
      .select('id, name, email, contact')
      .eq('user_id', bookingData.user_id);

    if (existingPatients && existingPatients.length > 0) {
      // Try to match by email first
      let matchedPatient = null;

      if (bookingData.patient_email) {
        matchedPatient = existingPatients.find(p =>
          p.email?.toLowerCase() === bookingData.patient_email.toLowerCase()
        );
      }

      // If no email match, try by name
      if (!matchedPatient && bookingData.patient_name) {
        matchedPatient = existingPatients.find(p =>
          p.name?.toLowerCase() === bookingData.patient_name.toLowerCase()
        );
      }

      if (matchedPatient) {
        patientId = matchedPatient.id;
      }
    }
  }

  // Create the appointment
  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      ...bookingData,
      patient_id: patientId,
      booking_source: 'online',
      status: 'scheduled',
      confirmation_sent: false,
    }])
    .select()
    .single();

  if (error) throw error;

  // Auto-create a treatment entry so it appears in Records
  try {
    await createTreatmentFromAppointment(data, bookingData.user_id);
  } catch (treatmentError) {
    console.error('Failed to create treatment entry:', treatmentError);
    // Don't fail the booking if treatment creation fails
  }

  // Send confirmation email/SMS
  try {
    await sendBookingConfirmation(data, bookingData.user_id);
  } catch (confirmError) {
    console.error('Failed to send confirmation:', confirmError);
    // Don't fail the booking if confirmation fails
  }

  return data;
}

/**
 * Create a treatment entry from an appointment
 */
async function createTreatmentFromAppointment(appointment, clinicUserId) {
  // Find treatment in catalog
  const { data: catalogTreatments } = await supabase
    .from('treatment_catalog')
    .select('*')
    .eq('user_id', clinicUserId);

  let catalogTreatment = null;
  if (catalogTreatments && catalogTreatments.length > 0) {
    catalogTreatment = catalogTreatments.find(t =>
      t.treatment_name.toLowerCase().includes(appointment.treatment_name.toLowerCase()) ||
      appointment.treatment_name.toLowerCase().includes(t.treatment_name.toLowerCase())
    );
  }

  const price = appointment.price || catalogTreatment?.default_price || 0;

  // Create treatment entry
  const { data, error } = await supabase
    .from('treatment_entries')
    .insert([{
      user_id: clinicUserId,
      date: appointment.date,
      patient_id: appointment.patient_id,
      patient_name: appointment.patient_name,
      treatment_id: catalogTreatment?.id || null,
      treatment_name: appointment.treatment_name,
      price_paid: price,
      payment_status: 'pending', // Online bookings start as pending
      amount_paid: 0,
      product_cost: catalogTreatment?.typical_product_cost || 0,
      profit: 0 - (catalogTreatment?.typical_product_cost || 0),
      notes: `Online booking: ${appointment.notes || ''}`.trim(),
      appointment_id: appointment.id,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Send booking confirmation email/SMS
 */
async function sendBookingConfirmation(appointment, clinicUserId) {
  // Get clinic profile for sender info
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_name, invoice_from_email, invoice_sender_name')
    .eq('id', clinicUserId)
    .single();

  const clinicName = profile?.clinic_name || 'The Clinic';
  const fromEmail = profile?.invoice_from_email || 'noreply@optifinance.app';
  const fromName = profile?.invoice_sender_name || clinicName;

  // Format date nicely
  const appointmentDate = new Date(appointment.date + 'T' + appointment.time);
  const formattedDate = appointmentDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const formattedTime = appointment.time;

  const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a2845;">Appointment Confirmed</h2>

  <p>Dear ${appointment.patient_name},</p>

  <p>Your appointment at <strong>${clinicName}</strong> has been confirmed.</p>

  <div style="background: #fef9f0; border-left: 4px solid #d4a740; padding: 15px; margin: 20px 0;">
    <p style="margin: 5px 0;"><strong>Treatment:</strong> ${appointment.treatment_name}</p>
    <p style="margin: 5px 0;"><strong>Date:</strong> ${formattedDate}</p>
    <p style="margin: 5px 0;"><strong>Time:</strong> ${formattedTime}</p>
  </div>

  <p>If you need to reschedule or cancel, please contact the clinic directly.</p>

  <p style="color: #666; font-size: 12px; margin-top: 30px;">
    This is an automated confirmation email from ${clinicName}.
  </p>
</div>
  `;

  if (appointment.patient_email) {
    // Send via Supabase edge function or integrated email service
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: appointment.patient_email,
          from: fromEmail,
          from_name: fromName,
          subject: `Appointment Confirmed - ${clinicName}`,
          html: emailBody
        }
      });

      if (error) {
        console.warn('Email send failed, trying fallback');
        // Fallback: could integrate with Resend, SendGrid, etc.
      } else {
        // Mark confirmation as sent
        await supabase
          .from('appointments')
          .update({ confirmation_sent: true })
          .eq('id', appointment.id);
      }
    } catch (e) {
      console.error('Confirmation email error:', e);
    }
  }
}

/**
 * Get my booking settings (authenticated)
 */
export async function getMyAvailabilitySettings() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('availability_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code === 'PGRST116') {
    // Create default settings
    const defaultSettings = {
      user_id: user.id,
      working_hours: {
        monday: { start: '09:00', end: '17:00', enabled: true },
        tuesday: { start: '09:00', end: '17:00', enabled: true },
        wednesday: { start: '09:00', end: '17:00', enabled: true },
        thursday: { start: '09:00', end: '17:00', enabled: true },
        friday: { start: '09:00', end: '17:00', enabled: true },
        saturday: { start: '09:00', end: '17:00', enabled: false },
        sunday: { start: '09:00', end: '17:00', enabled: false },
      },
      breaks: [],
      buffer_time: 15,
      default_duration: 30,
      min_booking_notice: 60,
      max_booking_advance: 60,
    };

    const { data: created, error: createError } = await supabase
      .from('availability_settings')
      .insert([defaultSettings])
      .select()
      .single();

    if (createError) throw createError;
    return created;
  }

  if (error) throw error;
  return data;
}

/**
 * Update my availability settings (authenticated)
 */
export async function updateMyAvailabilitySettings(settings) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('availability_settings')
    .update(settings)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get my booking URL
 */
export async function getMyBookingUrl() {
  const user = await backend.auth.me();
  if (!user?.booking_slug) {
    throw new Error('No booking slug configured');
  }

  const baseUrl = window.location.origin;
  return `${baseUrl}/book/${user.booking_slug}`;
}

export const bookingAPI = {
  getProfileBySlug,
  getAvailabilitySettings,
  getAppointmentsForRange,
  calculateAvailableSlots,
  createPublicBooking,
  getMyAvailabilitySettings,
  updateMyAvailabilitySettings,
  getMyBookingUrl,
};
