import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getAccountsByCategory, type Account } from '../../firebase/config';

const PersonalAccountsCard: React.FC = () => {
  const navigate = useNavigate();
  const [personalAccounts, setPersonalAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          console.log('🔍 Loading personal accounts for user:', user.uid);
          const accounts = await getAccountsByCategory(user.uid, 'personal');
          console.log('🔍 Found personal accounts:', accounts.length, accounts);
          setPersonalAccounts(accounts);
        } catch (error) {
          console.error('Error loading personal accounts:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Refresh data when component mounts or when user changes
  useEffect(() => {
    const refreshData = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          console.log('🔄 Refreshing personal accounts for user:', user.uid);
          const accounts = await getAccountsByCategory(user.uid, 'personal');
          console.log('🔄 Refreshed personal accounts:', accounts.length, accounts);
          setPersonalAccounts(accounts);
        } catch (error) {
          console.error('Error refreshing personal accounts:', error);
        }
      }
    };

    // Refresh immediately and then every 30 seconds
    refreshData();
    const interval = setInterval(refreshData, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
      onClick={() => navigate('/financial-hub?type=personal')}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">Personal Accounts</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Manage your individual financial accounts, track personal spending, and monitor your financial health.
      </p>
      {loading ? (
        <div className="flex items-center text-green-600 font-medium text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600 mr-2"></div>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Accounts:</span>
            <span className="font-semibold text-gray-900">{personalAccounts.length}</span>
          </div>
        </div>
      )}
      <div className="flex items-center text-green-600 font-medium text-sm mt-4">
        <span>View Accounts</span>
        <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};

export default PersonalAccountsCard;
