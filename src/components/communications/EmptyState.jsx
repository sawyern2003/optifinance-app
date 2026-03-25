import React from 'react';
import { MessageSquare, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Empty state when no patient is selected
 */
export function EmptyState({ onToggleSidebar }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md px-6">
        <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-[#1a2845] mb-2">
          Select a patient to view messages
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Choose a patient from the sidebar to see their communication history
          and send messages
        </p>
        <Button
          onClick={onToggleSidebar}
          className="md:hidden bg-[#1a2845] hover:bg-[#2a3f5f]"
        >
          <Menu className="w-4 h-4 mr-2" />
          Open Patient List
        </Button>
      </div>
    </div>
  );
}
