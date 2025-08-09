import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getAccessibleAccounts, 
  getTransactionsByAccountWithData,
  updateTransaction,
  deleteTransaction,
  type Account, 
  type Transaction,
  type Tag,
  type TransactionSplit 
} from '../firebase/config';
import CreateAccountModal from '../components/CreateAccountModal';
import AddTransactionModal from '../components/AddTransactionModal';
import TagSelector from '../components/TagSelector';


// AccountListItem Component
interface AccountListItemProps {
  account: Account;
  isSelected: boolean;
  onClick: () => void;
}

const AccountListItem: React.FC<AccountListItemProps> = ({ account, isSelected, onClick }) => {
  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'BRL': return 'R$';
      case 'AUD': return 'A$';
      case 'GBP': return '£';
      case 'CAD': return 'C$';
      case 'JPY': return '¥';
      case 'CHF': return 'Fr';
      default: return '$';
    }
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'checking':
        return '🏦';
      case 'savings':
        return '💰';
      case 'investment':
        return '📈';
      case 'credit-card':
        return '💳';
      case 'mortgage':
        return '🏠';
      case 'auto-loan':
        return '🚗';
      default:
        return '💼';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'bg-blue-50 border-l-4 border-blue-500 shadow-sm'
          : 'bg-white hover:bg-gray-50 border border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1 min-w-0">
          <div className="text-lg mr-2">{getAccountTypeIcon(account.type)}</div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${
              isSelected ? 'text-blue-900' : 'text-gray-900'
            }`}>
              {account.name}
            </p>
            <p className="text-xs text-gray-500">{account.type.replace('-', ' ')}</p>
            {account.sharedWith.length > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mt-1">
                Shared
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${
            account.defaultSign === 'positive' 
              ? (account.balance >= 0 ? 'text-green-600' : 'text-red-600')
              : (account.balance <= 0 ? 'text-green-600' : 'text-red-600')
          }`}>
            {getCurrencySymbol(account.currency)}{Math.abs(account.balance).toLocaleString()}
          </p>
          {account.defaultSign === 'negative' && (
            <p className="text-xs text-gray-400">Liability</p>
          )}
        </div>
      </div>
    </div>
  );
};

// InlineEditableField Component
interface InlineEditableFieldProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}

const InlineEditableField: React.FC<InlineEditableFieldProps> = ({ value, onSave, className = "" }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    if (editValue.trim() !== value) {
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyPress}
        className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-gray-100 px-2 py-1 rounded ${className}`}
      title="Click to edit"
    >
      {value}
    </span>
  );
};

// TransactionRow Component
interface TransactionRowProps {
  transaction: Transaction & { id: string };
  isMain: boolean;
  isSplit?: boolean;
  splits?: TransactionSplit[];
  tags?: Tag[];
  onDescriptionUpdate: (id: string, description: string) => void;
  onTagsUpdate: (id: string, tags: string[]) => void;
  onSplitTransaction: (id: string) => void;
  onEditTransaction: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ 
  transaction, 
  isMain, 
  isSplit, 
  tags = [],
  onDescriptionUpdate,
  onTagsUpdate,
  onSplitTransaction,
  onEditTransaction,
  onDeleteTransaction
}) => {
  return (
    <tr className={`${isSplit ? 'opacity-60 bg-gray-25' : ''} hover:bg-gray-50`}>
      <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${
        isSplit ? 'pl-12' : ''
      }`}>
        {isSplit && <span className="mr-2 text-gray-400">↳</span>}
        {new Date(transaction.date).toLocaleDateString()}
      </td>
      
      <td className="px-6 py-4 text-sm text-gray-900">
        <InlineEditableField
          value={transaction.description}
          onSave={(value) => onDescriptionUpdate(transaction.id, value)}
        />
      </td>
      
      <td className="px-6 py-4 text-sm">
        <TagSelector
          selectedTagIds={tags.map(tag => tag.id)}
          onTagChange={(tagIds: string[]) => onTagsUpdate(transaction.id, tagIds)}
        />
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
        <span className={`font-medium ${
          transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
        }`}>
          {transaction.amount >= 0 ? '+' : ''}${Math.abs(transaction.amount).toLocaleString()}
        </span>
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center justify-end space-x-2">
          {isMain && (
            <button
              onClick={() => onSplitTransaction(transaction.id)}
              className="text-blue-600 hover:text-blue-900 text-xs px-2 py-1 rounded"
              title="Split transaction"
            >
              Split
            </button>
          )}
          <button
            onClick={() => onEditTransaction(transaction.id)}
            className="text-indigo-600 hover:text-indigo-900 text-xs px-2 py-1 rounded"
            title="Edit transaction"
          >
            Edit
          </button>
          <button
            onClick={() => onDeleteTransaction(transaction.id)}
            className="text-red-600 hover:text-red-900 text-xs px-2 py-1 rounded"
            title="Delete transaction"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
};

