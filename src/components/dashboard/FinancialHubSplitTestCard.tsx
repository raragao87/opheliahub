import React from 'react';
import { useNavigate } from 'react-router-dom';

const FinancialHubSplitTestCard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all duration-200 cursor-pointer"
         onClick={() => navigate('/financial-hub')}>
      <div className="flex items-center justify-between mb-4">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
          <span className="text-2xl">💰</span>
        </div>
        <div className="text-right">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Financial Hub</h3>
      <p className="text-gray-600 text-sm mb-4">
        Manage accounts, transactions, and financial data with advanced features
      </p>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Split View • Tags • Import</span>
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default FinancialHubSplitTestCard;
