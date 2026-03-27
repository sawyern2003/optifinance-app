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
 * SIMPLIFIED VERSION - Just creates appointment for now
 */
export async function createPublicBooking(bookingData) {
  console.log('📝 Creating booking with data:', bookingData);

  try {
    // Try to find existing patient by email or name
    let patientId = bookingData.patient_id || null;

    if (!patientId && (bookingData.patient_email || bookingData.patient_name)) {
      console.log('🔍 Searching for existing patient...');

      const { data: existingPatients, error: patientsError } = await supabase
        .from('patients')
        .select('id, name, email, contact')
        .eq('user_id', bookingData.user_id);

      if (patientsError) {
        console.error('❌ Error fetching patients:', patientsError);
      } else if (existingPatients && existingPatients.length > 0) {
        console.log('📋 Found', existingPatients.length, 'existing patients');
        console.log('🔍 Looking for email:', bookingData.patient_email);
        console.log('🔍 Looking for phone:', bookingData.patient_phone);
        console.log('🔍 Looking for name:', bookingData.patient_name);
        console.log('📝 Patient emails in DB:', existingPatients.map(p => p.email));
        console.log('📝 Patient phones in DB:', existingPatients.map(p => p.contact));
        console.log('📝 Patient names in DB:', existingPatients.map(p => p.name));

        let matchedPatient = null;

        // Try to match by email first (exact match)
        if (bookingData.patient_email) {
          matchedPatient = existingPatients.find(p => {
            const dbEmail = p.email?.toLowerCase().trim();
            const searchEmail = bookingData.patient_email.toLowerCase().trim();
            if (!dbEmail) return false;
            console.log(`Email comparing: "${dbEmail}" === "${searchEmail}"`, dbEmail === searchEmail);
            return dbEmail === searchEmail;
          });
          if (matchedPatient) {
            console.log('✅ Matched patient by email:', matchedPatient.name);
          }
        }

        // If no email match, try by phone (exact match)
        if (!matchedPatient && bookingData.patient_phone) {
          matchedPatient = existingPatients.find(p => {
            const dbPhone = p.contact?.replace(/\s/g, '').toLowerCase().trim();
            const searchPhone = bookingData.patient_phone.replace(/\s/g, '').toLowerCase().trim();
            if (!dbPhone) return false;
            console.log(`Phone comparing: "${dbPhone}" === "${searchPhone}"`, dbPhone === searchPhone);
            return dbPhone === searchPhone;
          });
          if (matchedPatient) {
            console.log('✅ Matched patient by phone:', matchedPatient.name);
          }
        }

        // If no email/phone match, try fuzzy name matching
        if (!matchedPatient && bookingData.patient_name) {
          const searchName = bookingData.patient_name.toLowerCase().trim();
          const searchWords = searchName.split(/\s+/);

          matchedPatient = existingPatients.find(p => {
            const dbName = p.name?.toLowerCase().trim();
            if (!dbName) return false;

            // Exact match
            if (dbName === searchName) {
              console.log(`Name exact match: "${dbName}" === "${searchName}"`);
              return true;
            }

            // Check if all words from booking name appear in patient name
            const allWordsMatch = searchWords.every(word => dbName.includes(word));
            if (allWordsMatch) {
              console.log(`Name fuzzy match: "${dbName}" contains all words from "${searchName}"`);
              return true;
            }

            // Check if patient name appears in booking name
            if (searchName.includes(dbName)) {
              console.log(`Name partial match: "${searchName}" contains "${dbName}"`);
              return true;
            }

            console.log(`Name no match: "${dbName}" vs "${searchName}"`);
            return false;
          });

          if (matchedPatient) {
            console.log('✅ Matched patient by name (fuzzy):', matchedPatient.name);
          } else {
            console.log('❌ No name match found');
          }
        }

        if (matchedPatient) {
          patientId = matchedPatient.id;
          console.log('🎯 Using patient_id:', patientId);
        } else {
          console.log('ℹ️ No matching patient found, will create new patient reference');
        }
      }
    }

    // Create the appointment
    console.log('📅 Creating appointment...');
    const appointmentData = {
      ...bookingData,
      patient_id: patientId,
      booking_source: 'online',
      status: 'scheduled',
      confirmation_sent: false,
    };

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert([appointmentData])
      .select()
      .single();

    if (appointmentError) {
      console.error('❌ Failed to create appointment:', appointmentError);
      throw appointmentError;
    }

    console.log('✅ Appointment created:', appointment.id);

    // Try to create treatment entry using Supabase RPC or direct insert with service role
    console.log('💉 Creating treatment entry...');
    console.log('💉 Appointment data:', appointment);
    console.log('💉 Patient ID to use:', appointment.patient_id);
    try {
      const treatmentResult = await createTreatmentEntryViaRPC(appointment, bookingData.user_id);
      console.log('✅ Treatment entry created:', treatmentResult);
    } catch (treatmentError) {
      console.error('⚠️ Failed to create treatment entry:', treatmentError);
      console.error('⚠️ Error details:', treatmentError.message, treatmentError.details);
      console.log('Booking still successful, but treatment entry needs manual creation');
    }

    // Try to send email confirmation
    console.log('📧 Attempting to send confirmation email...');
    try {
      await sendSimpleConfirmation(appointment, bookingData.user_id);
      console.log('✅ Email sent');
    } catch (emailError) {
      console.error('⚠️ Failed to send email:', emailError);
      console.log('Booking still successful, but no email sent');
    }

    return appointment;
  } catch (error) {
    console.error('❌ Booking failed:', error);
    throw error;
  }
}

/**
 * Create treatment entry via RPC call to bypass RLS
 */
async function createTreatmentEntryViaRPC(appointment, clinicUserId) {
  // Call a Supabase RPC function that can bypass RLS
  const { data, error } = await supabase.rpc('create_treatment_from_booking', {
    p_user_id: clinicUserId,
    p_appointment_id: appointment.id,
    p_date: appointment.date,
    p_patient_id: appointment.patient_id,
    p_patient_name: appointment.patient_name,
    p_treatment_name: appointment.treatment_name,
    p_price: appointment.price || 0,
    p_notes: `Online booking: ${appointment.notes || ''}`.trim(),
  });

  if (error) {
    console.error('RPC error:', error);
    throw error;
  }

  return data;
}

/**
 * Send booking confirmation via dedicated edge function
 */
async function sendSimpleConfirmation(appointment, clinicUserId) {
  console.log('📧 Sending confirmation via edge function...');

  try {
    const { data, error } = await supabase.functions.invoke('send-booking-confirmation', {
      body: {
        appointmentId: appointment.id,
        clinicUserId: clinicUserId,
      },
    });

    if (error) {
      console.error('⚠️ Edge function error:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Confirmation sent:', data);

    if (data?.results?.email?.success) {
      console.log('📧 Email sent to:', appointment.patient_email);
    }

    if (data?.results?.sms?.success) {
      console.log('📱 SMS sent to:', appointment.patient_phone);
    }

    return { success: true, data };
  } catch (error) {
    console.error('⚠️ Failed to send confirmation:', error);
    return { success: false, error: error.message };
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
