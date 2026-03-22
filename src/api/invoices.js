import { supabase } from '@/config/supabase';

/**
 * Ensure we have a valid session before calling Edge Functions (avoids 401/CORS issues).
 * Refreshes the session so the JWT is valid when the gateway receives it.
 */
/** Exported for other API modules that call Edge Functions (e.g. send-invoice from QuickAdd). */
export async function ensureSession() {
  const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw new Error('Session expired. Please sign in again.');
  if (!session?.access_token) throw new Error('Not signed in. Please sign in and try again.');
  return session;
}

function authHeaders(session) {
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Read Edge Function error body. Supabase sets `error.context` and `response` to the same
 * Response; the generic message is "Edge Function returned a non-2xx status code".
 * Prefer .text() + JSON.parse so we never miss the server `error` field.
 */
export async function edgeInvokeErrorMessage(error, response) {
  let msg = error?.message || 'Request failed';
  const resp = response ?? error?.context;
  if (resp && typeof resp.text === 'function') {
    try {
      const text = await resp.text();
      if (text) {
        try {
          const j = JSON.parse(text);
          if (typeof j.error === 'string') return j.error;
          if (typeof j.message === 'string') return j.message;
        } catch {
          /* not JSON */
        }
        return text.length > 800 ? `${text.slice(0, 800)}…` : text;
      }
    } catch {
      /* ignore */
    }
  }
  return msg;
}

/**
 * Invoke a Supabase Edge Function and surface JSON `{ error }` from non-2xx bodies.
 */
async function invokeEdgeFunction(functionName, body) {
  const session = await ensureSession();
  const { data, error, response } = await supabase.functions.invoke(functionName, {
    body,
    headers: authHeaders(session),
  });
  if (error) {
    const msg = await edgeInvokeErrorMessage(error, response);
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
    const session = await ensureSession();

    const { data, error, response } = await supabase.functions.invoke('generate-invoice-pdf', {
      body: { invoiceId },
      headers: authHeaders(session),
    });

    if (error) {
      const msg = await edgeInvokeErrorMessage(error, response);
      throw new Error(msg);
    }
    return data;
  }

  /**
   * Send invoice via SMS, email, or both
   */
  async sendInvoice(invoiceId, sendVia = 'both') {
    const data = await invokeEdgeFunction('send-invoice', { invoiceId, sendVia });
    const r = data?.results;
    // Legacy soft-fail (server now throws); keep so UI never shows "sent" if email skipped
    if (
      (sendVia === 'email' || sendVia === 'both') &&
      r?.email &&
      r.email.success === false
    ) {
      throw new Error(
        r.email.note || 'Email was not sent. Check SendGrid/Resend secrets in Supabase.',
      );
    }
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
