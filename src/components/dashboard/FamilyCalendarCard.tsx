import React from 'react';
import ComingSoonCard from './ComingSoonCard';

const FamilyCalendarCard: React.FC = () => {
  return (
    <ComingSoonCard
      title="Family Calendar"
      description="Family events and schedules management."
      icon={
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      }
      color="from-purple-400 to-purple-600"
    />
  );
};

export default FamilyCalendarCard;
