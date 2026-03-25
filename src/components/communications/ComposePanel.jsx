import React, { useState } from 'react';
import { X, Send, Loader2, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Compose panel for sending messages
 */
export function ComposePanel({
  mode,
  patient,
  onSend,
  onCancel,
  isSending
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [sendMethod, setSendMethod] = useState('email');

  const outstandingInvoices = patient.invoices.filter(
    inv => inv.status !== 'paid' && inv.status !== 'Paid'
  );

  const hasOutstanding = outstandingInvoices.length > 0;

  // Validate contact info
  const hasEmail = patient.patient_contact && /@/.test(patient.patient_contact);
  const hasPhone = patient.patient_contact && /^\+?[\d\s-()]+$/.test(patient.patient_contact);

  const canSendEmail = hasEmail;
  const canSendSMS = hasPhone;

  const handleSend = () => {
    if (mode === 'reminder') {
      if (!selectedInvoiceId) return;
      const invoice = patient.invoices.find(inv => inv.id === selectedInvoiceId);
      onSend(invoice, 'reminder');
    } else if (mode === 'invoice') {
      if (!selectedInvoiceId) return;
      const invoice = patient.invoices.find(inv => inv.id === selectedInvoiceId);
      onSend(invoice, sendMethod);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white animate-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-[#1a2845]">
          {mode === 'reminder' && 'Send Payment Reminder'}
          {mode === 'invoice' && 'Send Invoice'}
          {mode === 'custom' && 'Send Custom Message'}
        </h4>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contact validation warnings */}
      {!hasEmail && !hasPhone && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            This patient has no contact information. Please add an email or phone number.
          </AlertDescription>
        </Alert>
      )}

      {/* Custom message (coming soon) */}
      {mode === 'custom' && (
        <Alert className="mb-4">
          <AlertDescription>
            Custom messaging feature coming soon! For now, you can send invoices and payment reminders.
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Reminder Mode */}
      {mode === 'reminder' && (
        <div className="space-y-4">
          {!hasOutstanding ? (
            <Alert>
              <AlertDescription>
                No outstanding invoices for this patient.
              </AlertDescription>
            </Alert>
          ) : !canSendSMS ? (
            <Alert variant="destructive">
              <AlertDescription>
                Payment reminders require a phone number. Current contact: {patient.patient_contact}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select Invoice
                </label>
                <Select
                  value={selectedInvoiceId}
                  onValueChange={setSelectedInvoiceId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an invoice..." />
                  </SelectTrigger>
                  <SelectContent>
                    {outstandingInvoices.map(invoice => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} - £{Number(invoice.amount || 0).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Alert>
                <MessageSquare className="w-4 h-4" />
                <AlertDescription>
                  Will send SMS reminder to {patient.patient_contact}
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>
      )}

      {/* Invoice Send Mode */}
      {mode === 'invoice' && (
        <div className="space-y-4">
          {patient.invoices.length === 0 ? (
            <Alert>
              <AlertDescription>
                No invoices found for this patient.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select Invoice
                </label>
                <Select
                  value={selectedInvoiceId}
                  onValueChange={setSelectedInvoiceId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an invoice..." />
                  </SelectTrigger>
                  <SelectContent>
                    {patient.invoices.map(invoice => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} - £{Number(invoice.amount || 0).toFixed(2)} ({invoice.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Send Method
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={sendMethod === 'email' ? 'default' : 'outline'}
                    onClick={() => setSendMethod('email')}
                    disabled={!canSendEmail}
                    className="flex-1"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </Button>
                  <Button
                    type="button"
                    variant={sendMethod === 'sms' ? 'default' : 'outline'}
                    onClick={() => setSendMethod('sms')}
                    disabled={!canSendSMS}
                    className="flex-1"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    SMS
                  </Button>
                </div>
                {sendMethod === 'email' && !canSendEmail && (
                  <p className="text-xs text-red-600 mt-2">
                    No email address available
                  </p>
                )}
                {sendMethod === 'sms' && !canSendSMS && (
                  <p className="text-xs text-red-600 mt-2">
                    No phone number available
                  </p>
                )}
              </div>

              {selectedInvoiceId && (
                <Alert>
                  <AlertDescription>
                    {sendMethod === 'email'
                      ? `Will send invoice PDF to ${patient.patient_contact}`
                      : `Will send download link to ${patient.patient_contact}`}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSend}
          disabled={
            isSending ||
            !selectedInvoiceId ||
            mode === 'custom' ||
            (mode === 'reminder' && (!hasOutstanding || !canSendSMS)) ||
            (mode === 'invoice' && sendMethod === 'email' && !canSendEmail) ||
            (mode === 'invoice' && sendMethod === 'sms' && !canSendSMS)
          }
          className="bg-[#1a2845] hover:bg-[#2a3f5f]"
        >
          {isSending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
