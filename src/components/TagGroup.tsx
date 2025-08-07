import React from 'react';
import { type Tag } from '../firebase/config';

interface TagGroupProps {
  title: string;
  tags: Tag[];
  onEditTag: (tag: Tag) => void;
  onDeleteTag: (tagId: string) => void;
  onEditCategory?: (categoryId: string) => void;
  onDeleteCategory?: (categoryName: string) => void;
  deletingTagId?: string | null;
}

const TagGroup: React.FC<TagGroupProps> = ({ 
  title, 
  tags, 
  onEditTag, 
  onDeleteTag, 
  onEditCategory,
  onDeleteCategory,
  deletingTagId 
}) => {
  const getTagColor = (color: string) => {
    return color.startsWith('#') ? color : `#${color}`;
  };

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
                      <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
                  <div className="flex space-x-1">
                    {onEditCategory && (
                      <button
                        onClick={() => onEditCategory(title.toLowerCase().replace(' ', '-'))}
                        className="p-0.5 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Edit category"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {onDeleteCategory && (
                      <button
                        onClick={() => onDeleteCategory(title.toLowerCase().replace(' ', '-'))}
                        className="p-0.5 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete category"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
      <div className="space-y-0.5">
        {tags.map(tag => (
          <div
            key={tag.id}
            className="flex items-center justify-between p-1 rounded-md hover:bg-gray-50 group"
          >
            <div className="flex items-center space-x-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: getTagColor(tag.color) }}
              />
              <div>
                <p className="text-xs font-medium text-gray-800">{tag.name}</p>
                {tag.isDefault && (
                  <p className="text-xs text-gray-400">Default</p>
                )}
              </div>
            </div>
            
            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEditTag(tag)}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit tag"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => onDeleteTag(tag.id)}
                disabled={deletingTagId === tag.id}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Delete tag"
              >
                {deletingTagId === tag.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TagGroup; 