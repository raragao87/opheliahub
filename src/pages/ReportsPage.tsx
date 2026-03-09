import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import useDarkMode from '../hooks/useDarkMode';
import { 
  getTags,
  type Transaction,
  type Tag
} from '../firebase/config';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs,
  where 
} from 'firebase/firestore';
import { db } from '../firebase/config';

interface MonthlySpendingData {
  category: string;
  tagName: string;
  totalAmount: number;
  transactionCount: number;
  color: string;
}

const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode } = useDarkMode();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [spendingData, setSpendingData] = useState<MonthlySpendingData[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Color palette for categories (enhanced for dark mode compatibility)
  const colors = isDarkMode ? [
    '#f87171', '#fb923c', '#fbbf24', '#facc15',
    '#a3e635', '#4ade80', '#34d399', '#2dd4bf',
    '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8',
    '#a78bfa', '#c084fc', '#e879f9', '#f472b6',
    '#fb7185', '#94a3b8', '#9ca3af', '#6b7280'
  ] : [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', 
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#64748b', '#6b7280', '#374151'
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          setLoading(true);
          setError(null);
          await loadReportData(user);
        } catch (error) {
          console.error('❌ Error loading reports data:', error);
          setError('Failed to load reports data');
        } finally {
          setLoading(false);
        }
      } else {
        setTransactions([]);
        setTags([]);
        setSpendingData([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [selectedMonth, selectedYear]);

  const loadReportData = async (user: User) => {
    console.log('📊 Loading reports data for user:', user.uid);
    
    // Load tags first
    const userTags = await getTags(user.uid);
    setTags(userTags);
    
    // Calculate date range for the selected month
    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0); // Last day of month
    
    console.log(`📅 Loading transactions for ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    // Get all transactions for the selected month
    // Note: We need to create this function or use existing filtering
    const monthlyTransactions = await getMonthlyTransactions(user.uid, selectedYear, selectedMonth);
    setTransactions(monthlyTransactions);
    
    // Calculate spending breakdown by category/tag
    const spending = calculateSpendingBreakdown(monthlyTransactions, userTags);
    setSpendingData(spending);
  };

  const getMonthlyTransactions = async (userId: string, year: number, month: number): Promise<Transaction[]> => {
    try {
      // Get all user transactions and filter client-side for now
      const transactionsQuery = query(
        collection(db, 'users', userId, 'transactions'),
        orderBy('createdAt', 'desc')
      );
      const transactionsSnapshot = await getDocs(transactionsQuery);
      const allTransactions = transactionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      
      // Filter transactions for the selected month
      const filtered = allTransactions.filter(transaction => {
        if (!transaction.date) return false; // Skip atemporal transactions
        
        const transactionDate = new Date(transaction.date);
        return transactionDate.getFullYear() === year && 
               transactionDate.getMonth() === month - 1; // month is 0-indexed in Date
      });
      
      console.log(`📊 Found ${filtered.length} transactions for ${year}-${month.toString().padStart(2, '0')}`);
      return filtered;
    } catch (error) {
      console.error('Error getting monthly transactions:', error);
      return [];
    }
  };

  const calculateSpendingBreakdown = (transactions: Transaction[], userTags: Tag[]): MonthlySpendingData[] => {
    const spendingMap = new Map<string, { amount: number; count: number; tagName: string }>();
    
    transactions.forEach(transaction => {
      // Only include expense transactions (negative amounts for expense accounts)
      if (transaction.amount >= 0) return; // Skip income/positive transactions
      
      const absAmount = Math.abs(transaction.amount);
      
      if (transaction.tagIds && transaction.tagIds.length > 0) {
        // Group by tag
        transaction.tagIds.forEach(tagId => {
          const tag = userTags.find(t => t.id === tagId);
          if (tag) {
            const existing = spendingMap.get(tagId);
            if (existing) {
              existing.amount += absAmount / transaction.tagIds!.length; // Split amount across tags
              existing.count += 1 / transaction.tagIds!.length;
            } else {
              spendingMap.set(tagId, { 
                amount: absAmount / transaction.tagIds!.length, 
                count: 1 / transaction.tagIds!.length,
                tagName: tag.name 
              });
            }
          }
        });
      } else {
        // Untagged transactions
        const existing = spendingMap.get('untagged');
        if (existing) {
          existing.amount += absAmount;
          existing.count += 1;
        } else {
          spendingMap.set('untagged', { 
            amount: absAmount, 
            count: 1,
            tagName: 'Untagged'
          });
        }
      }
    });

    // Convert to array and sort by amount
    const spending: MonthlySpendingData[] = Array.from(spendingMap.entries()).map(([key, data], index) => ({
      category: key,
      tagName: data.tagName,
      totalAmount: data.amount,
      transactionCount: Math.round(data.count),
      color: colors[index % colors.length]
    }));

    return spending.sort((a, b) => b.totalAmount - a.totalAmount);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const getMonthName = (month: number): string => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  };

  const totalSpending = spendingData.reduce((sum, item) => sum + item.totalAmount, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading reports...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Financial Reports</h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2">Analyze your spending patterns and financial trends</p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>

          {/* Date Selection */}
          <div className="mt-6 flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {getMonthName(i + 1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Monthly Spending Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Monthly Spending - {getMonthName(selectedMonth)} {selectedYear}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalSpending)}</p>
              <p className="text-gray-600 dark:text-gray-400">Total Spending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{transactions.length}</p>
              <p className="text-gray-600 dark:text-gray-400">Transactions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{spendingData.length}</p>
              <p className="text-gray-600 dark:text-gray-400">Categories</p>
            </div>
          </div>

          {/* Spending Breakdown Chart */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Spending by Category</h3>
            
            {spendingData.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>No spending data found for {getMonthName(selectedMonth)} {selectedYear}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {spendingData.map((item, index) => {
                  const percentage = totalSpending > 0 ? (item.totalAmount / totalSpending) * 100 : 0;
                  
                  return (
                    <div key={item.category} className="flex items-center space-x-4">
                      <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.tagName}</p>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(item.totalAmount)}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{percentage.toFixed(1)}%</p>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all duration-300"
                            style={{ 
                              backgroundColor: item.color, 
                              width: `${Math.min(percentage, 100)}%` 
                            }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.transactionCount} transactions</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Coming Soon Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">More Reports Coming Soon</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Net Worth Tracking</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Track your assets minus liabilities over time</p>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 mt-2">
                Coming Soon
              </span>
            </div>
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Income vs Expense Trends</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Monthly comparison of income and expenses</p>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 mt-2">
                Coming Soon
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;