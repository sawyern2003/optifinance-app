import React from 'react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

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
 * Patient conversation card in sidebar
 */
export function PatientConversationCard({
  conversation,
  isSelected,
  onClick,
}) {
  const { patient_name, patient_contact, outstandingCount, outstandingBalance, lastActivity } = conversation;

  const initials = getInitials(patient_name);
  const hasOutstanding = outstandingCount > 0;

  const lastActivityText = lastActivity
    ? formatDistanceToNow(lastActivity, { addSuffix: true })
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 transition-all duration-200 border-l-4 ${
        isSelected
          ? 'bg-[#d6b164]/10 border-[#d6b164]'
          : 'bg-transparent border-transparent hover:bg-white/5'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 font-light ${
            isSelected
              ? 'bg-[#d6b164]/20 text-[#d6b164] border border-[#d6b164]/30'
              : 'bg-white/10 text-white/70 border border-white/10'
          }`}
        >
          {initials}
        </div>

        {/* Patient Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-light text-white/90 truncate tracking-wide">
              {patient_name}
            </h3>
            {hasOutstanding && (
              <Badge
                variant="destructive"
                className="ml-2 flex-shrink-0 h-5 min-w-[20px] px-1.5 text-xs bg-rose-500/20 border-rose-500/30 text-rose-400 font-light"
              >
                {outstandingCount}
              </Badge>
            )}
          </div>

          {/* Contact */}
          <p className="text-xs text-white/50 truncate mb-1 font-light">
            {patient_contact || 'No contact'}
          </p>

          {/* Last activity & outstanding amount */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/30 font-light">
              {lastActivityText}
            </span>
            {hasOutstanding && (
              <span className="text-rose-400 font-light">
                £{outstandingBalance.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
