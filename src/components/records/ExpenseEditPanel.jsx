import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, DollarSign, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Slide-in edit panel for expenses
 */
export function ExpenseEditPanel({
  expense,
  isOpen,
  onClose,
  onSave,
  isSaving = false
}) {
  const [formData, setFormData] = useState({
    date: '',
    category: '',
    amount: '',
    notes: ''
  });

  // Initialize form data when expense changes
  useEffect(() => {
    if (expense && isOpen) {
      setFormData({
        date: format(new Date(expense.date), 'yyyy-MM-dd'),
        category: expense.category,
        amount: expense.amount,
        notes: expense.notes || ''
      });
    }
  }, [expense, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const saveData = {
      date: formData.date,
      category: formData.category,
      amount: parseFloat(formData.amount),
      notes: formData.notes
    };

    onSave(saveData);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full md:w-[500px] bg-white shadow-2xl z-50 overflow-y-auto animate-slide-in">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-semibold text-[#1a2845]">Edit Expense</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 px-6 py-6 space-y-8">
            {/* Basic Information */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-[#d4a740]" />
                <h3 className="text-lg font-semibold text-[#1a2845]">Expense Details</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div>
                  <Label htmlFor="expense-date" className="text-sm font-medium text-gray-700">Date *</Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="rounded-xl border-gray-300 h-11 mt-1"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="category" className="text-sm font-medium text-gray-700">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({...formData, category: value})}
                  >
                    <SelectTrigger className="rounded-xl border-gray-300 h-11 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Rent">Rent</SelectItem>
                      <SelectItem value="Products">Products</SelectItem>
                      <SelectItem value="Wages">Wages</SelectItem>
                      <SelectItem value="Insurance">Insurance</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Utilities">Utilities</SelectItem>
                      <SelectItem value="Equipment">Equipment</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-[#d4a740]" />
                <h3 className="text-lg font-semibold text-[#1a2845]">Amount</h3>
              </div>
              <div className="space-y-4 pl-7">
                <div>
                  <Label htmlFor="amount" className="text-sm font-medium text-gray-700">Amount (£) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    className="rounded-xl border-gray-300 h-11 mt-1"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="expense-notes" className="text-sm font-medium text-gray-700">Notes</Label>
                  <Textarea
                    id="expense-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Optional notes..."
                    className="rounded-xl border-gray-300 mt-1"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-xl border-gray-300"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
