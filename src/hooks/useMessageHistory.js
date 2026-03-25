import { useMemo } from 'react';

/**
 * Helper to detect if contact looks like email
 */
function looksLikeEmail(contact) {
  if (!contact) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
}

/**
 * Reconstructs message history from invoice data
 * @param {Array} invoices - List of invoices for a specific patient
 * @returns {Array} Timeline of communication events
 */
export function useMessageHistory(invoices) {
  return useMemo(() => {
    const messages = [];

    invoices.forEach(invoice => {
      // 1. Invoice created event
      messages.push({
        id: `created-${invoice.id}`,
        type: 'system',
        action: 'invoice_created',
        invoice: invoice,
        timestamp: invoice.created_at,
        text: `Invoice ${invoice.invoice_number} created`
      });

      // 2. If PDF exists and not draft, invoice was sent
      if (invoice.invoice_pdf_url && invoice.status !== 'draft') {
        const method = looksLikeEmail(invoice.patient_contact) ? 'email' : 'sms';
        messages.push({
          id: `sent-${invoice.id}`,
          type: 'sent',
          action: `invoice_sent_${method}`,
          invoice: invoice,
          timestamp: invoice.updated_at || invoice.created_at,
          text: `Invoice sent via ${method}`,
          method,
          status: 'delivered' // Assume delivered (no real tracking yet)
        });
      }

      // 3. If status is paid, payment was received
      if (invoice.status === 'paid' || invoice.status === 'Paid') {
        messages.push({
          id: `paid-${invoice.id}`,
          type: 'system',
          action: 'payment_received',
          invoice: invoice,
          timestamp: invoice.updated_at || invoice.created_at,
          text: `Payment received for ${invoice.invoice_number}`
        });
      }
    });

    // Sort chronologically
    messages.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    return messages;
  }, [invoices]);
}
