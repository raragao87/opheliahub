import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getAccountsByCategory, type Account } from '../../firebase/config';

const FamilyAccountsCard: React.FC = () => {
  const navigate = useNavigate();
  const [familyAccounts, setFamilyAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          console.log('🔍 Loading family accounts for user:', user.uid);
          const accounts = await getAccountsByCategory(user.uid, 'family');
          console.log('🔍 Found family accounts:', accounts.length, accounts);
          setFamilyAccounts(accounts);
        } catch (error) {
          console.error('Error loading family accounts:', error);
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
          console.log('🔄 Refreshing family accounts for user:', user.uid);
          const accounts = await getAccountsByCategory(user.uid, 'family');
          console.log('🔄 Refreshed family accounts:', accounts.length, accounts);
          setFamilyAccounts(accounts);
        } catch (error) {
          console.error('Error refreshing family accounts:', error);
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
      onClick={() => navigate('/financial-hub?type=family')}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">Family Accounts</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Manage shared financial accounts, track balances, and monitor family spending together.
      </p>
      {loading ? (
        <div className="flex items-center text-blue-600 font-medium text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Accounts:</span>
            <span className="font-semibold text-gray-900">{familyAccounts.length}</span>
          </div>
        </div>
      )}
      <div className="flex items-center text-blue-600 font-medium text-sm mt-4">
        <span>View Accounts</span>
        <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};

export default FamilyAccountsCard;
