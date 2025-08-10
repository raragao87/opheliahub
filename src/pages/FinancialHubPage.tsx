import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAccessibleAccounts, getAccountsByCategory, type Account } from '../firebase/config';
import AccountCard from '../components/AccountCard';
import CreateAccountModal from '../components/CreateAccountModal';
import AccountTypesModal from '../components/AccountTypesModal';
import TagsModal from '../components/TagsModal';
import ImportModal from '../components/ImportModal';

const FinancialHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAccountTypesModal, setShowAccountTypesModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Get account type filter from URL
  const accountType = searchParams.get('type');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadAccounts(user.uid);
      } else {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const loadAccounts = async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      let accessibleAccounts: Account[];
      
      if (accountType === 'family' || accountType === 'personal') {
        // Load accounts filtered by type
        accessibleAccounts = await getAccountsByCategory(userId, accountType);
        console.log(`🔍 Loaded ${accountType} accounts:`, accessibleAccounts.length);
      } else {
        // Load all accessible accounts (default behavior)
        accessibleAccounts = await getAccessibleAccounts(userId);
        console.log('🔍 Loaded all accessible accounts:', accessibleAccounts.length);
      }
      
      setAccounts(accessibleAccounts);
    } catch (error) {
      console.error('Error loading accounts:', error);
      setError('Failed to load accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountCreated = () => {
    setShowCreateModal(false);
    if (user) {
      loadAccounts(user.uid);
    }
  };

  const handleImportComplete = () => {
    if (user) {
      loadAccounts(user.uid);
    }
  };

  const handleBackClick = () => {
    navigate('/dashboard');
  };

  const totalAssets = accounts
    .filter(account => account.defaultSign === 'positive')
    .reduce((sum, account) => sum + account.balance, 0);

  const totalLiabilities = accounts
    .filter(account => account.defaultSign === 'negative')
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);

  const netWorth = totalAssets - totalLiabilities;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">💰</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Financial Hub</h2>
          <p className="text-gray-600 mb-4">Please sign in to access your financial data</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={handleBackClick}
                className="mr-4 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center">
                <div className="text-2xl mr-3">💰</div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    Financial Hub
                    {accountType && (
                      <span className="ml-2 text-lg font-medium text-blue-600">
                        ({accountType === 'family' ? 'Family' : 'Personal'} Accounts)
                      </span>
                    )}
                  </h1>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => navigate('/financial-hub-split-test')}
                className="px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Test Split View
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import Transactions
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Financial Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Assets</p>
                <p className="text-2xl font-bold text-green-600">${totalAssets.toLocaleString()}</p>
              </div>
              <div className="text-2xl">📈</div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Liabilities</p>
                <p className="text-2xl font-bold text-red-600">${totalLiabilities.toLocaleString()}</p>
              </div>
              <div className="text-2xl">📉</div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Net Worth</p>
                <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${netWorth.toLocaleString()}
                </p>
              </div>
              <div className="text-2xl">💎</div>
            </div>
          </div>
        </div>

        {/* Accounts Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Your Accounts</h2>
                <p className="text-sm text-gray-600">
                  {accountType 
                    ? `${accountType === 'family' ? 'Family' : 'Personal'} accounts`
                    : 'Manage your financial accounts and track your balances'
                  }
                </p>
                {accountType && (
                  <div className="flex items-center mt-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {accountType === 'family' ? '👨‍👩‍👧‍👦 Family' : '👤 Personal'} Filter Active
                    </span>
                    <button
                      onClick={() => navigate('/financial-hub')}
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Clear Filter
                    </button>
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowAccountTypesModal(true)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Account Types
                </button>
                <button
                  onClick={() => {
                    console.log('🏷️ Tags button clicked');
                    setShowTagsModal(true);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Tags
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading accounts...</span>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="text-red-500 text-6xl mb-4">❌</div>
                <p className="text-gray-600 mb-4">{error}</p>
                <button
                  onClick={() => user && loadAccounts(user.uid)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Try Again
                </button>
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">💰</div>
                <h3 className="text-lg font-medium text-gray-800 mb-2">
                  {accountType 
                    ? `No ${accountType === 'family' ? 'family' : 'personal'} accounts found`
                    : 'No accounts yet'
                  }
                </h3>
                <p className="text-gray-600 mb-6">
                  {accountType 
                    ? `You don't have any ${accountType === 'family' ? 'family' : 'personal'} accounts yet.`
                    : 'Start by adding your first financial account'
                  }
                </p>
                <div className="space-x-3">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Add {accountType ? `${accountType === 'family' ? 'Family' : 'Personal'} ` : ''}Account
                  </button>
                  {accountType && (
                    <button
                      onClick={() => navigate('/financial-hub')}
                      className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      View All Accounts
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onUpdate={() => user && loadAccounts(user.uid)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Account Modal */}
      {showCreateModal && (
        <CreateAccountModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleAccountCreated}
        />
      )}

      {/* Account Types Management Modal */}
      {showAccountTypesModal && (
        <AccountTypesModal
          isOpen={showAccountTypesModal}
          onClose={() => setShowAccountTypesModal(false)}
        />
      )}
      
      {/* Tags Management Modal */}
      {showTagsModal && (
        <TagsModal
          isOpen={showTagsModal}
          onClose={() => setShowTagsModal(false)}
        />
      )}

      {/* Import Transactions Modal */}
      {showImportModal && user && (
        <ImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportComplete={handleImportComplete}
          accounts={accounts}
          userId={user.uid}
        />
      )}
    </div>
  );
};

export default FinancialHubPage; 