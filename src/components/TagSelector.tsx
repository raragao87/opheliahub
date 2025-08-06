import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { getTags, getDefaultTags, type Tag } from '../firebase/config';

interface TagSelectorProps {
  selectedTagIds: string[];
  onTagChange: (tagIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

const TagSelector: React.FC<TagSelectorProps> = ({
  selectedTagIds,
  onTagChange,
  disabled = false,
  placeholder = "Select tags..."
}) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadTags(user.uid);
      }
    });
    return unsubscribe;
  }, []);

  const loadTags = async (userId: string) => {
    try {
      setLoading(true);
      const userTags = await getTags(userId);
      const defaultTags = getDefaultTags();
      
      // Combine user tags with default tags, avoiding duplicates
      const allTags = [...defaultTags];
      userTags.forEach(userTag => {
        const existingIndex = allTags.findIndex(t => t.id === userTag.id);
        if (existingIndex >= 0) {
          allTags[existingIndex] = userTag; // User tag overrides default
        } else {
          allTags.push(userTag);
        }
      });
      
      setTags(allTags);
    } catch (error) {
      console.error('Error loading tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTagToggle = (tagId: string) => {
    const newSelectedTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId];
    
    onTagChange(newSelectedTagIds);
  };

  const removeTag = (tagId: string) => {
    const newSelectedTagIds = selectedTagIds.filter(id => id !== tagId);
    onTagChange(newSelectedTagIds);
  };

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id));

  const getTagColor = (color: string) => {
    return color.startsWith('#') ? color : `#${color}`;
  };

  return (
    <div className="relative">
      {/* Selected Tags Display */}
      {selectedTags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedTags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: getTagColor(tag.color) }}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="ml-1 text-white hover:text-gray-200"
                disabled={disabled}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tag Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full px-3 py-2 text-left border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-gray-400'
          }`}
        >
          <span className={selectedTags.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
            {selectedTags.length === 0 ? placeholder : `${selectedTags.length} tag(s) selected`}
          </span>
          <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {/* Search */}
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Tags List */}
            <div className="p-1">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-sm text-gray-600">Loading tags...</span>
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-500">
                  No tags found
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredTags.map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className={`w-full flex items-center px-2 py-1 text-sm rounded hover:bg-gray-100 ${
                        selectedTagIds.includes(tag.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div
                        className="w-3 h-3 rounded-full mr-2 border border-white shadow-sm"
                        style={{ backgroundColor: getTagColor(tag.color) }}
                      />
                      <span className="flex-1 text-left">{tag.name}</span>
                      {selectedTagIds.includes(tag.id) && (
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default TagSelector; 