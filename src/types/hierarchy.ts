export interface HierarchyItem {
  id: string;
  name: string;
  level: 1 | 2 | 3 | 4; // 1: Category, 2: Subcategory, 3: Tag Group, 4: Tag
  parentId?: string; // Parent item ID
  userId: string;
  order: number; // For sorting within the same parent
  usageCount?: number; // How many transactions use this (for tags only)
  color?: string; // Optional color for visual distinction
  createdAt: number;
  updatedAt: number;
}

export type HierarchyLevel = 1 | 2 | 3 | 4;

export const HIERARCHY_LEVEL_NAMES = {
  1: 'Category',
  2: 'Subcategory', 
  3: 'Tag Group',
  4: 'Tag'
} as const;

export const HIERARCHY_LEVEL_COLORS = {
  1: '#1F2937', // Dark gray
  2: '#374151', // Medium gray
  3: '#6B7280', // Light gray  
  4: '#9CA3AF'  // Lightest gray
} as const;

export const HIERARCHY_LEVEL_INDENT = {
  1: 0,
  2: 20,
  3: 40,
  4: 60
} as const;

export const HIERARCHY_LEVEL_ICONS = {
  1: '📁', // Category
  2: '📂', // Subcategory
  3: '🗂️', // Tag Group
  4: '🏷️'  // Tag
} as const;

// Color palette for hierarchy items
export const COLOR_PALETTE = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#10B981', // Emerald
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#6B7280', // Gray
  '#374151', // Dark Gray
  '#1F2937'  // Very Dark Gray
] as const;

// Default color schemes for different levels
export const HIERARCHY_LEVEL_DEFAULT_COLORS = {
  1: ['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7'], // Blues and purples for categories
  2: ['#10B981', '#14B8A6', '#06B6D4', '#0EA5E9'], // Greens and teals for subcategories
  3: ['#F59E0B', '#EAB308', '#84CC16', '#22C55E'], // Yellows and greens for tag groups
  4: ['#EF4444', '#F97316', '#EC4899', '#F43F5E']  // Reds and pinks for tags
} as const;

export interface HierarchyTree {
  [key: string]: HierarchyItem & {
    children: HierarchyTree;
  };
}

export interface HierarchyOperations {
  createItem: (name: string, level: HierarchyLevel, parentId?: string) => Promise<string>;
  updateItem: (id: string, updates: Partial<HierarchyItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  moveItemLevel: (id: string, newLevel: HierarchyLevel, newParentId?: string) => Promise<void>;
  bulkUpdateItems: (items: { id: string; updates: Partial<HierarchyItem> }[]) => Promise<void>;
  getHierarchyTree: () => Promise<HierarchyItem[]>;
}