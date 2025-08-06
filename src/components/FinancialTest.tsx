import React, { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getDefaultAccountTypes, 
  createAccount, 
  getAccountsByUser, 
  updateAccount, 
  deleteAccount,
  getAccountTypes,
  createAccountType,
  type Account,
  type AccountType
} from '../firebase/config';

const FinancialTest: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [testStatus, setTestStatus] = useState<string>('Ready to test');
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return unsubscribe;
  }, []);

  const runFinancialTests = async () => {
    if (!user) {
      setTestStatus('❌ Cannot test - User not authenticated');
      setError('Please sign in to test financial functions');
      return;
    }

    setTestStatus('Running tests...');
    setError(null);
    setTestResults([]);

    try {
      // Test 1: Get default account types
      setTestResults(prev => [...prev, '🔍 Testing: Get default account types']);
      const defaultTypes = getDefaultAccountTypes();
      setTestResults(prev => [...prev, `✅ Found ${defaultTypes.length} default account types`]);
      defaultTypes.forEach(type => {
        setTestResults(prev => [...prev, `   - ${type.name} (${type.category}, ${type.defaultSign})`]);
      });

      // Test 2: Get account types (default + custom)
      setTestResults(prev => [...prev, '🔍 Testing: Get account types for user']);
      const types = await getAccountTypes(user.uid);
      setAccountTypes(types);
      setTestResults(prev => [...prev, `✅ Found ${types.length} total account types`]);

      // Test 3: Create a custom account type
      setTestResults(prev => [...prev, '🔍 Testing: Create custom account type']);
      const customTypeId = await createAccountType(user.uid, {
        name: 'Test Custom Account',
        defaultSign: 'positive',
        category: 'asset',
        isCustom: true,
        userId: user.uid
      });
      setTestResults(prev => [...prev, `✅ Custom account type created with ID: ${customTypeId}`]);

      // Test 4: Create a test account
      setTestResults(prev => [...prev, '🔍 Testing: Create test account']);
      const accountId = await createAccount(user.uid, {
        name: 'Test Account',
        type: 'checking',
        defaultSign: 'positive',
        initialBalance: 1000,
        balance: 1000,
        currency: 'EUR',
        sharedWith: [],
        ownerId: user.uid,
        isReal: false
      });
      setTestResults(prev => [...prev, `✅ Test account created with ID: ${accountId}`]);

      // Test 5: Get accounts for user
      setTestResults(prev => [...prev, '🔍 Testing: Get accounts for user']);
      const userAccounts = await getAccountsByUser(user.uid);
      setAccounts(userAccounts);
      setTestResults(prev => [...prev, `✅ Found ${userAccounts.length} accounts for user`]);

      // Test 6: Update account
      setTestResults(prev => [...prev, '🔍 Testing: Update account']);
      await updateAccount(accountId, {
        name: 'Updated Test Account',
        balance: 1500,
        ownerId: user.uid
      });
      setTestResults(prev => [...prev, '✅ Account updated successfully']);

      // Test 7: Delete test account
      setTestResults(prev => [...prev, '🔍 Testing: Delete test account']);
      await deleteAccount(accountId, user.uid);
      setTestResults(prev => [...prev, '✅ Test account deleted successfully']);

      // Test 8: Verify account deletion
      setTestResults(prev => [...prev, '🔍 Testing: Verify account deletion']);
      const accountsAfterDelete = await getAccountsByUser(user.uid);
      setTestResults(prev => [...prev, `✅ Accounts after deletion: ${accountsAfterDelete.length}`]);

      setTestStatus('✅ All financial tests passed!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Financial test error:', error);
      setTestStatus(`❌ Financial test failed: ${errorMessage}`);
      setError(`Financial error: ${errorMessage}`);
      setTestResults(prev => [...prev, `❌ Test failed: ${errorMessage}`]);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-4xl mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Financial Hub Database Test</h2>
      
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="font-medium">User Status:</span>
          <span className={`text-sm ${user ? 'text-green-600' : 'text-red-600'}`}>
            {user ? `✅ ${user.email}` : '❌ Not signed in'}
          </span>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <span className="font-medium">Test Status:</span>
          <span className={`text-sm ${testStatus.includes('✅') ? 'text-green-600' : testStatus.includes('❌') ? 'text-red-600' : 'text-blue-600'}`}>
            {testStatus}
          </span>
        </div>
        
        <button
          onClick={runFinancialTests}
          disabled={!user}
          className={`px-4 py-2 rounded-lg text-white font-medium ${
            user 
              ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-300' 
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          {user ? 'Run Financial Tests' : 'Sign in to test financial functions'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 rounded-lg">
          <span className="text-sm text-red-800">
            ❌ Error: {error}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {testResults.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-gray-700">Test Results:</h3>
            <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
              {testResults.map((result, index) => (
                <div key={index} className="text-sm mb-1">
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-gray-700">User Accounts:</h3>
            <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
              {accounts.map((account) => (
                <div key={account.id} className="text-sm mb-2 p-2 bg-white rounded border">
                  <div className="font-medium">{account.name}</div>
                  <div className="text-gray-600">Type: {account.type}</div>
                  <div className="text-gray-600">Balance: ${account.balance}</div>
                  <div className="text-gray-600">Sign: {account.defaultSign}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {accountTypes.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-gray-700">Account Types:</h3>
            <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
              {accountTypes.map((type) => (
                <div key={type.id} className="text-sm mb-2 p-2 bg-white rounded border">
                  <div className="font-medium">{type.name}</div>
                  <div className="text-gray-600">Category: {type.category}</div>
                  <div className="text-gray-600">Sign: {type.defaultSign}</div>
                  <div className="text-gray-600">Custom: {type.isCustom ? 'Yes' : 'No'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>User ID: {user?.uid || 'Not available'}</p>
        <p>Total Accounts: {accounts.length}</p>
        <p>Total Account Types: {accountTypes.length}</p>
      </div>
    </div>
  );
};

export default FinancialTest; 