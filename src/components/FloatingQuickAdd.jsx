import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import QuickAdd from "../pages/QuickAdd";

export default function FloatingQuickAdd() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-[#d6b164] hover:bg-[#c9a556] text-white shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 z-50 group"
        aria-label="Quick Add"
      >
        <div className="absolute inset-0 rounded-full bg-[#d6b164]/20 blur-xl group-hover:blur-2xl transition-all" />
        <Plus className="w-7 h-7 relative z-10" />
      </button>

      {/* Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-[#0a0e1a] border-white/10 p-0">
          <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-[#0a0e1a]/95 backdrop-blur-xl border-b border-white/10">
            <h2 className="text-2xl font-light text-white/90 tracking-wider">Quick Add</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          </div>
          <div className="p-6">
            <QuickAdd isModal onClose={() => setIsOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
