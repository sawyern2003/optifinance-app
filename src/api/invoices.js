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
 * Invoke a Supabase Edge Function and surface JSON `{ error }` from non-2xx bodies.
 */
async function invokeEdgeFunction(functionName, body) {
  await ensureSession();
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    let msg = error.message;
    if (error.context && typeof error.context.json === 'function') {
      try {
        const errBody = await error.context.json();
        if (errBody?.error) msg = errBody.error;
      } catch (_) { /* ignore */ }
    }
    throw new Error(msg);
  }
  if (data && typeof data === 'object' && data.error) {
    throw new Error(String(data.error));
  }
  return data;
}

/**
 * Human-readable outcome for send-invoice (handles SMS ok + email skipped when Resend unset).
 * @param {'sms'|'email'|'both'} sendVia
 * @param {Record<string, unknown>} data - response body from send-invoice
 */
export function summarizeSendInvoiceResults(sendVia, data) {
  const r = data?.results || {};
  const parts = [];
  if (sendVia === 'sms' || sendVia === 'both') {
    if (r.sms?.success) parts.push('SMS sent with link to the PDF.');
  }
  if (sendVia === 'email' || sendVia === 'both') {
    if (r.email?.success) parts.push('Email sent with PDF attached.');
    else if (r.email?.note) parts.push(`Email not sent: ${r.email.note}`);
  }
  const hasFailure = (sendVia === 'email' || sendVia === 'both') && r.email && r.email.success === false;
  const hasSuccess =
    ((sendVia === 'sms' || sendVia === 'both') && r.sms?.success) ||
    ((sendVia === 'email' || sendVia === 'both') && r.email?.success);
  return { parts, hasFailure, hasSuccess, description: parts.join(' ') };
}

/**
 * Invoice and Payment Reminder API
 */
export class InvoicesAPI {
  /**
   * Send payment reminder via SMS
   */
  async sendPaymentReminder(invoiceId, includeReview = false) {
    return invokeEdgeFunction('send-payment-reminder', { invoiceId, includeReview });
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
    return invokeEdgeFunction('send-invoice', { invoiceId, sendVia });
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
