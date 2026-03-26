import { useMemo } from 'react';
import { looksLikeEmail } from '@/lib/contactGuards';

/**
 * Reconstructs message history from invoice data
 * @param {Array} invoices - List of invoices for a specific patient
 * @param {Array} customMessages - Logged communication messages
 * @returns {Array} Timeline of communication events
 */
export function useMessageHistory(invoices, customMessages = []) {
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

    // Include logged custom communication entries (optional table).
    customMessages.forEach((msg) => {
      messages.push({
        id: `custom-${msg.id}`,
        type: msg.direction === 'outbound' ? 'sent' : 'system',
        action: msg.channel === 'sms' ? 'custom_sent_sms' : `custom_sent_${msg.channel || 'sms'}`,
        invoice: null,
        timestamp: msg.created_at,
        text: msg.message_body,
        method: msg.channel || 'sms',
        status: msg.status || 'sent',
      });
    });

    // Sort chronologically
    messages.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    return messages;
  }, [invoices, customMessages]);
}
