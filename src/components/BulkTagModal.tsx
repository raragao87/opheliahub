import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  bulkAssignTags, 
  type Transaction 
} from '../firebase/config';
import TagSelector from './TagSelector';

interface BulkTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTransactions: Transaction[];
  onSuccess: () => void;
}

const BulkTagModal: React.FC<BulkTagModalProps> = ({
  isOpen,
  onClose,
  selectedTransactions,
  onSuccess
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'add' | 'replace'>('add');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || selectedTransactions.length === 0 || selectedTags.length === 0) return;

    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Bulk tagging transactions:', {
        transactionIds: selectedTransactions.map(t => t.id),
        tagIds: selectedTags,
        mode: tagMode
      });

      await bulkAssignTags(
        selectedTransactions.map(t => t.id),
        selectedTags,
        user.uid,
        tagMode
      );

      console.log('✅ Bulk tagging completed');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('❌ Error bulk tagging transactions:', error);
      setError('Failed to apply tags to transactions');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Bulk Tag Transactions</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Selected Transactions Preview */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-3">
              Selected Transactions ({selectedTransactions.length})
            </h3>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {selectedTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                          <span 
                          className="text-sm text-gray-700 cursor-help"
                          title={transaction.description.length > 40 ? transaction.description : undefined}
                        >
                          {transaction.description.length > 40 
                            ? transaction.description.substring(0, 40) + '...' 
                            : transaction.description
                          }
                        </span>
                  <span className={`text-sm font-medium ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(transaction.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tag Selection */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Tags
              </label>
              <TagSelector
                selectedTagIds={selectedTags}
                onTagChange={setSelectedTags}
              />
            </div>

            {/* Tag Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tag Assignment Mode
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="tagMode"
                    value="add"
                    checked={tagMode === 'add'}
                    onChange={(e) => setTagMode(e.target.value as 'add' | 'replace')}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    Add to existing tags (keep current tags)
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="tagMode"
                    value="replace"
                    checked={tagMode === 'replace'}
                    onChange={(e) => setTagMode(e.target.value as 'add' | 'replace')}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    Replace existing tags (remove current tags)
                  </span>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || selectedTags.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Applying Tags...
                  </div>
                ) : (
                  `Apply Tags to ${selectedTransactions.length} Transaction${selectedTransactions.length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BulkTagModal; 