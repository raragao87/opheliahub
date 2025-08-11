import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getTags, 
  createTag, 
  updateTag, 
  deleteTag, 
  getDefaultTags, 
  getTransactionsByTag,
  deleteCategory,
  type Tag 
} from '../firebase/config';
import TagGroup from './TagGroup';

interface TagsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TagsModal: React.FC<TagsModalProps> = ({ isOpen, onClose }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [tagUsageCount, setTagUsageCount] = useState<number>(0);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  
  // Add/Edit form fields
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3B82F6');
  const [parentTagId, setParentTagId] = useState<string>('');
  const [categoryName, setCategoryName] = useState('');

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
      setLoading(true);
      console.log('🏷️ Loading tags for user:', userId);
      
      const userTags = await getTags(userId);
      console.log('✅ User tags loaded:', userTags.length);
      
      const defaultTags = getDefaultTags();
      console.log('✅ Default tags loaded:', defaultTags.length);
      
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
      
      console.log('✅ Combined tags:', allTags.length);
      setTags(allTags);
    } catch (error) {
      console.error('❌ Error loading tags:', error);
      setError('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };



  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !tagName.trim()) return;
    
    try {
      setLoading(true);
      setError(null);
      
      await createTag(user.uid, {
        name: tagName.trim(),
        color: tagColor,
        category: parentTagId || undefined,
        userId: user.uid,
        isDefault: false
      });
      
      await loadTags(user.uid);
      setTagName('');
      setTagColor('#3B82F6');
      setParentTagId('');
      setShowAddForm(false);
      console.log('✅ Custom tag created successfully');
    } catch (error) {
      console.error('Error creating tag:', error);
      setError('Failed to create tag');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingTag || !tagName.trim()) return;
    
    try {
      setLoading(true);
      setError(null);
      
      await updateTag(editingTag.id, {
        name: tagName.trim(),
        color: tagColor,
        category: parentTagId || undefined
      }, user.uid);
      
      await loadTags(user.uid);
      setEditingTag(null);
      setTagName('');
      setTagColor('#3B82F6');
      setParentTagId('');
      console.log('✅ Tag updated successfully');
    } catch (error) {
      console.error('Error updating tag:', error);
      setError('Failed to update tag');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!user) return;
    
    try {
      console.log('🗑️ Attempting to delete tag:', tagId);
      
      // Check if tag is in use
      const transactions = await getTransactionsByTag(tagId, user.uid);
      const usageCount = transactions.length;
      
      if (usageCount > 0) {
        setTagUsageCount(usageCount);
        setShowDeleteConfirm(tagId);
        return;
      }
      
      setDeletingTag(tagId);
      await deleteTag(tagId, user.uid);
      console.log('🔄 Reloading tags after deletion...');
      await loadTags(user.uid);
      console.log('✅ Tag deleted and UI refreshed');
    } catch (error) {
      console.error('❌ Error deleting tag:', error);
      setError('Failed to delete tag');
    } finally {
      setDeletingTag(null);
    }
  };

  const confirmDeleteTag = async () => {
    if (!user || !showDeleteConfirm) return;
    
    try {
      setDeletingTag(showDeleteConfirm);
      await deleteTag(showDeleteConfirm, user.uid);
      await loadTags(user.uid);
      console.log('✅ Tag deleted successfully');
    } catch (error) {
      console.error('Error deleting tag:', error);
      setError('Failed to delete tag');
    } finally {
      setDeletingTag(null);
      setShowDeleteConfirm(null);
      setTagUsageCount(0);
    }
  };

  const startEditTag = (tag: Tag) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setParentTagId(tag.category || '');
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setTagName('');
    setTagColor('#3B82F6');
    setParentTagId('');
  };



  const getAvailableCategories = () => {
    const categories = ['income', 'housing', 'transportation', 'food-dining', 'entertainment', 'healthcare', 'shopping', 'bills-services', 'personal-care'];
    return categories.map(category => ({
      id: category,
      name: category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ')
    }));
  };

  const handleEditCategory = (categoryId: string) => {
    setEditingCategory(categoryId);
    setCategoryName(categoryId.charAt(0).toUpperCase() + categoryId.slice(1).replace('-', ' '));
    setShowCategoryModal(true);
  };

  const handleSaveCategory = () => {
    if (!editingCategory || !categoryName.trim()) return;
    
    // For now, just log the category edit
    // In a real implementation, this would update the category in the database
    console.log('Editing category:', editingCategory, 'to:', categoryName);
    
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryName('');
  };

  const handleDeleteCategory = async (categoryName: string) => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('🗑️ Deleting category:', categoryName);
      await deleteCategory(categoryName, user.uid);
      
      // Reload tags to refresh the UI
      await loadTags(user.uid);
      
      console.log('✅ Category deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting category:', error);
      setError(`Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getTagGroups = () => {
    const incomeTags = tags.filter(tag => tag.category === 'income');
    const housingTags = tags.filter(tag => tag.category === 'housing');
    const transportationTags = tags.filter(tag => tag.category === 'transportation');
    const foodTags = tags.filter(tag => tag.category === 'food-dining');
    const entertainmentTags = tags.filter(tag => tag.category === 'entertainment');
    const healthcareTags = tags.filter(tag => tag.category === 'healthcare');
    const shoppingTags = tags.filter(tag => tag.category === 'shopping');
    const billsTags = tags.filter(tag => tag.category === 'bills-services');
    const personalCareTags = tags.filter(tag => tag.category === 'personal-care');
    const customTags = tags.filter(tag => !tag.isDefault);

    return {
      incomeTags,
      housingTags,
      transportationTags,
      foodTags,
      entertainmentTags,
      healthcareTags,
      shoppingTags,
      billsTags,
      personalCareTags,
      customTags
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Manage Tags</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Add New Tag Button */}
          {!showAddForm && !editingTag && (
            <div className="mb-6">
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add Custom Tag
              </button>
            </div>
          )}

          {/* Add/Edit Form */}
          {(showAddForm || editingTag) && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-medium text-gray-800 mb-4">
                {editingTag ? 'Edit Tag' : 'Add Custom Tag'}
              </h3>
              <form onSubmit={editingTag ? handleEditTag : handleAddTag} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tag Name *
                  </label>
                  <input
                    type="text"
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder="e.g., Coffee, Gym Membership"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Color
                    </label>
                    <input
                      type="color"
                      value={tagColor}
                      onChange={(e) => setTagColor(e.target.value)}
                      className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parent Tag
                    </label>
                    <select
                      value={parentTagId}
                      onChange={(e) => {
                        setParentTagId(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">No Category</option>
                      {getAvailableCategories().map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={editingTag ? cancelEdit : () => setShowAddForm(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : (editingTag ? 'Update Tag' : 'Add Tag')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tag Groups */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading tags...</span>
            </div>
          ) : (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Tag Categories</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <TagGroup
                  title="Income"
                  tags={getTagGroups().incomeTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Housing"
                  tags={getTagGroups().housingTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Transportation"
                  tags={getTagGroups().transportationTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Food & Dining"
                  tags={getTagGroups().foodTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Entertainment"
                  tags={getTagGroups().entertainmentTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Healthcare"
                  tags={getTagGroups().healthcareTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Shopping"
                  tags={getTagGroups().shoppingTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Bills & Services"
                  tags={getTagGroups().billsTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                <TagGroup
                  title="Personal Care"
                  tags={getTagGroups().personalCareTags}
                  onEditTag={startEditTag}
                  onDeleteTag={handleDeleteTag}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                  deletingTagId={deletingTag}
                />
                
                {getTagGroups().customTags.length > 0 && (
                  <TagGroup
                    title="Custom Tags"
                    tags={getTagGroups().customTags}
                    onEditTag={startEditTag}
                    onDeleteTag={handleDeleteTag}
                    deletingTagId={deletingTag}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Delete Tag</h3>
              <p className="text-gray-600 mb-6">
                This tag is used in {tagUsageCount} transaction(s). Are you sure you want to delete it? 
                This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(null);
                    setTagUsageCount(0);
                  }}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteTag}
                  disabled={deletingTag === showDeleteConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingTag === showDeleteConfirm ? 'Deleting...' : 'Delete Tag'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Edit Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit Category</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category Name
                  </label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowCategoryModal(false);
                      setEditingCategory(null);
                      setCategoryName('');
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCategory}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save Category
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagsModal;