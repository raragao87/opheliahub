import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getBudgets, 
  createBudget,
  type Budget
} from '../firebase/config';
import CreateBudgetModal from '../components/CreateBudgetModal';
import BudgetDetailsModal from '../components/BudgetDetailsModal';

interface BudgetPageProps {
  // Add any props if needed
}

const BudgetPage: React.FC<BudgetPageProps> = () => {
  const [user, setUser] = useState<User | null>(null);
  const [budgets, setBudgets] = useState<(Budget & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<(Budget & { id: string }) | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadBudgets();
      } else {
        setBudgets([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadBudgets = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      console.log('💰 Loading budgets for user:', user.uid);
      
      const userBudgets = await getBudgets(user.uid);
      setBudgets(userBudgets);
    } catch (error) {
      console.error('❌ Error loading budgets:', error);
      setError('Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBudget = async (budgetData: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const budgetId = await createBudget(user.uid, budgetData);
      console.log('✅ Budget created:', budgetId);
      
      // Reload budgets
      await loadBudgets();
      setShowCreateModal(false);
    } catch (error) {
      console.error('❌ Error creating budget:', error);
      setError('Failed to create budget');
    } finally {
      setLoading(false);
    }
  };

  const handleBudgetClick = (budget: Budget & { id: string }) => {
    setSelectedBudget(budget);
    setShowDetailsModal(true);
  };

  const handleBudgetUpdate = async () => {
    await loadBudgets();
  };



  const getMonthName = (month: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  };

  const getBudgetStatus = (budget: Budget & { id: string }) => {
    if (!budget.isActive) return 'inactive';
    const now = new Date();
    const budgetDate = new Date(budget.year, budget.month - 1);
    const currentDate = new Date(now.getFullYear(), now.getMonth());
    
    if (budgetDate.getTime() === currentDate.getTime()) return 'current';
    if (budgetDate > currentDate) return 'future';
    return 'past';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'current': return 'bg-green-100 text-green-800';
      case 'future': return 'bg-blue-100 text-blue-800';
      case 'past': return 'bg-gray-100 text-gray-800';
      case 'inactive': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'current': return 'Current';
      case 'future': return 'Future';
      case 'past': return 'Past';
      case 'inactive': return 'Inactive';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading budgets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Monthly Budgets</h1>
              <p className="mt-2 text-gray-600">
                Create and manage monthly budgets using tag-based categories
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Create Budget
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
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

        {/* Budgets Grid */}
        {budgets.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No budgets</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first monthly budget.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                + Create Budget
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {budgets.map((budget) => {
              const status = getBudgetStatus(budget);
              return (
                <div
                  key={budget.id}
                  onClick={() => handleBudgetClick(budget)}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {budget.name}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                      {getStatusText(status)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Month:</span>
                      <span className="font-medium">{getMonthName(budget.month)} {budget.year}</span>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Status:</span>
                      <span className={`font-medium ${budget.isActive ? 'text-green-600' : 'text-red-600'}`}>
                        {budget.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Created:</span>
                      <span className="text-gray-900">
                        {new Date(budget.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Budget Modal */}
      {showCreateModal && (
        <CreateBudgetModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreateBudget={handleCreateBudget}
        />
      )}

      {/* Budget Details Modal */}
      {showDetailsModal && selectedBudget && (
        <BudgetDetailsModal
          isOpen={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedBudget(null);
          }}
          budget={selectedBudget}
          onUpdate={handleBudgetUpdate}
        />
      )}
    </div>
  );
};

export default BudgetPage;
