import React, { useState, useEffect, useCallback, useRef } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';
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
  HIERARCHY_LEVEL_INDENT,
  HIERARCHY_LEVEL_ICONS,
  COLOR_PALETTE,
  HIERARCHY_LEVEL_DEFAULT_COLORS
} from '../types/hierarchy';

interface TagsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EditingState {
  itemId: string | null;
  value: string;
}

// Color picker component
const ColorPicker: React.FC<{
  selectedColor?: string;
  level: HierarchyLevel;
  onColorSelect: (color: string) => void;
  onClose: () => void;
}> = ({ selectedColor, level, onColorSelect, onClose }) => {
  const defaultColors = HIERARCHY_LEVEL_DEFAULT_COLORS[level];
  
  return (
    <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 mt-1">
      <div className="grid grid-cols-5 gap-1 mb-2">
        {/* Default colors for this level */}
        {defaultColors.map((color) => (
          <button
            key={color}
            onClick={() => {
              onColorSelect(color);
              onClose();
            }}
            className={`w-5 h-5 rounded border hover:scale-110 transition-transform ${
              selectedColor === color ? 'border-gray-800' : 'border-gray-300'
            }`}
            style={{ backgroundColor: color }}
            title={`Default ${HIERARCHY_LEVEL_NAMES[level].toLowerCase()} color`}
          />
        ))}
      </div>
      
      <div className="border-t border-gray-200 pt-2">
        <div className="grid grid-cols-8 gap-1">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => {
                onColorSelect(color);
                onClose();
              }}
              className={`w-4 h-4 rounded border hover:scale-110 transition-transform ${
                selectedColor === color ? 'border-gray-800 border-2' : 'border-gray-300'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>
      
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
        <button
          onClick={() => {
            onColorSelect('');
            onClose();
          }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          No Color
        </button>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

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

// Compact hierarchy item row component
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
  onColorChange: (itemId: string, color: string) => void;
  onChangeParent: (itemId: string, newParentId: string) => void;
  getValidParents: (item: HierarchyItem) => HierarchyItem[];
  getCurrentParentName: (item: HierarchyItem) => string;
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
  onMoveDown,
  onColorChange,
  onChangeParent,
  getValidParents,
  getCurrentParentName
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showParentSelector, setShowParentSelector] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const parentSelectorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
      if (parentSelectorRef.current && !parentSelectorRef.current.contains(event.target as Node)) {
        setShowParentSelector(false);
      }
    };

    if (showColorPicker || showParentSelector) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPicker, showParentSelector]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onEditSave();
    } else if (e.key === 'Escape') {
      onEditCancel();
    }
  };

  const indent = HIERARCHY_LEVEL_INDENT[item.level];
  const fallbackColor = HIERARCHY_LEVEL_COLORS[item.level];
  const itemColor = item.color || fallbackColor;
  const levelName = HIERARCHY_LEVEL_NAMES[item.level];
  const levelIcon = HIERARCHY_LEVEL_ICONS[item.level];

  // Generate a subtle background based on hierarchy level for better visual grouping
  const getRowBackground = () => {
    if (isSelected) return 'bg-blue-50 border-blue-200';
    if (isChecked) return 'bg-indigo-50';
    
    // Subtle background variation by level for visual grouping
    switch (item.level) {
      case 1: return 'bg-white hover:bg-gray-50';
      case 2: return 'bg-slate-50 hover:bg-slate-100';
      case 3: return 'bg-gray-50 hover:bg-gray-100';
      case 4: return 'bg-gray-100 hover:bg-gray-200';
      default: return 'bg-white hover:bg-gray-50';
    }
  };

  const validParents = getValidParents(item);

  return (
    <tr 
      className={`transition-colors border-b border-gray-100 ${getRowBackground()}`}
      onClick={(e) => {
        if ((e.target as HTMLInputElement).type !== 'checkbox') {
          onSelect(item.id);
        }
      }}
    >
      {/* Checkbox column */}
      <td className="px-3 py-1.5 whitespace-nowrap">
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

      {/* Name column with enhanced hierarchy */}
      <td className="px-3 py-1.5 whitespace-nowrap">
        <div className="flex items-center relative" style={{ paddingLeft: `${indent}px` }}>
          {/* Hierarchy indicators */}
          {item.level > 1 && (
            <div className="absolute left-0 top-0 bottom-0 flex items-center" style={{ left: `${indent - 6}px` }}>
              <div className="w-0.5 h-full bg-gray-200 relative">
                <div className="absolute left-0.5 top-1/2 w-2 h-0.5 bg-gray-200"></div>
              </div>
            </div>
          )}
          
          {/* Level icon and color indicator */}
          <div className="flex items-center mr-2 z-10 relative">
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                }}
                className="w-5 h-5 rounded-full border border-white shadow-sm hover:scale-110 transition-transform flex items-center justify-center text-xs"
                style={{ backgroundColor: itemColor }}
                title="Change color"
              >
                <span className="filter drop-shadow-sm">{levelIcon}</span>
              </button>
              
              {showColorPicker && (
                <div ref={colorPickerRef} className="relative">
                  <ColorPicker
                    selectedColor={item.color}
                    level={item.level}
                    onColorSelect={(color) => onColorChange(item.id, color)}
                    onClose={() => setShowColorPicker(false)}
                  />
                </div>
              )}
            </div>
            
            <div className="ml-1.5 flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wide leading-none">
                {levelName}
              </span>
              {item.level > 1 && (
                <div className="w-0 h-0 border-l-[2px] border-r-[2px] border-b-[3px] border-l-transparent border-r-transparent border-b-gray-300 mt-0.5" />
              )}
            </div>
          </div>
          
          {/* Name field with enhanced styling */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onEditSave}
                className="bg-white border-2 border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full font-medium shadow-sm"
                placeholder={`New ${levelName}...`}
                style={{ color: itemColor }}
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit(item.id);
                }}
                className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1 transition-all duration-200 text-sm font-medium inline-block min-w-full truncate hover:shadow-sm"
                style={{ color: itemColor }}
                title={item.name}
              >
                {item.name}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Usage count */}
      <td className="px-3 py-1.5 whitespace-nowrap text-center">
        <span className="text-sm text-gray-600">
          {item.level === 4 ? usageCount : '-'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-1.5 whitespace-nowrap text-right">
        <div className="flex items-center justify-end space-x-1">
          {/* Parent selector for non-root items */}
          {item.level > 1 && validParents.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowParentSelector(!showParentSelector);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title={`Change parent (currently: ${getCurrentParentName(item)})`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </button>
              
              {showParentSelector && (
                <div ref={parentSelectorRef} className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 min-w-48">
                  <div className="text-xs text-gray-500 mb-2 px-2">Move to parent:</div>
                  {validParents.map((parent) => (
                    <button
                      key={parent.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeParent(item.id, parent.id);
                        setShowParentSelector(false);
                      }}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded flex items-center"
                    >
                      <span className="w-3 h-3 rounded mr-2" style={{ backgroundColor: parent.color || HIERARCHY_LEVEL_COLORS[parent.level] }}></span>
                      {parent.name}
                    </button>
                  ))}
                  <div className="border-t border-gray-200 mt-2 pt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onIndentOut(item.id);
                        setShowParentSelector(false);
                      }}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded text-blue-600"
                    >
                      🏠 Move to root level
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
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
          
          {/* Indent in button */}
          {item.level < 4 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onIndentIn(item.id);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Group under this item (Tab)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
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

  const sortHierarchically = (items: HierarchyItem[]): HierarchyItem[] => {
    const result: HierarchyItem[] = [];
    const itemMap = new Map<string, HierarchyItem>();
    
    // Create a map for quick lookup
    items.forEach(item => itemMap.set(item.id, item));
    
    // Recursive function to add item and its children
    const addItemWithChildren = (item: HierarchyItem, addedIds: Set<string>) => {
      if (addedIds.has(item.id)) return; // Prevent infinite loops
      
      result.push(item);
      addedIds.add(item.id);
      
      // Find and add children in order
      const children = items
        .filter(child => child.parentId === item.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      children.forEach(child => addItemWithChildren(child, addedIds));
    };
    
    // Start with top-level items (level 1, no parent)
    const topLevelItems = items
      .filter(item => item.level === 1)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const addedIds = new Set<string>();
    topLevelItems.forEach(item => addItemWithChildren(item, addedIds));
    
    // Add any orphaned items (items whose parents don't exist)
    items.forEach(item => {
      if (!addedIds.has(item.id)) {
        console.warn('Orphaned item found:', item.name, 'Parent ID:', item.parentId);
        result.push(item);
      }
    });
    
    return result;
  };

  const loadHierarchyItems = async (userId: string) => {
    try {
      setLoading(true);
      console.log('🏗️ Loading hierarchy items for user:', userId);
      
      const hierarchyItems = await getHierarchyItems(userId);
      const sortedItems = sortHierarchically(hierarchyItems);
      setItems(sortedItems);
      
      console.log('📋 Hierarchical sorting applied:', {
        originalCount: hierarchyItems.length,
        sortedCount: sortedItems.length,
        structure: sortedItems.map(item => `${'  '.repeat(item.level - 1)}${item.name} (${HIERARCHY_LEVEL_NAMES[item.level]})`).slice(0, 10)
      });
      
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

  const createHierarchyItemWithPosition = async (
    userId: string,
    name: string,
    level: HierarchyLevel,
    parentId?: string,
    insertAfterItemId?: string,
    color?: string
  ): Promise<string> => {
    try {
      console.log('🏗️ Creating positioned hierarchy item:', { name, level, parentId, insertAfterItemId });
      
      // Calculate order for new item
      let order = 0;
      
      if (insertAfterItemId) {
        // Find the item to insert after
        const afterItem = items.find(i => i.id === insertAfterItemId);
        if (afterItem) {
          // Get siblings at the same level and parent
          const siblings = items
            .filter(i => i.level === level && i.parentId === parentId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
          
          const afterItemIndex = siblings.findIndex(i => i.id === insertAfterItemId);
          
          if (afterItemIndex !== -1) {
            // Set order to be after the selected item
            const currentOrder = afterItem.order || 0;
            const nextSibling = siblings[afterItemIndex + 1];
            
            if (nextSibling) {
              // Insert between current and next sibling
              order = currentOrder + ((nextSibling.order || 0) - currentOrder) / 2;
            } else {
              // Insert at the end
              order = currentOrder + 1;
            }
          }
        }
      }
      
      // Use the existing createHierarchyItem function if no specific positioning needed
      if (!insertAfterItemId || order === 0) {
        // Create via Firebase function but add color afterward if specified
        const newItemId = await createHierarchyItem(userId, name, level, parentId);
        if (color) {
          await updateHierarchyItem(userId, newItemId, { color });
        }
        return newItemId;
      }
      
      // Create with specific order and color
      const hierarchyData = {
        name,
        level,
        ...(parentId ? { parentId } : {}),
        ...(color ? { color } : {}),
        userId,
        order,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const docRef = await addDoc(collection(db, 'users', userId, 'hierarchy'), hierarchyData);
      return docRef.id;
      
    } catch (error) {
      console.error('❌ Error creating positioned hierarchy item:', error);
      throw error;
    }
  };

  const handleCreateNewItem = async (createAsChild = false) => {
    if (!user) return;
    
    try {
      console.log('🆕 Creating new item', createAsChild ? 'as child' : 'at same level');
      
      // Smart positioning logic - prioritize creating tags (level 4) first
      const selectedItemId = Array.from(selectedItems)[0];
      let level: HierarchyLevel = 4; // Default to tag level
      let parentId: string | undefined;
      let itemName = 'New Tag';
      let insertAfterItemId: string | undefined;
      let defaultColor: string | undefined;
      
      if (selectedItemId) {
        const selectedItem = items.find(i => i.id === selectedItemId);
        if (selectedItem) {
          if (createAsChild) {
            // Create as child of selected item (group under it)
            level = Math.min(selectedItem.level + 1, 4) as HierarchyLevel;
            parentId = selectedItem.id;
            itemName = level === 4 ? 'New Tag' : `New ${HIERARCHY_LEVEL_NAMES[level]}`;
            // Don't use insertAfterItemId for children - add at end
          } else {
            // Create at same level as selected item, positioned after it
            level = selectedItem.level;
            parentId = selectedItem.parentId;
            itemName = level === 4 ? 'New Tag' : `New ${HIERARCHY_LEVEL_NAMES[level]}`;
            insertAfterItemId = selectedItem.id;
          }
        }
      }
      
      // Assign a default color from the level's palette
      const levelColors = HIERARCHY_LEVEL_DEFAULT_COLORS[level];
      const existingItemsAtLevel = items.filter(i => i.level === level);
      defaultColor = levelColors[existingItemsAtLevel.length % levelColors.length];
      
      const newItemId = await createHierarchyItemWithPosition(
        user.uid, 
        itemName, 
        level, 
        parentId, 
        insertAfterItemId,
        defaultColor
      );
      
      await loadHierarchyItems(user.uid);
      
      // Start editing the new item
      setEditing({ itemId: newItemId, value: itemName });
      setSelectedItems(new Set([newItemId]));
      
      showToast(`New ${level === 4 ? 'tag' : HIERARCHY_LEVEL_NAMES[level].toLowerCase()} created`, 'success');
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

  const handleColorChange = async (itemId: string, color: string) => {
    if (!user) return;
    
    try {
      await updateHierarchyItem(user.uid, itemId, { color: color || undefined });
      await loadHierarchyItems(user.uid);
      showToast(color ? 'Color updated' : 'Color removed', 'success');
    } catch (error) {
      console.error('❌ Error updating color:', error);
      showToast('Failed to update color', 'error');
    }
  };

  const getValidParents = (item: HierarchyItem): HierarchyItem[] => {
    // Find potential parents (one level up from current item)
    if (item.level <= 1) return []; // Top-level items have no parents
    
    const parentLevel = (item.level - 1) as HierarchyLevel;
    return items.filter(i => 
      i.level === parentLevel && 
      i.id !== item.parentId // Exclude current parent
    ).sort((a, b) => a.name.localeCompare(b.name));
  };

  const getCurrentParentName = (item: HierarchyItem): string => {
    if (!item.parentId) return 'Root Level';
    const parent = items.find(i => i.id === item.parentId);
    return parent?.name || 'Unknown Parent';
  };

  const handleChangeParent = async (itemId: string, newParentId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // If same parent selected, do nothing
    if (newParentId === item.parentId) return;

    const newParent = items.find(i => i.id === newParentId);
    if (!newParent) return;

    try {
      console.log('🔄 Changing parent:', {
        itemName: item.name,
        currentParent: getCurrentParentName(item),
        newParent: newParent.name,
        level: item.level
      });

      // Move item to new parent (same level)
      await moveHierarchyItemLevel(user.uid, itemId, item.level, newParentId);
      await loadHierarchyItems(user.uid);
      showToast(`Moved "${item.name}" to "${newParent.name}"`, 'success');
    } catch (error) {
      console.error('❌ Error changing parent:', error);
      showToast('Failed to change parent', 'error');
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const hasChildren = items.some(i => i.parentId === itemId);
    const usageCount = usageCounts[itemId] || 0;
    
    const childrenCount = items.filter(i => i.parentId === itemId).length;
    
    let confirmMessage = `Delete "${item.name}"?`;
    let warningDetails = [];
    
    if (hasChildren) {
      warningDetails.push(`This will also delete ${childrenCount} child item${childrenCount !== 1 ? 's' : ''}`);
    }
    if (usageCount > 0) {
      warningDetails.push(`It's currently used in ${usageCount} transaction${usageCount !== 1 ? 's' : ''}`);
    }
    
    if (warningDetails.length > 0) {
      confirmMessage += '\n\n⚠️ Warning: ' + warningDetails.join(' and ') + '.';
    }
    
    confirmMessage += '\n\nThis action cannot be undone.';
    
    if (!window.confirm(confirmMessage)) return;

    try {
      setLoading(true);
      await deleteHierarchyItem(user.uid, itemId);
      await loadHierarchyItems(user.uid);
      setSelectedItems(new Set());
      showToast(`"${item.name}" deleted successfully`, 'success');
    } catch (error) {
      console.error('❌ Error deleting item:', error);
      showToast('Failed to delete item', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleIndentIn = async (itemId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item || item.level >= 4) return;

    // Find potential parent (previous item at target parent level)
    const itemIndex = items.findIndex(i => i.id === itemId);
    const targetParentLevel = item.level; // Current level items can become parent of level + 1
    let newParentId: string | undefined;
    
    // Look backwards for an item at the target parent level
    for (let i = itemIndex - 1; i >= 0; i--) {
      if (items[i].level === targetParentLevel) {
        newParentId = items[i].id;
        break;
      }
      // Stop searching if we encounter an item at a lower level than target parent
      if (items[i].level < targetParentLevel) {
        break;
      }
    }

    if (!newParentId) {
      showToast(`No ${HIERARCHY_LEVEL_NAMES[targetParentLevel].toLowerCase()} found to indent under`, 'error');
      return;
    }

    try {
      console.log('🔧 Indenting in:', { 
        itemName: item.name, 
        currentLevel: item.level, 
        targetLevel: item.level + 1,
        newParent: items.find(i => i.id === newParentId)?.name || 'unknown'
      });
      
      await moveHierarchyItemLevel(user.uid, itemId, (item.level + 1) as HierarchyLevel, newParentId);
      await loadHierarchyItems(user.uid);
      showToast(`Moved to ${HIERARCHY_LEVEL_NAMES[(item.level + 1) as HierarchyLevel]} under "${items.find(i => i.id === newParentId)?.name}"`, 'success');
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
    // When moving to top level, newParentId should be undefined (not null)
    // This allows Firebase to properly remove the parentId field using deleteField()
    const parent = items.find(i => i.id === item.parentId);
    const newParentId = parent?.parentId || undefined; // Ensure it's undefined, not null

    console.log('🔍 Outdent debug:', {
      itemId,
      itemName: item.name,
      currentLevel: item.level,
      newLevel: item.level - 1,
      currentParentId: item.parentId,
      parentName: parent?.name,
      newParentId: newParentId || 'none (top level)',
      willBeTopLevel: newParentId === undefined
    });

    try {
      await moveHierarchyItemLevel(
        user.uid, 
        itemId, 
        (item.level - 1) as HierarchyLevel, 
        newParentId // This should be undefined for top-level items
      );
      await loadHierarchyItems(user.uid);
      
      const newParentName = newParentId ? 
        (items.find(i => i.id === newParentId)?.name || 'unknown parent') : 
        'root level';
      
      showToast(`Moved "${item.name}" to ${HIERARCHY_LEVEL_NAMES[(item.level - 1) as HierarchyLevel]} ${newParentId ? `under "${newParentName}"` : 'at top level'}`, 'success');
    } catch (error) {
      console.error('❌ Error outdenting item:', error);
      console.error('Error details:', error);
      showToast('Failed to outdent item', 'error');
    }
  };

  const handleMoveUp = async (itemId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Check if we can move within current parent
    const siblings = items.filter(i => 
      i.level === item.level && 
      i.parentId === item.parentId
    ).sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const currentIndex = siblings.findIndex(i => i.id === itemId);
    
    if (currentIndex > 0) {
      // Normal up movement within same parent
      try {
        await moveHierarchyItemWithChildren(user.uid, itemId, 'up');
        await loadHierarchyItems(user.uid);
        showToast('Item moved up successfully', 'success');
      } catch (error) {
        console.error('❌ Error moving item up:', error);
        showToast('Failed to move item up', 'error');
      }
    } else {
      // At top of current parent - offer to move to previous parent
      const validParents = getValidParents(item);
      if (validParents.length === 0) {
        showToast('Already at the top of this section', 'info');
        return;
      }

      const currentParentIndex = validParents.findIndex(p => p.id === item.parentId);
      
      if (currentParentIndex > 0) {
        const newParent = validParents[currentParentIndex - 1];
        if (window.confirm(`Move "${item.name}" to "${newParent.name}"?`)) {
          await handleChangeParent(itemId, newParent.id);
        }
      } else {
        showToast('Already at the top-most position', 'info');
      }
    }
  };

  const handleMoveDown = async (itemId: string) => {
    if (!user) return;
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Check if we can move within current parent
    const siblings = items.filter(i => 
      i.level === item.level && 
      i.parentId === item.parentId
    ).sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const currentIndex = siblings.findIndex(i => i.id === itemId);
    
    if (currentIndex >= 0 && currentIndex < siblings.length - 1) {
      // Normal down movement within same parent
      try {
        await moveHierarchyItemWithChildren(user.uid, itemId, 'down');
        await loadHierarchyItems(user.uid);
        showToast('Item moved down successfully', 'success');
      } catch (error) {
        console.error('❌ Error moving item down:', error);
        showToast('Failed to move item down', 'error');
      }
    } else {
      // At bottom of current parent - offer to move to next parent
      const validParents = getValidParents(item);
      if (validParents.length === 0) {
        showToast('Already at the bottom of this section', 'info');
        return;
      }

      const currentParentIndex = validParents.findIndex(p => p.id === item.parentId);
      
      if (currentParentIndex >= 0 && currentParentIndex < validParents.length - 1) {
        const newParent = validParents[currentParentIndex + 1];
        if (window.confirm(`Move "${item.name}" to "${newParent.name}"?`)) {
          await handleChangeParent(itemId, newParent.id);
        }
      } else {
        showToast('Already at the bottom-most position', 'info');
      }
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
    let successCount = 0;
    
    try {
      await Promise.all(
        itemsToMove.map(async (itemId) => {
          const item = items.find(i => i.id === itemId);
          if (!item || item.level >= 4) return;

          // Find potential parent (previous item at target parent level)
          const itemIndex = items.findIndex(i => i.id === itemId);
          const targetParentLevel = item.level; // Current level items can become parent of level + 1
          let newParentId: string | undefined;
          
          // Look backwards for an item at the target parent level
          for (let i = itemIndex - 1; i >= 0; i--) {
            if (items[i].level === targetParentLevel) {
              newParentId = items[i].id;
              break;
            }
            // Stop searching if we encounter an item at a lower level than target parent
            if (items[i].level < targetParentLevel) {
              break;
            }
          }

          if (newParentId) {
            await moveHierarchyItemLevel(user.uid, itemId, (item.level + 1) as HierarchyLevel, newParentId);
            successCount++;
          }
        })
      );
      
      await loadHierarchyItems(user.uid);
      if (successCount > 0) {
        showToast(`${successCount} items indented successfully`, 'success');
      } else {
        showToast('No items could be indented (no valid parents found)', 'info');
      }
    } catch (error) {
      console.error('❌ Error in bulk indent:', error);
      showToast('Failed to indent items', 'error');
    }
  };

  const handleBulkIndentOut = async () => {
    if (!user || checkedItems.size === 0) return;

    const itemsToMove = Array.from(checkedItems);
    let successCount = 0;
    
    try {
      await Promise.all(
        itemsToMove.map(async (itemId) => {
          const item = items.find(i => i.id === itemId);
          if (!item || item.level <= 1) return;

          const parent = items.find(i => i.id === item.parentId);
          const newParentId = parent?.parentId || undefined; // Ensure it's undefined, not null
          
          console.log('🔍 Bulk outdent debug:', {
            itemId,
            itemName: item.name,
            currentLevel: item.level,
            newParentId: newParentId || 'none (top level)'
          });
          
          await moveHierarchyItemLevel(user.uid, itemId, (item.level - 1) as HierarchyLevel, newParentId);
          successCount++;
        })
      );
      
      await loadHierarchyItems(user.uid);
      if (successCount > 0) {
        showToast(`${successCount} items outdented successfully`, 'success');
      } else {
        showToast('No items could be outdented (already at top level)', 'info');
      }
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
    if (!isOpen) return;

    const selectedItemId = Array.from(selectedItems)[0];

    // Handle keyboard shortcuts during editing
    if (editing.itemId) {
      // Allow Tab to create child item even when editing
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        // Save current edit first, then create child
        const saveAndCreateChild = async () => {
          await handleEditSave();
          await handleCreateNewItem(true); // Create as child
        };
        saveAndCreateChild();
        return;
      }
      // For other keys during editing, let the input handle them
      return;
    }

    if (!selectedItemId) {
      // No item selected - only allow Enter to create new top-level item
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateNewItem();
      }
      return;
    }

    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Tab: Move item to previous level (indent out)
          handleIndentOut(selectedItemId);
        } else {
          // Tab: Create new child item under selected item
          handleCreateNewItem(true);
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        handleDelete(selectedItemId);
        break;
      case 'Enter':
        e.preventDefault();
        // Enter: Create new item at same level after selected item
        handleCreateNewItem(false);
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
              Create tags first, then optionally group them. Tab groups items, Enter creates new tags, dropdown moves items between groups.
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
        <div ref={containerRef} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] relative">
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-40 flex items-center justify-center">
              <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-lg shadow-lg border">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="text-gray-700 font-medium">Processing...</span>
              </div>
            </div>
          )}
          
          {items.length === 0 && !loading ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🏷️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tags yet</h3>
              <p className="text-gray-500 mb-6">Create your first tag to start organizing your transactions</p>
              <button
                onClick={() => handleCreateNewItem()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
              >
                Create First Tag
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usage
                    </th>
                    <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    // Check if this is the start of a new parent group
                    const prevItem = index > 0 ? items[index - 1] : null;
                    const isNewParentGroup = prevItem && 
                      item.level === 1 && prevItem.level === 4; // New category after tags
                    
                    return (
                      <React.Fragment key={item.id}>
                        {isNewParentGroup && (
                          <tr>
                            <td colSpan={4} className="px-3 py-0.5">
                              <div className="border-t border-gray-300"></div>
                            </td>
                          </tr>
                        )}
                        <HierarchyItemRow
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
                          onColorChange={handleColorChange}
                          onChangeParent={handleChangeParent}
                          getValidParents={getValidParents}
                          getCurrentParentName={getCurrentParentName}
                        />
                      </React.Fragment>
                    );
                  })}
                  
                  {/* Add new item row */}
                  <tr className="hover:bg-gray-50 border-t-2 border-dashed border-gray-300">
                    <td className="px-3 py-1.5 whitespace-nowrap"></td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleCreateNewItem()}
                        className="flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm italic">Click to add new tag (or press Enter)</span>
                      </button>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-center text-gray-400">-</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleCreateNewItem()}
                        className="text-blue-600 hover:text-blue-800"
                        title="Add Tag"
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
            </div>
          )}
          
          {/* Keyboard shortcuts help */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Keyboard Shortcuts</h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">Tab</kbd> Group under selected</div>
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">Enter</kbd> Create new tag</div>
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">F2</kbd> Rename selected</div>
              <div><kbd className="px-1 py-0.5 bg-gray-200 rounded">Delete</kbd> Delete selected</div>
              <div><span className="text-gray-500">📁 Dropdown moves between groups</span></div>
              <div><span className="text-gray-500">🏠 Move to root level</span></div>
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