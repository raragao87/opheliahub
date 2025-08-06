import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getTags, 
  createTag, 
  updateTag, 
  deleteTag, 
  getDefaultTags, 
  type Tag 
} from '../firebase/config';

interface TagsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TagNode {
  tag: Tag;
  children: TagNode[];
  isExpanded?: boolean;
}

const TagsModal: React.FC<TagsModalProps> = ({ isOpen, onClose }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagTree, setTagTree] = useState<TagNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  
  // Add/Edit form fields
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3B82F6');
  const [parentTagId, setParentTagId] = useState<string>('');
  const [tagLevel, setTagLevel] = useState(0);

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
      buildTagTree(allTags);
    } catch (error) {
      console.error('❌ Error loading tags:', error);
      setError('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  const buildTagTree = (tagList: Tag[]) => {
    const tagMap = new Map<string, TagNode>();
    const rootNodes: TagNode[] = [];

    // Create nodes for all tags
    tagList.forEach(tag => {
      tagMap.set(tag.id, {
        tag,
        children: [],
        isExpanded: true
      });
    });

    // Build tree structure
    tagList.forEach(tag => {
      const node = tagMap.get(tag.id)!;
      if (tag.parentTagId) {
        const parentNode = tagMap.get(tag.parentTagId);
        if (parentNode) {
          parentNode.children.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    setTagTree(rootNodes);
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
        parentTagId: parentTagId || undefined,
        level: tagLevel,
        userId: user.uid,
        isDefault: false
      });
      
      await loadTags(user.uid);
      setTagName('');
      setTagColor('#3B82F6');
      setParentTagId('');
      setTagLevel(0);
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
        parentTagId: parentTagId || undefined,
        level: tagLevel
      }, user.uid);
      
      await loadTags(user.uid);
      setEditingTag(null);
      setTagName('');
      setTagColor('#3B82F6');
      setParentTagId('');
      setTagLevel(0);
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
      setDeletingTag(tagId);
      await deleteTag(tagId, user.uid);
      await loadTags(user.uid);
      console.log('✅ Tag deleted successfully');
    } catch (error) {
      console.error('Error deleting tag:', error);
      setError('Failed to delete tag');
    } finally {
      setDeletingTag(null);
    }
  };

  const startEditTag = (tag: Tag) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setParentTagId(tag.parentTagId || '');
    setTagLevel(tag.level);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setTagName('');
    setTagColor('#3B82F6');
    setParentTagId('');
    setTagLevel(0);
  };

  const toggleNodeExpansion = (nodeId: string) => {
    const updateNode = (nodes: TagNode[]): TagNode[] => {
      return nodes.map(node => {
        if (node.tag.id === nodeId) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        return {
          ...node,
          children: updateNode(node.children)
        };
      });
    };
    
    setTagTree(updateNode(tagTree));
  };

  const renderTagNode = (node: TagNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = node.isExpanded !== false;
    
    return (
      <div key={node.tag.id} className="space-y-1">
        <div 
          className={`flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 ${
            node.tag.isDefault ? 'bg-blue-50' : 'bg-white'
          }`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          <div className="flex items-center space-x-3">
            {hasChildren && (
              <button
                onClick={() => toggleNodeExpansion(node.tag.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg 
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {!hasChildren && <div className="w-4" />}
            
            <div 
              className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: node.tag.color }}
            />
            
            <div>
              <p className="font-medium text-gray-800">{node.tag.name}</p>
              <p className="text-xs text-gray-500">
                Level {node.tag.level} {node.tag.isDefault && '• Default'}
              </p>
            </div>
          </div>
          
          {!node.tag.isDefault && (
            <div className="flex space-x-2">
              <button
                onClick={() => startEditTag(node.tag)}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit tag"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => handleDeleteTag(node.tag.id)}
                disabled={deletingTag === node.tag.id}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Delete tag"
              >
                {deletingTag === node.tag.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
        
        {isExpanded && hasChildren && (
          <div className="space-y-1">
            {node.children.map(child => renderTagNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const getAvailableParents = () => {
    return tags.filter(tag => tag.level === 0); // Only root tags can be parents
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
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
                        setTagLevel(e.target.value ? 1 : 0);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">No Parent (Root Tag)</option>
                      {getAvailableParents().map(tag => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
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

          {/* Tags Tree */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading tags...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Tag Hierarchy</h3>
              {tagTree.map(node => renderTagNode(node))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagsModal; 