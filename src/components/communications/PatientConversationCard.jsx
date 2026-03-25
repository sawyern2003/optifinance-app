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
          ? 'bg-[#fef9f0] border-[#d4a740]'
          : 'bg-white border-transparent hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold ${
            isSelected ? 'bg-[#1a2845]' : 'bg-gray-400'
          }`}
        >
          {initials}
        </div>

        {/* Patient Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-semibold text-gray-900 truncate">
              {patient_name}
            </h3>
            {hasOutstanding && (
              <Badge
                variant="destructive"
                className="ml-2 flex-shrink-0 h-5 min-w-[20px] px-1.5 text-xs"
              >
                {outstandingCount}
              </Badge>
            )}
          </div>

          {/* Contact */}
          <p className="text-xs text-gray-500 truncate mb-1">
            {patient_contact || 'No contact'}
          </p>

          {/* Last activity & outstanding amount */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {lastActivityText}
            </span>
            {hasOutstanding && (
              <span className="text-rose-600 font-medium">
                £{outstandingBalance.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
