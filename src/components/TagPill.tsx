import React from 'react';

interface TagPillProps {
  tag: {
    id: string;
    name: string;
    color: string;
  };
  onRemove?: (tagId: string) => void;
  removable?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const TagPill: React.FC<TagPillProps> = ({ 
  tag, 
  onRemove, 
  removable = true, 
  size = 'sm',
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5'
  };

  const removeButtonClasses = {
    sm: 'w-3 h-3 text-xs',
    md: 'w-4 h-4 text-sm'
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium text-white ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: tag.color }}
    >
      <span className="flex items-center">
        <span 
          className="w-1.5 h-1.5 rounded-full bg-white bg-opacity-30 mr-1.5"
          style={{ backgroundColor: `${tag.color}40` }}
        />
        {tag.name}
      </span>
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag.id);
          }}
          className={`ml-1.5 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors ${removeButtonClasses[size]} flex items-center justify-center`}
          title={`Remove ${tag.name} tag`}
        >
          <svg 
            className="w-full h-full" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={3} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
        </button>
      )}
    </span>
  );
};

export default TagPill;