// TransactionTable Component
interface TransactionTableProps {
  transactions: (Transaction & { id: string })[];
  transactionTags: Record<string, Tag[]>;
  transactionSplits: Record<string, TransactionSplit[]>;
  onTransactionUpdate: () => void;
}

const TransactionTable: React.FC<TransactionTableProps> = ({ 
  transactions, 
  transactionTags,
  transactionSplits,
  onTransactionUpdate 
}) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return unsubscribe;
  }, []);

  const handleDescriptionUpdate = async (transactionId: string, description: string) => {
    if (!user) return;
    try {
      await updateTransaction(transactionId, { description }, user.uid);
      onTransactionUpdate();
    } catch (error) {
      console.error('Error updating transaction description:', error);
    }
  };

  const handleTagsUpdate = async (transactionId: string, tagIds: string[]) => {
    if (!user) return;
    try {
      await updateTransaction(transactionId, { tagIds }, user.uid);
      onTransactionUpdate();
    } catch (error) {
      console.error('Error updating transaction tags:', error);
    }
  };

  const handleSplitTransaction = (transactionId: string) => {
    // This would open the split modal - placeholder for now
    console.log('Split transaction:', transactionId);
  };

  const handleEditTransaction = (transactionId: string) => {
    // This would open the edit modal - placeholder for now
    console.log('Edit transaction:', transactionId);
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!user) return;
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await deleteTransaction(transactionId, user.uid);
        onTransactionUpdate();
      } catch (error) {
        console.error('Error deleting transaction:', error);
      }
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow text-center py-12">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Transactions</h3>
        <p className="text-gray-500">This account doesn't have any transactions yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tags
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {transactions.map((transaction) => (
            <React.Fragment key={transaction.id}>
              {/* Main Transaction Row */}
              <TransactionRow
                transaction={transaction}
                isMain={true}
                tags={transactionTags[transaction.id] || []}
                onDescriptionUpdate={handleDescriptionUpdate}
                onTagsUpdate={handleTagsUpdate}
                onSplitTransaction={handleSplitTransaction}
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={handleDeleteTransaction}
              />
              
              {/* Split Transaction Rows */}
              {transactionSplits[transaction.id]?.map((split, index) => (
                <TransactionRow
                  key={`${transaction.id}-split-${index}`}
                  transaction={{
                    ...split,
                    id: `${transaction.id}-split-${index}`,
                    accountId: transaction.accountId,
                    isManual: true,
                    source: 'manual' as const,
                    date: transaction.date, // Use parent transaction date
                    createdAt: transaction.createdAt,
                    updatedAt: transaction.updatedAt
                  }}
                  isMain={false}
                  isSplit={true}
                  tags={[]} // Split tags would need separate handling
                  onDescriptionUpdate={handleDescriptionUpdate}
                  onTagsUpdate={handleTagsUpdate}
                  onSplitTransaction={handleSplitTransaction}
                  onEditTransaction={handleEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Main FinancialHubSplitViewPage Component
const FinancialHubSplitViewPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionTags, setTransactionTags] = useState<Record<string, Tag[]>>({});
  const [transactionSplits, setTransactionSplits] = useState<Record<string, TransactionSplit[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);

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

  useEffect(() => {
    if (selectedAccountId && user) {
      const account = accounts.find(a => a.id === selectedAccountId);
      setSelectedAccount(account || null);
      if (account) {
        loadTransactions(user.uid, selectedAccountId);
      }
    } else {
      setSelectedAccount(null);
      setTransactions([]);
    }
  }, [selectedAccountId, accounts, user]);

  const loadAccounts = async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const accessibleAccounts = await getAccessibleAccounts(userId);
      setAccounts(accessibleAccounts);
      
      // Auto-select first account if available
      if (accessibleAccounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accessibleAccounts[0].id);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      setError('Failed to load accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (userId: string, accountId: string) => {
    try {
      setLoadingTransactions(true);
      const result = await getTransactionsByAccountWithData(userId, accountId);
      setTransactions(result.transactions);
      setTransactionTags(result.tagsMap);
      setTransactionSplits(result.splitsMap);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleAccountCreated = () => {
    setShowCreateModal(false);
    if (user) {
      loadAccounts(user.uid);
    }
  };

  const handleTransactionUpdate = () => {
    if (user && selectedAccountId) {
      loadTransactions(user.uid, selectedAccountId);
      loadAccounts(user.uid); // Refresh account balances
    }
  };

  const handleBackClick = () => {
    navigate('/financial-hub');
  };

  // Calculate financial summary
  const familyAccounts = accounts.filter(account => account.category === 'family');
  const personalAccounts = accounts.filter(account => account.category === 'personal');
  
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
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Financial Hub Split View</h2>
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
                    <span className="ml-2 text-lg font-medium text-purple-600">(Split View Test)</span>
                  </h1>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
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

      {/* Main Content - Split View */}
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Sidebar (30% width) */}
        <div className="w-[30%] bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
          {/* Net Worth Header */}
          <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
            <h3 className="text-sm font-medium text-gray-600">Total Net Worth</h3>
            <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${netWorth.toLocaleString()}
            </p>
            <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-200">
              <div>
                <p className="text-xs text-gray-500">Assets</p>
                <p className="text-sm font-semibold text-green-600">${totalAssets.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Liabilities</p>
                <p className="text-sm font-semibold text-red-600">${totalLiabilities.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600 text-sm">Loading accounts...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-500 text-4xl mb-2">❌</div>
              <p className="text-gray-600 text-sm mb-3">{error}</p>
              <button
                onClick={() => user && loadAccounts(user.uid)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Family Accounts Section */}
              {familyAccounts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    👨‍👩‍👧‍👦 Family Accounts
                  </h4>
                  <div className="space-y-1">
                    {familyAccounts.map(account => (
                      <AccountListItem 
                        key={account.id}
                        account={account}
                        isSelected={selectedAccountId === account.id}
                        onClick={() => setSelectedAccountId(account.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Personal Accounts Section */}
              {personalAccounts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    👤 Personal Accounts
                  </h4>
                  <div className="space-y-1">
                    {personalAccounts.map(account => (
                      <AccountListItem 
                        key={account.id}
                        account={account}
                        isSelected={selectedAccountId === account.id}
                        onClick={() => setSelectedAccountId(account.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other Accounts (no specific category) */}
              {accounts.filter(account => 
                account.category !== 'family' && account.category !== 'personal'
              ).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    💼 Other Accounts
                  </h4>
                  <div className="space-y-1">
                    {accounts
                      .filter(account => account.category !== 'family' && account.category !== 'personal')
                      .map(account => (
                        <AccountListItem 
                          key={account.id}
                          account={account}
                          isSelected={selectedAccountId === account.id}
                          onClick={() => setSelectedAccountId(account.id)}
                        />
                      ))}
                  </div>
                </div>
              )}

              {accounts.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-2">💰</div>
                  <h3 className="text-sm font-medium text-gray-800 mb-2">No accounts yet</h3>
                  <p className="text-xs text-gray-600 mb-4">Start by adding your first financial account</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    Add Account
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel (70% width) */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selectedAccount ? (
            <div>
              {/* Account Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">{selectedAccount.name}</h2>
                <p className="text-gray-600">
                  {selectedAccount.type.replace('-', ' ')} • Balance: 
                  <span className={`font-semibold ml-1 ${
                    selectedAccount.defaultSign === 'positive' 
                      ? (selectedAccount.balance >= 0 ? 'text-green-600' : 'text-red-600')
                      : (selectedAccount.balance <= 0 ? 'text-green-600' : 'text-red-600')
                  }`}>
                    ${Math.abs(selectedAccount.balance).toLocaleString()}
                  </span>
                  {selectedAccount.sharedWith.length > 0 && (
                    <span className="ml-2 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                      Shared with {selectedAccount.sharedWith.length} person(s)
                    </span>
                  )}
                </p>
              </div>

              {/* Add Transaction Button */}
              <div className="mb-4">
                <button
                  onClick={() => setShowAddTransactionModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Transaction
                </button>
              </div>

              {/* Transaction Table */}
              {loadingTransactions ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading transactions...</p>
                </div>
              ) : (
                <TransactionTable 
                  transactions={transactions}
                  transactionTags={transactionTags}
                  transactionSplits={transactionSplits}
                  onTransactionUpdate={handleTransactionUpdate}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Account</h3>
                <p className="text-gray-500">Choose an account from the sidebar to view its transactions</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Account Modal */}
      {showCreateModal && (
        <CreateAccountModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onAccountCreated={handleAccountCreated}
        />
      )}

      {/* Add Transaction Modal */}
      {showAddTransactionModal && selectedAccount && user && (
        <AddTransactionModal
          isOpen={showAddTransactionModal}
          onClose={() => setShowAddTransactionModal(false)}
          account={selectedAccount}
          onTransactionAdded={() => {
            setShowAddTransactionModal(false);
            handleTransactionUpdate();
          }}
        />
      )}
    </div>
  );
};

export default FinancialHubSplitViewPage;
