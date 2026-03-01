import React, { useState } from 'react';
import { auth } from '../../firebase/config';
import { scheduledBalanceSync } from '../../firebase/config';
import BalanceSyncStatus from '../admin/BalanceSyncStatus';

const BalanceSyncSettings: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runFullSync = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setRunning(true);

    try {
      console.log('🔄 Starting full balance sync...');
      await scheduledBalanceSync(user.uid);
      setLastRun(new Date());
      console.log('✅ Full balance sync completed successfully');
    } catch (error) {
      console.error('❌ Error running full balance sync:', error);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Account Balance Synchronization
        </h2>
        
        <div className="mb-6">
          <p className="text-gray-600 mb-4">
            OpheliaHub automatically keeps your account balances in sync with transaction history. 
            This page allows you to verify the sync status and manually trigger sync operations if needed.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">🤖 Automatic Sync</h3>
            <p className="text-sm text-blue-800">
              Balance sync happens automatically when you:
            </p>
            <ul className="list-disc list-inside text-sm text-blue-800 mt-2 space-y-1">
              <li>Create a new transaction</li>
              <li>Edit an existing transaction</li>
              <li>Delete a transaction</li>
              <li>Import transactions via CSV/Excel</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <h3 className="font-medium text-gray-900">Manual Full Sync</h3>
            <p className="text-sm text-gray-500">
              Run a comprehensive balance sync across all accounts
            </p>
            {lastRun && (
              <p className="text-xs text-gray-400 mt-1">
                Last run: {lastRun.toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={runFullSync}
            disabled={running}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? 'Running Sync...' : 'Run Full Sync'}
          </button>
        </div>
      </div>

      {/* Balance Sync Status Component */}
      <BalanceSyncStatus />

      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-medium text-gray-900 mb-4">Troubleshooting</h3>
        
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-800">Why might balances be out of sync?</h4>
            <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
              <li><strong>Manual balance adjustments:</strong> If you manually edited account balances</li>
              <li><strong>Import errors:</strong> Incorrect amounts during CSV import</li>
              <li><strong>Transfer transactions:</strong> Untracked transfers between accounts</li>
              <li><strong>System errors:</strong> Rare sync failures during transaction operations</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-800">How does balance calculation work?</h4>
            <p className="text-sm text-gray-600 mt-2">
              Account balances are calculated as the sum of all transactions for that account:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
              <li>Positive amounts increase the balance (income, deposits)</li>
              <li>Negative amounts decrease the balance (expenses, withdrawals)</li>
              <li>Initial balance transactions set the starting point</li>
              <li>All subsequent transactions are added to create the current balance</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-800">Transfer transactions</h4>
            <p className="text-sm text-gray-600 mt-2">
              When moving money between accounts, create two transactions:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
              <li>A negative transaction in the source account (withdrawal)</li>
              <li>A positive transaction in the destination account (deposit)</li>
              <li>Use the same description for both (e.g., "Transfer to Savings")</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BalanceSyncSettings;