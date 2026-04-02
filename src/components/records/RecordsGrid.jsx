import React from 'react';
import { TreatmentCard } from './TreatmentCard';
import { ExpenseCard } from './ExpenseCard';
import { EmptyState } from './EmptyState';

/**
 * Grid layout wrapper for treatment and expense cards
 */
export function RecordsGrid({
  items,
  type = 'treatments',
  isLoading = false,
  selectedItems = [],
  onSelectItem,
  onEdit,
  onDelete,
  onGenerateInvoice,
  onMarkPaid,
  markingPaidId = null,
  practitioners = [],
  invoices = []
}) {
  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
            <div className="h-20 bg-gray-200 rounded-xl mb-4" />
            <div className="h-4 bg-gray-200 rounded w-full mb-2" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return <EmptyState type={type} />;
  }

  const anySelected = selectedItems.length > 0;

  // Render cards
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      {items.map((item) => {
        const isSelected = selectedItems.includes(item.id);

        if (type === 'treatments') {
          return (
            <TreatmentCard
              key={item.id}
              treatment={item}
              isSelected={isSelected}
              onSelect={onSelectItem}
              onEdit={() => onEdit?.(item, 'treatment')}
              onGenerateInvoice={onGenerateInvoice}
              onMarkPaid={onMarkPaid}
              markingPaidId={markingPaidId}
              onDelete={() => onDelete?.(item, 'treatment')}
              practitioners={practitioners}
              invoices={invoices}
              showCheckbox={true}
              anySelected={anySelected}
            />
          );
        } else {
          return (
            <ExpenseCard
              key={item.id}
              expense={item}
              isSelected={isSelected}
              onSelect={onSelectItem}
              onEdit={() => onEdit?.(item, 'expense')}
              onDelete={() => onDelete?.(item, 'expense')}
              showCheckbox={true}
              anySelected={anySelected}
            />
          );
        }
      })}
    </div>
  );
}
