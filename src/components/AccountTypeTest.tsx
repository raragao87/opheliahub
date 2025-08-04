import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAccountTypes, createAccountType, getDefaultAccountTypes, type AccountType } from '../firebase/config';

const AccountTypeTest: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadAccountTypes(user.uid);
      }
    });

    return unsubscribe;
  }, []);

  const loadAccountTypes = async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Loading account types for user:', userId);
      const types = await getAccountTypes(userId);
      setAccountTypes(types);
      console.log('✅ Account types loaded:', types);
    } catch (error) {
      console.error('❌ Error loading account types:', error);
      setError('Failed to load account types');
    } finally {
      setLoading(false);
    }
  };

  const testCreateCustomType = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      
      const newTypeId = await createAccountType(user.uid, {
        name: 'Test Custom Type',
        defaultSign: 'positive',
        category: 'asset',
        isCustom: true,
        userId: user.uid
      });

      console.log('✅ Custom type created with ID:', newTypeId);
      
      // Reload account types
      await loadAccountTypes(user.uid);
    } catch (error) {
      console.error('❌ Error creating custom type:', error);
      setError('Failed to create custom type');
    } finally {
      setLoading(false);
    }
  };

  const testDefaultTypes = () => {
    const defaultTypes = getDefaultAccountTypes();
    console.log('✅ Default account types:', defaultTypes);
    return defaultTypes;
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Account Type Test</h2>
      
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">User Status:</span>
          <span className={`text-sm ${user ? 'text-green-600' : 'text-red-600'}`}>
            {user ? `✅ ${user.email}` : '❌ Not signed in'}
          </span>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <span className="font-medium">Loading Status:</span>
          <span className={`text-sm ${loading ? 'text-blue-600' : 'text-gray-600'}`}>
            {loading ? '🔄 Loading...' : '✅ Ready'}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 rounded-lg">
          <span className="text-sm text-red-800">❌ Error: {error}</span>
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={() => user && loadAccountTypes(user.uid)}
          disabled={!user || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Load Account Types
        </button>

        <button
          onClick={testCreateCustomType}
          disabled={!user || loading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          Create Test Custom Type
        </button>

        <button
          onClick={testDefaultTypes}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Test Default Types
        </button>
      </div>

      {accountTypes.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium text-gray-700 mb-3">Account Types ({accountTypes.length}):</h3>
          <div className="space-y-2">
            {accountTypes.map((type) => (
              <div key={type.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{type.name}</span>
                    <span className={`ml-2 text-sm ${type.category === 'asset' ? 'text-green-600' : 'text-red-600'}`}>
                      ({type.category})
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {type.isCustom ? 'Custom' : 'Default'} • {type.defaultSign}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>User ID: {user?.uid || 'Not available'}</p>
        <p>Total Account Types: {accountTypes.length}</p>
        <p>Default Types: {accountTypes.filter(t => !t.isCustom).length}</p>
        <p>Custom Types: {accountTypes.filter(t => t.isCustom).length}</p>
      </div>
    </div>
  );
};

export default AccountTypeTest; 