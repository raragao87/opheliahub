import React, { useState, useEffect } from 'react';
import { auth } from '../../firebase/config';
import { AccountBalanceSync } from '../../utils/balanceSync';

const BalanceSyncStatus: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<{
    loading: boolean;
    isValid: boolean | null;
    discrepancies: Array<{
      accountId: string;
      accountName: string;
      storedBalance: number;
      calculatedBalance: number;
      difference: number;
    }>;
    lastChecked: Date | null;
  }>({
    loading: false,
    isValid: null,
    discrepancies: [],
    lastChecked: null
  });

  const [fixing, setFixing] = useState(false);

  const checkBalances = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setSyncStatus(prev => ({ ...prev, loading: true }));

    try {
      const result = await AccountBalanceSync.verifyAllAccountBalances(user.uid);
      setSyncStatus({
        loading: false,
        isValid: result.isValid,
        discrepancies: result.discrepancies,
        lastChecked: new Date()
      });
    } catch (error) {
      console.error('Error checking balance sync:', error);
      setSyncStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const fixBalances = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setFixing(true);

    try {
      const result = await AccountBalanceSync.fixAllAccountBalances(user.uid);
      console.log(`✅ Fixed ${result.fixed} accounts. Errors: ${result.errors.length}`);
      
      if (result.errors.length > 0) {
        console.error('Fix errors:', result.errors);
      }
      
      // Re-check after fixing
      await checkBalances();
    } catch (error) {
      console.error('Error fixing balance sync:', error);
    } finally {
      setFixing(false);
    }
  };

  // Auto-check on mount
  useEffect(() => {
    checkBalances();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Account Balance Sync Status
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={checkBalances}
            disabled={syncStatus.loading}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {syncStatus.loading ? 'Checking...' : 'Check Now'}
          </button>
          
          {syncStatus.discrepancies.length > 0 && (
            <button
              onClick={fixBalances}
              disabled={fixing || syncStatus.loading}
              className="px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              {fixing ? 'Fixing...' : 'Fix Discrepancies'}
            </button>
          )}
        </div>
      </div>

      {syncStatus.lastChecked && (
        <p className="text-sm text-gray-500 mb-4">
          Last checked: {syncStatus.lastChecked.toLocaleString()}
        </p>
      )}

      {syncStatus.isValid === null && !syncStatus.loading && (
        <div className="text-gray-500">
          Click "Check Now" to verify account balance synchronization.
        </div>
      )}

      {syncStatus.isValid === true && (
        <div className="flex items-center text-green-600">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          All account balances are in sync with transaction history.
        </div>
      )}

      {syncStatus.isValid === false && (
        <div className="space-y-4">
          <div className="flex items-center text-red-600">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {syncStatus.discrepancies.length} account(s) have balance discrepancies
          </div>

          <div className="bg-red-50 rounded-lg p-4">
            <h4 className="font-medium text-red-800 mb-3">Discrepancies Found:</h4>
            <div className="space-y-3">
              {syncStatus.discrepancies.map((discrepancy) => (
                <div key={discrepancy.accountId} className="border-l-4 border-red-400 pl-4">
                  <div className="font-medium text-red-800">
                    {discrepancy.accountName}
                  </div>
                  <div className="text-sm text-red-700">
                    Stored: {formatCurrency(discrepancy.storedBalance)} → 
                    Calculated: {formatCurrency(discrepancy.calculatedBalance)}
                  </div>
                  <div className="text-xs text-red-600">
                    Difference: {formatCurrency(discrepancy.difference)}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <div className="text-sm text-yellow-800">
                <strong>💡 What this means:</strong> The stored account balance doesn't match the sum of all transactions. 
                This can happen if:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Manual balance adjustments were made</li>
                  <li>Transactions were imported with incorrect amounts</li>
                  <li>There was a sync error during transaction operations</li>
                </ul>
                <p className="mt-2">
                  Click "Fix Discrepancies" to automatically recalculate balances based on transaction history.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSyncStatus;