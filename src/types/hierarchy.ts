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