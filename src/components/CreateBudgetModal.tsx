import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { createBudget, createBudgetItem, type Budget, type BudgetItem } from '../firebase/config';
import TagSelector from './TagSelector';

interface CreateBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateBudget: (budgetData: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

const CreateBudgetModal: React.FC<CreateBudgetModalProps> = ({
  isOpen,
  onClose,
  onCreateBudget
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isActive, setIsActive] = useState(true);
  
  // Budget items state
  const [budgetItems, setBudgetItems] = useState<Array<{
    category: string;
    tagIds: string[];
    budgetedAmount: number;
  }>>([]);
  


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    if (!name.trim()) {
      setError('Budget name is required');
      return;
    }
    
    if (budgetItems.length === 0) {
      setError('At least one budget item is required');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const budgetData: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> = {
        name: name.trim(),
        month,
        year,
        userId: user.uid,
        isActive
      };
      
      // Create the budget first
      const budgetId = await createBudget(user.uid, budgetData);
      
      // Create budget items
      for (const item of budgetItems) {
        if (item.category.trim() && item.tagIds.length > 0 && item.budgetedAmount > 0) {
          const budgetItemData: Omit<BudgetItem, 'id' | 'createdAt' | 'updatedAt'> = {
            budgetId,
            category: item.category.trim(),
            tagIds: item.tagIds,
            budgetedAmount: item.budgetedAmount
          };
          await createBudgetItem(user.uid, budgetItemData);
        }
      }
      
      // Call the parent's onCreateBudget to refresh the budget list
      await onCreateBudget(budgetData);
      
      // Reset form
      setName('');
      setMonth(new Date().getMonth() + 1);
      setYear(new Date().getFullYear());
      setIsActive(true);
      setBudgetItems([]);
      onClose();
    } catch (error) {
      console.error('Error creating budget:', error);
      setError('Failed to create budget');
    } finally {
      setLoading(false);
    }
  };

  const addBudgetItem = () => {
    setBudgetItems([
      ...budgetItems,
      {
        category: '',
        tagIds: [],
        budgetedAmount: 0
      }
    ]);
  };

  const removeBudgetItem = (index: number) => {
    setBudgetItems(budgetItems.filter((_, i) => i !== index));
  };

  const updateBudgetItem = (index: number, field: string, value: any) => {
    const updatedItems = [...budgetItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    setBudgetItems(updatedItems);
  };

  const getMonthOptions = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    return months.map((month, index) => (
      <option key={index + 1} value={index + 1}>
        {month}
      </option>
    ));
  };

  const getYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    
    for (let i = currentYear - 2; i <= currentYear + 2; i++) {
      years.push(i);
    }
    
    return years.map(year => (
      <option key={year} value={year}>
        {year}
      </option>
    ));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">Create Monthly Budget</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Budget Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Budget Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., January 2024 Budget"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Month
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {getMonthOptions()}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Year
                </label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {getYearOptions()}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                    Active Budget
                  </label>
                </div>
              </div>
            </div>

            {/* Budget Items */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">Budget Categories</h4>
                <button
                  type="button"
                  onClick={addBudgetItem}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  + Add Category
                </button>
              </div>
              
              {budgetItems.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <p className="text-gray-500">No budget categories added yet.</p>
                  <p className="text-sm text-gray-400 mt-1">Click "Add Category" to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {budgetItems.map((item, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-medium text-gray-900">Category {index + 1}</h5>
                        <button
                          type="button"
                          onClick={() => removeBudgetItem(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Category Name
                          </label>
                          <input
                            type="text"
                            value={item.category}
                            onChange={(e) => updateBudgetItem(index, 'category', e.target.value)}
                            placeholder="e.g., Housing, Food, Transportation"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tags
                          </label>
                          <TagSelector
                            selectedTagIds={item.tagIds}
                            onTagChange={(tagIds) => updateBudgetItem(index, 'tagIds', tagIds)}
                            placeholder="Select tags..."
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Budgeted Amount
                          </label>
                          <input
                            type="number"
                            value={item.budgetedAmount}
                            onChange={(e) => updateBudgetItem(index, 'budgetedAmount', Number(e.target.value))}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Budget'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateBudgetModal;
