import React from 'react';
import ComingSoonCard from './ComingSoonCard';

const CloudStorageCard: React.FC = () => {
  return (
    <ComingSoonCard
      title="Cloud Storage"
      description="Family file storage and sharing."
      icon={
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      }
      color="from-cyan-400 to-cyan-600"
    />
  );
};

export default CloudStorageCard;
