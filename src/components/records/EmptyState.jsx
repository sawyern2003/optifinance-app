import React from 'react';
import { CalendarX, FileX } from 'lucide-react';

/**
 * Empty state component with illustrations
 */
export function EmptyState({ type = 'treatments' }) {
  const config = {
    treatments: {
      icon: CalendarX,
      title: 'No treatments found',
      description: 'No treatments match your current filters. Try adjusting your search or date range.',
      suggestion: 'You can add treatments from the Add section.'
    },
    expenses: {
      icon: FileX,
      title: 'No expenses found',
      description: 'No expenses match your current filters. Try adjusting your search or date range.',
      suggestion: 'You can add expenses from the Add section.'
    }
  };

  const { icon: Icon, title, description, suggestion } = config[type] || config.treatments;

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="mx-auto h-24 w-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
          <Icon className="w-12 h-12 text-gray-400" />
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold text-[#1a2845] mb-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-gray-600 mb-4">
          {description}
        </p>

        {/* Suggestion */}
        <p className="text-sm text-gray-500">
          {suggestion}
        </p>
      </div>
    </div>
  );
}
