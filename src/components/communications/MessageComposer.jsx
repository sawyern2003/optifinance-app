import React from 'react';
import { Clock, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComposePanel } from './ComposePanel';

/**
 * Message composer with quick actions
 */
export function MessageComposer({
  patient,
  composeMode,
  setComposeMode,
  onSend,
  isSending
}) {
  const outstandingInvoices = patient.invoices.filter(
    inv => inv.status !== 'paid' && inv.status !== 'Paid'
  );

  const hasOutstanding = outstandingInvoices.length > 0;

  return (
    <div className="border-t bg-white p-4">
      {/* Quick Action Buttons */}
      <div className="flex gap-2 flex-wrap mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setComposeMode('reminder')}
          disabled={!hasOutstanding || composeMode !== null}
          className="border-[#f0e9d8] hover:bg-[#fef9f0]"
        >
          <Clock className="w-4 h-4 mr-2" />
          Send Payment Reminder
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setComposeMode('invoice')}
          disabled={composeMode !== null}
          className="border-[#f0e9d8] hover:bg-[#fef9f0]"
        >
          <Mail className="w-4 h-4 mr-2" />
          Send Invoice
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setComposeMode('custom')}
          disabled={composeMode !== null}
          className="border-[#f0e9d8] hover:bg-[#fef9f0]"
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Custom Message
        </Button>
      </div>

      {/* Compose Panel (appears when button clicked) */}
      {composeMode && (
        <ComposePanel
          mode={composeMode}
          patient={patient}
          onSend={onSend}
          onCancel={() => setComposeMode(null)}
          isSending={isSending}
        />
      )}
    </div>
  );
}
