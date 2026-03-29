import React from 'react';
import { MessageSquare, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Empty state when no patient is selected
 */
export function EmptyState({ onToggleSidebar }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-white/[0.02]">
      <div className="text-center max-w-md px-6">
        <MessageSquare className="w-16 h-16 text-white/20 mx-auto mb-4" />
        <h3 className="text-lg font-light text-white/90 mb-2 tracking-wider">
          Select a patient to view messages
        </h3>
        <p className="text-sm text-white/50 mb-4 font-light">
          Choose a patient from the sidebar to see their communication history
          and send messages
        </p>
        <Button
          onClick={onToggleSidebar}
          className="md:hidden bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164]"
        >
          <Menu className="w-4 h-4 mr-2" />
          Open Patient List
        </Button>
      </div>
    </div>
  );
}
