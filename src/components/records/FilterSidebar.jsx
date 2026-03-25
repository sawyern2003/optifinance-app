import React from 'react';
import { Search, Calendar, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

/**
 * Sticky filter sidebar for Records page
 */
export function FilterSidebar({
  searchTerm,
  setSearchTerm,
  dateRangePreset,
  setDateRangePreset,
  paymentStatusFilter,
  setPaymentStatusFilter,
  statistics = null,
  type = 'treatments'
}) {
  const dateRangeOptions = [
    { value: 'all-time', label: 'All Time' },
    { value: 'this-month', label: 'This Month' },
    { value: 'last-month', label: 'Last Month' },
    { value: 'last-3-months', label: 'Last 3 Months' },
    { value: 'last-6-months', label: 'Last 6 Months' },
    { value: 'year-to-date', label: 'Year to Date' }
  ];

  const paymentStatusOptions = [
    { value: 'all', label: 'All', color: 'bg-gray-100 text-gray-700' },
    { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-700' },
    { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-700' },
    { value: 'partially_paid', label: 'Partial', color: 'bg-blue-100 text-blue-700' }
  ];

  return (
    <div className="w-80 bg-white border-r border-gray-100 p-6 overflow-y-auto sticky top-0 h-screen">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#1a2845] mb-1">Filters</h2>
        <p className="text-sm text-gray-500">Refine your search</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Search
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search records..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 rounded-xl border-gray-300"
          />
        </div>
      </div>

      {/* Date Range */}
      <div className="mb-6">
        <label className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Date Range
        </label>
        <div className="flex flex-col gap-2">
          {dateRangeOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setDateRangePreset(option.value)}
              className={`
                px-4 py-2 rounded-xl text-sm font-medium text-left transition-all
                ${dateRangePreset === option.value
                  ? 'bg-[#1a2845] text-white shadow-sm'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payment Status (only for treatments) */}
      {type === 'treatments' && (
        <div className="mb-6">
          <label className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Payment Status
          </label>
          <div className="flex flex-col gap-2">
            {paymentStatusOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setPaymentStatusFilter(option.value)}
                className={`
                  px-4 py-2 rounded-xl text-sm font-medium text-left transition-all
                  ${paymentStatusFilter === option.value
                    ? `${option.color} shadow-sm ring-2 ring-offset-1 ${option.color.replace('bg-', 'ring-').replace('100', '300')}`
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Statistics Summary */}
      {statistics && (
        <div className="pt-6 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Summary</h3>
          <div className="space-y-3">
            {statistics.count !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {type === 'treatments' ? 'Treatments' : 'Expenses'}
                </span>
                <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                  {statistics.count}
                </Badge>
              </div>
            )}
            {statistics.totalRevenue !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Revenue</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                  £{statistics.totalRevenue.toFixed(2)}
                </Badge>
              </div>
            )}
            {statistics.pendingCount !== undefined && statistics.pendingCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Pending</span>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                  {statistics.pendingCount}
                </Badge>
              </div>
            )}
            {statistics.totalExpenses !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Expenses</span>
                <Badge variant="secondary" className="bg-red-100 text-red-700">
                  £{statistics.totalExpenses.toFixed(2)}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
