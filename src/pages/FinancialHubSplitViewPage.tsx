import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getAccessibleAccounts, 
  getTransactionsByAccountWithData,
  updateTransaction,
  deleteTransaction,
  migrateExistingAccountsToInitialBalance,
  type Account, 
  type Transaction,
  type Tag,
  type TransactionSplit 
} from '../firebase/config';
import CreateAccountModal from '../components/CreateAccountModal';
import EditAccountModal from '../components/EditAccountModal';

import InlineTagInput from '../components/InlineTagInput';
import SharingModal from '../components/SharingModal';
import EnhancedLinkTransactionsModal from '../components/EnhancedLinkTransactionsModal';
import ImportModal from '../components/ImportModal';
import InlineTransactionRow from '../components/InlineTransactionRow';
import InlineAddTransactionButton from '../components/InlineAddTransactionButton';
import UpdateAssetBalanceModal from '../components/UpdateAssetBalanceModal';
import SplitTransactionModal from '../components/SplitTransactionModal';


// AccountListItem Component
interface AccountListItemProps {
  account: Account;
  isSelected: boolean;
  onClick: () => void;
  onShare: (account: Account) => void;
  onEdit: (account: Account) => void;
  onUpdateValue?: (account: Account) => void;
}

const AccountListItem: React.FC<AccountListItemProps> = ({ account, isSelected, onClick, onShare, onEdit, onUpdateValue }) => {
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
      className={`account-list-item p-3 rounded-lg cursor-pointer transition-all duration-200 ${
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
        <div className="flex items-center space-x-2">
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
          
          {/* Share button */}
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent account selection
              onShare(account);
            }}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Share Account"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
          </button>

          {/* Update Value button */}
          {account.accountType === 'asset' && onUpdateValue && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateValue(account);
              }}
              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Update Account Value"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {/* Edit button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(account);
            }}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Edit Account"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
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
        className="w-full px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
    );
  }

  return (
          <span
        onClick={() => setIsEditing(true)}
        className={`inline-editable cursor-pointer hover:bg-gray-100 px-2 py-0.5 rounded ${className}`}
        title="Click to edit"
      >
      {value}
    </span>
  );
};

// InlineEditableDate Component
interface InlineEditableDateProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}

const InlineEditableDate: React.FC<InlineEditableDateProps> = ({ value, onSave, className = "" }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    if (editValue !== value) {
      onSave(editValue);
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
        type="date"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyPress}
        className="w-full px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
    );
  }

  return (
    <div className="group">
      <span
        onClick={() => setIsEditing(true)}
        className={`inline-editable cursor-pointer hover:bg-gray-100 px-2 py-0.5 rounded group-hover:bg-gray-50 transition-colors ${className}`}
        title="Click to edit date"
      >
        {new Date(value).toLocaleDateString()}
      </span>
    </div>
  );
};

// InlineEditableAmount Component
interface InlineEditableAmountProps {
  value: number;
  onSave: (value: number) => void;
  className?: string;
}

const InlineEditableAmount: React.FC<InlineEditableAmountProps> = ({ value, onSave, className = "" }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  const handleSave = () => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue) && numValue !== value) {
      onSave(numValue);
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value.toString());
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="number"
        step="0.01"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyPress}
        className="w-full px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
        autoFocus
      />
    );
  }

  return (
    <div className="group">
      <span
        onClick={() => setIsEditing(true)}
        className={`inline-editable cursor-pointer hover:bg-gray-100 px-2 py-0.5 rounded font-medium group-hover:bg-gray-50 transition-colors ${
          value >= 0 ? 'text-green-600' : 'text-red-600'
        } ${className}`}
        title="Click to edit amount"
      >
        {value >= 0 ? '+' : ''}${Math.abs(value).toLocaleString()}
      </span>
    </div>
  );
};

// TransactionRow Component
interface TransactionRowProps {
  transaction: Transaction & { id: string };
  isMain: boolean;
  isSplit?: boolean;
  splits?: TransactionSplit[];
  tags?: Tag[];
  onDateUpdate: (id: string, date: string) => void;
  onAmountUpdate: (id: string, amount: number) => void;
  onDescriptionUpdate: (id: string, description: string) => void;
  onTagsUpdate: (id: string, tags: string[]) => void;
  onSplitTransaction: (id: string) => void;
  onLinkTransaction: (transaction: Transaction & { id: string }) => void;
  onDeleteTransaction: (id: string) => void;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ 
  transaction, 
  isMain, 
  isSplit, 
  tags = [],
  onDateUpdate,
  onAmountUpdate,
  onDescriptionUpdate,
  onTagsUpdate,
  onSplitTransaction,
  onLinkTransaction,
  onDeleteTransaction
}) => {
  return (
    <tr className={`transaction-row ${
      isSplit 
        ? 'split-row bg-blue-50 border-l-4 border-blue-300' 
        : ''
    } hover:bg-gray-50 transition-colors`}>
      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
        <InlineEditableDate
          value={transaction.date}
          onSave={(value) => onDateUpdate(transaction.id, value)}
        />
      </td>
      
      <td className="px-4 py-2 text-sm text-gray-900">
        {isSplit && (
          <div className="flex items-center mb-1">
            <svg className="w-4 h-4 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-blue-800 font-medium text-xs">Split:</span>
          </div>
        )}
        <InlineEditableField
          value={transaction.description}
          onSave={(value) => onDescriptionUpdate(transaction.id, value)}
        />
      </td>
      
      <td className="px-4 py-2 text-sm">
        <InlineTagInput
          transactionId={transaction.id}
          selectedTags={tags}
          onTagsUpdate={onTagsUpdate}
        />
      </td>
      
      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
        <InlineEditableAmount
          value={transaction.amount}
          onSave={(value) => onAmountUpdate(transaction.id, value)}
        />
      </td>
      
      <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center justify-end space-x-2">
          {isMain && (
            <>
              {/* Split button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSplitTransaction(transaction.id);
                }}
                className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                title="Split Transaction"
              >
                ✂️
              </button>

              {/* Link button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkTransaction(transaction);
                }}
                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title="Link Transaction"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </>
          )}
          
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteTransaction(transaction.id);
            }}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete Transaction"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
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
  selectedAccount: Account;
  onTransactionUpdate: () => void;
  onLinkTransaction: (transaction: Transaction & { id: string }) => void;
  splittingTransaction: Transaction & { id: string } | null;
  setSplittingTransaction: (transaction: Transaction & { id: string } | null) => void;
  setShowSplitModal: (show: boolean) => void;
}

const TransactionTable: React.FC<TransactionTableProps> = ({ 
  transactions, 
  transactionTags,
  transactionSplits,
  selectedAccount,
  onTransactionUpdate,
  onLinkTransaction,

  setSplittingTransaction,
  setShowSplitModal
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [showInlineAdd, setShowInlineAdd] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return unsubscribe;
  }, []);

  const handleDateUpdate = async (transactionId: string, date: string) => {
    if (!user) return;
    try {
      await updateTransaction(transactionId, { date }, user.uid);
      onTransactionUpdate();
    } catch (error) {
      console.error('Error updating transaction date:', error);
    }
  };

  const handleAmountUpdate = async (transactionId: string, amount: number) => {
    if (!user) return;
    try {
      await updateTransaction(transactionId, { amount }, user.uid);
      onTransactionUpdate();
    } catch (error) {
      console.error('Error updating transaction amount:', error);
    }
  };

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
    const transaction = transactions.find(t => t.id === transactionId);
    if (transaction) {
      setSplittingTransaction(transaction);
      setShowSplitModal(true);
    }
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

  const handleInlineTransactionCreated = () => {
    setShowInlineAdd(false);
    onTransactionUpdate();
  };

  const handleCancelInlineAdd = () => {
    setShowInlineAdd(false);
  };

  if (transactions.length === 0 && !showInlineAdd) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <InlineAddTransactionButton onClick={() => setShowInlineAdd(true)} />
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center">
                <div className="text-gray-500">
                  <div className="text-3xl mb-3">📊</div>
                  <h3 className="text-base font-medium text-gray-900 mb-2">No transactions yet</h3>
                  <p className="text-gray-500 mb-3">Get started by adding your first transaction</p>
                  <button
                    onClick={() => setShowInlineAdd(true)}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    Add First Transaction
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (transactions.length === 0 && showInlineAdd) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <InlineTransactionRow
              accountId={selectedAccount.id}
              onTransactionCreated={handleInlineTransactionCreated}
              onCancel={handleCancelInlineAdd}
            />
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Description
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tags
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {/* Inline Add Transaction Row */}
          {showInlineAdd ? (
            <InlineTransactionRow
              accountId={selectedAccount.id}
              onTransactionCreated={handleInlineTransactionCreated}
              onCancel={handleCancelInlineAdd}
            />
          ) : (
            <InlineAddTransactionButton onClick={() => setShowInlineAdd(true)} />
          )}

          {/* Existing Transactions */}
          {transactions.map((transaction) => (
            <React.Fragment key={transaction.id}>
              {/* Main Transaction Row */}
              <TransactionRow
                transaction={transaction}
                isMain={true}
                tags={transactionTags[transaction.id] || []}
                onDateUpdate={handleDateUpdate}
                onAmountUpdate={handleAmountUpdate}
                onDescriptionUpdate={handleDescriptionUpdate}
                onTagsUpdate={handleTagsUpdate}
                onSplitTransaction={handleSplitTransaction}
                onLinkTransaction={onLinkTransaction}
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
                  onDateUpdate={handleDateUpdate}
                  onAmountUpdate={handleAmountUpdate}
                  onDescriptionUpdate={handleDescriptionUpdate}
                  onTagsUpdate={handleTagsUpdate}
                  onSplitTransaction={handleSplitTransaction}
                  onLinkTransaction={onLinkTransaction}
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
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [selectedAccountForSharing, setSelectedAccountForSharing] = useState<Account | null>(null);
  const [showLinkTransactionsModal, setShowLinkTransactionsModal] = useState(false);
  const [selectedTransactionForLinking, setSelectedTransactionForLinking] = useState<(Transaction & { id: string }) | null>(null);
  const [showUpdateAssetBalanceModal, setShowUpdateAssetBalanceModal] = useState(false);
  const [selectedAccountForAssetUpdate, setSelectedAccountForAssetUpdate] = useState<Account | null>(null);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [selectedAccountForEdit, setSelectedAccountForEdit] = useState<Account | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splittingTransaction, setSplittingTransaction] = useState<(Transaction & { id: string }) | null>(null);


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

  const handleShareAccount = (account: Account) => {
    setSelectedAccountForSharing(account);
    setShowSharingModal(true);
  };

  const handleEditAccount = (account: Account) => {
    setSelectedAccountForEdit(account);
    setShowEditAccountModal(true);
  };

  const handleLinkTransaction = (transaction: Transaction & { id: string }) => {
    setSelectedTransactionForLinking(transaction);
    setShowLinkTransactionsModal(true);
  };

  const handleImportComplete = () => {
    if (user && selectedAccount) {
      loadTransactions(user.uid, selectedAccount.id);
      loadAccounts(user.uid); // Refresh account balances
    }
    setShowImportModal(false);
  };

  const handleUpdateAssetBalance = async () => {
    if (!user) return;
    try {
      // The actual update is handled by the UpdateAssetBalanceModal
      // This function is called after the modal completes successfully
      setShowUpdateAssetBalanceModal(false);
      setSelectedAccountForAssetUpdate(null);
      // Refresh accounts to show updated balances
      loadAccounts(user.uid);
    } catch (error) {
      console.error('Error updating asset balance:', error);
    }
  };

  const handleRefreshBalances = async () => {
    if (!user) return;
    try {
      await loadAccounts(user.uid);
    } catch (error) {
      console.error('Error refreshing balances:', error);
    }
  };

  const handleMigrateInitialBalances = async () => {
    if (!user) return;
    try {
      console.log('🔄 Starting migration of initial balances...');
      await migrateExistingAccountsToInitialBalance(user.uid);
      console.log('✅ Migration completed successfully');
      
      // Refresh accounts to show any updated data
      await loadAccounts(user.uid);
      
      // Show success message
      alert('Migration completed! Initial balance transactions have been created for existing accounts.');
    } catch (error) {
      console.error('❌ Error during migration:', error);
      alert(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
      {/* Custom Styles for Enhanced Visual Feedback */}
      <style>{`
        .inline-editable {
          transition: all 0.2s ease-in-out;
        }
        .inline-editable:hover {
          background-color: rgba(243, 244, 246, 0.5);
          border-radius: 4px;
        }
        .split-row {
          position: relative;
        }
        .split-row::before {
          content: '';
          position: absolute;
          left: 3rem;
          top: 0;
          width: 1px;
          height: 100%;
          background-color: rgba(209, 213, 219, 0.5);
        }
        .account-list-item {
          transition: all 0.2s ease-in-out;
        }
        .account-list-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .transaction-row {
          transition: all 0.15s ease-in-out;
        }
        .transaction-row:hover {
          background-color: rgba(249, 250, 251, 0.8);
        }
      `}</style>
      
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
              {/* Action Buttons */}
              <div className="mb-4 flex items-center gap-2">
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center text-sm font-medium"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Account
                </button>
                
                <button 
                  onClick={handleRefreshBalances}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
                  title="Refresh Balances"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* Migration Button - Hidden as no longer needed */}
              {/* <div className="mb-4">
                <button 
                  onClick={handleMigrateInitialBalances}
                  className="w-full px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center justify-center text-sm font-medium"
                  title="Create initial balance transactions for existing accounts"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Migrate Initial Balances
                </button>
              </div> */}

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
                        onShare={handleShareAccount}
                        onEdit={handleEditAccount}
                        onUpdateValue={() => setSelectedAccountForAssetUpdate(account)}
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
                        onShare={handleShareAccount}
                        onEdit={handleEditAccount}
                        onUpdateValue={() => setSelectedAccountForAssetUpdate(account)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Assets Accounts Section */}
              {accounts.filter(account => account.accountType === 'asset').length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    🏠 Assets Accounts
                  </h4>
                  <div className="space-y-1">
                    {accounts
                      .filter(account => account.accountType === 'asset')
                      .map(account => (
                        <AccountListItem 
                          key={account.id}
                          account={account}
                          isSelected={selectedAccountId === account.id}
                          onClick={() => setSelectedAccountId(account.id)}
                          onShare={handleShareAccount}
                          onEdit={handleEditAccount}
                          onUpdateValue={() => setSelectedAccountForAssetUpdate(account)}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Other Accounts (no specific category) */}
              {accounts.filter(account => 
                account.category !== 'family' && account.category !== 'personal' && account.accountType !== 'asset'
              ).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    💼 Other Accounts
                  </h4>
                  <div className="space-y-1">
                    {accounts
                      .filter(account => account.category !== 'family' && account.category !== 'personal' && account.accountType !== 'asset')
                      .map(account => (
                        <AccountListItem 
                          key={account.id}
                          account={account}
                          isSelected={selectedAccountId === account.id}
                          onClick={() => setSelectedAccountId(account.id)}
                          onShare={handleShareAccount}
                          onEdit={handleEditAccount}
                          onUpdateValue={() => setSelectedAccountForAssetUpdate(account)}
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

              {/* Action Buttons */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Import Transactions
                  </button>
                </div>
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
                selectedAccount={selectedAccount}
                onTransactionUpdate={handleTransactionUpdate}
                onLinkTransaction={handleLinkTransaction}
                splittingTransaction={splittingTransaction}
                setSplittingTransaction={setSplittingTransaction}
                setShowSplitModal={setShowSplitModal}
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
          onSuccess={handleAccountCreated}
        />
      )}

      {/* Import Modal */}
      {showImportModal && user && (
        <ImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportComplete={handleImportComplete}
          accounts={accounts}
          userId={user.uid}
        />
      )}

      {/* Sharing Modal */}
      {showSharingModal && selectedAccountForSharing && (
        <SharingModal
          isOpen={showSharingModal}
          onClose={() => {
            setShowSharingModal(false);
            setSelectedAccountForSharing(null);
            loadAccounts(user?.uid || ''); // Refresh accounts after sharing
          }}
          itemId={selectedAccountForSharing.id}
          itemName={selectedAccountForSharing.name}
          itemType="account"
        />
      )}

      {/* Enhanced Link Transactions Modal */}
      {showLinkTransactionsModal && selectedTransactionForLinking && selectedAccount && (
        <EnhancedLinkTransactionsModal
          isOpen={showLinkTransactionsModal}
          onClose={() => {
            setShowLinkTransactionsModal(false);
            setSelectedTransactionForLinking(null);
          }}
          transaction={selectedTransactionForLinking}
          currentAccount={selectedAccount}
          allAccounts={accounts}
          onTransactionLinked={() => {
            if (user && selectedAccount) {
              loadTransactions(user.uid, selectedAccount.id);
            }
            setShowLinkTransactionsModal(false);
            setSelectedTransactionForLinking(null);
          }}
        />
      )}

      {/* Update Asset Balance Modal */}
      {showUpdateAssetBalanceModal && selectedAccountForAssetUpdate && (
        <UpdateAssetBalanceModal
          isOpen={showUpdateAssetBalanceModal}
          onClose={() => {
            setShowUpdateAssetBalanceModal(false);
            setSelectedAccountForAssetUpdate(null);
          }}
          account={selectedAccountForAssetUpdate}
          onSuccess={handleUpdateAssetBalance}
        />
      )}

      {/* Edit Account Modal */}
      {showEditAccountModal && selectedAccountForEdit && (
        <EditAccountModal
          isOpen={showEditAccountModal}
          onClose={() => {
            setShowEditAccountModal(false);
            setSelectedAccountForEdit(null);
          }}
          account={selectedAccountForEdit}
          onAccountUpdated={() => {
            setShowEditAccountModal(false);
            setSelectedAccountForEdit(null);
            if (user) {
              loadAccounts(user.uid);
            }
          }}
        />
      )}

      {/* Split Transaction Modal */}
      {showSplitModal && splittingTransaction && (
        <SplitTransactionModal
          isOpen={showSplitModal}
          onClose={() => {
            setShowSplitModal(false);
            setSplittingTransaction(null);
          }}
          transaction={splittingTransaction}
          onSuccess={() => {
            setShowSplitModal(false);
            setSplittingTransaction(null);
            if (user && selectedAccount) {
              loadTransactions(user.uid, selectedAccount.id);
            }
          }}
        />
      )}
    </div>
  );
};

export default FinancialHubSplitViewPage;
