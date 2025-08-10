import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { createTransaction, getTags } from '../firebase/config';

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
    tags: [] as string[]
  });
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Load available tags
    const loadTags = async () => {
      if (auth.currentUser) {
        try {
          const tags = await getTags(auth.currentUser.uid);
          setAvailableTags(tags.map(tag => tag.name));
        } catch (error) {
          console.error('Error loading tags:', error);
        }
      }
    };
    loadTags();
  }, []);

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
  }, []);

  const handleSubmit = async () => {
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
  };

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

  const handleTagToggle = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  // Close tag selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tag-selector-container')) {
        setShowTagSelector(false);
      }
    };

    if (showTagSelector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTagSelector]);

  return (
    <tr className={`transition-all duration-300 ${
      showSuccess 
        ? 'bg-green-50 border-l-4 border-green-400' 
        : 'bg-blue-50 border-l-4 border-blue-400'
    }`}>
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
      <td className="px-4 py-2 text-sm relative">
        <div className="relative tag-selector-container">
          <button
            onClick={() => setShowTagSelector(!showTagSelector)}
            className="w-full px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-left min-h-[24px] flex items-center justify-between"
            disabled={saving}
          >
            <span className="flex flex-wrap gap-1">
              {formData.tags.length > 0 ? (
                formData.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-gray-400">Select tags...</span>
              )}
            </span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showTagSelector && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
              {availableTags.map((tag) => (
                <label
                  key={tag}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={formData.tags.includes(tag)}
                    onChange={() => handleTagToggle(tag)}
                    className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">{tag}</span>
                </label>
              ))}
              {availableTags.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">No tags available</div>
              )}
            </div>
          )}
        </div>
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
