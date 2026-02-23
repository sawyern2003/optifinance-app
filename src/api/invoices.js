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

    if (error) {
      let msg = error.message;
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
        } catch (_) {}
      }
      throw new Error(msg);
    }
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

  /**
   * Get a signed URL to download the invoice PDF (works with private Storage bucket).
   * Use this instead of opening invoice_pdf_url directly to avoid 401 on download.
   * @param {{ id: string, invoice_number: string }} invoice - invoice with id and invoice_number
   * @param {number} expiresIn - seconds (default 1 hour)
   * @returns {Promise<string>} signed URL to open in a new tab
   */
  async getInvoicePdfDownloadUrl(invoice, expiresIn = 3600) {
    const path = `invoices/${invoice.id}-${String(invoice.invoice_number ?? '').replace(/\//g, '-')}.pdf`;
    const { data, error } = await supabase.storage
      .from('files')
      .createSignedUrl(path, expiresIn);
    if (error) throw new Error(error.message || 'Could not get download link');
    if (!data?.signedUrl) throw new Error('No download link available');
    return data.signedUrl;
  }
}

export const invoicesAPI = new InvoicesAPI();
