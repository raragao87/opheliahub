import React from 'react';
import ComingSoonCard from './ComingSoonCard';

const FamilyInvestmentsCard: React.FC = () => {
  return (
    <ComingSoonCard
      title="Family Investments"
      description="Investment portfolios and performance tracking for family finances."
      icon={
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      }
      color="from-emerald-400 to-emerald-600"
    />
  );
};

export default FamilyInvestmentsCard;
