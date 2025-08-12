import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getAccessibleAccounts, 
  getAccountsByCategory,
  getTransactionsByAccountWithData,
  getTransactionsByAccountPaginated,
  getTransactionCount,
  updateTransaction,
  updateAccount,
  deleteTransaction,
  emergencyFixAccountBalances,
  isInitialBalanceTransaction,
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
import AccountTypesModal from '../components/AccountTypesModal';
import TagsModal from '../components/TagsModal';
import BulkTagModal from '../components/BulkTagModal';
import TagSelector from '../components/TagSelector';


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
          {(account.accountType === 'asset' || account.category === 'assets') && onUpdateValue && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateValue(account);
              }}
              className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
              title="Update Asset Value"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
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
  maxLength?: number;
}

const InlineEditableField: React.FC<InlineEditableFieldProps> = ({ value, onSave, className = "", maxLength = 50 }) => {
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

  // Truncate description if it's too long
  const shouldTruncate = value.length > maxLength;
  const displayText = shouldTruncate ? value.substring(0, maxLength) + '...' : value;

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`inline-editable cursor-pointer hover:bg-gray-100 px-2 py-0.5 rounded ${className}`}
      title={shouldTruncate ? `${value}\n\nClick to edit` : "Click to edit"}
    >
      {displayText}
    </span>
  );
};

// InlineEditableDate Component
interface InlineEditableDateProps {
  value?: string;
  onSave: (value: string) => void;
  className?: string;
}

