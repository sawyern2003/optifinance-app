import React, { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageItem } from './MessageItem';
import { InvoiceMessageCard } from './InvoiceMessageCard';

/**
 * Date separator for grouping messages by day
 */
function DateSeparator({ date }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="h-px bg-gray-200 flex-1" />
      <span className="text-xs font-medium text-gray-500">
        {format(new Date(date), 'MMMM d, yyyy')}
      </span>
      <div className="h-px bg-gray-200 flex-1" />
    </div>
  );
}

/**
 * Message timeline with chronological history
 */
export function MessageTimeline({
  messages,
  onViewPDF,
  onResend,
  resendingId
}) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No communication history yet</p>
        </div>
      </div>
    );
  }

  // Group messages by date
  let lastDate = null;

  return (
    <ScrollArea ref={scrollRef} className="h-full p-6">
      <div className="max-w-3xl">
        {messages.map((message, index) => {
          const messageDate = new Date(message.timestamp);
          const showDateSeparator =
            !lastDate || !isSameDay(messageDate, lastDate);
          lastDate = messageDate;

          return (
            <div key={message.id}>
              {showDateSeparator && <DateSeparator date={message.timestamp} />}

              {/* Render invoice card or simple message */}
              {message.type === 'sent' && message.invoice ? (
                <InvoiceMessageCard
                  invoice={message.invoice}
                  sentAt={message.timestamp}
                  method={message.method}
                  onViewPDF={() => onViewPDF(message.invoice)}
                  onResend={() => onResend(message.invoice, message.method)}
                  isResending={resendingId === message.invoice.id}
                />
              ) : (
                <MessageItem message={message} />
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
