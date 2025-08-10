import React, { useState, useEffect } from 'react';
import { type Account } from '../firebase/config';
import { updateAssetAccountBalance } from '../firebase/config';

interface UpdateAssetBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account;
  onSuccess: () => void;
}

const UpdateAssetBalanceModal: React.FC<UpdateAssetBalanceModalProps> = ({
  isOpen,
  onClose,
  account,
  onSuccess
}) => {
  const [newBalance, setNewBalance] = useState(account.balance);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewBalance(account.balance);
      setNotes('');
      setError('');
    }
  }, [isOpen, account.balance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await updateAssetAccountBalance(account.ownerId, account.id, newBalance, notes);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset balance');
    } finally {
      setIsLoading(false);
    }
  };

  const difference = newBalance - account.balance;
  const isIncrease = difference > 0;
  const isDecrease = difference < 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">🏠 Update Asset Value</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current vs New Value */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Value
              </label>
              <div className="text-lg font-semibold text-gray-900">
                ${account.balance.toLocaleString()}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Value
              </label>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter new value"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          {/* Difference Preview */}
          {difference !== 0 && (
            <div className={`p-3 rounded-lg border ${
              isIncrease 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {isIncrease ? 'Value Increase' : 'Value Decrease'}
                </span>
                <span className={`font-semibold ${
                  isIncrease ? 'text-green-700' : 'text-red-700'
                }`}>
                  {isIncrease ? '+' : '-'}${Math.abs(difference).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                This will automatically create a transaction for the difference
              </p>
            </div>
          )}

          {/* Notes Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Property appraisal, market update, etc."
              rows={3}
            />
          </div>

          {/* Auto-transaction Explanation */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium">Auto-Transaction Created</p>
                <p className="text-xs mt-1">
                  When you update an asset value, the system automatically creates a transaction 
                  for the difference, maintaining your financial history.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || difference === 0}
            >
              {isLoading ? 'Updating...' : 'Update Value'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UpdateAssetBalanceModal;


