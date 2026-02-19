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
  const [classification, setClassification] = useState<'bank' | 'asset' | 'liability'>('bank');
  const [scope, setScope] = useState<'family' | 'personal'>('personal');
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
      // Determine if it's a "real" bank account based on classification
      const isReal = classification === 'bank' || classification === 'liability';
      
      // Map scope/classification to backend category
      let backendCategory: 'family' | 'personal' | 'assets' = scope;
      if (classification === 'asset' && scope === 'personal') {
          if (classification === 'asset') backendCategory = 'assets';
      }

      // Determine default sign based on selected type
      const selectedTypeObj = availableTypes.find(t => t.id === selectedType);
      const defaultSign = selectedTypeObj?.defaultSign || (classification === 'liability' ? 'negative' : 'positive');

      await createAccount(user.uid, {
        name: name.trim(),
        type: finalType,
        category: backendCategory,
        balance: parseFloat(balance) || 0,
        initialBalance: parseFloat(balance) || 0,
        isReal,
        accountType: classification === 'liability' ? 'pseudo' : (classification === 'asset' ? 'asset' : 'bank'),
        defaultSign,
        currency: 'EUR',
        sharedWith: [],
        ownerId: user.uid,
        notes: notes // Using the notes state
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
    setClassification('bank');
    setScope('personal');
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

  const getFilteredTypes = () => {
    switch (classification) {
      case 'bank':
        return availableTypes.filter(t => ['checking', 'savings', 'cash'].includes(t.id));
      case 'liability':
        return availableTypes.filter(t => ['credit-card', 'loan', 'mortgage'].includes(t.id));
      case 'asset':
        return availableTypes.filter(t => ['investment', 'property', 'vehicle'].includes(t.id));
      default:
        return availableTypes;
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
              placeholder="e.g., Main Checking, Amex Gold"
            />
          </div>

          {/* Account Classification */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Classification *
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="bank"
                  checked={classification === 'bank'}
                  onChange={() => {
                      setClassification('bank');
                      setSelectedType('');
                  }}
                  className="mr-2"
                />
                <span>🏦 Banking / Cash (Liquid)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="liability"
                  checked={classification === 'liability'}
                  onChange={() => {
                      setClassification('liability');
                      setSelectedType('');
                  }}
                  className="mr-2"
                />
                <span>💳 Credit / Loan (Liability)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="asset"
                  checked={classification === 'asset'}
                  onChange={() => {
                      setClassification('asset');
                      setSelectedType('');
                  }}
                  className="mr-2"
                />
                <span>🏠 Property / Asset (Illiquid)</span>
              </label>
            </div>
          </div>

          {/* Scope (Family/Personal) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ownership Scope
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="personal"
                  checked={scope === 'personal'}
                  onChange={(e) => setScope(e.target.value as 'family' | 'personal')}
                  className="mr-2"
                />
                <span>👤 Personal</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="family"
                  checked={scope === 'family'}
                  onChange={(e) => setScope(e.target.value as 'family' | 'personal')}
                  className="mr-2"
                />
                <span>👨‍👩‍👧‍👦 Family Shared</span>
              </label>
            </div>
          </div>

          {/* Specific Account Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type *
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {getFilteredTypes().map((type) => (
                  <label key={type.id} className={`flex items-center p-2 border rounded cursor-pointer hover:bg-gray-50 ${selectedType === type.id ? 'bg-blue-50 border-blue-500' : ''}`}>
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
            <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">€</span>
                <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                />
            </div>
            {classification === 'liability' && (
                <p className="text-xs text-gray-500 mt-1">For liabilities, enter a positive number (e.g., 500 for a €500 debt).</p>
            )}
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
