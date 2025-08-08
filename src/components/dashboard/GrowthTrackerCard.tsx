import React from 'react';
import { useNavigate } from 'react-router-dom';

const GrowthTrackerCard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div 
      className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
      onClick={() => navigate('/growth-tracker')}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-pink-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">Growth Tracker</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Track your child's growth and development with detailed charts and milestone tracking.
      </p>
      <div className="flex items-center text-pink-600 font-medium text-sm">
        <span>View Tracker</span>
        <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
};

export default GrowthTrackerCard;
