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
  createCategory,
  getCategories,
  updateCategory,
  deleteCategoryById,
  createSubcategory,
  getSubcategories,
  updateSubcategory,
  deleteSubcategory,
  type Tag,
  type TagCategory as FirebaseTagCategory,
  type TagSubcategory as FirebaseTagSubcategory
} from '../firebase/config';

// Interfaces for hierarchical structure (extending Firebase types with UI-specific fields)
interface TagCategory extends Omit<FirebaseTagCategory, 'createdAt' | 'updatedAt'> {
  subcategories: TagSubcategory[];
}

interface TagSubcategory extends Omit<FirebaseTagSubcategory, 'createdAt' | 'updatedAt'> {
  tags: Tag[];
}

interface TagsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Toast notification component
const Toast: React.FC<{
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-100 border-green-500 text-green-700' :
                  type === 'error' ? 'bg-red-100 border-red-500 text-red-700' :
                  'bg-blue-100 border-blue-500 text-blue-700';

  return (
    <div className={`fixed top-4 right-4 z-[60] p-4 border rounded-lg shadow-lg ${bgColor} flex items-center`}>
      <span className="mr-2">
        {type === 'success' && '✅'}
        {type === 'error' && '❌'}
        {type === 'info' && 'ℹ️'}
      </span>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-3 text-lg font-semibold opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
};

// Inline editable field component
const InlineEditField: React.FC<{
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  isLoading?: boolean;
}> = ({ value, onSave, className = "", placeholder = "", isLoading = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue !== value && trimmedValue) {
      onSave(trimmedValue);
    } else if (!trimmedValue) {
      setEditValue(value); // Reset to original if empty
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="relative">
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyPress}
          placeholder={placeholder}
          className={`bg-white border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
          autoFocus
          disabled={isLoading}
        />
        {isLoading && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      onClick={() => {
        if (!isLoading) {
          setIsEditing(true);
          setEditValue(value);
        }
      }}
      className={`cursor-pointer hover:bg-gray-100 rounded px-2 py-1 transition-colors ${isLoading ? 'opacity-50' : ''} ${className}`}
      title={isLoading ? 'Loading...' : 'Click to edit'}
    >
      {value || placeholder}
    </span>
  );
};

const TagsModal: React.FC<TagsModalProps> = ({ isOpen, onClose }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [tagUsageCount, setTagUsageCount] = useState<Record<string, number>>({});
  const [operationLoading, setOperationLoading] = useState<Record<string, boolean>>({});
  
  // Delete confirmation states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{
    type: 'category' | 'subcategory' | 'tag';
    id: string;
    name: string;
    usageCount?: number;
    canDelete?: boolean;
  } | null>(null);

  // Replace tag modal states
  const [showReplaceTagModal, setShowReplaceTagModal] = useState<{
    tagToReplace: string;
    tagName: string;
    availableTags: Tag[];
  } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadTags(user.uid);
      }
    });
    return unsubscribe;
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const loadTags = async (userId: string) => {
    try {
      setLoading(true);
      console.log('🏷️ Loading tags, categories, and subcategories for user:', userId);
      
      // Load all data concurrently
      const [userTags, userCategories, userSubcategories] = await Promise.all([
        getTags(userId),
        getCategories(userId),
        getSubcategories(userId)
      ]);
      
      const defaultTags = getDefaultTags();
      
      // Combine user tags with default tags
      const allTags = [...defaultTags];
      userTags.forEach(userTag => {
        const existingIndex = allTags.findIndex(t => t.id === userTag.id);
        if (existingIndex >= 0) {
          allTags[existingIndex] = userTag;
        } else {
          allTags.push(userTag);
        }
      });
      
      setTags(allTags);
      await buildCategoryStructure(allTags, userCategories, userSubcategories);
      
      // Load usage counts for all tags
      await loadTagUsageCounts(userId, allTags);
    } catch (error) {
      console.error('❌ Error loading tags:', error);
      setError('Failed to load tags');
      showToast('Failed to load tags', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTagUsageCounts = async (userId: string, allTags: Tag[]) => {
    try {
      const usageCounts: Record<string, number> = {};
      
      // Load usage count for each tag
      await Promise.all(
        allTags.map(async (tag) => {
          try {
            const transactions = await getTransactionsByTag(tag.id, userId);
            usageCounts[tag.id] = transactions.length;
          } catch (error) {
            console.error(`Error loading usage count for tag ${tag.id}:`, error);
            usageCounts[tag.id] = 0;
          }
        })
      );
      
      setTagUsageCount(usageCounts);
    } catch (error) {
      console.error('Error loading tag usage counts:', error);
    }
  };

  const buildCategoryStructure = async (allTags: Tag[], userCategories: FirebaseTagCategory[], userSubcategories: FirebaseTagSubcategory[]) => {
    // Define default category structure for backward compatibility
    const defaultCategoryConfigs = [
      { id: 'income', name: 'Income', color: '#10B981' },
      { id: 'housing', name: 'Housing', color: '#3B82F6' },
      { id: 'transportation', name: 'Transportation', color: '#8B5CF6' },
      { id: 'food-dining', name: 'Food & Dining', color: '#EF4444' },
      { id: 'entertainment', name: 'Entertainment', color: '#F59E0B' },
      { id: 'healthcare', name: 'Healthcare', color: '#06B6D4' },
      { id: 'shopping', name: 'Shopping', color: '#EC4899' },
      { id: 'bills-services', name: 'Bills & Services', color: '#84CC16' },
      { id: 'personal-care', name: 'Personal Care', color: '#6366F1' }
    ];
    
    // Combine default categories with user-created categories
    const allCategoryConfigs = [
      ...defaultCategoryConfigs,
      ...userCategories.map(cat => ({
        id: cat.id,
        name: cat.name,
        color: cat.color
      }))
    ];

    const categoryStructure: TagCategory[] = allCategoryConfigs.map(catConfig => {
      // Find tags that belong to this category (legacy category field or via subcategory)
      const directCategoryTags = allTags.filter(tag => tag.category === catConfig.id);
      const subcategoryTags = allTags.filter(tag => 
        tag.subcategoryId && userSubcategories.find(sub => sub.id === tag.subcategoryId && sub.categoryId === catConfig.id)
      );
      const categoryTags = [...directCategoryTags, ...subcategoryTags];
      
      // Get subcategories for this category
      const categorySubcategories = userSubcategories.filter(sub => sub.categoryId === catConfig.id);
      
      const subcategories: TagSubcategory[] = [];
      
      // Add user-created subcategories
      categorySubcategories.forEach(subcat => {
        const subcategoryTags = allTags.filter(tag => tag.subcategoryId === subcat.id);
        subcategories.push({
          ...subcat,
          tags: subcategoryTags
        });
      });
      
      // If there are direct category tags (legacy), create a "General" subcategory
      if (directCategoryTags.length > 0) {
        subcategories.unshift({
          id: `${catConfig.id}-general`,
          name: 'General',
          categoryId: catConfig.id,
          color: catConfig.color,
          userId: '', // Not stored in Firebase
          isDefault: true,
          tags: directCategoryTags
        });
      }
      
      return {
        ...catConfig,
        userId: userCategories.find(c => c.id === catConfig.id)?.userId || '',
        isDefault: defaultCategoryConfigs.some(dc => dc.id === catConfig.id),
        subcategories
      };
    });

    // Handle custom tags (tags without a category or subcategory)
    const customTags = allTags.filter(tag => 
      !tag.category && 
      !tag.subcategoryId && 
      !tag.isDefault
    );
    if (customTags.length > 0) {
      const customCategory: TagCategory = {
        id: 'custom',
        name: 'Custom Tags',
        color: '#6B7280',
        userId: '',
        isDefault: false,
        subcategories: [{
          id: 'custom-general',
          name: 'General',
          categoryId: 'custom',
          color: '#6B7280',
          userId: '',
          isDefault: false,
          tags: customTags
        }]
      };
      categoryStructure.push(customCategory);
    }

    // Filter out categories with no subcategories (unless they're being edited)
    const filteredCategories = categoryStructure.filter(cat => 
      cat.subcategories.length > 0 || cat.id.startsWith('temp-')
    );
    
    setCategories(filteredCategories);
  };

  const validateName = (name: string, type: string): boolean => {
    if (!name || !name.trim()) {
      showToast(`${type} name cannot be empty`, 'error');
      return false;
    }
    if (name.trim().length < 2) {
      showToast(`${type} name must be at least 2 characters`, 'error');
      return false;
    }
    return true;
  };

  const setOperationLoadingState = (id: string, isLoading: boolean) => {
    setOperationLoading(prev => ({
      ...prev,
      [id]: isLoading
    }));
  };

  const handleAddCategory = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log('📂 Adding new category');
      
      const newCategoryData = {
        name: 'New Category',
        color: '#3B82F6',
        userId: user.uid,
        isDefault: false
      };
      
      const newCategoryId = await createCategory(user.uid, newCategoryData);
      console.log('✅ Category created with ID:', newCategoryId);
      
      // Reload all data to reflect changes
      await loadTags(user.uid);
      showToast('New category created successfully. Click to rename it.', 'success');
    } catch (error) {
      console.error('Error creating category:', error);
      showToast('Failed to create category. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubcategory = async (categoryId: string) => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log('📁 Adding new subcategory to category:', categoryId);
      
      const category = categories.find(cat => cat.id === categoryId);
      if (!category) {
        showToast('Category not found', 'error');
        return;
      }
      
      const newSubcategoryData = {
        name: 'New Subcategory',
        categoryId: categoryId,
        color: category.color,
        userId: user.uid,
        isDefault: false
      };
      
      const newSubcategoryId = await createSubcategory(user.uid, newSubcategoryData);
      console.log('✅ Subcategory created with ID:', newSubcategoryId);
      
      // Reload all data to reflect changes
      await loadTags(user.uid);
      showToast('New subcategory created successfully. Click to rename it.', 'success');
    } catch (error) {
      console.error('Error creating subcategory:', error);
      showToast('Failed to create subcategory. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = async (subcategoryId: string) => {
    if (!user) return;
    
    const subcategory = categories
      .flatMap(cat => cat.subcategories)
      .find(sub => sub.id === subcategoryId);
    
    if (!subcategory) return;

    const operationId = `add-tag-${subcategoryId}`;
    setOperationLoadingState(operationId, true);

    try {
      const newTagData = {
        name: 'New Tag',
        color: subcategory.color,
        category: subcategory.categoryId === 'custom' ? undefined : subcategory.categoryId, // Legacy support
        subcategoryId: subcategory.id.includes('-general') ? undefined : subcategory.id, // Only set for real subcategories
        userId: user.uid,
        isDefault: false
      };

      console.log('🏷️ Creating new tag with data:', newTagData);
      const newTagId = await createTag(user.uid, newTagData);
      console.log('✅ Tag created successfully with ID:', newTagId);
      
      // Reload tags to get the fresh data from database
      await loadTags(user.uid);
      showToast('New tag created successfully. Click to rename it.', 'success');
    } catch (error) {
      console.error('Error creating tag:', error);
      showToast('Failed to create tag. Please try again.', 'error');
    } finally {
      setOperationLoadingState(operationId, false);
    }
  };

  const handleUpdateCategoryName = async (categoryId: string, newName: string) => {
    if (!user || !validateName(newName, 'Category')) return;
    
    // Skip update for temporary categories or default categories
    if (categoryId.startsWith('temp-') || categoryId === 'custom') {
      setCategories(categories.map(cat => 
        cat.id === categoryId ? { ...cat, name: newName } : cat
      ));
      showToast('Category name updated locally', 'info');
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Updating category name:', categoryId, 'to:', newName);
      
      await updateCategory(categoryId, { name: newName }, user.uid);
      console.log('✅ Category name updated successfully');
      
      // Reload all data to reflect changes
      await loadTags(user.uid);
      showToast('Category name updated successfully', 'success');
    } catch (error) {
      console.error('Error updating category name:', error);
      showToast('Failed to update category name', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSubcategoryName = async (subcategoryId: string, newName: string) => {
    if (!user || !validateName(newName, 'Subcategory')) return;
    
    // Skip update for temporary subcategories or default subcategories
    if (subcategoryId.startsWith('temp-') || subcategoryId.includes('-general')) {
      setCategories(categories.map(cat => ({
        ...cat,
        subcategories: cat.subcategories.map(sub => 
          sub.id === subcategoryId ? { ...sub, name: newName } : sub
        )
      })));
      showToast('Subcategory name updated locally', 'info');
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Updating subcategory name:', subcategoryId, 'to:', newName);
      
      await updateSubcategory(subcategoryId, { name: newName }, user.uid);
      console.log('✅ Subcategory name updated successfully');
      
      // Reload all data to reflect changes
      await loadTags(user.uid);
      showToast('Subcategory name updated successfully', 'success');
    } catch (error) {
      console.error('Error updating subcategory name:', error);
      showToast('Failed to update subcategory name', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTagName = async (tagId: string, newName: string) => {
    if (!user || !validateName(newName, 'Tag')) return;
    
    setOperationLoadingState(tagId, true);

    try {
      console.log('🏷️ Updating tag name:', tagId, 'to:', newName);
      await updateTag(tagId, { name: newName }, user.uid);
      console.log('✅ Tag name updated successfully');
      
      // Reload tags to reflect changes
      await loadTags(user.uid);
      showToast('Tag name updated successfully', 'success');
    } catch (error) {
      console.error('Error updating tag:', error);
      showToast('Failed to update tag name', 'error');
    } finally {
      setOperationLoadingState(tagId, false);
    }
  };

  const handleDeleteRequest = async (type: 'category' | 'subcategory' | 'tag', id: string, name: string) => {
    if (type === 'tag' && user) {
      // Check if tag can be deleted
      const usageCount = tagUsageCount[id] || 0;
      const canDelete = usageCount === 0;
      
      setShowDeleteConfirm({
        type,
        id,
        name,
        usageCount,
        canDelete
      });
    } else if (type === 'category') {
      // Check if category has subcategories/tags
      const category = categories.find(cat => cat.id === id);
      const hasContent = category && category.subcategories.some(sub => sub.tags.length > 0);
      
      setShowDeleteConfirm({
        type,
        id,
        name,
        canDelete: !hasContent
      });
    } else if (type === 'subcategory') {
      // Check if subcategory has tags
      const subcategory = categories
        .flatMap(cat => cat.subcategories)
        .find(sub => sub.id === id);
      const hasContent = subcategory && subcategory.tags.length > 0;
      
      setShowDeleteConfirm({
        type,
        id,
        name,
        canDelete: !hasContent
      });
    } else {
      setShowDeleteConfirm({ type, id, name, canDelete: true });
    }
  };

  const handleReplaceTag = (tagId: string, tagName: string) => {
    // Get all other tags that could be used as replacements
    const availableTags = tags.filter(tag => tag.id !== tagId);
    
    setShowReplaceTagModal({
      tagToReplace: tagId,
      tagName: tagName,
      availableTags
    });
    setShowDeleteConfirm(null);
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm || !user) return;

    const operationId = `delete-${showDeleteConfirm.type}-${showDeleteConfirm.id}`;
    setOperationLoadingState(operationId, true);

    try {
      if (showDeleteConfirm.type === 'tag') {
        // Check one more time if tag can be deleted
        const usageCount = tagUsageCount[showDeleteConfirm.id] || 0;
        
        if (usageCount > 0) {
          showToast(`Cannot delete tag "${showDeleteConfirm.name}" - it's used in ${usageCount} transaction(s). Use "Replace Tag" instead.`, 'error');
          setShowDeleteConfirm(null);
          return;
        }

        console.log('🗑️ Deleting tag:', showDeleteConfirm.id);
        await deleteTag(showDeleteConfirm.id, user.uid);
        console.log('✅ Tag deleted successfully');
        
        // Reload tags to reflect changes
        await loadTags(user.uid);
        showToast(`Tag "${showDeleteConfirm.name}" deleted successfully`, 'success');
        
      } else if (showDeleteConfirm.type === 'category') {
        // Handle category deletion
        if (showDeleteConfirm.id.startsWith('temp-') || showDeleteConfirm.id === 'custom') {
          // Remove temporary or special categories from local state only
          setCategories(categories.filter(cat => cat.id !== showDeleteConfirm.id));
          showToast(`Category "${showDeleteConfirm.name}" removed`, 'success');
        } else {
          // Delete from Firebase
          console.log('🗑️ Deleting category from Firebase:', showDeleteConfirm.id);
          await deleteCategoryById(showDeleteConfirm.id, user.uid);
          console.log('✅ Category deleted from Firebase');
          
          // Reload all data to reflect changes
          await loadTags(user.uid);
          showToast(`Category "${showDeleteConfirm.name}" deleted successfully`, 'success');
        }
        
      } else if (showDeleteConfirm.type === 'subcategory') {
        // Handle subcategory deletion
        if (showDeleteConfirm.id.startsWith('temp-') || showDeleteConfirm.id.includes('-general')) {
          // Remove temporary or general subcategories from local state only
          setCategories(categories.map(cat => ({
            ...cat,
            subcategories: cat.subcategories.filter(sub => sub.id !== showDeleteConfirm.id)
          })));
          showToast(`Subcategory "${showDeleteConfirm.name}" removed`, 'success');
        } else {
          // Delete from Firebase
          console.log('🗑️ Deleting subcategory from Firebase:', showDeleteConfirm.id);
          await deleteSubcategory(showDeleteConfirm.id, user.uid);
          console.log('✅ Subcategory deleted from Firebase');
          
          // Reload all data to reflect changes
          await loadTags(user.uid);
          showToast(`Subcategory "${showDeleteConfirm.name}" deleted successfully`, 'success');
        }
      }
      
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      
      // Handle specific error cases
      if (error instanceof Error && error.message.includes('Cannot delete tag that is in use')) {
        showToast(`Cannot delete "${showDeleteConfirm.name}" - it's used by transactions. Use "Replace Tag" instead.`, 'error');
      } else {
        showToast(`Failed to delete ${showDeleteConfirm.type}. Please try again.`, 'error');
      }
    } finally {
      setOperationLoadingState(operationId, false);
    }
  };

  const calculateRowSpans = (category: TagCategory) => {
    const totalTags = category.subcategories.reduce((sum, sub) => sum + Math.max(sub.tags.length, 1), 0);
    return Math.max(totalTags, 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Manage Tags</h2>
            <p className="text-sm text-gray-600 mt-1">Organize your transaction tags with categories and subcategories</p>
          </div>
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


          {/* Tags Table */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading tags...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subcategory
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tags
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usage
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {categories.map((category) => {
                    let categoryRowRendered = false;
                    const categoryRowSpan = calculateRowSpans(category);
                    
                    return category.subcategories.length > 0 
                      ? category.subcategories.map((subcategory) => {
                          let subcategoryRowRendered = false;
                          const subcategoryRowSpan = Math.max(subcategory.tags.length, 1);
                          
                          return subcategory.tags.length > 0
                            ? subcategory.tags.map((tag) => (
                                <tr key={`${category.id}-${subcategory.id}-${tag.id}`} className="hover:bg-gray-50">
                                  {/* Category column */}
                                  {!categoryRowRendered && (
                                    <td rowSpan={categoryRowSpan} className="px-4 py-2 whitespace-nowrap border-r border-gray-200 bg-gray-25">
                                      <div className="flex items-center">
                                        <div 
                                          className="w-3 h-3 rounded-full mr-2 flex-shrink-0" 
                                          style={{ backgroundColor: category.color }}
                                        ></div>
                                        <div className="flex-1">
                                          <InlineEditField
                                            value={category.name}
                                            onSave={(newName) => handleUpdateCategoryName(category.id, newName)}
                                            className="text-xs font-medium text-gray-900"
                                          />
                                        </div>
                                        <button
                                          onClick={() => handleAddSubcategory(category.id)}
                                          className="ml-1 text-blue-600 hover:text-blue-800"
                                          title="Add Subcategory"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => handleDeleteRequest('category', category.id, category.name)}
                                          className="ml-1 text-red-600 hover:text-red-800"
                                          title="Delete Category"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  )}

                                  {/* Subcategory column */}
                                  {!subcategoryRowRendered && (
                                    <td rowSpan={subcategoryRowSpan} className="px-4 py-2 whitespace-nowrap border-r border-gray-200">
                                      <div className="flex items-center">
                                        <div className="flex-1">
                                          <InlineEditField
                                            value={subcategory.name}
                                            onSave={(newName) => handleUpdateSubcategoryName(subcategory.id, newName)}
                                            className="text-xs text-gray-700"
                                          />
                                        </div>
                                        <button
                                          onClick={() => handleAddTag(subcategory.id)}
                                          className="ml-1 text-green-600 hover:text-green-800 relative"
                                          title="Add Tag"
                                          disabled={operationLoading[`add-tag-${subcategory.id}`]}
                                        >
                                          {operationLoading[`add-tag-${subcategory.id}`] ? (
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600"></div>
                                          ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                          )}
                                        </button>
                                        <button
                                          onClick={() => handleDeleteRequest('subcategory', subcategory.id, subcategory.name)}
                                          className="ml-1 text-red-600 hover:text-red-800"
                                          title="Delete Subcategory"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  )}

                                  {/* Tag column */}
                                  <td className="px-4 py-2 whitespace-nowrap">
                                    <div className="flex items-center">
                                      <div 
                                        className="w-3 h-3 rounded-full mr-2 flex-shrink-0" 
                                        style={{ backgroundColor: tag.color }}
                                      ></div>
                                      <InlineEditField
                                        value={tag.name}
                                        onSave={(newName) => handleUpdateTagName(tag.id, newName)}
                                        className="text-xs text-gray-900"
                                        isLoading={operationLoading[tag.id]}
                                      />
                                    </div>
                                  </td>

                                  {/* Usage column */}
                                  <td className="px-4 py-2 whitespace-nowrap text-center text-xs text-gray-500">
                                    {tagUsageCount[tag.id] || 0}
                                  </td>

                                  {/* Actions column */}
                                  <td className="px-4 py-2 whitespace-nowrap text-right text-xs font-medium">
                                    <div className="flex items-center justify-end space-x-1">
                                      {tagUsageCount[tag.id] && tagUsageCount[tag.id] > 0 ? (
                                        <button
                                          onClick={() => handleReplaceTag(tag.id, tag.name)}
                                          className="text-orange-600 hover:text-orange-800"
                                          title={`Replace tag (used in ${tagUsageCount[tag.id]} transactions)`}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                          </svg>
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => handleDeleteRequest('tag', tag.id, tag.name)}
                                          className="text-red-600 hover:text-red-800"
                                          title="Delete Tag"
                                          disabled={operationLoading[`delete-tag-${tag.id}`]}
                                        >
                                          {operationLoading[`delete-tag-${tag.id}`] ? (
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                                          ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </td>

                                  {(() => {
                                    categoryRowRendered = true;
                                    subcategoryRowRendered = true;
                                    return null;
                                  })()}
                                </tr>
                              ))
                            : (
                                <tr key={`${category.id}-${subcategory.id}-empty`} className="hover:bg-gray-50">
                                  {!categoryRowRendered && (
                                    <td rowSpan={categoryRowSpan} className="px-4 py-2 whitespace-nowrap border-r border-gray-200 bg-gray-25">
                                      <div className="flex items-center">
                                        <div 
                                          className="w-3 h-3 rounded-full mr-2 flex-shrink-0" 
                                          style={{ backgroundColor: category.color }}
                                        ></div>
                                        <div className="flex-1">
                                          <InlineEditField
                                            value={category.name}
                                            onSave={(newName) => handleUpdateCategoryName(category.id, newName)}
                                            className="text-xs font-medium text-gray-900"
                                          />
                                        </div>
                                        <button
                                          onClick={() => handleAddSubcategory(category.id)}
                                          className="ml-1 text-blue-600 hover:text-blue-800"
                                          title="Add Subcategory"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => handleDeleteRequest('category', category.id, category.name)}
                                          className="ml-1 text-red-600 hover:text-red-800"
                                          title="Delete Category"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  )}

                                  <td className="px-4 py-2 whitespace-nowrap border-r border-gray-200">
                                    <div className="flex items-center">
                                      <div className="flex-1">
                                        <InlineEditField
                                          value={subcategory.name}
                                          onSave={(newName) => handleUpdateSubcategoryName(subcategory.id, newName)}
                                          className="text-sm text-gray-700"
                                        />
                                      </div>
                                      <button
                                        onClick={() => handleAddTag(subcategory.id)}
                                        className="ml-2 text-green-600 hover:text-green-800"
                                        title="Add Tag"
                                        disabled={operationLoading[`add-tag-${subcategory.id}`]}
                                      >
                                        {operationLoading[`add-tag-${subcategory.id}`] ? (
                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                                        ) : (
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRequest('subcategory', subcategory.id, subcategory.name)}
                                        className="ml-1 text-red-600 hover:text-red-800"
                                        title="Delete Subcategory"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </td>

                                  <td className="px-4 py-2 whitespace-nowrap text-gray-500 italic">
                                    No tags yet
                                  </td>

                                  <td className="px-4 py-2 whitespace-nowrap text-center text-xs text-gray-500">
                                    -
                                  </td>

                                  <td className="px-4 py-2 whitespace-nowrap text-right text-xs font-medium">
                                    <button
                                      onClick={() => handleAddTag(subcategory.id)}
                                      className="text-green-600 hover:text-green-800"
                                      title="Add First Tag"
                                      disabled={operationLoading[`add-tag-${subcategory.id}`]}
                                    >
                                      {operationLoading[`add-tag-${subcategory.id}`] ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                                      ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                      )}
                                    </button>
                                  </td>

                                  {(() => {
                                    categoryRowRendered = true;
                                    return null;
                                  })()}
                                </tr>
                              );
                        })
                      : (
                          <tr key={`${category.id}-empty`} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap border-r border-gray-200 bg-gray-25">
                              <div className="flex items-center">
                                <div 
                                  className="w-4 h-4 rounded-full mr-3 flex-shrink-0" 
                                  style={{ backgroundColor: category.color }}
                                ></div>
                                <div className="flex-1">
                                  <InlineEditField
                                    value={category.name}
                                    onSave={(newName) => handleUpdateCategoryName(category.id, newName)}
                                    className="text-sm font-medium text-gray-900"
                                  />
                                </div>
                                <button
                                  onClick={() => handleAddSubcategory(category.id)}
                                  className="ml-2 text-blue-600 hover:text-blue-800"
                                  title="Add Subcategory"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteRequest('category', category.id, category.name)}
                                  className="ml-1 text-red-600 hover:text-red-800"
                                  title="Delete Category"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap border-r border-gray-200 text-gray-500 italic">
                              No subcategories yet
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-gray-500 italic">
                              -
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-center text-xs text-gray-500">
                              -
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-right text-xs font-medium">
                              <button
                                onClick={() => handleAddSubcategory(category.id)}
                                className="text-blue-600 hover:text-blue-800"
                                title="Add First Subcategory"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                  })}
                  
                  {/* Add Category Row */}
                  <tr className="hover:bg-gray-50 border-t-2 border-dashed border-gray-300">
                    <td className="px-4 py-2 whitespace-nowrap border-r border-gray-200 bg-gray-25">
                      <div className="flex items-center cursor-pointer" onClick={handleAddCategory}>
                        <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0 bg-gray-300 border-2 border-dashed border-gray-400"></div>
                        <span className="text-xs text-gray-500 italic hover:text-gray-700">Click to add category</span>
                        <svg className="w-3 h-3 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap border-r border-gray-200 text-gray-400 text-xs italic">-</td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-400 text-xs italic">-</td>
                    <td className="px-4 py-2 whitespace-nowrap text-center text-xs text-gray-400">-</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right text-xs font-medium">
                      <button
                        onClick={handleAddCategory}
                        className="text-blue-600 hover:text-blue-800"
                        title="Add Category"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>

              {categories.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-2">🏷️</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No categories yet</h3>
                  <p className="text-gray-500 mb-4">Start by adding your first category to organize your tags</p>
                  <button
                    onClick={handleAddCategory}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    disabled={loading}
                  >
                    Add First Category
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[55]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Delete {showDeleteConfirm.type.charAt(0).toUpperCase() + showDeleteConfirm.type.slice(1)}
              </h3>
              <div className="mb-6">
                <p className="text-gray-600 mb-2">
                  Are you sure you want to delete "{showDeleteConfirm.name}"?
                </p>
                
                {showDeleteConfirm.type === 'tag' && showDeleteConfirm.usageCount !== undefined && showDeleteConfirm.usageCount > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-3">
                    <p className="text-red-800 font-medium text-sm">
                      ⚠️ This tag is used in {showDeleteConfirm.usageCount} transaction(s).
                    </p>
                    <p className="text-red-700 text-sm mt-1">
                      You cannot delete a tag that's in use. Use "Replace Tag" instead to reassign these transactions to another tag.
                    </p>
                  </div>
                )}

                {showDeleteConfirm.type === 'category' && !showDeleteConfirm.canDelete && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg mb-3">
                    <p className="text-orange-800 font-medium text-sm">
                      ⚠️ This category contains subcategories and tags.
                    </p>
                    <p className="text-orange-700 text-sm mt-1">
                      Deleting this category will also remove all its subcategories and tags.
                    </p>
                  </div>
                )}

                {showDeleteConfirm.type === 'subcategory' && !showDeleteConfirm.canDelete && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg mb-3">
                    <p className="text-orange-800 font-medium text-sm">
                      ⚠️ This subcategory contains tags.
                    </p>
                    <p className="text-orange-700 text-sm mt-1">
                      Deleting this subcategory will also remove all its tags.
                    </p>
                  </div>
                )}

                <p className="text-gray-500 text-sm">This action cannot be undone.</p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                
                {showDeleteConfirm.type === 'tag' && showDeleteConfirm.usageCount && showDeleteConfirm.usageCount > 0 ? (
                  <button
                    onClick={() => handleReplaceTag(showDeleteConfirm.id, showDeleteConfirm.name)}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                  >
                    Replace Tag Instead
                  </button>
                ) : (
                  <button
                    onClick={confirmDelete}
                    disabled={operationLoading[`delete-${showDeleteConfirm.type}-${showDeleteConfirm.id}`]}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {operationLoading[`delete-${showDeleteConfirm.type}-${showDeleteConfirm.id}`] ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Deleting...
                      </>
                    ) : (
                      `Delete ${showDeleteConfirm.type.charAt(0).toUpperCase() + showDeleteConfirm.type.slice(1)}`
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Replace Tag Modal */}
      {showReplaceTagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[55]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Replace Tag</h3>
              <p className="text-gray-600 mb-4">
                Replace "{showReplaceTagModal.tagName}" with another tag. All transactions using this tag will be reassigned.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select replacement tag:
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">Choose a tag...</option>
                  {showReplaceTagModal.availableTags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowReplaceTagModal(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Replace Tag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default TagsModal;