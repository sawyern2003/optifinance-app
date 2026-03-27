import React from 'react';
import { CheckSquare, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Floating bulk actions bar (appears when items are selected)
 */
export function BulkActionsBar({
  selectedCount = 0,
  totalCount = 0,
  onClearSelection,
  onSelectAll,
  onBulkDelete,
  type = 'treatments'
}) {
  if (selectedCount === 0) return null;

  const itemLabel = type === 'treatments' ? 'treatment' : 'expense';
  const itemsLabel = type === 'treatments' ? 'treatments' : 'expenses';
  const allSelected = selectedCount === totalCount;

  return (
    <div className="sticky top-0 z-30 bg-blue-50 border-b border-blue-200 px-6 py-4 flex items-center justify-between shadow-sm animate-slide-down">
      {/* Left side - Selection info */}
      <div className="flex items-center gap-4">
        <CheckSquare className="w-5 h-5 text-blue-600" />
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-900 font-semibold">
            {selectedCount}
          </Badge>
          <span className="text-sm font-medium text-blue-900">
            {selectedCount === 1 ? itemLabel : itemsLabel} selected
          </span>
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Clear Selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="text-blue-900 hover:bg-blue-100 rounded-xl"
        >
          <X className="w-4 h-4 mr-2" />
          Clear
        </Button>

        {/* Select All / Deselect All */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
          className="text-blue-900 hover:bg-blue-100 rounded-xl"
        >
          <CheckSquare className="w-4 h-4 mr-2" />
          {allSelected ? 'Deselect All' : `Select All (${totalCount})`}
        </Button>

        {/* Bulk Delete */}
        <Button
          variant="default"
          size="sm"
          onClick={onBulkDelete}
          className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete {selectedCount === 1 ? itemLabel : itemsLabel}
        </Button>
      </div>
    </div>
  );
}
