import React, { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  createHierarchyItem,
  updateHierarchyItem,
  deleteHierarchyItem,
  moveHierarchyItemLevel,
  moveHierarchyItemWithChildren,
  getHierarchyItems,
  getHierarchyItemUsageCount
} from '../firebase/config';
import type { HierarchyItem, HierarchyLevel } from '../types/hierarchy';
import { 
  HIERARCHY_LEVEL_NAMES, 
  HIERARCHY_LEVEL_COLORS, 
  HIERARCHY_LEVEL_INDENT 
} from '../types/hierarchy';

interface TagsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EditingState {
  itemId: string | null;
  value: string;
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

// Hierarchy item row component
const HierarchyItemRow: React.FC<{
  item: HierarchyItem;
  isSelected: boolean;
  isChecked: boolean;
  isEditing: boolean;
  editValue: string;
  usageCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: (itemId: string) => void;
  onCheck: (itemId: string, checked: boolean) => void;
  onStartEdit: (itemId: string) => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (itemId: string) => void;
  onIndentIn: (itemId: string) => void;
  onIndentOut: (itemId: string) => void;
  onMoveUp: (itemId: string) => void;
  onMoveDown: (itemId: string) => void;
}> = ({ 
  item, 
  isSelected, 
  isChecked,
  isEditing, 
  editValue, 
  usageCount,
  canMoveUp,
  canMoveDown,
  onSelect, 
  onCheck,
  onStartEdit, 
  onEditChange, 
  onEditSave, 
  onEditCancel, 
  onDelete,
  onIndentIn,
  onIndentOut,
  onMoveUp,
  onMoveDown
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onEditSave();
    } else if (e.key === 'Escape') {
      onEditCancel();
    }
  };

  const indent = HIERARCHY_LEVEL_INDENT[item.level];
  const color = HIERARCHY_LEVEL_COLORS[item.level];
  const levelName = HIERARCHY_LEVEL_NAMES[item.level];

  return (
    <tr 
      className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : ''} ${isChecked ? 'bg-indigo-50' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).type !== 'checkbox') {
          onSelect(item.id);
        }
      }}
    >
      {/* Checkbox column */}
      <td className="px-4 py-2 whitespace-nowrap">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => {
            e.stopPropagation();
            onCheck(item.id, e.target.checked);
          }}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
      </td>

      {/* Name column with indentation */}
      <td className="px-4 py-2 whitespace-nowrap">
        <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
          {/* Level indicator */}
          <div className="flex items-center mr-3">
            <div 
              className="w-2 h-2 rounded-full mr-2" 
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              {levelName}
            </span>
          </div>
          
          {/* Name field */}
          <div className="flex-1">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onEditSave}
                className="bg-white border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                placeholder={`New ${levelName}...`}
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit(item.id);
                }}
                className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1 transition-colors text-sm font-medium"
                style={{ color }}
              >
                {item.name}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Usage count */}
      <td className="px-4 py-2 whitespace-nowrap text-center">
        <span className="text-sm text-gray-600">
          {item.level === 4 ? usageCount : '-'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-2 whitespace-nowrap text-right">
        <div className="flex items-center justify-end space-x-1">
          {/* Move up button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp(item.id);
            }}
            disabled={!canMoveUp}
            className={`p-1 transition-colors ${canMoveUp ? 'text-gray-400 hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'}`}
            title="Move up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>

          {/* Move down button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown(item.id);
            }}
            disabled={!canMoveDown}
            className={`p-1 transition-colors ${canMoveDown ? 'text-gray-400 hover:text-gray-600' : 'text-gray-200 cursor-not-allowed'}`}
            title="Move down"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Indent out button */}
          {item.level > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onIndentOut(item.id);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Move left (Shift+Tab)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
            </button>
          )}
          
          {/* Indent in button */}
          {item.level < 4 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onIndentIn(item.id);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Move right (Tab)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          )}
          
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-1 text-red-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
};

