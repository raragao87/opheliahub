import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAccountTypes, createAccountType, type AccountType } from '../firebase/config';

interface AccountTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onAccountTypeCreated?: (newType: AccountType) => void;
  disabled?: boolean;
}

const AccountTypeSelector: React.FC<AccountTypeSelectorProps> = ({
  value,
  onChange,
  onAccountTypeCreated,
  disabled = false
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTypeName, setCustomTypeName] = useState('');
  const [customTypeCategory, setCustomTypeCategory] = useState<'asset' | 'liability'>('asset');
  const [customTypeSign, setCustomTypeSign] = useState<'positive' | 'negative'>('positive');

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
      console.log('🔄 Loading account types for user:', userId);
      const types = await getAccountTypes(userId);
      console.log('✅ Account types loaded:', types.map(t => ({ id: t.id, name: t.name, isCustom: t.isCustom })));
      setAccountTypes(types);
    } catch (error) {
      console.error('❌ Error loading account types:', error);
      // Set empty array to prevent undefined errors
      setAccountTypes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomType = async () => {
    if (!user || !customTypeName.trim()) return;

    try {
      const newTypeId = await createAccountType(user.uid, {
        name: customTypeName.trim(),
        defaultSign: customTypeSign,
        category: customTypeCategory,
        isCustom: true,
        userId: user.uid
      });

      // Reload account types
      await loadAccountTypes(user.uid);

      // Reset form
      setCustomTypeName('');
      setCustomTypeCategory('asset');
      setCustomTypeSign('positive');
      setShowCustomForm(false);

      // Notify parent component
      if (onAccountTypeCreated) {
        const createdType = accountTypes.find(t => t.id === newTypeId) || {
          id: newTypeId,
          name: customTypeName.trim(),
          defaultSign: customTypeSign,
          category: customTypeCategory,
          isCustom: true,
          userId: user.uid
        };
        onAccountTypeCreated(createdType);
      }

      // Select the new type
      onChange(newTypeId);
    } catch (error) {
      console.error('Error creating custom account type:', error);
    }
  };

  const getAccountTypeIcon = (type: AccountType) => {
    switch (type.category) {
      case 'asset':
        return '📈';
      case 'liability':
        return '📉';
      default:
        return '💼';
    }
  };

  const getAccountTypeColor = (type: AccountType) => {
    switch (type.category) {
      case 'asset':
        return 'text-green-600';
      case 'liability':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const groupedTypes = accountTypes.reduce((groups, type) => {
    const category = type.category === 'asset' ? 'Assets' : 'Liabilities';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(type);
    return groups;
  }, {} as Record<string, AccountType[]>);

  return (
    <div className="space-y-2">
      {/* Account Type Dropdown */}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || loading}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          <option value="">Select account type</option>
          {Object.entries(groupedTypes).map(([category, types]) => (
            <optgroup key={category} label={category}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.defaultSign === 'positive' ? '+' : '-'})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        
        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>

      {/* Selected Type Display */}
      {value && !loading && (
        <div className="p-3 bg-gray-50 rounded-lg">
          {(() => {
            const selectedType = accountTypes.find(t => t.id === value);
            if (!selectedType) return null;
            
            return (
              <div className="flex items-center space-x-3">
                <span className="text-lg">{getAccountTypeIcon(selectedType)}</span>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{selectedType.name}</p>
                  <p className="text-sm text-gray-600">
                    {selectedType.category} • {selectedType.defaultSign === 'positive' ? 'Positive' : 'Negative'} balance
                  </p>
                </div>
                <span className={`text-sm font-medium ${getAccountTypeColor(selectedType)}`}>
                  {selectedType.defaultSign === 'positive' ? '+' : '-'}
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Create Custom Type Button */}
      {!showCustomForm && (
        <button
          type="button"
          onClick={() => setShowCustomForm(true)}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 hover:border-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Create custom account type
        </button>
      )}

      {/* Custom Type Form */}
      {showCustomForm && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-medium text-gray-800 mb-3">Create Custom Account Type</h4>
          
          <div className="space-y-3">
            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Type Name
              </label>
              <input
                type="text"
                value={customTypeName}
                onChange={(e) => setCustomTypeName(e.target.value)}
                placeholder="e.g., Emergency Fund, Student Loan"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="asset"
                    checked={customTypeCategory === 'asset'}
                    onChange={(e) => {
                      setCustomTypeCategory(e.target.value as 'asset');
                      setCustomTypeSign('positive');
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm">Asset (Positive balance)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="liability"
                    checked={customTypeCategory === 'liability'}
                    onChange={(e) => {
                      setCustomTypeCategory(e.target.value as 'liability');
                      setCustomTypeSign('negative');
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm">Liability (Negative balance)</span>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={handleCreateCustomType}
                disabled={!customTypeName.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Type
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomForm(false);
                  setCustomTypeName('');
                  setCustomTypeCategory('asset');
                  setCustomTypeSign('positive');
                }}
                className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountTypeSelector; 