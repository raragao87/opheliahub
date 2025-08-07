import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { splitTransaction, mergeTransactionSplits, getTransactionSplits, updateTransactionSplit, getTags } from '../firebase/config';
import type { Transaction, Tag } from '../firebase/config';

interface SplitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  onSuccess: () => void;
}

interface SplitEntry {
  id: string;
  amount: number;
  description: string;
  tagIds: string[];
}

const SplitTransactionModal: React.FC<SplitTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction,
  onSuccess
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [splits, setSplits] = useState<SplitEntry[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOpen && user) {
      loadSplits();
      loadTags();
    }
  }, [isOpen, user]);

  const loadSplits = async () => {
    if (!user) return;
    
    try {
      const existingSplits = await getTransactionSplits(transaction.id, user.uid);
      if (existingSplits.length > 0) {
        setSplits(existingSplits.map(split => ({
          id: split.id,
          amount: split.amount,
          description: split.description,
          tagIds: split.tagIds || []
        })));
        setIsEditing(true);
      } else {
        // Initialize with default split
        setSplits([{
          id: 'new-1',
          amount: transaction.amount,
          description: transaction.description,
          tagIds: transaction.tagIds || []
        }]);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading splits:', error);
      setError('Failed to load transaction splits');
    }
  };

  const loadTags = async () => {
    if (!user) return;
    
    try {
      const tags = await getTags(user.uid);
      setAvailableTags(tags);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };

  const addSplit = () => {
    const newId = `new-${Date.now()}`;
    setSplits([...splits, {
      id: newId,
      amount: 0,
      description: '',
      tagIds: []
    }]);
  };

  const removeSplit = (index: number) => {
    if (splits.length <= 1) return;
    setSplits(splits.filter((_, i) => i !== index));
  };

  const updateSplit = (index: number, field: keyof SplitEntry, value: any) => {
    const updatedSplits = [...splits];
    updatedSplits[index] = { ...updatedSplits[index], [field]: value };
    setSplits(updatedSplits);
  };

  const getTotalAmount = () => {
    return splits.reduce((sum, split) => sum + split.amount, 0);
  };

  const getRemainingAmount = () => {
    return transaction.amount - getTotalAmount();
  };

  const getPercentage = (amount: number) => {
    return ((amount / transaction.amount) * 100).toFixed(1);
  };

  const validateSplits = () => {
    const remaining = getRemainingAmount();
    
    if (Math.abs(remaining) > 0.01) {
      setError(`Split amounts must equal original amount. Remaining: ${remaining.toFixed(2)}`);
      return false;
    }
    
    if (splits.some(split => split.amount <= 0)) {
      setError('All split amounts must be greater than 0');
      return false;
    }
    
    if (splits.some(split => !split.description.trim())) {
      setError('All splits must have a description');
      return false;
    }
    
    setError('');
    return true;
  };

  const handleSave = async () => {
    if (!user || !validateSplits()) return;
    
    setLoading(true);
    try {
      if (isEditing) {
        // Update existing splits
        for (const split of splits) {
          if (split.id.startsWith('new-')) {
            // This is a new split, we need to handle it differently
            continue;
          }
          await updateTransactionSplit(split.id, {
            amount: split.amount,
            description: split.description,
            tagIds: split.tagIds
          }, user.uid);
        }
      } else {
        // Create new splits
        const splitData = splits.map(split => ({
          amount: split.amount,
          description: split.description,
          tagIds: split.tagIds
        }));
        
        await splitTransaction(transaction.id, splitData, user.uid);
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving splits:', error);
      setError('Failed to save transaction splits');
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await mergeTransactionSplits(transaction.id, user.uid);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error merging splits:', error);
      setError('Failed to merge transaction splits');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">✂️</div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">
                {isEditing ? 'Edit Transaction Splits' : 'Split Transaction'}
              </h2>
              <p className="text-sm text-gray-600">
                {transaction.description} - {formatCurrency(transaction.amount)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Original Amount</p>
                <p className="text-lg font-bold text-gray-800">
                  {formatCurrency(transaction.amount)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Split Total</p>
                <p className={`text-lg font-bold ${getRemainingAmount() === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(getTotalAmount())}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Remaining</p>
                <p className={`text-lg font-bold ${getRemainingAmount() === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(getRemainingAmount())}
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Splits */}
          <div className="space-y-4">
            {splits.map((split, index) => (
              <div key={split.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-800">Split {index + 1}</h3>
                  {splits.length > 1 && (
                    <button
                      onClick={() => removeSplit(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount ({getPercentage(split.amount)}%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={split.amount}
                      onChange={(e) => updateSplit(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={split.description}
                      onChange={(e) => updateSplit(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter split description"
                    />
                  </div>
                </div>
                
                {/* Tags */}
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => {
                          const newTagIds = split.tagIds.includes(tag.id)
                            ? split.tagIds.filter(id => id !== tag.id)
                            : [...split.tagIds, tag.id];
                          updateSplit(index, 'tagIds', newTagIds);
                        }}
                        className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                          split.tagIds.includes(tag.id)
                            ? 'text-white'
                            : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                        }`}
                        style={{
                          backgroundColor: split.tagIds.includes(tag.id) ? tag.color : undefined
                        }}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Split Button */}
          <div className="mt-4">
            <button
              onClick={addSplit}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Split
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            
            {isEditing && (
              <button
                onClick={handleMerge}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {loading ? 'Merging...' : 'Merge Splits'}
              </button>
            )}
            
            <button
              onClick={handleSave}
              disabled={loading || getRemainingAmount() !== 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (isEditing ? 'Update Splits' : 'Create Splits')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplitTransactionModal; 