const TagsModal: React.FC<TagsModalProps> = ({ isOpen, onClose }) => {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<HierarchyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingState>({ itemId: null, value: '' });
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadHierarchyItems(user.uid);
      }
    });
    return unsubscribe;
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  }, []);

  const loadHierarchyItems = async (userId: string) => {
    try {
      setLoading(true);
      console.log('🏗️ Loading hierarchy items for user:', userId);
      
      const hierarchyItems = await getHierarchyItems(userId);
      setItems(hierarchyItems);
      
      // Load usage counts for tags (level 4 items)
      const tagItems = hierarchyItems.filter(item => item.level === 4);
      const counts: Record<string, number> = {};
      
      await Promise.all(
        tagItems.map(async (tag) => {
          try {
            const count = await getHierarchyItemUsageCount(userId, tag.id);
            counts[tag.id] = count;
          } catch (error) {
            console.error(`Error loading usage count for ${tag.id}:`, error);
            counts[tag.id] = 0;
          }
        })
      );
      
      setUsageCounts(counts);
      console.log(`✅ Loaded ${hierarchyItems.length} hierarchy items`);
      
    } catch (error) {
      console.error('❌ Error loading hierarchy items:', error);
      showToast('Failed to load hierarchy items', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewItem = async () => {
    if (!user) return;
    
    try {
      console.log('🆕 Creating new item');
      const newItemId = await createHierarchyItem(user.uid, 'New Category', 1);
      
      await loadHierarchyItems(user.uid);
      
      // Start editing the new item
      setEditing({ itemId: newItemId, value: 'New Category' });
      setSelectedItems(new Set([newItemId]));
      
      showToast('New category created', 'success');
    } catch (error) {
      console.error('❌ Error creating new item:', error);
      showToast('Failed to create new item', 'error');
    }
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItems(new Set([itemId]));
  };

  const handleStartEdit = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      setEditing({ itemId, value: item.name });
    }
  };

  const handleEditChange = (value: string) => {
    setEditing(prev => ({ ...prev, value }));
  };

  const handleEditSave = async () => {
    if (!user || !editing.itemId || !editing.value.trim()) {
      handleEditCancel();
      return;
    }

    try {
      await updateHierarchyItem(user.uid, editing.itemId, { name: editing.value.trim() });
      await loadHierarchyItems(user.uid);
      setEditing({ itemId: null, value: '' });
      showToast('Item updated successfully', 'success');
    } catch (error) {
      console.error('❌ Error updating item:', error);
      showToast('Failed to update item', 'error');
    }
  };

  const handleEditCancel = () => {
    setEditing({ itemId: null, value: '' });
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const hasChildren = items.some(i => i.parentId === itemId);
    const usageCount = usageCounts[itemId] || 0;
    
    const confirmMessage = hasChildren 
      ? `Delete "${item.name}" and all its children?`
      : usageCount > 0 
        ? `Delete "${item.name}"? It's used in ${usageCount} transactions.`
        : `Delete "${item.name}"?`;
    
    if (!window.confirm(confirmMessage)) return;

    try {
      await deleteHierarchyItem(user.uid, itemId);
      await loadHierarchyItems(user.uid);
      setSelectedItems(new Set());
      showToast('Item deleted successfully', 'success');
    } catch (error) {
      console.error('❌ Error deleting item:', error);
      showToast('Failed to delete item', 'error');
    }
  };

  const handleIndentIn = async (itemId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item || item.level >= 4) return;

    // Find potential parent (previous item at current level - 1)
    const itemIndex = items.findIndex(i => i.id === itemId);
    let newParentId: string | undefined;
    
    for (let i = itemIndex - 1; i >= 0; i--) {
      if (items[i].level === item.level) {
        newParentId = items[i].id;
        break;
      }
    }

    if (!newParentId) {
      showToast('No parent item found to indent under', 'error');
      return;
    }

    try {
      await moveHierarchyItemLevel(user.uid, itemId, (item.level + 1) as HierarchyLevel, newParentId);
      await loadHierarchyItems(user.uid);
      showToast(`Moved to ${HIERARCHY_LEVEL_NAMES[(item.level + 1) as HierarchyLevel]}`, 'success');
    } catch (error) {
      console.error('❌ Error indenting item:', error);
      showToast('Failed to indent item', 'error');
    }
  };

  const handleIndentOut = async (itemId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item || item.level <= 1) return;

    // Find the parent's parent for new parent ID
    const parent = items.find(i => i.id === item.parentId);
    const newParentId = parent?.parentId;

    try {
      await moveHierarchyItemLevel(user.uid, itemId, (item.level - 1) as HierarchyLevel, newParentId);
      await loadHierarchyItems(user.uid);
      showToast(`Moved to ${HIERARCHY_LEVEL_NAMES[(item.level - 1) as HierarchyLevel]}`, 'success');
    } catch (error) {
      console.error('❌ Error outdenting item:', error);
      showToast('Failed to outdent item', 'error');
    }
  };

  const handleMoveUp = async (itemId: string) => {
    if (!user) return;
    
    try {
      await moveHierarchyItemWithChildren(user.uid, itemId, 'up');
      await loadHierarchyItems(user.uid);
      showToast('Item moved up successfully', 'success');
    } catch (error) {
      console.error('❌ Error moving item up:', error);
      showToast('Failed to move item up', 'error');
    }
  };

  const handleMoveDown = async (itemId: string) => {
    if (!user) return;
    
    try {
      await moveHierarchyItemWithChildren(user.uid, itemId, 'down');
      await loadHierarchyItems(user.uid);
      showToast('Item moved down successfully', 'success');
    } catch (error) {
      console.error('❌ Error moving item down:', error);
      showToast('Failed to move item down', 'error');
    }
  };

  const handleCheck = (itemId: string, checked: boolean) => {
    setCheckedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setCheckedItems(new Set(items.map(item => item.id)));
    } else {
      setCheckedItems(new Set());
    }
  };

  const handleBulkDelete = async () => {
    if (!user || checkedItems.size === 0) return;

    const itemsToDelete = Array.from(checkedItems);
    const confirmMessage = `Delete ${itemsToDelete.length} selected item(s) and all their children?`;
    
    if (!window.confirm(confirmMessage)) return;

    try {
      // Delete items one by one (this will handle children automatically)
      await Promise.all(
        itemsToDelete.map(itemId => deleteHierarchyItem(user.uid, itemId))
      );
      
      await loadHierarchyItems(user.uid);
      setCheckedItems(new Set());
      setSelectedItems(new Set());
      showToast(`${itemsToDelete.length} items deleted successfully`, 'success');
    } catch (error) {
      console.error('❌ Error in bulk delete:', error);
      showToast('Failed to delete items', 'error');
    }
  };

  const handleBulkIndentIn = async () => {
    if (!user || checkedItems.size === 0) return;

    const itemsToMove = Array.from(checkedItems);
    try {
      await Promise.all(
        itemsToMove.map(async (itemId) => {
          const item = items.find(i => i.id === itemId);
          if (!item || item.level >= 4) return;

          // Find potential parent
          const itemIndex = items.findIndex(i => i.id === itemId);
          let newParentId: string | undefined;
          
          for (let i = itemIndex - 1; i >= 0; i--) {
            if (items[i].level === item.level) {
              newParentId = items[i].id;
              break;
            }
          }

          if (newParentId) {
            await moveHierarchyItemLevel(user.uid, itemId, (item.level + 1) as HierarchyLevel, newParentId);
          }
        })
      );
      
      await loadHierarchyItems(user.uid);
      showToast(`${itemsToMove.length} items indented successfully`, 'success');
    } catch (error) {
      console.error('❌ Error in bulk indent:', error);
      showToast('Failed to indent items', 'error');
    }
  };

  const handleBulkIndentOut = async () => {
    if (!user || checkedItems.size === 0) return;

    const itemsToMove = Array.from(checkedItems);
    try {
      await Promise.all(
        itemsToMove.map(async (itemId) => {
          const item = items.find(i => i.id === itemId);
          if (!item || item.level <= 1) return;

          const parent = items.find(i => i.id === item.parentId);
          const newParentId = parent?.parentId;
          
          await moveHierarchyItemLevel(user.uid, itemId, (item.level - 1) as HierarchyLevel, newParentId);
        })
      );
      
      await loadHierarchyItems(user.uid);
      showToast(`${itemsToMove.length} items outdented successfully`, 'success');
    } catch (error) {
      console.error('❌ Error in bulk outdent:', error);
      showToast('Failed to outdent items', 'error');
    }
  };

  // Helper function to determine if an item can move up/down
  const canMoveUp = (itemId: string): boolean => {
    const item = items.find(i => i.id === itemId);
    if (!item) return false;
    
    const siblings = items.filter(i => 
      i.level === item.level && 
      i.parentId === item.parentId
    ).sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return siblings.findIndex(i => i.id === itemId) > 0;
  };

  const canMoveDown = (itemId: string): boolean => {
    const item = items.find(i => i.id === itemId);
    if (!item) return false;
    
    const siblings = items.filter(i => 
      i.level === item.level && 
      i.parentId === item.parentId
    ).sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const currentIndex = siblings.findIndex(i => i.id === itemId);
    return currentIndex >= 0 && currentIndex < siblings.length - 1;
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen || editing.itemId) return;

    const selectedItemId = Array.from(selectedItems)[0];
    if (!selectedItemId) return;

    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          handleIndentOut(selectedItemId);
        } else {
          handleIndentIn(selectedItemId);
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        handleDelete(selectedItemId);
        break;
      case 'Enter':
        e.preventDefault();
        handleCreateNewItem();
        break;
      case 'F2':
        e.preventDefault();
        handleStartEdit(selectedItemId);
        break;
    }
  }, [isOpen, editing.itemId, selectedItems]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Manage Tags</h2>
            <p className="text-sm text-gray-600 mt-1">
              Create and organize your tag hierarchy. Use Tab/Shift+Tab to indent, Enter to add new items.
            </p>
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
        <div ref={containerRef} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading hierarchy...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={checkedItems.size > 0 && checkedItems.size === items.length}
                        ref={(input) => {
                          if (input) {
                            input.indeterminate = checkedItems.size > 0 && checkedItems.size < items.length;
                          }
                        }}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
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
                  {items.map((item) => (
                    <HierarchyItemRow
                      key={item.id}
                      item={item}
                      isSelected={selectedItems.has(item.id)}
                      isChecked={checkedItems.has(item.id)}
                      isEditing={editing.itemId === item.id}
                      editValue={editing.value}
                      usageCount={usageCounts[item.id] || 0}
                      canMoveUp={canMoveUp(item.id)}
                      canMoveDown={canMoveDown(item.id)}
                      onSelect={handleSelectItem}
                      onCheck={handleCheck}
                      onStartEdit={handleStartEdit}
                      onEditChange={handleEditChange}
                      onEditSave={handleEditSave}
                      onEditCancel={handleEditCancel}
                      onDelete={handleDelete}
                      onIndentIn={handleIndentIn}
                      onIndentOut={handleIndentOut}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                    />
                  ))}
                  
                  {/* Add new item row */}
                  <tr className="hover:bg-gray-50 border-t-2 border-dashed border-gray-300">
                    <td className="px-4 py-2 whitespace-nowrap"></td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <button
                        onClick={handleCreateNewItem}
                        className="flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm italic">Click to add new category (or press Enter)</span>
                      </button>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-center text-gray-400">-</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <button
                        onClick={handleCreateNewItem}
                        className="text-blue-600 hover:text-blue-800"
                        title="Add Category"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Bulk operations toolbar */}
              {checkedItems.size > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-sm font-medium text-blue-900">
                        {checkedItems.size} item{checkedItems.size !== 1 ? 's' : ''} selected
                      </span>
                      <div className="flex space-x-2">
                        <button
                          onClick={handleBulkDelete}
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                        >
                          Delete Selected
                        </button>
                        <button
                          onClick={handleBulkIndentIn}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                        >
                          Indent In
                        </button>
                        <button
                          onClick={handleBulkIndentOut}
                          className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
                        >
                          Indent Out
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setCheckedItems(new Set())}
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                      title="Clear selection"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {items.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-2">🏷️</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No tags yet</h3>
                  <p className="text-gray-500 mb-4">Create your first category to start organizing your tags</p>
                  <button
                    onClick={handleCreateNewItem}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create First Category
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Keyboard shortcuts help */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Keyboard Shortcuts</h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">Tab</kbd> Indent right</div>
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">Shift+Tab</kbd> Indent left</div>
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">Enter</kbd> Add new item</div>
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">F2</kbd> Rename selected</div>
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">Delete</kbd> Delete selected</div>
              <div><span className="text-gray-500">Click checkbox for bulk ops</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast notification */}
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