import React, { useState, useEffect } from 'react';
import { type Tag } from '../firebase/config';
import { getTags, createTag } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase/config';

interface InlineTagInputProps {
  transactionId: string;
  selectedTags: Tag[];
  onTagsUpdate: (transactionId: string, tagIds: string[]) => void;
}

const InlineTagInput: React.FC<InlineTagInputProps> = ({ 
  transactionId, 
  selectedTags, 
  onTagsUpdate 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadTags(user.uid);
      }
    });
    return unsubscribe;
  }, []);

  const loadTags = async (userId: string) => {
    try {
      const tags = await getTags(userId);
      setAllTags(tags);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };

  const removeTag = (tagId: string) => {
    const newTagIds = selectedTags
      .filter(tag => tag.id !== tagId)
      .map(tag => tag.id);
    onTagsUpdate(transactionId, newTagIds);
  };

  const addTag = (tag: Tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      const newTagIds = [...selectedTags.map(t => t.id), tag.id];
      onTagsUpdate(transactionId, newTagIds);
    }
    setInputValue('');
    setShowSuggestions(false);
    setIsEditing(false);
  };

  const createNewTag = async () => {
    if (!user || !inputValue.trim()) return;
    
    setIsLoading(true);
    try {
      // Generate a random color for the new tag
      const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      const newTagId = await createTag(user.uid, {
        name: inputValue.trim(),
        color: randomColor,
        category: 'custom',
        userId: user.uid,
        isDefault: false
      });
      
      // Reload tags to get the new one
      await loadTags(user.uid);
      
      // Add the new tag to the transaction
      const newTag = allTags.find(t => t.id === newTagId) || {
        id: newTagId,
        name: inputValue.trim(),
        color: randomColor,
        category: 'custom',
        userId: user.uid,
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      addTag(newTag);
    } catch (error) {
      console.error('Error creating tag:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    if (value.trim()) {
      const filtered = allTags.filter(tag => 
        tag.name.toLowerCase().includes(value.toLowerCase()) &&
        !selectedTags.find(selected => selected.id === tag.id)
      );
      setFilteredTags(filtered);
      setShowSuggestions(filtered.length > 0 || value.trim().length > 0);
    } else {
      setFilteredTags([]);
      setShowSuggestions(false);
    }
  };

  const handleInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTags.length > 0) {
        addTag(filteredTags[0]);
      } else if (inputValue.trim()) {
        createNewTag();
      }
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      setShowSuggestions(false);
      setIsEditing(false);
      setInputValue('');
    }, 200);
  };

  if (!isEditing) {
    return (
      <div 
        onClick={() => setIsEditing(true)} 
        className="cursor-text min-h-[2rem] hover:bg-gray-50 rounded px-2 py-1 transition-colors"
      >
        {selectedTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selectedTags.map(tag => (
              <span 
                key={tag.id} 
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white" 
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    removeTag(tag.id); 
                  }} 
                  className="ml-1 hover:bg-black/20 rounded-full w-4 h-4 flex items-center justify-center text-white/80 hover:text-white"
                  title="Remove tag"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400 text-sm">Add tags...</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyPress}
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="Type tag name..."
        autoFocus
      />
      
      {showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filteredTags.length > 0 && (
            <div className="py-1">
              {filteredTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => addTag(tag)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <span 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          
          {inputValue.trim() && (
            <div className="border-t border-gray-200 py-1">
              <button
                onClick={createNewTag}
                disabled={isLoading}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 text-blue-600 flex items-center gap-2"
              >
                <span className="text-lg">+</span>
                {isLoading ? 'Creating...' : `Create "${inputValue.trim()}"`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InlineTagInput;
