import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getBudgetVsActual, 
  createBudgetItem, 
  updateBudgetItem, 
  deleteBudgetItem,
  getTags, 
  getDefaultTags,
  type Budget, 
  type BudgetItem,
  type Tag 
} from '../firebase/config';
import TagSelector from './TagSelector';

interface BudgetDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: Budget & { id: string };
  onUpdate: () => void;
}

const BudgetDetailsModal: React.FC<BudgetDetailsModalProps> = ({
  isOpen,
  onClose,
  budget,
  onUpdate
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetData, setBudgetData] = useState<any>(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  // Form state for adding/editing items
  const [category, setCategory] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [budgetedAmount, setBudgetedAmount] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadBudgetData();
        loadTags();
      }
    });

    return () => unsubscribe();
  }, [budget.id]);

  const loadBudgetData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await getBudgetVsActual(budget.id, user.uid);
      setBudgetData(data);
    } catch (error) {
      console.error('Error loading budget data:', error);
      setError('Failed to load budget data');
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    if (!user) return;
    
    try {
      const userTags = await getTags(user.uid);
      const defaultTags = getDefaultTags();
      const tagMap = new Map();
      
      defaultTags.forEach(tag => tagMap.set(tag.id, tag));
      userTags.forEach(tag => tagMap.set(tag.id, tag));
      
      const allTags = Array.from(tagMap.values());
      setAvailableTags(allTags);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    if (!category.trim() || tagIds.length === 0 || budgetedAmount <= 0) {
      setError('Please fill in all required fields');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const budgetItemData: Omit<BudgetItem, 'id' | 'createdAt' | 'updatedAt'> = {
        budgetId: budget.id,
        category: category.trim(),
        tagIds,
        budgetedAmount
      };
      
      await createBudgetItem(user.uid, budgetItemData);
      
      // Reset form
      setCategory('');
      setTagIds([]);
      setBudgetedAmount(0);
      setShowAddItemModal(false);
      
      // Reload budget data
      await loadBudgetData();
      onUpdate();
    } catch (error) {
      console.error('Error adding budget item:', error);
      setError('Failed to add budget item');
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !editingItem) return;
    
    if (!category.trim() || tagIds.length === 0 || budgetedAmount <= 0) {
      setError('Please fill in all required fields');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const updates: Partial<BudgetItem> = {
        category: category.trim(),
        tagIds,
        budgetedAmount
      };
      
      await updateBudgetItem(editingItem.id, updates, user.uid);
      
      // Reset form
      setCategory('');
      setTagIds([]);
      setBudgetedAmount(0);
      setEditingItem(null);
      
      // Reload budget data
      await loadBudgetData();
      onUpdate();
    } catch (error) {
      console.error('Error updating budget item:', error);
      setError('Failed to update budget item');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this budget item?')) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      await deleteBudgetItem(itemId, user.uid);
      
      // Reload budget data
      await loadBudgetData();
      onUpdate();
    } catch (error) {
      console.error('Error deleting budget item:', error);
      setError('Failed to delete budget item');
    } finally {
      setLoading(false);
    }
  };

  const startEditItem = (item: BudgetItem) => {
    setEditingItem(item);
    setCategory(item.category);
    setTagIds(item.tagIds);
    setBudgetedAmount(item.budgetedAmount);
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setCategory('');
    setTagIds([]);
    setBudgetedAmount(0);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getMonthName = (month: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getTagNames = (tagIds: string[]) => {
    return tagIds
      .map(id => availableTags.find(tag => tag.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-4/5 lg:w-3/4 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-medium text-gray-900">{budget.name}</h3>
              <p className="text-sm text-gray-500">
                {getMonthName(budget.month)} {budget.year} • {budget.isActive ? 'Active' : 'Inactive'}
              </p>
            </div>
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

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading budget data...</span>
            </div>
          ) : budgetData ? (
            <>
              {/* Budget Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800">Total Budgeted</h4>
                  <p className="text-2xl font-bold text-blue-900">{formatCurrency(budgetData.totalBudgeted)}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-green-800">Total Spent</h4>
                  <p className="text-2xl font-bold text-green-900">{formatCurrency(budgetData.totalSpent)}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-yellow-800">Remaining</h4>
                  <p className="text-2xl font-bold text-yellow-900">{formatCurrency(budgetData.totalRemaining)}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-purple-800">Used</h4>
                  <p className="text-2xl font-bold text-purple-900">{budgetData.overallPercentageUsed.toFixed(1)}%</p>
                </div>
              </div>

              {/* Budget Items */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-medium text-gray-900">Budget Categories</h4>
                  <button
                    onClick={() => setShowAddItemModal(true)}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    + Add Category
                  </button>
                </div>

                {budgetData.budgetItems.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-gray-500">No budget categories found.</p>
                    <p className="text-sm text-gray-400 mt-1">Click "Add Category" to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {budgetData.budgetItems.map((item: any) => (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h5 className="font-medium text-gray-900">{item.category}</h5>
                            <p className="text-sm text-gray-500">
                              Tags: {getTagNames(item.tagIds)}
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => startEditItem(item)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                          <div>
                            <p className="text-sm text-gray-500">Budgeted</p>
                            <p className="font-medium">{formatCurrency(item.budgetedAmount)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Spent</p>
                            <p className="font-medium">{formatCurrency(item.actualSpent)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Remaining</p>
                            <p className="font-medium">{formatCurrency(item.remaining)}</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getProgressColor(item.percentageUsed)}`}
                            style={{ width: `${Math.min(item.percentageUsed, 100)}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.percentageUsed.toFixed(1)}% used
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Add Budget Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add Budget Category</h3>
                <button
                  onClick={() => setShowAddItemModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAddItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., Housing, Food, Transportation"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags *
                  </label>
                  <TagSelector
                    selectedTagIds={tagIds}
                    onTagChange={setTagIds}
                    placeholder="Select tags..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Budgeted Amount *
                  </label>
                  <input
                    type="number"
                    value={budgetedAmount}
                    onChange={(e) => setBudgetedAmount(Number(e.target.value))}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Budget Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Budget Category</h3>
                <button
                  onClick={cancelEdit}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleEditItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., Housing, Food, Transportation"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags *
                  </label>
                  <TagSelector
                    selectedTagIds={tagIds}
                    onTagChange={setTagIds}
                    placeholder="Select tags..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Budgeted Amount *
                  </label>
                  <input
                    type="number"
                    value={budgetedAmount}
                    onChange={(e) => setBudgetedAmount(Number(e.target.value))}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Update Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetDetailsModal;
