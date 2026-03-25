import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PatientConversationCard } from './PatientConversationCard';

/**
 * Sidebar with patient list, search, and filters
 */
export function PatientSidebar({
  conversations,
  selectedKey,
  onSelectPatient,
  isOpen,
  onClose,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
}) {
  const outstandingCount = conversations.filter(c => c.outstandingCount > 0).length;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed md:relative inset-y-0 left-0 z-50
          w-80 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-[#1a2845]">Messages</h2>
            <button
              onClick={onClose}
              className="md:hidden p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-10 h-10 border-gray-300"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-gray-200 flex gap-2">
          <Badge
            variant={filter === 'outstanding' ? 'default' : 'outline'}
            className={`cursor-pointer ${
              filter === 'outstanding'
                ? 'bg-[#1a2845] hover:bg-[#2a3f5f]'
                : 'hover:bg-gray-100'
            }`}
            onClick={() => onFilterChange('outstanding')}
          >
            Outstanding ({outstandingCount})
          </Badge>
          <Badge
            variant={filter === 'all' ? 'default' : 'outline'}
            className={`cursor-pointer ${
              filter === 'all'
                ? 'bg-[#1a2845] hover:bg-[#2a3f5f]'
                : 'hover:bg-gray-100'
            }`}
            onClick={() => onFilterChange('all')}
          >
            All ({conversations.length})
          </Badge>
        </div>

        {/* Patient List */}
        <ScrollArea className="flex-1">
          {conversations.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {conversations.map((conversation) => (
                <PatientConversationCard
                  key={conversation.key}
                  conversation={conversation}
                  isSelected={selectedKey === conversation.key}
                  onClick={() => {
                    onSelectPatient(conversation.key);
                    onClose(); // Close sidebar on mobile after selection
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <p className="text-sm">
                {searchQuery
                  ? `No patients found matching "${searchQuery}"`
                  : 'No patients with invoices'}
              </p>
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  );
}
