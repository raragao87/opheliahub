import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getAccessibleAccounts, type Account } from '../../firebase/config';

const FinancialHubSplitTestCard: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          console.log('🔍 Loading accounts for split test card:', user.uid);
          const allAccounts = await getAccessibleAccounts(user.uid);
          console.log('🔍 Found accounts for split test:', allAccounts.length);
          setAccounts(allAccounts);
        } catch (error) {
          console.error('Error loading accounts for split test card:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Calculate financial metrics for display
  const totalAssets = accounts
    .filter(account => account.defaultSign === 'positive')
    .reduce((sum, account) => sum + account.balance, 0);

  const totalLiabilities = accounts
    .filter(account => account.defaultSign === 'negative')
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);

  const netWorth = totalAssets - totalLiabilities;

  return (
    <div 
      className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl shadow-lg p-8 border border-purple-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
      onClick={() => navigate('/financial-hub')}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2z" />
          </svg>
        </div>
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      
      <h3 className="text-xl font-semibold text-gray-900 mb-3">Financial Hub</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Manage your accounts and transactions with the enhanced split-view interface.
      </p>
      
      {loading ? (
        <div className="flex items-center text-purple-600 font-medium text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-2"></div>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Total Accounts:</span>
            <span className="font-semibold text-gray-900">{accounts.length}</span>
          </div>
          {accounts.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Net Worth:</span>
              <span className={`font-semibold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.abs(netWorth).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
      
      <div className="flex items-center text-purple-600 font-medium text-sm mt-4">
        <span>Open Financial Hub</span>
        <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};

export default FinancialHubSplitTestCard;
