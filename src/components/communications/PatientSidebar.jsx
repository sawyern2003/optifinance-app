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
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed md:relative inset-y-0 left-0 z-50
          w-80 bg-white/5 backdrop-blur-xl border-r border-white/10 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-light text-white/90 tracking-wider">Messages</h2>
            <button
              onClick={onClose}
              className="md:hidden p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-10 h-11 bg-white/5 border-white/10 hover:border-white/20 rounded-2xl text-white/90 placeholder:text-white/40 font-light"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-white/10 flex gap-2">
          <Badge
            variant={filter === 'outstanding' ? 'default' : 'outline'}
            className={`cursor-pointer transition-all font-light tracking-wider ${
              filter === 'outstanding'
                ? 'bg-[#d6b164]/20 backdrop-blur-xl border-[#d6b164]/30 text-[#d6b164] hover:bg-[#d6b164]/30'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
            }`}
            onClick={() => onFilterChange('outstanding')}
          >
            Outstanding ({outstandingCount})
          </Badge>
          <Badge
            variant={filter === 'all' ? 'default' : 'outline'}
            className={`cursor-pointer transition-all font-light tracking-wider ${
              filter === 'all'
                ? 'bg-[#d6b164]/20 backdrop-blur-xl border-[#d6b164]/30 text-[#d6b164] hover:bg-[#d6b164]/30'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
            }`}
            onClick={() => onFilterChange('all')}
          >
            All ({conversations.length})
          </Badge>
        </div>

        {/* Patient List */}
        <ScrollArea className="flex-1">
          {conversations.length > 0 ? (
            <div className="divide-y divide-white/5">
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
            <div className="p-8 text-center">
              <p className="text-sm text-white/40 font-light">
                {searchQuery
                  ? `No patients found matching "${searchQuery}"`
                  : 'No patients found'}
              </p>
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  );
}
