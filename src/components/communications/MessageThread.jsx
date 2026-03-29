import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageTimeline } from './MessageTimeline';
import { MessageComposer } from './MessageComposer';
import { useMessageHistory } from '@/hooks/useMessageHistory';

/**
 * Helper to get patient initials
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Main message thread area
 */
export function MessageThread({
  patient,
  composeMode,
  setComposeMode,
  onSendMessage,
  onViewPDF,
  onResend,
  isSending,
  resendingId
}) {
  const messages = useMessageHistory(patient.invoices, patient.customMessages || []);
  const initials = getInitials(patient.patient_name);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5 backdrop-blur-xl relative z-10">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="h-10 w-10 rounded-full bg-[#d6b164]/20 border border-[#d6b164]/30 flex items-center justify-center text-[#d6b164] font-light flex-shrink-0">
            {initials}
          </div>

          {/* Patient Info */}
          <div>
            <h3 className="font-light text-white/90 tracking-wide">
              {patient.patient_name}
            </h3>
            <p className="text-sm text-white/50 font-light">
              {patient.patient_contact || 'No contact'}
            </p>
          </div>

          {/* Outstanding Badge */}
          {patient.outstandingCount > 0 && (
            <Badge variant="destructive" className="ml-2 bg-rose-500/20 border-rose-500/30 text-rose-400 font-light">
              £{patient.outstandingBalance.toFixed(2)} outstanding
            </Badge>
          )}
        </div>

        {/* Actions */}
        <Link to="/records?tab=invoices">
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white/90 hover:bg-white/10">
            <ExternalLink className="w-4 h-4 mr-2" />
            View Records
          </Button>
        </Link>
      </div>

      {/* Message Timeline */}
      <div className="flex-1 min-h-0 bg-white/[0.02] overflow-hidden">
        <MessageTimeline
          messages={messages}
          onViewPDF={onViewPDF}
          onResend={onResend}
          resendingId={resendingId}
        />
      </div>

      {/* Message Composer */}
      <MessageComposer
        patient={patient}
        composeMode={composeMode}
        setComposeMode={setComposeMode}
        onSend={onSendMessage}
        isSending={isSending}
      />
    </div>
  );
}
