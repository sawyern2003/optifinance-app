import { supabase } from '@/config/supabase';

/**
 * Invoice and Payment Reminder API
 */
export class InvoicesAPI {
  /**
   * Send payment reminder via SMS
   */
  async sendPaymentReminder(invoiceId, includeReview = false) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('send-invoice', {
      body: { invoiceId, sendVia }
    });

    if (error) throw error;
    return data;
  }
}

export const invoicesAPI = new InvoicesAPI();
