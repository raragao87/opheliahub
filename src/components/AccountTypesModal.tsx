import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAccountTypes, createAccountType, updateAccountType, deleteAccountType, type AccountType } from '../firebase/config';

interface AccountTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AccountTypesModal: React.FC<AccountTypesModalProps> = ({
  isOpen,
  onClose
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingType, setEditingType] = useState<AccountType | null>(null);
  const [deletingType, setDeletingType] = useState<string | null>(null);
  
  // Add/Edit form fields
  const [typeName, setTypeName] = useState('');
  const [typeCategory, setTypeCategory] = useState<'asset' | 'liability'>('asset');
  const [typeSign, setTypeSign] = useState<'positive' | 'negative'>('positive');

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
      const types = await getAccountTypes(userId);
      setAccountTypes(types);
    } catch (error) {
      console.error('Error loading account types:', error);
      setError('Failed to load account types');
    } finally {
      setLoading(false);
    }
  };

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !typeName.trim()) return;

    try {
      setLoading(true);
      setError(null);

      await createAccountType(user.uid, {
        name: typeName.trim(),
        defaultSign: typeSign,
        category: typeCategory,
        isCustom: true,
        userId: user.uid
      });

      // Reload account types
      await loadAccountTypes(user.uid);

      // Reset form
      setTypeName('');
      setTypeCategory('asset');
      setTypeSign('positive');
      setShowAddForm(false);

      console.log('✅ Custom account type created successfully');
    } catch (error) {
      console.error('Error creating account type:', error);
      setError('Failed to create account type');
    } finally {
      setLoading(false);
    }
  };

  const handleEditType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingType || !typeName.trim()) return;

    try {
      setLoading(true);
      setError(null);

      await updateAccountType(editingType.id, {
        name: typeName.trim(),
        defaultSign: typeSign,
        category: typeCategory,
        isCustom: true,
        userId: user.uid
      }, user.uid);

      // Reload account types
      await loadAccountTypes(user.uid);

      // Reset form
      setEditingType(null);
      setTypeName('');
      setTypeCategory('asset');
      setTypeSign('positive');

      console.log('✅ Account type updated successfully');
    } catch (error) {
      console.error('Error updating account type:', error);
      setError('Failed to update account type');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteType = async (typeId: string) => {
    if (!user) return;

    try {
      setDeletingType(typeId);
      await deleteAccountType(typeId, user.uid);
      await loadAccountTypes(user.uid);
      console.log('✅ Account type deleted successfully');
    } catch (error) {
      console.error('Error deleting account type:', error);
      setError('Failed to delete account type');
    } finally {
      setDeletingType(null);
    }
  };

  const startEditType = (type: AccountType) => {
    setEditingType(type);
    setTypeName(type.name);
    setTypeCategory(type.category);
    setTypeSign(type.defaultSign);
  };

  const cancelEdit = () => {
    setEditingType(null);
    setTypeName('');
    setTypeCategory('asset');
    setTypeSign('positive');
  };

  const getCategoryIcon = (category: string) => {
    return category === 'asset' ? '📈' : '📉';
  };



  const getSignText = (sign: string) => {
    return sign === 'positive' ? 'Positive' : 'Negative';
  };

  const getSignColor = (sign: string) => {
    return sign === 'positive' ? 'text-green-600' : 'text-red-600';
  };

  const assetTypes = accountTypes.filter(type => type.category === 'asset');
  const liabilityTypes = accountTypes.filter(type => type.category === 'liability');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Manage Account Types</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Add New Type Button */}
          {!showAddForm && !editingType && (
            <div className="mb-6">
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add Custom Account Type
              </button>
            </div>
          )}

          {/* Add/Edit Form */}
          {(showAddForm || editingType) && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-medium text-gray-800 mb-4">
                {editingType ? 'Edit Account Type' : 'Add Custom Account Type'}
              </h3>
              <form onSubmit={editingType ? handleEditType : handleAddType} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type Name *
                  </label>
                  <input
                    type="text"
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    placeholder="e.g., Emergency Fund, Business Account"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category *
                    </label>
                    <select
                      value={typeCategory}
                      onChange={(e) => setTypeCategory(e.target.value as 'asset' | 'liability')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Sign *
                    </label>
                    <select
                      value={typeSign}
                      onChange={(e) => setTypeSign(e.target.value as 'positive' | 'negative')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="positive">Positive</option>
                      <option value="negative">Negative</option>
                    </select>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={editingType ? cancelEdit : () => setShowAddForm(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : (editingType ? 'Update Type' : 'Add Type')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Account Types List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading account types...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Asset Types */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <span className="mr-2">📈</span>
                  Asset Types
                </h3>
                <div className="space-y-2">
                  {assetTypes.map((type) => (
                    <div key={type.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">{getCategoryIcon(type.category)}</span>
                        <div>
                          <p className="font-medium text-gray-800">{type.name}</p>
                          <p className="text-sm text-gray-500">
                            <span className={getSignColor(type.defaultSign)}>{getSignText(type.defaultSign)}</span>
                            {type.isCustom && <span className="ml-2 text-blue-600">• Custom</span>}
                          </p>
                        </div>
                      </div>
                      {type.isCustom && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => startEditType(type)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit type"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteType(type.id)}
                            disabled={deletingType === type.id}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                            title="Delete type"
                          >
                            {deletingType === type.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Liability Types */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <span className="mr-2">📉</span>
                  Liability Types
                </h3>
                <div className="space-y-2">
                  {liabilityTypes.map((type) => (
                    <div key={type.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">{getCategoryIcon(type.category)}</span>
                        <div>
                          <p className="font-medium text-gray-800">{type.name}</p>
                          <p className="text-sm text-gray-500">
                            <span className={getSignColor(type.defaultSign)}>{getSignText(type.defaultSign)}</span>
                            {type.isCustom && <span className="ml-2 text-blue-600">• Custom</span>}
                          </p>
                        </div>
                      </div>
                      {type.isCustom && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => startEditType(type)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit type"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteType(type.id)}
                            disabled={deletingType === type.id}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                            title="Delete type"
                          >
                            {deletingType === type.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountTypesModal; 