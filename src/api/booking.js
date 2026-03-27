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
  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      ...bookingData,
      booking_source: 'online',
      status: 'scheduled',
      confirmation_sent: false,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
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
