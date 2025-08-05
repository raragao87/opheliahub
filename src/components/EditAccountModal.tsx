import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { updateAccount, getAccountTypes, type Account, type AccountType } from '../firebase/config';
import AccountTypeSelector from './AccountTypeSelector';

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account;
  onAccountUpdated: () => void;
}

const EditAccountModal: React.FC<EditAccountModalProps> = ({
  isOpen,
  onClose,
  account,
  onAccountUpdated
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [accountName, setAccountName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType | null>(null);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOpen && account && user) {
      // Initialize form with current account data
      setAccountName(account.name);
      setInitialBalance(account.initialBalance.toString());
      setError(null);
      
      // Load account types
      loadAccountTypes();
    }
  }, [isOpen, account, user]);

  const loadAccountTypes = async () => {
    if (!user) return;
    
    try {
      const types = await getAccountTypes(user.uid);
      setAccountTypes(types);
    } catch (error) {
      console.error('Error loading account types:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be signed in to edit accounts');
      return;
    }

    if (!accountName.trim()) {
      setError('Please enter an account name');
      return;
    }

    const newInitialBalance = parseFloat(initialBalance);
    if (isNaN(newInitialBalance)) {
      setError('Please enter a valid initial balance');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Calculate balance adjustment
      const balanceDifference = newInitialBalance - account.initialBalance;
      const newBalance = account.balance + balanceDifference;

      // Update account
      await updateAccount(account.id, {
        name: accountName.trim(),
        type: selectedAccountType?.name || account.type, // Use selected type or keep current
        defaultSign: selectedAccountType?.defaultSign || account.defaultSign,
        initialBalance: newInitialBalance,
        balance: newBalance,
        updatedAt: Date.now(),
        ownerId: account.ownerId
      });

      console.log('✅ Account updated successfully');
      
      // Success - close modal and notify parent
      onAccountUpdated();
    } catch (error) {
      console.error('❌ Error updating account:', error);
      setError('Failed to update account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: string) => {
    // Remove any non-numeric characters except decimal point
    const numericValue = value.replace(/[^0-9.]/g, '');
    return numericValue;
  };

  const handleInitialBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatCurrency(e.target.value);
    setInitialBalance(formattedValue);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">✏️</div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Edit Account</h2>
              <p className="text-sm text-gray-600">{account.name}</p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Account Info */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Current Balance</p>
                <p className={`text-lg font-bold ${account.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${account.balance.toLocaleString()}
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {account.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
            </div>
          </div>

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
              value={account.type}
              onChange={(typeId) => {
                const selectedType = accountTypes.find(t => t.id === typeId);
                setSelectedAccountType(selectedType || null);
              }}
              onAccountTypeCreated={(newType) => setSelectedAccountType(newType)}
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
                type="text"
                value={initialBalance}
                onChange={handleInitialBalanceChange}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Changing initial balance will adjust current balance proportionally
            </p>
          </div>

          {/* Warning */}
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm text-yellow-800">
                Changing initial balance will affect your current balance calculation
              </span>
            </div>
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
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Updating...
                </>
              ) : (
                'Update Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditAccountModal; 