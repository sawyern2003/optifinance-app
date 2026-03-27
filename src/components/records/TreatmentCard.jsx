import React from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, User, FileText, Pencil, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
 * Luxury treatment card component
 */
export function TreatmentCard({
  treatment,
  isSelected = false,
  onSelect,
  onEdit,
  onGenerateInvoice,
  onDelete,
  practitioners = [],
  invoices = [],
  showCheckbox = false,
  anySelected = false
}) {
  const initials = getInitials(treatment.patient_name);
  const practitioner = practitioners.find(p => p.id === treatment.practitioner_id);
  const invoice = invoices.find(i => i.treatment_entry_id === treatment.id);
  const isLead = practitioner?.is_lead;

  // Payment status styling
  const getStatusStyle = () => {
    switch (treatment.payment_status) {
      case 'paid':
        return {
          banner: 'bg-emerald-50 border-emerald-200',
          text: 'text-emerald-800',
          badge: 'bg-emerald-100 text-emerald-800'
        };
      case 'pending':
        return {
          banner: 'bg-amber-50 border-amber-200',
          text: 'text-amber-800',
          badge: 'bg-amber-100 text-amber-800'
        };
      case 'partially_paid':
        return {
          banner: 'bg-blue-50 border-blue-200',
          text: 'text-blue-800',
          badge: 'bg-blue-100 text-blue-800'
        };
      default:
        return {
          banner: 'bg-gray-50 border-gray-200',
          text: 'text-gray-800',
          badge: 'bg-gray-100 text-gray-800'
        };
    }
  };

  const statusStyle = getStatusStyle();

  // Payment status label
  const getStatusLabel = () => {
    switch (treatment.payment_status) {
      case 'paid':
        return '✓ PAID';
      case 'pending':
        return 'PENDING PAYMENT';
      case 'partially_paid':
        return 'PARTIALLY PAID';
      default:
        return treatment.payment_status?.toUpperCase();
    }
  };

  return (
    <div
      className={`
        bg-white rounded-2xl p-6 border transition-all duration-200 hover:shadow-md
        hover:border-[#d4a740] hover:-translate-y-1 cursor-pointer group relative
        ${isSelected ? 'border-[#d4a740] ring-2 ring-[#d4a740]/20' : 'border-gray-100'}
      `}
    >
      {/* Selection Checkbox */}
      {(showCheckbox || anySelected) && (
        <div
          className={`absolute top-3 left-3 z-10 transition-opacity duration-200 ${
            anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect?.(treatment.id, checked)}
            className="h-5 w-5 border-2 border-gray-300 data-[state=checked]:bg-[#1a2845] data-[state=checked]:border-[#1a2845]"
          />
        </div>
      )}

      {/* Header with avatar and treatment name */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Patient Avatar */}
          <div className="h-10 w-10 rounded-full bg-[#1a2845] flex items-center justify-center text-white font-semibold flex-shrink-0">
            {initials}
          </div>

          {/* Treatment Name */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-[#1a2845] truncate">
              {treatment.treatment_name}
            </h3>
            <p className="text-sm text-gray-500 truncate">{treatment.patient_name || '-'}</p>
          </div>
        </div>

        {/* F&F Badge */}
        {treatment.friends_family_discount_applied && (
          <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 flex-shrink-0 ml-2">
            F&F
          </Badge>
        )}
      </div>

      {/* Key Info Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{format(new Date(treatment.date), 'dd MMM yyyy')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>{treatment.duration_minutes ? `${treatment.duration_minutes} min` : '-'}</span>
        </div>
      </div>

      {/* Payment Status Banner */}
      <div className={`
        p-4 rounded-xl mb-4 text-center border-2
        ${statusStyle.banner}
      `}>
        <div className={`font-semibold text-xl ${statusStyle.text}`}>
          £{(treatment.amount_paid || 0).toFixed(2)} / £{(treatment.price_paid || 0).toFixed(2)}
        </div>
        <div className={`text-xs uppercase tracking-wide mt-1 font-medium ${statusStyle.text}`}>
          {getStatusLabel()}
        </div>
      </div>

      {/* Practitioner Info */}
      {(practitioner || treatment.practitioner_name) && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-gray-700">{practitioner?.name || treatment.practitioner_name}</span>
          {isLead && (
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              Lead
            </Badge>
          )}
        </div>
      )}

      {/* Detailed Pricing (F&F) */}
      {treatment.friends_family_discount_applied &&
        treatment.friends_family_list_price != null &&
        Number(treatment.friends_family_list_price) > Number(treatment.price_paid || 0) + 0.005 && (
          <div className="text-xs text-gray-500 mb-4 bg-indigo-50 p-2 rounded-lg">
            List price: £{Number(treatment.friends_family_list_price).toFixed(2)} ·
            -{treatment.friends_family_discount_percent ?? '?'}% F&F discount
          </div>
        )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onGenerateInvoice?.(treatment);
          }}
          className="flex-1 border-gray-200 hover:bg-[#fef9f0] hover:border-[#d4a740]"
        >
          <FileText className="w-3 h-3 mr-2" />
          Invoice
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(treatment);
          }}
          className="flex-1 border-gray-200 hover:bg-[#fef9f0] hover:border-[#d4a740]"
        >
          <Pencil className="w-3 h-3 mr-2" />
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="hover:bg-[#fef9f0]">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(treatment);
              }}
              className="text-red-600 focus:text-red-600"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
