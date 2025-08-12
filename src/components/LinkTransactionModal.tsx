import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  createTransactionLink, 
  getLinkedTransactions, 
  deleteTransactionLink, 
  suggestTransactionLinks,
  getTransactionsByAccount,
  getAccessibleAccounts
} from '../firebase/config';
import type { Transaction, TransactionLink, Account } from '../firebase/config';

interface LinkTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTransaction: Transaction;
  onSuccess: () => void;
}

interface LinkedTransactionDisplay {
  link: TransactionLink;
  transaction: Transaction;
  account?: Account;
}

const LinkTransactionModal: React.FC<LinkTransactionModalProps> = ({
  isOpen,
  onClose,
  sourceTransaction,
  onSuccess
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [linkedTransactions, setLinkedTransactions] = useState<LinkedTransactionDisplay[]>([]);
  const [suggestions, setSuggestions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [linkType, setLinkType] = useState<'transfer' | 'payment' | 'related'>('transfer');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOpen && user) {
      loadData();
    }
  }, [isOpen, user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError('');

      // Load accounts
      const userAccounts = await getAccessibleAccounts(user.uid);
      setAccounts(userAccounts);

      // Load all transactions
      const allUserTransactions: Transaction[] = [];
      for (const account of userAccounts) {
        const accountTransactions = await getTransactionsByAccount(user.uid, account.id);
        allUserTransactions.push(...accountTransactions);
      }
      setAllTransactions(allUserTransactions);

      // Load existing links
      const existingLinks = await getLinkedTransactions(sourceTransaction.id, user.uid);
      const linkedWithAccounts = await Promise.all(
        existingLinks.map(async (linkData) => {
          const account = userAccounts.find(acc => acc.id === linkData.transaction.accountId);
          return { ...linkData, account };
        })
      );
      setLinkedTransactions(linkedWithAccounts);

      // Load suggestions
      const transactionSuggestions = await suggestTransactionLinks(sourceTransaction.id, user.uid);
      setSuggestions(transactionSuggestions);

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load transaction data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async () => {
    if (!user || !selectedTransaction) return;

    try {
      setLoading(true);
      setError('');

      await createTransactionLink(user.uid, {
        sourceTransactionId: sourceTransaction.id,
        targetTransactionId: selectedTransaction.id,
        linkType,
        description: description.trim() || undefined,
        userId: user.uid
      });

      // Reload data
      await loadData();
      setSelectedTransaction(null);
      setLinkType('transfer');
      setDescription('');
      
      onSuccess();
    } catch (error) {
      console.error('Error creating link:', error);
      setError('Failed to create transaction link');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!user) return;

    try {
      setLoading(true);
      setError('');

      await deleteTransactionLink(linkId, user.uid);
      await loadData();
      onSuccess();
    } catch (error) {
      console.error('Error deleting link:', error);
      setError('Failed to delete transaction link');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getLinkTypeColor = (type: string) => {
    switch (type) {
      case 'transfer': return 'bg-blue-100 text-blue-800';
      case 'payment': return 'bg-green-100 text-green-800';
      case 'related': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLinkTypeIcon = (type: string) => {
    switch (type) {
      case 'transfer': return '🔄';
      case 'payment': return '💳';
      case 'related': return '🔗';
      default: return '📎';
    }
  };

  const filteredTransactions = allTransactions.filter(transaction => {
    if (transaction.id === sourceTransaction.id) return false;
    
    const matchesSearch = transaction.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAccount = selectedAccountId === 'all' || transaction.accountId === selectedAccountId;
    
    return matchesSearch && matchesAccount;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="text-2xl mr-3">🔗</div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Link Transaction</h2>
              <p className="text-sm text-gray-600">
                {sourceTransaction.description} - {formatCurrency(sourceTransaction.amount)}
              </p>
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

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Create New Link */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Create New Link</h3>
              
              {/* Search and Filter */}
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search Transactions
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by description..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Filter by Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Accounts</option>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Transaction List */}
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredTransactions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No transactions found
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredTransactions.map(transaction => {
                      const account = accounts.find(acc => acc.id === transaction.accountId);
                      return (
                        <div
                          key={transaction.id}
                          onClick={() => setSelectedTransaction(transaction)}
                          className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                            selectedTransaction?.id === transaction.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p 
                                className="font-medium text-gray-800 cursor-help"
                                title={transaction.description.length > 40 ? transaction.description : undefined}
                              >
                                {transaction.description.length > 40 
                                  ? transaction.description.substring(0, 40) + '...' 
                                  : transaction.description
                                }
                              </p>
                              <p className="text-sm text-gray-500">
                                {account?.name} • {transaction.date ? formatDate(transaction.date) : 'Atemporal'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(transaction.amount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Link Configuration */}
              {selectedTransaction && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-3">Link Configuration</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Link Type
                      </label>
                      <select
                        value={linkType}
                        onChange={(e) => setLinkType(e.target.value as 'transfer' | 'payment' | 'related')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="transfer">Transfer</option>
                        <option value="payment">Payment</option>
                        <option value="related">Related</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g., Monthly transfer, Loan payment"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <button
                      onClick={handleCreateLink}
                      disabled={loading}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Creating Link...' : 'Create Link'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Existing Links & Suggestions */}
            <div className="space-y-6">
              {/* Existing Links */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Existing Links</h3>
                {linkedTransactions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
                    No linked transactions
                  </div>
                ) : (
                  <div className="space-y-3">
                    {linkedTransactions.map(({ link, transaction, account }) => (
                      <div key={link.id} className="p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLinkTypeColor(link.linkType)}`}>
                              {getLinkTypeIcon(link.linkType)} {link.linkType}
                            </span>
                            <div>
                              <p 
                                className="font-medium text-gray-800 cursor-help"
                                title={transaction.description.length > 40 ? transaction.description : undefined}
                              >
                                {transaction.description.length > 40 
                                  ? transaction.description.substring(0, 40) + '...' 
                                  : transaction.description
                                }
                              </p>
                              <p className="text-sm text-gray-500">
                                {account?.name} • {transaction.date ? formatDate(transaction.date) : 'Atemporal'}
                              </p>
                              {link.description && (
                                <p className="text-xs text-gray-400">{link.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <p className={`font-bold ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(transaction.amount)}
                            </p>
                            <button
                              onClick={() => handleDeleteLink(link.id)}
                              disabled={loading}
                              className="text-red-600 hover:text-red-800 disabled:opacity-50"
                              title="Delete link"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Suggestions */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Smart Suggestions</h3>
                {suggestions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
                    No suggestions available
                  </div>
                ) : (
                  <div className="space-y-2">
                    {suggestions.slice(0, 5).map(transaction => {
                      const account = accounts.find(acc => acc.id === transaction.accountId);
                      return (
                        <div
                          key={transaction.id}
                          onClick={() => setSelectedTransaction(transaction)}
                          className="p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p 
                                className="font-medium text-gray-800 cursor-help"
                                title={transaction.description.length > 40 ? transaction.description : undefined}
                              >
                                {transaction.description.length > 40 
                                  ? transaction.description.substring(0, 40) + '...' 
                                  : transaction.description
                                }
                              </p>
                              <p className="text-sm text-gray-500">
                                {account?.name} • {transaction.date ? formatDate(transaction.date) : 'Atemporal'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(transaction.amount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkTransactionModal; 