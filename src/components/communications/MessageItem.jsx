import React from 'react';
import { Mail, MessageSquare, Check, CheckCheck, AlertTriangle, FileText, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Status badge for sent messages
 */
function StatusBadge({ status }) {
  const configs = {
    sent: { icon: Check, color: 'text-blue-500', text: 'Sent' },
    delivered: { icon: CheckCheck, color: 'text-blue-500', text: 'Delivered' },
    failed: { icon: AlertTriangle, color: 'text-red-500', text: 'Failed' }
  };

  const config = configs[status] || configs.sent;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1 text-xs ${config.color}`}>
      <Icon className="w-3 h-3" />
      <span>{config.text}</span>
    </div>
  );
}

/**
 * Individual message/event in timeline
 */
export function MessageItem({ message }) {
  const { type, action, text, timestamp, method, status } = message;

  // Choose icon based on action
  let Icon = FileText;
  if (action?.includes('sent_email')) Icon = Mail;
  else if (action?.includes('sent_sms')) Icon = MessageSquare;
  else if (action === 'payment_received') Icon = CheckCircle;

  const isSentMessage = type === 'sent';
  const isPayment = action === 'payment_received';

  return (
    <div className="flex items-start gap-3 py-2">
      {/* Icon */}
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isPayment
            ? 'bg-green-100 text-green-600'
            : isSentMessage
            ? 'bg-blue-100 text-blue-600'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isPayment ? 'text-green-700 font-medium' : 'text-gray-700'}`}>
          {text}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">
            {format(new Date(timestamp), 'MMM d, yyyy • h:mm a')}
          </span>
          {isSentMessage && status && (
            <>
              <span className="text-gray-300">•</span>
              <StatusBadge status={status} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
