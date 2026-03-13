import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  where
} from 'firebase/firestore';
import { db, getAccounts, getTags, type Transaction, type Account, type Tag } from '../../firebase/config';

interface TransactionWithAccountName extends Transaction {
  accountName: string;
  accountType: string;
  tagNames: string[];
}

const RecentTransactionsCard: React.FC = () => {
  const navigate = useNavigate();
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithAccountName[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await loadRecentTransactions(user.uid);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadRecentTransactions = async (userId: string) => {
    try {
      setLoading(true);
      
      // Get recent transactions (last 10)
      const transactionsQuery = query(
        collection(db, 'users', userId, 'transactions'),
        where('source', '!=', 'initial-balance'), // Exclude initial balance transactions
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const [transactionsSnapshot, accounts, tags] = await Promise.all([
        getDocs(transactionsQuery),
        getAccounts(userId),
        getTags(userId)
      ]);
      
      const transactions = transactionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      
      // Create maps for quick lookup
      const accountsMap = new Map<string, Account & { id: string }>();
      accounts.forEach((account: Account & { id: string }) => accountsMap.set(account.id, account));
      
      const tagsMap = new Map<string, Tag>();
      tags.forEach((tag: Tag) => tagsMap.set(tag.id, tag));
      
      // Enrich transactions with account names and tag names
      const enrichedTransactions: TransactionWithAccountName[] = transactions.map((transaction) => {
        const account = accountsMap.get(transaction.accountId);
        const tagNames = transaction.tagIds?.map((tagId: string) => tagsMap.get(tagId)?.name).filter(Boolean) || [];
        
        return {
          ...transaction,
          accountName: account?.name || 'Unknown Account',
          accountType: account?.type || 'asset',
          tagNames: tagNames as string[]
        };
      });
      
      setRecentTransactions(enrichedTransactions);
    } catch (error) {
      console.error('Error loading recent transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(Math.abs(amount));
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const handleViewAllTransactions = () => {
    navigate('/financial-hub/split');
  };

  return (
    <div 
      className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
      onClick={handleViewAllTransactions}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      
      <h3 className="text-xl font-semibold text-gray-900 mb-3">Recent Transactions</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Your latest financial activity across all accounts.
      </p>
      
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
          <span className="ml-2 text-gray-600">Loading transactions...</span>
        </div>
      ) : recentTransactions.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-500">No recent transactions found.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {recentTransactions.slice(0, 5).map((transaction) => (
            <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {transaction.description}
                </p>
                <p className="text-xs text-gray-500">
                  {transaction.accountName} • {formatDate(transaction.createdAt)}
                </p>
                {transaction.tagNames.length > 0 && (
                  <p className="text-xs text-gray-400 truncate">
                    {transaction.tagNames.join(', ')}
                  </p>
                )}
              </div>
              <div className="ml-3 flex-shrink-0">
                <span className={`inline-flex text-sm font-semibold ${
                  transaction.amount > 0 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {transaction.amount > 0 ? '+' : '-'}{formatCurrency(transaction.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="flex items-center text-green-600 font-medium text-sm mt-4">
        <span>View All Transactions</span>
        <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};

export default RecentTransactionsCard;