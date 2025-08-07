import React, { useState, useEffect, useMemo } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getTransactionsByAccount, updateTransaction, deleteTransaction, getTransactionTags, getTransactionSplits, getTags, getDefaultTags, forceUpdateAccountBalance, type Account, type Transaction } from '../firebase/config';
import EditAccountModal from './EditAccountModal';
import AddTransactionModal from './AddTransactionModal';
import TagSelector from './TagSelector';
import BulkTagModal from './BulkTagModal';
import SplitTransactionModal from './SplitTransactionModal';

interface AccountDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account;
  onUpdate: () => void;
}

const AccountDetailsModal: React.FC<AccountDetailsModalProps> = ({
  isOpen,
  onClose,
  account,
  onUpdate
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<string | null>(null);
  const [editingTransactionTags, setEditingTransactionTags] = useState<string[]>([]);
  const [transactionTags, setTransactionTags] = useState<Record<string, any[]>>({});
  const [transactionSplits, setTransactionSplits] = useState<Record<string, any[]>>({});
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  
  // Bulk selection state
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);

  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  
  // Filter state
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<string>('all');
  const [transactionType, setTransactionType] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOpen && user && account) {
      loadTransactions();
    }
  }, [isOpen, user, account]);

  const loadTransactions = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      const accountTransactions = await getTransactionsByAccount(user.uid, account.id);
      setTransactions(accountTransactions);
      
      // Load tags and splits for all transactions
      const tagsMap: Record<string, any[]> = {};
      const splitsMap: Record<string, any[]> = {};
      
      // Load all available tags for split tag matching
      const allTags = await getTags(user.uid);
      const defaultTags = getDefaultTags();
      const tagMap = new Map();
      defaultTags.forEach(tag => tagMap.set(tag.id, tag));
      allTags.forEach(tag => tagMap.set(tag.id, tag));
      const availableTags = Array.from(tagMap.values());
      setAvailableTags(availableTags);
      
      for (const transaction of accountTransactions) {
        try {
          // Load tags
          const tags = await getTransactionTags(transaction.id, user.uid);
          tagsMap[transaction.id] = tags;
          
          // Load splits if transaction is split
          if (transaction.isSplit) {
            const splits = await getTransactionSplits(transaction.id, user.uid);
            splitsMap[transaction.id] = splits;
          }
        } catch (error) {
          console.error('Error loading data for transaction:', transaction.id, error);
          tagsMap[transaction.id] = [];
          splitsMap[transaction.id] = [];
        }
      }
      setTransactionTags(tagsMap);
      setTransactionSplits(splitsMap);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTransactionIcon = (amount: number) => {
    return amount >= 0 ? '📈' : '📉';
  };

  const getTransactionColor = (amount: number) => {
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const calculateBalanceChange = () => {
    const change = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    console.log('🔢 Balance Calculation Debug:', {
      initialBalance: account.initialBalance,
      transactions: transactions.map(t => ({ id: t.id, amount: t.amount, description: t.description })),
      calculatedChange: change,
      expectedCurrentBalance: account.initialBalance + change,
      actualCurrentBalance: account.balance,
      difference: (account.initialBalance + change) - account.balance
    });
    return change;
  };

  const handleRefreshBalance = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log('🔄 Manual balance refresh requested');
      
      // Force update account balance in Firestore
      await forceUpdateAccountBalance(user.uid, account.id);
      
      // Reload transactions to ensure we have the latest data
      await loadTransactions();
      
      console.log('✅ Manual balance refresh completed');
    } catch (error) {
      console.error('❌ Error refreshing balance:', error);
      setError('Failed to refresh balance');
    } finally {
      setLoading(false);
    }
  };

  // Bulk selection functions
  const handleTransactionSelect = (transactionId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedTransactions(prev => [...prev, transactionId]);
    } else {
      setSelectedTransactions(prev => prev.filter(id => id !== transactionId));
    }
  };

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedTransactions(filteredTransactions.map(t => t.id));
    } else {
      setSelectedTransactions([]);
    }
  };

  const clearSelection = () => {
    setSelectedTransactions([]);
  };

  const handleBulkTagging = () => {
    setShowBulkTagModal(true);
  };

  const handleBulkTagSuccess = async () => {
    // Reload transactions to show updated tags
    await loadTransactions();
    // Force update account balance
    if (user) {
      await forceUpdateAccountBalance(user.uid, account.id);
    }
    // Clear selection
    clearSelection();
  };

  const handleSplitTransaction = (transaction: Transaction) => {
    setSplittingTransaction(transaction);
    setShowSplitModal(true);
  };

  const handleSplitSuccess = async () => {
    await loadTransactions();
    if (user) {
      await forceUpdateAccountBalance(user.uid, account.id);
    }
    setShowSplitModal(false);
    setSplittingTransaction(null);
  };

  // Filter functions
  const handleTagFilterClick = (tagId: string) => {
    if (selectedFilterTags.includes(tagId)) {
      setSelectedFilterTags(prev => prev.filter(id => id !== tagId));
    } else {
      setSelectedFilterTags(prev => [...prev, tagId]);
    }
  };

  const clearAllFilters = () => {
    setSelectedFilterTags([]);
    setDateRange('all');
    setTransactionType('all');
    setSearchText('');
    setMinAmount('');
    setMaxAmount('');
  };

  const getDateRangeFilter = (transaction: Transaction) => {
    const transactionDate = new Date(transaction.date);
    const now = new Date();
    
    switch (dateRange) {
      case 'this-month':
        return transactionDate.getMonth() === now.getMonth() && 
               transactionDate.getFullYear() === now.getFullYear();
      case 'last-month':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
        return transactionDate.getMonth() === lastMonth.getMonth() && 
               transactionDate.getFullYear() === lastMonth.getFullYear();
      case 'last-3-months':
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3);
        return transactionDate >= threeMonthsAgo;
      case 'this-year':
        return transactionDate.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  };

  const getAmountRangeFilter = (transaction: Transaction) => {
    const amount = transaction.amount;
    const min = minAmount ? parseFloat(minAmount) : -Infinity;
    const max = maxAmount ? parseFloat(maxAmount) : Infinity;
    return amount >= min && amount <= max;
  };

  const getTransactionTypeFilter = (transaction: Transaction) => {
    switch (transactionType) {
      case 'income':
        return transaction.amount > 0;
      case 'expense':
        return transaction.amount < 0;
      case 'manual':
        return transaction.isManual;
      case 'imported':
        return !transaction.isManual;
      default:
        return true;
    }
  };

  const getSearchTextFilter = (transaction: Transaction) => {
    if (!searchText.trim()) return true;
    return transaction.description.toLowerCase().includes(searchText.toLowerCase());
  };

  const getTagFilter = (transaction: Transaction) => {
    if (selectedFilterTags.length === 0) return true;
    const transactionTagIds = transaction.tagIds || [];
    return selectedFilterTags.some(tagId => transactionTagIds.includes(tagId));
  };

  // Filtered transactions using useMemo for performance
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      return getDateRangeFilter(transaction) &&
             getAmountRangeFilter(transaction) &&
             getTransactionTypeFilter(transaction) &&
             getSearchTextFilter(transaction) &&
             getTagFilter(transaction);
    });
  }, [transactions, dateRange, minAmount, maxAmount, transactionType, searchText, selectedFilterTags]);

  const handleBulkDelete = async () => {
    if (!user || selectedTransactions.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedTransactions.length} transactions? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('🗑️ Bulk deleting transactions:', selectedTransactions);
      
      // Delete each transaction
      for (const transactionId of selectedTransactions) {
        await deleteTransaction(transactionId, user.uid);
      }
      
      // Force update account balance
      await forceUpdateAccountBalance(user.uid, account.id);
      
      // Reload transactions
      await loadTransactions();
      
      // Clear selection
      clearSelection();
      
      console.log('✅ Bulk delete completed');
    } catch (error) {
      console.error('❌ Error bulk deleting transactions:', error);
      setError('Failed to delete transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTransaction = async (transaction: Transaction) => {
    setEditingTransaction(transaction);
    // Load current tags for this transaction
    if (user) {
      try {
        const tags = await getTransactionTags(transaction.id, user.uid);
        setEditingTransactionTags(tags.map(tag => tag.id));
      } catch (error) {
        console.error('Error loading transaction tags:', error);
        setEditingTransactionTags([]);
      }
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!user) return;
    
    try {
      setDeletingTransaction(transactionId);
      
      // Get the transaction to calculate balance adjustment
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return;
      
      // Delete the transaction
      await deleteTransaction(transactionId, user.uid);
      
      // Force update account balance
      await forceUpdateAccountBalance(user.uid, account.id);
      console.log('✅ Account balance force updated after transaction deletion');
      
      // Reload transactions (don't call onUpdate to avoid modal closing)
      await loadTransactions();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      setError('Failed to delete transaction');
    } finally {
      setDeletingTransaction(null);
    }
  };

  const handleUpdateTransaction = async (transactionId: string, updatedData: Partial<Transaction>) => {
    if (!user) return;
    
    try {
      await updateTransaction(transactionId, updatedData, user.uid);
      
      // Force update account balance
      await forceUpdateAccountBalance(user.uid, account.id);
      console.log('✅ Account balance force updated after transaction edit');
      
      // Reload transactions (don't call onUpdate to avoid modal closing)
      await loadTransactions();
      
      setEditingTransaction(null);
    } catch (error) {
      console.error('Error updating transaction:', error);
      setError('Failed to update transaction');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">💰</div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Account Details</h2>
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

        {/* Account Summary */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Current Balance</p>
                  <p className={`text-2xl font-bold ${account.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(account.balance)}
                  </p>
                </div>
                <button
                  onClick={handleRefreshBalance}
                  disabled={loading}
                  className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                  title="Refresh balance"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-600">Initial Balance</p>
              <p className="text-2xl font-bold text-gray-800">
                {formatCurrency(account.initialBalance)}
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-600">Balance Change</p>
              <p className={`text-2xl font-bold ${getTransactionColor(calculateBalanceChange())}`}>
                {formatCurrency(calculateBalanceChange())}
              </p>
            </div>
          </div>
        </div>

        {/* Transactions Section */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <h3 className="text-lg font-semibold text-gray-800">Transaction History</h3>
              {transactions.length > 0 && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedTransactions.length === filteredTransactions.length && filteredTransactions.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">Select All</span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-sm text-gray-500">
                {filteredTransactions.length} of {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                {showFilters ? 'Hide' : 'Show'} Filters
              </button>
            </div>
          </div>

          {/* Filter Controls */}
          {showFilters && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search descriptions..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Time</option>
                    <option value="this-month">This Month</option>
                    <option value="last-month">Last Month</option>
                    <option value="last-3-months">Last 3 Months</option>
                    <option value="this-year">This Year</option>
                  </select>
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="manual">Manual</option>
                    <option value="imported">Imported</option>
                  </select>
                </div>

                {/* Amount Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Amount</label>
                  <input
                    type="number"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="Min amount..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Amount</label>
                  <input
                    type="number"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="Max amount..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Tag Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Tags</label>
                  <TagSelector
                    selectedTagIds={selectedFilterTags}
                    onTagChange={setSelectedFilterTags}
                    placeholder="Select tags to filter..."
                  />
                </div>
              </div>

              {/* Clear Filters Button */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          )}

          {/* Bulk Actions Toolbar */}
          {selectedTransactions.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-800">
                  {selectedTransactions.length} transaction{selectedTransactions.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={handleBulkTagging}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Add Tags
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Delete Selected
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading transactions...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-500 text-6xl mb-4">❌</div>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={loadTransactions}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-6xl mb-4">🔍</div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                {transactions.length === 0 ? 'No transactions yet' : 'No transactions match your filters'}
              </h3>
              <p className="text-gray-600">
                {transactions.length === 0 
                  ? 'Add your first transaction to see the history here'
                  : 'Try adjusting your filters to see more transactions'
                }
              </p>
              {transactions.length > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.includes(transaction.id)}
                        onChange={(e) => handleTransactionSelect(transaction.id, e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <div className="text-2xl">{getTransactionIcon(transaction.amount)}</div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-gray-800">{transaction.description}</p>
                          {transaction.isSplit && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                              ✂️ Split
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {formatDate(transaction.date)} • {transaction.isManual ? 'Manual' : 'Imported'}
                        </p>
                        {/* Transaction Tags - Hide for split transactions */}
                        {!transaction.isSplit && transactionTags[transaction.id] && transactionTags[transaction.id].length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {transactionTags[transaction.id].map((tag: any, index: number) => (
                              <button
                                key={`${transaction.id}-${tag.id}-${index}`}
                                onClick={() => handleTagFilterClick(tag.id)}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white hover:opacity-80 transition-opacity cursor-pointer"
                                style={{ backgroundColor: tag.color }}
                                title={`Click to filter by ${tag.name}`}
                              >
                                {tag.name}
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {/* Split Summary with Tags */}
                        {transaction.isSplit && transactionSplits[transaction.id] && (
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="font-medium">Split into:</span>
                            {transactionSplits[transaction.id].map((split: any, index: number) => {
                              // Get tags for this split from available tags
                              const splitTags = split.tagIds && split.tagIds.length > 0 
                                ? availableTags.filter((tag: any) => split.tagIds.includes(tag.id)) || []
                                : [];
                              
                              return (
                                <span key={split.id} className="ml-2">
                                  {split.description} ({formatCurrency(split.amount)})
                                  {splitTags.length > 0 && (
                                    <span className="text-gray-500">
                                      {' '}Tags: {splitTags.map((tag: any) => tag.name).join(', ')}
                                    </span>
                                  )}
                                  {index < transactionSplits[transaction.id].length - 1 ? ', ' : ''}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="text-right">
                        <p className={`font-bold ${getTransactionColor(transaction.amount)}`}>
                          {formatCurrency(transaction.amount)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {transaction.source}
                        </p>
                      </div>
                      <div className="flex space-x-1 ml-4">
                        <button
                          onClick={() => handleSplitTransaction(transaction)}
                          className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                          title="Split transaction"
                        >
                          ✂️
                        </button>
                        <button
                          onClick={() => handleEditTransaction(transaction)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit transaction"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(transaction.id)}
                          disabled={deletingTransaction === transaction.id}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete transaction"
                        >
                          {deletingTransaction === transaction.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
            <button
              onClick={() => setShowAddTransactionModal(true)}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Add Transaction
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Edit Account
            </button>
          </div>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showAddTransactionModal && (
        <AddTransactionModal
          isOpen={showAddTransactionModal}
          onClose={() => setShowAddTransactionModal(false)}
          account={account}
          onTransactionAdded={() => {
            setShowAddTransactionModal(false);
            loadTransactions(); // Refresh transaction list
            onUpdate(); // <--- Trigger a full data refresh
          }}
        />
      )}

      {/* Edit Account Modal */}
      {showEditModal && (
        <EditAccountModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          account={account}
          onAccountUpdated={() => {
            setShowEditModal(false);
            onClose(); // Close the details modal as well
          }}
        />
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit Transaction</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const description = formData.get('description') as string;
                const amount = parseFloat(formData.get('amount') as string);
                
                if (isNaN(amount)) {
                  setError('Please enter a valid amount');
                  return;
                }
                
                handleUpdateTransaction(editingTransaction.id, {
                  description: description,
                  amount: amount,
                  tagIds: editingTransactionTags
                });
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      name="description"
                      defaultValue={editingTransaction.description}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                        $
                      </span>
                      <input
                        type="number"
                        name="amount"
                        step="0.01"
                        defaultValue={editingTransaction.amount}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Use positive for income, negative for expenses
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tags
                    </label>
                    <TagSelector
                      selectedTagIds={editingTransactionTags}
                      onTagChange={setEditingTransactionTags}
                      placeholder="Select tags for this transaction..."
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setEditingTransaction(null)}
                      className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Update
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <BulkTagModal
          isOpen={showBulkTagModal}
          onClose={() => setShowBulkTagModal(false)}
          selectedTransactions={transactions.filter(t => selectedTransactions.includes(t.id))}
          onSuccess={handleBulkTagSuccess}
        />
      )}

      {/* Split Transaction Modal */}
      {showSplitModal && splittingTransaction && (
        <SplitTransactionModal
          isOpen={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          transaction={splittingTransaction}
          onSuccess={handleSplitSuccess}
        />
      )}
    </div>
  );
};

export default AccountDetailsModal; 