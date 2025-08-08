import React from 'react';
import ComingSoonCard from './ComingSoonCard';

const ShoppingListsCard: React.FC = () => {
  return (
    <ComingSoonCard
      title="Shopping Lists"
      description="Grocery and shopping lists management."
      icon={
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m6 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
        </svg>
      }
      color="from-green-400 to-green-600"
    />
  );
};

export default ShoppingListsCard;
