import React from 'react';

interface ComingSoonCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const ComingSoonCard: React.FC<ComingSoonCardProps> = ({ title, description, icon, color }) => {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 opacity-75">
      <div className="flex items-center justify-between mb-6">
        <div className={`w-8 h-8 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
        <div className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
          Coming Soon
        </div>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        {description}
      </p>
      <div className="flex items-center text-gray-400 font-medium text-sm">
        <span>Coming Soon</span>
      </div>
    </div>
  );
};

export default ComingSoonCard;
