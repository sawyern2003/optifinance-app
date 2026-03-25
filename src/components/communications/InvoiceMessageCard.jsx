import React from 'react';
import { FileText, ExternalLink, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Invoice card displayed in message timeline
 */
export function InvoiceMessageCard({
  invoice,
  sentAt,
  method,
  onViewPDF,
  onResend,
  isResending
}) {
  const statusColors = {
    paid: 'bg-green-100 text-green-700 border-green-200',
    Paid: 'bg-green-100 text-green-700 border-green-200',
    sent: 'bg-blue-100 text-blue-700 border-blue-200',
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    overdue: 'bg-rose-100 text-rose-700 border-rose-200',
  };

  const statusColor = statusColors[invoice.status] || statusColors.draft;

  return (
    <div className="max-w-md bg-white border border-gray-200 rounded-xl p-4 shadow-sm my-2">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#d4a740]" />
          <div>
            <p className="font-semibold text-sm">{invoice.invoice_number}</p>
            <p className="text-xs text-gray-500">
              {invoice.issue_date
                ? format(new Date(invoice.issue_date), 'MMM d, yyyy')
                : 'No date'}
            </p>
          </div>
        </div>
        <Badge className={statusColor}>
          {invoice.status || 'draft'}
        </Badge>
      </div>

      {/* Treatment & Amount */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
        <span className="text-sm text-gray-600 truncate">
          {invoice.treatment_name || 'Treatment'}
        </span>
        <span className="font-semibold text-[#1a2845] ml-2">
          £{Number(invoice.amount || 0).toFixed(2)}
        </span>
      </div>

      {/* Sent info */}
      {sentAt && method && (
        <p className="text-xs text-gray-500 mb-3">
          Sent via {method} •{' '}
          {format(new Date(sentAt), 'MMM d, h:mm a')}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {invoice.invoice_pdf_url && (
          <Button
            size="sm"
            variant="outline"
            onClick={onViewPDF}
            className="flex-1 border-gray-300"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            View PDF
          </Button>
        )}
        {onResend && (
          <Button
            size="sm"
            variant="outline"
            onClick={onResend}
            disabled={isResending}
            className="flex-1 border-gray-300"
          >
            {isResending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Send className="w-3 h-3 mr-1" />
            )}
            Resend
          </Button>
        )}
      </div>
    </div>
  );
}
