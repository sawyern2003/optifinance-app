import { supabase } from '@/config/supabase';

/**
 * Ensure we have a valid session before calling Edge Functions (avoids 401/CORS issues).
 * Refreshes the session so the JWT is valid when the gateway receives it.
 */
async function ensureSession() {
  const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw new Error('Session expired. Please sign in again.');
  if (!session?.access_token) throw new Error('Not signed in. Please sign in and try again.');
  return session;
}

/**
 * Invoice and Payment Reminder API
 */
export class InvoicesAPI {
  /**
   * Send payment reminder via SMS
   */
  async sendPaymentReminder(invoiceId, includeReview = false) {
    await ensureSession();

    const { data, error } = await supabase.functions.invoke('send-payment-reminder', {
      body: { invoiceId, includeReview }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Generate PDF for invoice
   */
  async generateInvoicePDF(invoiceId) {
    await ensureSession();

    const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
      body: { invoiceId }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Send invoice via SMS, email, or both
   */
  async sendInvoice(invoiceId, sendVia = 'both') {
    await ensureSession();

    const { data, error } = await supabase.functions.invoke('send-invoice', {
      body: { invoiceId, sendVia }
    });

    if (error) throw error;
    return data;
  }
}

export const invoicesAPI = new InvoicesAPI();
