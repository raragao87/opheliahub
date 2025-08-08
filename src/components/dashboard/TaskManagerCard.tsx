import React from 'react';
import ComingSoonCard from './ComingSoonCard';

const TaskManagerCard: React.FC = () => {
  return (
    <ComingSoonCard
      title="Task Manager"
      description="Household tasks and chores management."
      icon={
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      }
      color="from-blue-400 to-blue-600"
    />
  );
};

export default TaskManagerCard;