const InlineEditableDate: React.FC<InlineEditableDateProps> = ({ value, onSave, className = "" }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');

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
      setEditValue(value || '');
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
        {value ? new Date(value).toLocaleDateString() : 'No Date'}
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
  isSelected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
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
  isSelected = false,
  onSelect,
  onDateUpdate,
  onAmountUpdate,
  onDescriptionUpdate,
  onTagsUpdate,
  onSplitTransaction,
  onLinkTransaction,
  onDeleteTransaction
}) => {
  const isInitialBalance = isInitialBalanceTransaction(transaction);
  
  return (
    <tr className={`transaction-row ${
      isSplit 
        ? 'split-row bg-blue-50 border-l-4 border-blue-300' 
        : isInitialBalance 
        ? 'bg-blue-50 border-l-4 border-l-blue-400'  // Special styling for initial balance
        : ''
    } hover:bg-gray-50 transition-colors`}>
      
      {/* Checkbox Cell */}
      <td className="px-4 py-2 text-sm">
        {!isInitialBalance && onSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(transaction.id, e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        )}
      </td>
      
      {/* Date Cell - Empty for initial balance */}
      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
        {isInitialBalance ? (
          <span></span>
        ) : (
          <InlineEditableDate
            value={transaction.date}
            onSave={(value) => onDateUpdate(transaction.id, value)}
          />
        )}
      </td>
      
      {/* Description Cell - Disable editing for initial balance */}
      <td className="px-4 py-2 text-sm text-gray-900">
        {isSplit && (
          <div className="flex items-center mb-1">
            <svg className="w-4 h-4 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-blue-800 font-medium text-xs">Split:</span>
          </div>
        )}
        {isInitialBalance ? (
          <span className="text-gray-600 italic text-sm">{transaction.description}</span>
        ) : (
          <InlineEditableField
            value={transaction.description}
            onSave={(value) => onDescriptionUpdate(transaction.id, value)}
            maxLength={40}
          />
        )}
      </td>
      
      {/* Tags Cell - Empty for initial balance */}
      <td className="px-4 py-2 text-sm">
        {isInitialBalance ? (
          <span></span>
        ) : (
          <InlineTagInput
            transactionId={transaction.id}
            selectedTags={tags}
            onTagsUpdate={onTagsUpdate}
          />
        )}
      </td>
      
      {/* Amount Cell - Enable editing for initial balance */}
      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
        <InlineEditableAmount
          value={transaction.amount}
          onSave={(value) => onAmountUpdate(transaction.id, value)}
        />
      </td>
      
      {/* Actions Cell - Hide actions for initial balance */}
      <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
        {!isInitialBalance ? (
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a0 0 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
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
        ) : (
          <span className="text-xs text-gray-400">System Transaction</span>
        )}
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
  totalTransactionCount: number;
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
  totalTransactionCount,
  onTransactionUpdate,
  onLinkTransaction,

  setSplittingTransaction,
  setShowSplitModal
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [showInlineAdd, setShowInlineAdd] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [pageTransactions, setPageTransactions] = useState<(Transaction & { id: string })[]>([]);
  const [pageTransactionTags, setPageTransactionTags] = useState<Record<string, Tag[]>>({});
  const [pageTransactionSplits, setPageTransactionSplits] = useState<Record<string, TransactionSplit[]>>({});
  
  // Filter states
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    description: '',
    descriptionMode: 'contains' as 'contains' | 'starts' | 'ends',
    tags: [] as string[],
    amountMin: '',
    amountMax: '',
    amountExact: ''
  });
  
  // Sort state
  const [sortConfig, setSortConfig] = useState({
    key: 'date' as keyof Transaction,
    direction: 'desc' as 'asc' | 'desc'
  });

  // Column filter visibility
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage] = useState(100);

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
    if (!user || !selectedAccount) return;
    try {
      // Find the transaction to check if it's an initial balance transaction
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return;
      
      // Update the transaction
      await updateTransaction(transactionId, { amount }, user.uid);
      
      // If this is an initial balance transaction, also update the account's initialBalance
      if (isInitialBalanceTransaction(transaction)) {
        console.log('🔄 Updating account initial balance to sync with transaction:', amount);
        
        // Calculate the balance difference
        const balanceDifference = amount - selectedAccount.initialBalance;
        const newBalance = selectedAccount.balance + balanceDifference;
        
        // Update the account
        await updateAccount(selectedAccount.id, {
          initialBalance: amount,
          balance: newBalance,
          updatedAt: Date.now(),
          ownerId: selectedAccount.ownerId
        });
        
        console.log('✅ Account initial balance synced successfully');
        
        // Reload accounts to reflect the updated balance
        await loadAccounts(user.uid);
      }
      
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

  // Bulk selection handlers
  const handleSelectTransaction = (transactionId: string, checked: boolean) => {
    const newSelected = new Set(selectedTransactions);
    if (checked) {
      newSelected.add(transactionId);
    } else {
      newSelected.delete(transactionId);
    }
    setSelectedTransactions(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all transactions on current page
      const currentPageIds = new Set(currentTransactions.map(t => t.id));
      setSelectedTransactions(currentPageIds);
      setShowBulkActions(true);
    } else {
      setSelectedTransactions(new Set());
      setShowBulkActions(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!user) return;
    if (window.confirm(`Are you sure you want to delete ${selectedTransactions.size} transactions?`)) {
      try {
        for (const transactionId of selectedTransactions) {
          await deleteTransaction(transactionId, user.uid);
        }
        setSelectedTransactions(new Set());
        setShowBulkActions(false);
        onTransactionUpdate();
      } catch (error) {
        console.error('Error deleting transactions:', error);
      }
    }
  };

  const handleBulkTag = () => {
    setShowBulkTagModal(true);
  };

  const handleBulkTagSuccess = () => {
    setShowBulkTagModal(false);
    setSelectedTransactions(new Set());
    setShowBulkActions(false);
    onTransactionUpdate();
  };

  // Use page-specific data if available, otherwise fall back to props
  const displayTransactions = pageTransactions.length > 0 ? pageTransactions : transactions;
  const displayTransactionTags = Object.keys(pageTransactionTags).length > 0 ? pageTransactionTags : transactionTags;
  const displayTransactionSplits = Object.keys(pageTransactionSplits).length > 0 ? pageTransactionSplits : transactionSplits;

  // Filter and sort transactions
  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = [...displayTransactions];
    
    // Apply filters
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(transaction => {
        const transactionDate = new Date(transaction.date);
        if (filters.dateFrom && filters.dateFrom.trim()) {
          const fromDate = new Date(filters.dateFrom);
          if (transactionDate < fromDate) return false;
        }
        if (filters.dateTo && filters.dateTo.trim()) {
          const toDate = new Date(filters.dateTo);
          if (transactionDate > toDate) return false;
        }
        return true;
      });
    }
    
    if (filters.description) {
      filtered = filtered.filter(transaction => {
        const desc = transaction.description.toLowerCase();
        const searchTerm = filters.description.toLowerCase();
        
        switch (filters.descriptionMode) {
          case 'contains':
            return desc.includes(searchTerm);
          case 'starts':
            return desc.startsWith(searchTerm);
          case 'ends':
            return desc.endsWith(searchTerm);
          default:
            return desc.includes(searchTerm);
        }
      });
    }
    
    if (filters.tags.length > 0) {
      filtered = filtered.filter(transaction => 
        transaction.tagIds && filters.tags.some(tagId => transaction.tagIds!.includes(tagId))
      );
    }
    
    if (filters.amountExact) {
      const amount = parseFloat(filters.amountExact);
      if (!isNaN(amount)) {
        filtered = filtered.filter(transaction => Math.abs(transaction.amount - amount) < 0.01);
      }
    } else {
      if (filters.amountMin) {
        const min = parseFloat(filters.amountMin);
        if (!isNaN(min)) {
          filtered = filtered.filter(transaction => transaction.amount >= min);
        }
      }
      if (filters.amountMax) {
        const max = parseFloat(filters.amountMax);
        if (!isNaN(max)) {
          filtered = filtered.filter(transaction => transaction.amount <= max);
        }
      }
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortConfig.key];
      let bValue: any = b[sortConfig.key];
      
      // Handle date sorting
      if (sortConfig.key === 'date') {
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
      }
      
      // Handle amount sorting
      if (sortConfig.key === 'amount') {
        aValue = Math.abs(a.amount);
        bValue = Math.abs(b.amount);
      }
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return filtered;
  }, [displayTransactions, filters, sortConfig]);

  // Pagination logic
  const totalPages = Math.ceil(totalTransactionCount / transactionsPerPage);
  const startIndex = (currentPage - 1) * transactionsPerPage;
  const endIndex = startIndex + transactionsPerPage;
  const currentTransactions = filteredAndSortedTransactions.slice(startIndex, endIndex);

  // Debug logging
  console.log('🔍 Pagination Debug:', {
    totalTransactions: totalTransactionCount,
    filteredTransactions: filteredAndSortedTransactions.length,
    transactionsPerPage,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
    currentTransactionsLength: currentTransactions.length
  });

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortConfig]);

  // Pagination functions
  const goToPage = async (page: number) => {
    const targetPage = Math.max(1, Math.min(page, totalPages));
    if (targetPage === currentPage) return;
    
    setCurrentPage(targetPage);
    
    // Load transactions for the new page if it's not the first page
    if (targetPage > 1 && user && selectedAccount) {
      await loadTransactionsForPage(user.uid, selectedAccount.id, targetPage);
    }
  };

  const goToNextPage = async () => {
    if (currentPage < totalPages) {
      await goToPage(currentPage + 1);
    }
  };

  const goToPreviousPage = async () => {
    if (currentPage > 1) {
      await goToPage(currentPage - 1);
    }
  };

  const handleSort = (key: keyof Transaction) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      description: '',
      descriptionMode: 'contains',
      tags: [],
      amountMin: '',
      amountMax: '',
      amountExact: ''
    });
  };

  const toggleColumnFilter = (column: string) => {
    if (activeFilterColumn === column) {
      setActiveFilterColumn(null);
    } else {
      setActiveFilterColumn(column);
    }
  };

  const closeAllFilters = () => {
    setActiveFilterColumn(null);
  };

  // Close filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeFilterColumn && !(event.target as Element).closest('th')) {
        setActiveFilterColumn(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeFilterColumn]);

  const loadTransactionsForPage = async (userId: string, accountId: string, page: number) => {
    try {
      setLoadingTransactions(true);
      console.log(`📄 Loading page ${page} for account ${accountId}`);
      
      // Calculate the offset for the page
      const offset = (page - 1) * transactionsPerPage;
      
      // For now, we'll load all transactions and slice them
      // In a production app, you'd implement proper server-side pagination
      const result = await getTransactionsByAccountWithData(userId, accountId);
      
      // Slice the transactions for the current page
      const startIndex = offset;
      const endIndex = startIndex + transactionsPerPage;
      const pageTransactions = result.transactions.slice(startIndex, endIndex);
      
      setPageTransactions(pageTransactions);
      setPageTransactionTags(result.tagsMap);
      setPageTransactionSplits(result.splitsMap);
      
      console.log(`✅ Loaded page ${page}: ${pageTransactions.length} transactions (${startIndex + 1}-${endIndex} of ${result.transactions.length})`);
    } catch (error) {
      console.error('Error loading transactions for page:', error);
    } finally {
      setLoadingTransactions(false);
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
                
              </th>
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
              <td colSpan={6} className="px-4 py-8 text-center">
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
                
              </th>
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
      {/* Loading Indicator */}
      {loadingTransactions && (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading transactions...</span>
        </div>
      )}
      {/* Filter Status Bar */}
      {(filters.dateFrom || filters.dateTo || filters.description || filters.tags.length > 0 || filters.amountMin || filters.amountMax || filters.amountExact) && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="flex justify-between items-center">
            <div className="text-sm text-blue-800">
              Filters active: {filteredAndSortedTransactions.length} of {transactions.length} transactions
              {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
            </div>
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {showBulkActions && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-blue-800">
                {selectedTransactions.size} transaction{selectedTransactions.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedTransactions(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Clear selection
              </button>
              {totalPages > 1 && (
                <button
                  onClick={() => {
                    const allIds = new Set(filteredAndSortedTransactions.map(t => t.id));
                    setSelectedTransactions(allIds);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Select all {filteredAndSortedTransactions.length} filtered transactions
                </button>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBulkTag}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                Add Tags
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
              >
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <input
                type="checkbox"
                checked={currentTransactions.length > 0 && currentTransactions.every(t => selectedTransactions.has(t.id))}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
              <div className="flex items-center justify-between">
                <div 
                  className="flex items-center space-x-1 cursor-pointer hover:bg-gray-100 px-1 py-1 rounded"
                  onClick={() => handleSort('date')}
                >
                  <span>Date</span>
                  {sortConfig.key === 'date' && (
                    <span className="text-blue-600">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggleColumnFilter('date')}
                  className={`p-1 rounded ${filters.dateFrom || filters.dateTo ? 'text-blue-600 bg-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Filter date"
                >
                  🔍
                </button>
              </div>
              
              {/* Date Filter Dropdown */}
              {activeFilterColumn === 'date' && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-10 min-w-64">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Date Range</span>
                      <button
                        onClick={() => setActiveFilterColumn(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="From"
                      />
                      <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="To"
                      />
                    </div>
                  </div>
                </div>
              )}
            </th>
            
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
              <div className="flex items-center justify-between">
                <div 
                  className="flex items-center space-x-1 cursor-pointer hover:bg-gray-100 px-1 py-1 rounded"
                  onClick={() => handleSort('description')}
                >
                  <span>Description</span>
                  {sortConfig.key === 'description' && (
                    <span className="text-blue-600">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggleColumnFilter('description')}
                  className={`p-1 rounded ${filters.description ? 'text-blue-600 bg-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Filter description"
                >
                  🔍
                </button>
              </div>
              
              {/* Description Filter Dropdown */}
              {activeFilterColumn === 'description' && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-10 min-w-64">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Description Search</span>
                      <button
                        onClick={() => setActiveFilterColumn(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                    <select
                      value={filters.descriptionMode}
                      onChange={(e) => setFilters(prev => ({ 
                        ...prev, 
                        descriptionMode: e.target.value as 'contains' | 'starts' | 'ends' 
                      }))}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="contains">Contains</option>
                      <option value="starts">Starts with</option>
                      <option value="ends">Ends with</option>
                    </select>
                    <input
                      type="text"
                      value={filters.description}
                      onChange={(e) => setFilters(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="Search description..."
                    />
                  </div>
                </div>
              )}
            </th>
            
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative">
              <div className="flex items-center justify-between">
                <span>Tags</span>
                <button
                  onClick={() => toggleColumnFilter('tags')}
                  className={`p-1 rounded ${filters.tags.length > 0 ? 'text-blue-600 bg-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Filter tags"
                >
                  🔍
                </button>
              </div>
              
              {/* Tags Filter Dropdown */}
              {activeFilterColumn === 'tags' && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-10 min-w-64">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Filter by Tags</span>
                      <button
                        onClick={() => setActiveFilterColumn(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                    <TagSelector
                      selectedTagIds={filters.tags}
                      onTagChange={(tagIds: string[]) => setFilters(prev => ({ ...prev, tags: tagIds }))}
                      placeholder="Select tags..."
                    />
                  </div>
                </div>
              )}
            </th>
            
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider relative">
              <div className="flex items-center justify-end justify-between">
                <div 
                  className="flex items-center space-x-1 cursor-pointer hover:bg-gray-100 px-1 py-1 rounded"
                  onClick={() => handleSort('amount')}
                >
                  <span>Amount</span>
                  {sortConfig.key === 'amount' && (
                    <span className="text-blue-600">
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggleColumnFilter('amount')}
                  className={`p-1 rounded ml-2 ${filters.amountMin || filters.amountMax || filters.amountExact ? 'text-blue-600 bg-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Filter amount"
                >
                  🔍
                </button>
              </div>
              
              {/* Amount Filter Dropdown */}
              {activeFilterColumn === 'amount' && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-10 min-w-64">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Amount Filter</span>
                      <button
                        onClick={() => setActiveFilterColumn(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="number"
                      value={filters.amountExact}
                      onChange={(e) => setFilters(prev => ({ 
                        ...prev, 
                        amountExact: e.target.value,
                        amountMin: '',
                        amountMax: ''
                      }))}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="Exact amount"
                      step="0.01"
                    />
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        value={filters.amountMin}
                        onChange={(e) => setFilters(prev => ({ 
                          ...prev, 
                          amountMin: e.target.value,
                          amountExact: ''
                        }))}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Min"
                        step="0.01"
                      />
                      <input
                        type="number"
                        value={filters.amountMax}
                        onChange={(e) => setFilters(prev => ({ 
                          ...prev, 
                          amountMax: e.target.value,
                          amountExact: ''
                        }))}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Max"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>
              )}
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
          {currentTransactions.map((transaction) => (
            <React.Fragment key={transaction.id}>
              {/* Main Transaction Row */}
              <TransactionRow
                transaction={transaction}
                isMain={true}
                tags={transactionTags[transaction.id] || []}
                isSelected={selectedTransactions.has(transaction.id)}
                onSelect={handleSelectTransaction}
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
                  isSelected={selectedTransactions.has(`${transaction.id}-split-${index}`)}
                  onSelect={handleSelectTransaction}
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

      {/* Pagination Controls */}
      {(
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center text-sm text-gray-700">
            <span>
              Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSortedTransactions.length)} of{' '}
              {filteredAndSortedTransactions.length} transactions
              {totalTransactionCount > filteredAndSortedTransactions.length && (
                <span className="text-gray-500">
                  {' '}({totalTransactionCount} total in account)
                </span>
              )}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {totalPages > 1 ? (
              <>
                {/* Previous Page Button */}
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-500"
                >
                  ← Previous
                </button>
                
                {/* Page Numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white border border-blue-600'
                            : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                {/* Next Page Button */}
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-500"
                >
                  Next →
                </button>
              </>
            ) : (
              <span className="text-sm text-gray-500">
                {totalTransactionCount > 100 
                  ? `Showing first 100 of ${totalTransactionCount} total transactions`
                  : `All ${totalTransactionCount} transactions shown on this page`
                }
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bulk Tag Modal */}
      <BulkTagModal
        isOpen={showBulkTagModal}
        onClose={() => setShowBulkTagModal(false)}
        onSuccess={handleBulkTagSuccess}
        selectedTransactions={Array.from(selectedTransactions).map(id => {
          const transaction = transactions.find(t => t.id === id);
          if (!transaction) return null;
          return transaction;
        }).filter(Boolean) as (Transaction & { id: string })[]}
      />
    </div>
  );
};

// Main FinancialHubSplitViewPage Component
const FinancialHubSplitViewPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountType = searchParams.get('type'); // 'family', 'personal', or null
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<(Transaction & { id: string })[]>([]);
  const [totalTransactionCount, setTotalTransactionCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedAccountForAssetUpdate, setSelectedAccountForAssetUpdate] = useState<Account | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<(Transaction & { id: string }) | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [transactionTags, setTransactionTags] = useState<Record<string, Tag[]>>({});
  const [transactionSplits, setTransactionSplits] = useState<Record<string, TransactionSplit[]>>({});
  
  // Collapse/expand state for account sections
  const [familyAccountsCollapsed, setFamilyAccountsCollapsed] = useState(false);
  const [personalAccountsCollapsed, setPersonalAccountsCollapsed] = useState(false);
  const [assetsAccountsCollapsed, setAssetsAccountsCollapsed] = useState(false);
  const [otherAccountsCollapsed, setOtherAccountsCollapsed] = useState(false);
  
  // Additional state variables that were removed
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [selectedAccountForSharing, setSelectedAccountForSharing] = useState<Account | null>(null);
  const [showLinkTransactionsModal, setShowLinkTransactionsModal] = useState(false);
  const [selectedTransactionForLinking, setSelectedTransactionForLinking] = useState<(Transaction & { id: string }) | null>(null);
  const [showUpdateAssetBalanceModal, setShowUpdateAssetBalanceModal] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [selectedAccountForEdit, setSelectedAccountForEdit] = useState<Account | null>(null);
  const [showAccountTypesModal, setShowAccountTypesModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        const initializeData = async () => {
          try {
            setLoading(true);
            
            // Run emergency fix automatically on first load (only once)
            const hasRunFix = localStorage.getItem(`emergency_fix_run_${user.uid}`);
            if (!hasRunFix) {
              console.log('🚨 Running automatic emergency fix...');
              await emergencyFixAccountBalances(user.uid);
              localStorage.setItem(`emergency_fix_run_${user.uid}`, 'true');
              console.log('✅ Emergency fix completed automatically');
            }
            
            
            // Load accounts after fixes
            await loadAccounts(user.uid);
          } catch (error) {
            console.error('❌ Error during initialization:', error);
          } finally {
            setLoading(false);
          }
        };
        
        initializeData();
      } else {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Reload accounts when accountType parameter changes
  useEffect(() => {
    if (user) {
      loadAccounts(user.uid);
    }
  }, [accountType, user]);

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
      
      // Get total transaction count first
      const totalCount = await getTransactionCount(userId, accountId);
      setTotalTransactionCount(totalCount);
      
      // Load first page of transactions
      const result = await getTransactionsByAccountPaginated(userId, accountId, 100);
      setTransactions(result.transactions);
      
      // Load related data for the transactions
      const fullResult = await getTransactionsByAccountWithData(userId, accountId);
      setTransactionTags(fullResult.tagsMap);
      setTransactionSplits(fullResult.splitsMap);
      
      console.log(`📊 Loaded ${result.transactions.length} of ${totalCount} total transactions`);
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
    navigate('/dashboard');
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



  // Calculate financial summary
  const familyAccounts = accounts.filter(account => account.category === 'family' && account.accountType !== 'asset');
  const personalAccounts = accounts.filter(account => account.category === 'personal' && account.accountType !== 'asset');
  
  // Asset accounts - filter by category based on URL parameters
  let assetAccounts = accounts.filter(account => account.category === 'assets' || account.accountType === 'asset');
  if (accountType === 'family') {
    assetAccounts = assetAccounts.filter(account => account.category === 'family');
  } else if (accountType === 'personal') {
    assetAccounts = assetAccounts.filter(account => account.category === 'personal');
  }
  
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

              {/* Management Buttons */}
              <div className="mb-4 space-y-2">
                <button 
                  onClick={() => setShowAccountTypesModal(true)}
                  className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center text-sm font-medium"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 00-2 2v2a2 2 0 002 2m0 0h14m-14 0v4a2 2 0 002 2h2a2 2 0 002-2v-4" />
                  </svg>
                  Account Types
                </button>

                <button 
                  onClick={() => setShowTagsModal(true)}
                  className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center text-sm font-medium"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Manage Tags
                </button>
              </div>

              {/* Account Type Filters */}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Filter Accounts</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate('/financial-hub')}
                    className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      !accountType 
                        ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All Accounts ({accounts.length})
                  </button>
                  
                  <button
                    onClick={() => navigate('/financial-hub?type=personal')}
                    className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      accountType === 'personal' 
                        ? 'bg-green-100 text-green-800 border border-green-300' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Personal ({accounts.filter(a => a.category === 'personal').length})
                  </button>
                  
                  <button
                    onClick={() => navigate('/financial-hub?type=family')}
                    className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      accountType === 'family' 
                        ? 'bg-purple-100 text-purple-800 border border-purple-300' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Family ({accounts.filter(a => a.category === 'family').length})
                  </button>
                </div>
              </div>

              {/* Family Accounts Section */}
              {familyAccounts.length > 0 && (
                <div>
                  <div 
                    className="flex items-center justify-between cursor-pointer mb-2"
                    onClick={() => setFamilyAccountsCollapsed(!familyAccountsCollapsed)}
                  >
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      👨‍👩‍👧‍👦 Family Accounts
                    </h4>
                    <svg 
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${familyAccountsCollapsed ? 'rotate-90' : '-rotate-90'}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {!familyAccountsCollapsed && (
                    <div className="space-y-1">
                      {familyAccounts.map(account => (
                        <AccountListItem 
                          key={account.id}
                          account={account}
                          isSelected={selectedAccountId === account.id}
                          onClick={() => setSelectedAccountId(account.id)}
                          onShare={handleShareAccount}
                          onEdit={handleEditAccount}
                          onUpdateValue={() => {
                            setSelectedAccountForAssetUpdate(account);
                            setShowUpdateAssetBalanceModal(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Personal Accounts Section */}
              {personalAccounts.length > 0 && (
                <div>
                  <div 
                    className="flex items-center justify-between cursor-pointer mb-2"
                    onClick={() => setPersonalAccountsCollapsed(!personalAccountsCollapsed)}
                  >
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      👤 Personal Accounts
                    </h4>
                    <svg 
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${personalAccountsCollapsed ? 'rotate-90' : '-rotate-90'}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {!personalAccountsCollapsed && (
                    <div className="space-y-1">
                      {personalAccounts.map(account => (
                        <AccountListItem 
                          key={account.id}
                          account={account}
                          isSelected={selectedAccountId === account.id}
                          onClick={() => setSelectedAccountId(account.id)}
                          onShare={handleShareAccount}
                          onEdit={handleEditAccount}
                          onUpdateValue={() => {
                            setSelectedAccountForAssetUpdate(account);
                            setShowUpdateAssetBalanceModal(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Assets Accounts Section */}
              {assetAccounts.length > 0 && (
                <div>
                  <div 
                    className="flex items-center justify-between cursor-pointer mb-2"
                    onClick={() => setAssetsAccountsCollapsed(!assetsAccountsCollapsed)}
                  >
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      🏠 Assets Accounts
                    </h4>
                    <svg 
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${assetsAccountsCollapsed ? 'rotate-90' : '-rotate-90'}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {!assetsAccountsCollapsed && (
                    <div className="space-y-1">
                      {assetAccounts.map(account => (
                          <AccountListItem 
                            key={account.id}
                            account={account}
                            isSelected={selectedAccountId === account.id}
                            onClick={() => setSelectedAccountId(account.id)}
                            onShare={handleShareAccount}
                            onEdit={handleEditAccount}
                            onUpdateValue={() => {
                              setSelectedAccountForAssetUpdate(account);
                              setShowUpdateAssetBalanceModal(true);
                            }}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Other Accounts (no specific category) */}
              {accounts.filter(account => 
                account.category !== 'family' && account.category !== 'personal' && account.category !== 'assets' && account.accountType !== 'asset'
              ).length > 0 && (
                <div>
                  <div 
                    className="flex items-center justify-between cursor-pointer mb-2"
                    onClick={() => setOtherAccountsCollapsed(!otherAccountsCollapsed)}
                  >
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      💼 Other Accounts
                    </h4>
                    <svg 
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${otherAccountsCollapsed ? 'rotate-90' : '-rotate-90'}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {!otherAccountsCollapsed && (
                    <div className="space-y-1">
                      {accounts
                        .filter(account => account.category !== 'family' && account.category !== 'personal' && account.category !== 'assets' && account.accountType !== 'asset')
                        .map(account => (
                          <AccountListItem
                            key={account.id}
                            account={account}
                            isSelected={selectedAccountId === account.id}
                            onClick={() => setSelectedAccountId(account.id)}
                            onShare={handleShareAccount}
                            onEdit={handleEditAccount}
                            onUpdateValue={() => {
                              setSelectedAccountForAssetUpdate(account);
                              setShowUpdateAssetBalanceModal(true);
                            }}
                          />
                        ))}
                    </div>
                  )}
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
                totalTransactionCount={totalTransactionCount}
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
    </div>
  );
};

export default FinancialHubSplitViewPage;
