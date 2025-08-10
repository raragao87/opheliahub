import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { updateAccount, deleteAccount, getAccountTypes, getTransactionsByAccount, updateTransaction, type Account, type AccountType } from '../firebase/config';
import UpdateAssetBalanceModal from './UpdateAssetBalanceModal';

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
  const [selectedAccountTypeId, setSelectedAccountTypeId] = useState('');
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [currency, setCurrency] = useState('EUR');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [category, setCategory] = useState<'family' | 'personal' | 'assets'>('personal');
  const [accountType, setAccountType] = useState<'bank' | 'pseudo' | 'asset'>('bank');
  const [showUpdateAssetBalanceModal, setShowUpdateAssetBalanceModal] = useState(false);

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
      setSelectedAccountTypeId(account.type);
      setCurrency(account.currency || 'EUR');
      setCategory(account.category || 'personal');
      
      // Initialize accountType based on existing account data
      if (account.accountType) {
        setAccountType(account.accountType);
      } else {
        // Backward compatibility: map isReal to accountType
        setAccountType(account.isReal ? 'bank' : 'pseudo');
      }
      
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

  const findAndUpdateInitialBalanceTransaction = async (newInitialBalance: number) => {
    if (!user) return;
    
    try {
      // Find the initial balance transaction for this account
      const transactions = await getTransactionsByAccount(user.uid, account.id);
      const initialBalanceTransaction = transactions.find(t => t.source === 'initial-balance');
      
      if (initialBalanceTransaction) {
        // Update the initial balance transaction amount
        await updateTransaction(initialBalanceTransaction.id, {
          amount: newInitialBalance,
          description: `Initial balance: ${newInitialBalance.toFixed(2)}`,
          updatedAt: Date.now()
        }, user.uid);
        
        console.log('✅ Updated initial balance transaction:', initialBalanceTransaction.id);
      } else {
        console.log('⚠️ No initial balance transaction found for account:', account.id);
      }
    } catch (error) {
      console.error('❌ Error updating initial balance transaction:', error);
      throw error;
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      await deleteAccount(account.id, user.uid);
      console.log('✅ Account deleted successfully');
      
      // Close modal and notify parent
      onAccountUpdated();
    } catch (error) {
      console.error('❌ Error deleting account:', error);
      setError('Failed to delete account. Please try again.');
    } finally {
      setLoading(false);
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

      console.log('🔄 Submitting account update with selectedAccountTypeId:', selectedAccountTypeId);
      
      // Find the selected account type to get its properties
      const selectedType = accountTypes.find(t => t.name === selectedAccountTypeId);
      
      // Update the initial balance transaction if it exists
      if (newInitialBalance !== account.initialBalance) {
        await findAndUpdateInitialBalanceTransaction(newInitialBalance);
      }
      
      // Update account
      await updateAccount(account.id, {
        name: accountName.trim(),
        type: selectedAccountTypeId || account.type,
        defaultSign: selectedType?.defaultSign || account.defaultSign,
        initialBalance: newInitialBalance,
        balance: newBalance,
        currency: currency,
        isReal: accountType === 'bank', // Map accountType to isReal for backward compatibility
        category: category,
        accountType: accountType, // Add new accountType field
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
            <select
              value={selectedAccountTypeId}
              onChange={(e) => setSelectedAccountTypeId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select an account type</option>
              <optgroup label="Assets">
                {accountTypes.filter(type => type.category === 'asset').map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name} {type.isCustom && '(Custom)'}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Liabilities">
                {accountTypes.filter(type => type.category === 'liability').map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name} {type.isCustom && '(Custom)'}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Manage custom account types in the Account Types settings
            </p>
          </div>

          {/* Account Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Category
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="accountType"
                  value="bank"
                  checked={accountType === 'bank'}
                  onChange={() => setAccountType('bank')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Bank Account</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="accountType"
                  value="pseudo"
                  checked={accountType === 'pseudo'}
                  onChange={() => setAccountType('pseudo')}
                  className="mr-2 text-orange-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Pseudo Account</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="accountType"
                  value="asset"
                  checked={accountType === 'asset'}
                  onChange={() => setAccountType('asset')}
                  className="mr-2 text-green-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">🏠 Asset Account</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Bank accounts are real institutions, pseudo accounts are for budgeting, asset accounts track property/investment values
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
                  name="category"
                  value="personal"
                  checked={category === 'personal'}
                  onChange={(e) => setCategory(e.target.value as 'family' | 'personal' | 'assets')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Personal</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="category"
                  value="family"
                  checked={category === 'family'}
                  onChange={(e) => setCategory(e.target.value as 'family' | 'personal' | 'assets')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Family</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="category"
                  value="assets"
                  checked={category === 'assets'}
                  onChange={(e) => setCategory(e.target.value as 'family' | 'personal' | 'assets')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">🏠 Assets</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Choose whether this account is for personal, family, or assets use
            </p>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="BRL">BRL (R$)</option>
              <option value="AUD">AUD (A$)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (C$)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="CHF">CHF (Fr)</option>
            </select>
          </div>

          {/* Initial Balance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Initial Balance *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                {currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'BRL' ? 'R$' : currency === 'AUD' ? 'A$' : currency === 'GBP' ? '£' : currency === 'CAD' ? 'C$' : currency === 'JPY' ? '¥' : currency === 'CHF' ? 'Fr' : '$'}
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

          {/* Update Asset Value Button */}
          {accountType === 'asset' && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                  </svg>
                  <span className="text-sm text-blue-800">
                    Asset accounts can have their values updated directly
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUpdateAssetBalanceModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                  </svg>
                  Update Value
                </button>
              </div>
            </div>
          )}

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

          {/* Delete Account Button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading}
              className="w-full px-4 py-2 text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete Account
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Delete Account</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete "{account.name}"? This will permanently delete the account and all its transactions.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Asset Balance Modal */}
      <UpdateAssetBalanceModal
        isOpen={showUpdateAssetBalanceModal}
        onClose={() => setShowUpdateAssetBalanceModal(false)}
        account={account}
        onSuccess={() => {
          onAccountUpdated();
          setShowUpdateAssetBalanceModal(false);
        }}
      />
    </div>
  );
};

export default EditAccountModal; 