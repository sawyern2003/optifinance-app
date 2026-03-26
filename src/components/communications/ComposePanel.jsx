import React, { useState } from 'react';
import { X, Send, Loader2, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { extractEmailAddress, extractPhoneNumber } from '@/lib/contactGuards';
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
  const [customMessage, setCustomMessage] = useState('');

  const outstandingInvoices = patient.invoices.filter(
    inv => inv.status !== 'paid' && inv.status !== 'Paid'
  );

  const hasOutstanding = outstandingInvoices.length > 0;

  // Validate contact info
  const emailAddress = extractEmailAddress(patient.patient_contact);
  const phoneNumber = extractPhoneNumber(patient.patient_contact);
  const hasEmail = Boolean(emailAddress);
  const hasPhone = Boolean(phoneNumber);

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
    } else if (mode === 'custom') {
      if (!customMessage.trim() || !canSendSMS) return;
      onSend(null, 'custom_sms', customMessage.trim());
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

      {/* Custom message */}
      {mode === 'custom' && (
        <div className="space-y-4 mb-4">
          {!canSendSMS ? (
            <Alert variant="destructive">
              <AlertDescription>
                Custom SMS requires a phone number. Current contact: {patient.patient_contact || 'none'}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <AlertDescription>
                  Sending to {phoneNumber} via SMS.
                </AlertDescription>
              </Alert>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Message
                </label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={`Hi ${patient.patient_name || 'there'}, just checking in after your treatment...`}
                  rows={4}
                  maxLength={1200}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {customMessage.length}/1200
                </p>
              </div>
            </>
          )}
        </div>
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
                  Will send SMS reminder to {phoneNumber}
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
                      ? `Will send invoice PDF to ${emailAddress || patient.patient_contact}`
                      : `Will send download link to ${phoneNumber || patient.patient_contact}`}
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
            ((mode === 'reminder' || mode === 'invoice') && !selectedInvoiceId) ||
            (mode === 'custom' && !customMessage.trim()) ||
            (mode === 'reminder' && (!hasOutstanding || !canSendSMS)) ||
            (mode === 'invoice' && sendMethod === 'email' && !canSendEmail) ||
            (mode === 'invoice' && sendMethod === 'sms' && !canSendSMS) ||
            (mode === 'custom' && !canSendSMS)
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
