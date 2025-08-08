import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getBudgetsByCategory, type Budget } from '../../firebase/config';

const PersonalBudgetCard: React.FC = () => {
  const navigate = useNavigate();
  const [personalBudgets, setPersonalBudgets] = useState<(Budget & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const budgets = await getBudgetsByCategory(user.uid, 'personal');
          setPersonalBudgets(budgets);
        } catch (error) {
          console.error('Error loading personal budgets:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const activeBudgets = personalBudgets.filter(budget => budget.isActive);

  return (
    <div 
      className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
      onClick={() => navigate('/budgets')}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">Personal Budget</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Create and manage your personal monthly budgets with detailed tracking and insights.
      </p>
      {loading ? (
        <div className="flex items-center text-indigo-600 font-medium text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Total Budgets:</span>
            <span className="font-semibold text-gray-900">{personalBudgets.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Active:</span>
            <span className="font-semibold text-gray-900">{activeBudgets.length}</span>
          </div>
        </div>
      )}
      <div className="flex items-center text-indigo-600 font-medium text-sm mt-4">
        <span>View Budgets</span>
        <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};

export default PersonalBudgetCard;
