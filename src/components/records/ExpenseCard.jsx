import React from 'react';
import { format } from 'date-fns';
import { Calendar, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Category icons mapping
 */
const CATEGORY_ICONS = {
  Rent: { emoji: '🏢', bg: 'bg-blue-100', text: 'text-blue-700' },
  Products: { emoji: '📦', bg: 'bg-amber-100', text: 'text-amber-700' },
  Wages: { emoji: '💼', bg: 'bg-purple-100', text: 'text-purple-700' },
  Insurance: { emoji: '🛡️', bg: 'bg-green-100', text: 'text-green-700' },
  Marketing: { emoji: '📢', bg: 'bg-pink-100', text: 'text-pink-700' },
  Utilities: { emoji: '⚡', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Equipment: { emoji: '🔧', bg: 'bg-gray-100', text: 'text-gray-700' },
  Other: { emoji: '📝', bg: 'bg-slate-100', text: 'text-slate-700' }
};

/**
 * Luxury expense card component
 */
export function ExpenseCard({
  expense,
  isSelected = false,
  onSelect,
  onEdit,
  onDelete
}) {
  const categoryInfo = CATEGORY_ICONS[expense.category] || CATEGORY_ICONS.Other;

  return (
    <div
      className={`
        bg-white rounded-2xl p-6 border transition-all duration-200 hover:shadow-md
        hover:border-[#d4a740] hover:-translate-y-1 cursor-pointer group
        ${isSelected ? 'border-[#d4a740] ring-2 ring-[#d4a740]/20' : 'border-gray-100'}
      `}
    >
      {/* Header with category icon and name */}
      <div className="flex items-center gap-4 mb-4">
        {/* Category Icon Circle */}
        <div className={`
          h-12 w-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0
          ${categoryInfo.bg}
        `}>
          {categoryInfo.emoji}
        </div>

        {/* Category Name */}
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-lg ${categoryInfo.text}`}>
            {expense.category}
          </h3>
        </div>
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
        <Calendar className="w-4 h-4 flex-shrink-0" />
        <span>{format(new Date(expense.date), 'dd MMM yyyy')}</span>
      </div>

      {/* Amount (prominent, red) */}
      <div className="mb-4">
        <div className="text-3xl font-semibold text-red-600">
          £{(expense.amount || 0).toFixed(2)}
        </div>
      </div>

      {/* Notes Preview */}
      {expense.notes && (
        <div className="text-sm text-gray-600 mb-4 line-clamp-2">
          {expense.notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(expense);
          }}
          className="flex-1 border-gray-200 hover:bg-[#fef9f0] hover:border-[#d4a740]"
        >
          <Pencil className="w-3 h-3 mr-2" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(expense);
          }}
          className="flex-1 border-gray-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
        >
          <Trash2 className="w-3 h-3 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  );
}
