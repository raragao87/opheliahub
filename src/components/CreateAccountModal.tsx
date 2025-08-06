import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { createAccount, getAccountTypes, type AccountType } from '../firebase/config';
import AccountTypeSelector from './AccountTypeSelector';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: () => void;
}

const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [isRealAccount, setIsRealAccount] = useState(true);
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType | null>(null);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadAccountTypes(user.uid);
      }
    });

    return unsubscribe;
  }, []);

  const loadAccountTypes = async (userId: string) => {
    try {
      const types = await getAccountTypes(userId);
      setAccountTypes(types);
    } catch (error) {
      console.error('Error loading account types:', error);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setAccountName('');
      setAccountType('');
      setInitialBalance('');
      setIsRealAccount(true);
      setSelectedAccountType(null);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be signed in to create an account');
      return;
    }

    if (!accountName.trim()) {
      setError('Please enter an account name');
      return;
    }

    if (!accountType) {
      setError('Please select an account type');
      return;
    }

    if (!initialBalance.trim()) {
      setError('Please enter an initial balance');
      return;
    }

    const balance = parseFloat(initialBalance);
    if (isNaN(balance)) {
      setError('Please enter a valid balance amount');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const accountData = {
        name: accountName.trim(),
        type: accountType,
        defaultSign: selectedAccountType?.defaultSign || 'positive',
        initialBalance: balance,
        balance: balance,
        currency: 'EUR',
        sharedWith: [],
        ownerId: user.uid,
        isReal: isRealAccount
      };

      await createAccount(user.uid, accountData);
      
      // Success - close modal and notify parent
      onAccountCreated();
    } catch (error) {
      console.error('Error creating account:', error);
      setError('Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountTypeChange = (typeId: string) => {
    console.log('🔄 Account type changed to:', typeId);
    setAccountType(typeId);
    
    // Find the selected account type for default sign
    const selectedType = accountTypes.find(t => t.id === typeId);
    if (selectedType) {
      setSelectedAccountType(selectedType);
      console.log('✅ Selected account type:', selectedType);
    }
  };

  const handleAccountTypeCreated = (newType: AccountType) => {
    setSelectedAccountType(newType);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">💰</div>
            <h2 className="text-xl font-semibold text-gray-800">Create New Account</h2>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Account Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Name *
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., Chase Checking, Emergency Fund"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type *
            </label>
            <AccountTypeSelector
              value={accountType}
              onChange={handleAccountTypeChange}
              onAccountTypeCreated={handleAccountTypeCreated}
              disabled={loading}
            />
          </div>

          {/* Initial Balance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Initial Balance *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                $
              </span>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter the current balance of this account
            </p>
          </div>

          {/* Account Category Toggle */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isRealAccount}
                onChange={(e) => setIsRealAccount(e.target.checked)}
                className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                This is a bank account
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Uncheck if this is a pseudo account for budgeting/organization
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAccountModal; 