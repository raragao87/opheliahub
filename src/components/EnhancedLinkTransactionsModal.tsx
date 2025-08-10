import React, { useState } from 'react';
import { auth } from '../firebase/config';
import { 
  getTransactionsByAccount, 
  createTransaction,
  linkTransactions,
  type Account, 
  type Transaction 
} from '../firebase/config';

interface EnhancedLinkTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction & { id: string };
  currentAccount: Account;
  allAccounts: Account[];
  onTransactionLinked: () => void;
}

interface PotentialMatch {
  transaction: Transaction;
  account: Account;
  matchReason: 'exact_amount' | 'close_amount';
  confidence: number;
}

const EnhancedLinkTransactionsModal: React.FC<EnhancedLinkTransactionsModalProps> = ({
  isOpen,
  onClose,
  transaction,
  currentAccount,
  allAccounts,
  onTransactionLinked
}) => {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<PotentialMatch | null>(null);

  const targetAmount = Math.abs(transaction.amount);

  const handleAccountSelect = async (account: Account) => {
    setSelectedAccount(account);
    setLoading(true);
    setPotentialMatches([]);
    setAllTransactions([]);
    setShowAllTransactions(false);

    try {
      if (auth.currentUser) {
        const accountTransactions = await getTransactionsByAccount(auth.currentUser.uid, account.id);
        setAllTransactions(accountTransactions);

        // Find potential matches based on amount
        const matches: PotentialMatch[] = [];
        
        accountTransactions.forEach((txn) => {
          const txnAmount = Math.abs(txn.amount);
          
          // Exact amount match
          if (txnAmount === targetAmount) {
            matches.push({
              transaction: txn,
              account,
              matchReason: 'exact_amount',
              confidence: 100
            });
          }
          // Close amount match (within 5%)
          else if (Math.abs(txnAmount - targetAmount) / targetAmount <= 0.05) {
            const confidence = Math.round((1 - Math.abs(txnAmount - targetAmount) / targetAmount) * 100);
            matches.push({
              transaction: txn,
              account,
              matchReason: 'close_amount',
              confidence
            });
          }
        });

        // Sort by confidence
        matches.sort((a, b) => b.confidence - a.confidence);
        setPotentialMatches(matches);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkTransactions = async (matchTransaction: Transaction) => {
    try {
      if (auth.currentUser) {
        await linkTransactions(auth.currentUser.uid, transaction.id, matchTransaction.id);
        onTransactionLinked();
      }
    } catch (error) {
      console.error('Error linking transactions:', error);
    }
  };

  const handleDuplicateTransaction = async (targetSign: 'positive' | 'negative') => {
    try {
      if (auth.currentUser && selectedAccount) {
        const duplicatedAmount = targetSign === 'positive' ? targetAmount : -targetAmount;
        
        await createTransaction(auth.currentUser.uid, {
          accountId: selectedAccount.id,
          amount: duplicatedAmount,
          description: transaction.description,
          date: transaction.date,
          isManual: true,
          source: 'manual',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        onTransactionLinked();
      }
    } catch (error) {
      console.error('Error duplicating transaction:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Link Transaction: {transaction.description}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Transaction Details */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{transaction.description}</p>
                <p className="text-sm text-gray-600">
                  {currentAccount.name} • {transaction.date ? new Date(transaction.date).toLocaleDateString() : 'Atemporal'}
                </p>
              </div>
              <div className={`text-lg font-semibold ${
                transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {transaction.amount >= 0 ? '+' : ''}${transaction.amount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Account Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select account to link with:
            </label>
            <select
              value={selectedAccount?.id || ''}
              onChange={(e) => {
                const account = allAccounts.find(acc => acc.id === e.target.value);
                if (account) handleAccountSelect(account);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Choose an account...</option>
              {allAccounts.filter(acc => acc.id !== currentAccount.id).map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.type})
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Searching for matching transactions...</p>
            </div>
          )}

          {selectedAccount && !loading && (
            <div className="space-y-6">
              {/* Potential Matches */}
              {potentialMatches.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">
                    🎯 Potential Matches (Amount: ${targetAmount.toLocaleString()})
                  </h3>
                  <div className="space-y-2">
                    {potentialMatches.map((match, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedMatch(match)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <input
                                type="radio"
                                checked={selectedMatch?.transaction.id === match.transaction.id}
                                onChange={() => setSelectedMatch(match)}
                                className="h-4 w-4 text-blue-600"
                              />
                              <div>
                                <p className="font-medium">{match.transaction.description}</p>
                                <p className="text-sm text-gray-600">
                                  {match.transaction.date ? new Date(match.transaction.date).toLocaleDateString() : 'Atemporal'}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-semibold ${
                              match.transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {match.transaction.amount >= 0 ? '+' : ''}${match.transaction.amount.toLocaleString()}
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                match.matchReason === 'exact_amount' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {match.confidence}% match
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {selectedMatch && (
                    <button
                      onClick={() => handleLinkTransactions(selectedMatch.transaction)}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Link Selected Transactions
                    </button>
                  )}
                </div>
              )}

              {/* No Matches Found */}
              {potentialMatches.length === 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">
                    ❌ No matching transactions found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    No transactions with amount ${targetAmount.toLocaleString()} found in {selectedAccount.name}.
                  </p>
                  
                  {/* Options */}
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowAllTransactions(!showAllTransactions)}
                      className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      {showAllTransactions ? 'Hide' : 'Show'} All Transactions in {selectedAccount.name}
                    </button>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        onClick={() => handleDuplicateTransaction('positive')}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Create +${targetAmount.toLocaleString()} Transaction
                      </button>
                      <button
                        onClick={() => handleDuplicateTransaction('negative')}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        Create -${targetAmount.toLocaleString()} Transaction
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* All Transactions */}
              {showAllTransactions && allTransactions.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">
                    📋 All Transactions in {selectedAccount.name}
                  </h3>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {allTransactions.map((txn) => (
                      <div
                        key={txn.id}
                        className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleLinkTransactions(txn)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{txn.description}</p>
                            <p className="text-sm text-gray-600">
                              {txn.date ? new Date(txn.date).toLocaleDateString() : 'Atemporal'}
                            </p>
                          </div>
                          <div className={`text-lg font-semibold ${
                            txn.amount >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {txn.amount >= 0 ? '+' : ''}${txn.amount.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedLinkTransactionsModal;
