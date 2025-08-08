import React, { useRef, useEffect, useState } from 'react';
import { useQuickTagging } from '../hooks/useQuickTagging';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Transaction {
  id: string;
  description: string;
  tagIds?: string[];
}

interface QuickTagEditorProps {
  transaction: Transaction;
  onTagsUpdate: (transactionId: string, newTagIds: string[]) => void;
  onClose: () => void;
  position: {
    top: number;
    left: number;
    width: number;
  };
}

const QuickTagEditor: React.FC<QuickTagEditorProps> = ({
  transaction,
  onTagsUpdate,
  onClose,
  position
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const {
    displayTags,
    suggestedTags,
    searchQuery,
    setSearchQuery,
    isLoading,
    isUpdating,
    toggleTag,
  } = useQuickTagging({ transaction, onTagsUpdate });

  // Focus search input on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => 
            prev < displayTags.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => prev > -1 ? prev - 1 : -1);
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < displayTags.length) {
            handleTagClick(displayTags[selectedIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedIndex, displayTags, onClose]);

  const handleTagClick = async (tag: Tag) => {
    await toggleTag(tag.id);
    // Don't close the editor after adding/removing a tag
    // This allows for multiple tag operations
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setSelectedIndex(-1); // Reset selection when search changes
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg"
      style={{
        top: position.top + 8,
        left: position.left,
        minWidth: Math.max(position.width, 320),
        maxWidth: 400,
      }}
    >
      {/* Search Input */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search tags..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute right-3 top-2.5 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="p-4 text-center text-sm text-gray-500">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
          Loading tags...
        </div>
      )}

      {/* Tags List */}
      {!isLoading && (
        <div className="max-h-64 overflow-y-auto">
          {/* Suggested Tags Section */}
          {suggestedTags.length > 0 && !searchQuery && (
            <div className="p-2 border-b border-gray-100">
              <div className="text-xs font-medium text-gray-500 mb-2 px-1">
                💡 Suggested for "{transaction.description.slice(0, 20)}..."
              </div>
              <div className="space-y-1">
                {suggestedTags.map((tag, index) => (
                  <TagItem
                    key={tag.id}
                    tag={tag}
                    isSelected={selectedIndex === index}
                    isUpdating={isUpdating}
                    onClick={() => handleTagClick(tag)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Tags Section */}
          <div className="p-2">
            {!searchQuery && (
              <div className="text-xs font-medium text-gray-500 mb-2 px-1">
                All Tags
              </div>
            )}
            <div className="space-y-1">
              {displayTags
                .filter(tag => !suggestedTags.find(s => s.id === tag.id) || searchQuery)
                .map((tag, index) => {
                  const adjustedIndex = suggestedTags.length > 0 && !searchQuery 
                    ? index + suggestedTags.length 
                    : index;
                  return (
                    <TagItem
                      key={tag.id}
                      tag={tag}
                      isSelected={selectedIndex === adjustedIndex}
                      isUpdating={isUpdating}
                      onClick={() => handleTagClick(tag)}
                    />
                  );
                })}
            </div>
          </div>

          {/* No Results */}
          {displayTags.length === 0 && searchQuery && (
            <div className="p-4 text-center text-sm text-gray-500">
              No tags found for "{searchQuery}"
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-2 border-t border-gray-100 text-xs text-gray-500 text-center">
        Press <kbd className="px-1 py-0.5 bg-gray-100 rounded">Esc</kbd> to close
      </div>
    </div>
  );
};

interface TagItemProps {
  tag: Tag;
  isSelected: boolean;
  isUpdating: boolean;
  onClick: () => void;
}

const TagItem: React.FC<TagItemProps> = ({ tag, isSelected, isUpdating, onClick }) => {
  return (
    <button
      onClick={onClick}
      disabled={isUpdating}
      className={`w-full flex items-center p-2 text-sm rounded-md transition-colors ${
        isSelected 
          ? 'bg-blue-50 border-blue-200' 
          : 'hover:bg-gray-50'
      } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div
        className="w-3 h-3 rounded-full mr-3 flex-shrink-0"
        style={{ backgroundColor: tag.color }}
      />
      <span className="flex-1 text-left">{tag.name}</span>
      {isUpdating && (
        <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400 ml-2"></div>
      )}
    </button>
  );
};

export default QuickTagEditor;
