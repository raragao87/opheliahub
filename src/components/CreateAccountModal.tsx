import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { createAccount, getDefaultAccountTypes, type AccountType } from '../firebase/config';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<'bank' | 'pseudo' | 'asset'>('bank');
  const [category, setCategory] = useState<'family' | 'personal'>('personal');
  const [balance, setBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [customType, setCustomType] = useState('');
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableTypes, setAvailableTypes] = useState<AccountType[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user && isOpen) {
        loadAccountTypes();
      }
    });

    return unsubscribe;
  }, [isOpen]);

  const loadAccountTypes = async () => {
    try {
      const types = await getDefaultAccountTypes();
      setAvailableTypes(types);
    } catch (error) {
      console.error('Error loading account types:', error);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!name.trim()) {
      setError('Account name is required');
      return;
    }

    if (!selectedType && !customType.trim()) {
      setError('Please select an account type or enter a custom type');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const finalType = customType.trim() || selectedType;
      const isReal = accountType === 'bank';
      
      await createAccount(user.uid, {
        name: name.trim(),
        type: finalType,
        category,
        balance: parseFloat(balance) || 0,
        initialBalance: parseFloat(balance) || 0,
        isReal,
        accountType,
        defaultSign: 'positive',
        currency: 'EUR',
        sharedWith: [],
        ownerId: user.uid,
      });

      onSuccess();
      handleClose();
    } catch (error) {
      setError('Failed to create account. Please try again.');
      console.error('Error creating account:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setAccountType('bank');
    setCategory('personal');
    setBalance('');
    setNotes('');
    setSelectedType('');
    setCustomType('');
    setShowCustomTypeInput(false);
    setError('');
    onClose();
  };

  const handleTypeChange = (type: string) => {
    if (type === 'custom') {
      setShowCustomTypeInput(true);
      setSelectedType('');
    } else {
      setShowCustomTypeInput(false);
      setSelectedType(type);
      setCustomType('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Create New Account</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Main Checking, Savings, etc."
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type *
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="bank"
                  checked={accountType === 'bank'}
                  onChange={(e) => setAccountType(e.target.value as 'bank' | 'pseudo' | 'asset')}
                  className="mr-2"
                />
                <span>🏦 Bank Account</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="pseudo"
                  checked={accountType === 'pseudo'}
                  onChange={(e) => setAccountType(e.target.value as 'bank' | 'pseudo' | 'asset')}
                  className="mr-2"
                />
                <span>💳 Pseudo Account</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="asset"
                  checked={accountType === 'asset'}
                  onChange={(e) => setAccountType(e.target.value as 'bank' | 'pseudo' | 'asset')}
                  className="mr-2"
                />
                <span>🏠 Asset Account</span>
              </label>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Choose the type of account you want to create. Bank accounts are real accounts with actual balances, pseudo accounts are for tracking purposes, and asset accounts are for tracking valuable items like houses, cars, or investments.
            </p>
          </div>

          {/* Family/Personal Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Family/Personal Category
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="personal"
                  checked={category === 'personal'}
                  onChange={(e) => setCategory(e.target.value as 'family' | 'personal')}
                  className="mr-2"
                />
                <span>👤 Personal</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="family"
                  checked={category === 'family'}
                  onChange={(e) => setCategory(e.target.value as 'family' | 'personal')}
                  className="mr-2"
                />
                <span>👨‍👩‍👧‍👦 Family</span>
              </label>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Choose whether this account is for personal or family use.
            </p>
          </div>

          {/* Account Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type *
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {availableTypes
                .filter(type => type.category === accountType)
                .map((type) => (
                  <label key={type.id} className="flex items-center p-2 border rounded cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="accountType"
                      value={type.id}
                      checked={selectedType === type.id}
                      onChange={() => handleTypeChange(type.id)}
                      className="mr-2"
                    />
                    <span className="text-sm">{type.name}</span>
                  </label>
                ))}
            </div>
            
            <label className="flex items-center p-2 border rounded cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="accountType"
                value="custom"
                checked={showCustomTypeInput}
                onChange={() => handleTypeChange('custom')}
                className="mr-2"
              />
              <span className="text-sm">Custom Type</span>
            </label>

            {showCustomTypeInput && (
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter custom account type"
              />
            )}
          </div>

          {/* Initial Balance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Balance
            </label>
            <input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any additional notes about this account..."
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAccountModal; 