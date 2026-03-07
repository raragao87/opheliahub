import React, { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase/config';
import { createTransaction, type Tag } from '../firebase/config';
import InlineTagInput from './InlineTagInput';

interface InlineTransactionRowProps {
  accountId: string;
  onTransactionCreated: () => void;
  onCancel: () => void;
}

const InlineTransactionRow: React.FC<InlineTransactionRowProps> = ({
  accountId,
  onTransactionCreated,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], // Today's date
    description: '',
    amount: '',
    tags: [] as Tag[]
  });
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!formData.description.trim() || !formData.amount.trim()) {
      return; // Don't save empty transactions
    }

    setSaving(true);
    try {
      if (auth.currentUser) {
        const amount = parseFloat(formData.amount);
        if (isNaN(amount)) return;

        await createTransaction(auth.currentUser.uid, {
          accountId,
          amount,
          description: formData.description.trim(),
          date: formData.date,
          tagIds: formData.tags.map(t => t.id),
          isManual: true,
          source: 'manual',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        // Show success feedback
        setShowSuccess(true);
        setTimeout(() => {
          onTransactionCreated();
        }, 300); // Brief success animation
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
      setSaving(false);
    }
  }, [accountId, formData, onTransactionCreated]);

  useEffect(() => {
    const handleGlobalKeyPress = (e: KeyboardEvent) => {
      // Escape to cancel from anywhere
      if (e.key === 'Escape') {
        onCancel();
      }
      // Ctrl/Cmd + Enter to save
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyPress);
    return () => document.removeEventListener('keydown', handleGlobalKeyPress);
  }, [handleSubmit, onCancel]);

  const handleKeyPress = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      if (field === 'description' && formData.description.trim()) {
        // Move to amount field
        (document.querySelector('[data-field="amount"]') as HTMLInputElement)?.focus();
      } else if (field === 'amount' && formData.amount.trim()) {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <tr className={`transition-all duration-300 ${
      showSuccess 
        ? 'bg-green-50 border-l-4 border-green-400' 
        : 'bg-blue-50 border-l-4 border-blue-400'
    }`}>
      {/* Checkbox - Disabled for inline add */}
      <td className="px-4 py-2 text-sm">
        <input
          type="checkbox"
          disabled
          className="rounded border-gray-300 text-gray-400 cursor-not-allowed"
        />
      </td>

      {/* Date */}
      <td className="px-4 py-2 whitespace-nowrap text-sm">
        <input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
          className="w-full px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          disabled={saving}
        />
      </td>

      {/* Description */}
      <td className="px-4 py-2 text-sm">
        <input
          type="text"
          placeholder="Enter description..."
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          onKeyDown={(e) => handleKeyPress(e, 'description')}
          className="w-full px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          autoFocus
          data-field="description"
          disabled={saving}
        />
      </td>

      {/* Tags */}
      <td className="px-4 py-2 text-sm">
        <InlineTagInput
          selectedTags={formData.tags}
          onTagsChange={(newTags) => setFormData(prev => ({ ...prev, tags: newTags }))}
        />
      </td>

      {/* Amount */}
      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={formData.amount}
          onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
          onKeyDown={(e) => handleKeyPress(e, 'amount')}
          className="w-full px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-right bg-white"
          data-field="amount"
          disabled={saving}
        />
      </td>

      {/* Actions */}
      <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center justify-end space-x-2">
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.description.trim() || !formData.amount.trim()}
            className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save Transaction (Enter)"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Cancel (Esc)"
            disabled={saving}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
};

export default InlineTransactionRow;
