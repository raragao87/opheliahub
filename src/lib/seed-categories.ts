import { PrismaClient, Visibility, CategoryType } from "@prisma/client";

interface CategoryChild {
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

interface CategoryGroup {
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  type?: CategoryType;
  children?: CategoryChild[];
}

const SHARED_CATEGORY_GROUPS: CategoryGroup[] = [
  {
    name: "Income",
    icon: "💰",
    color: "#16a34a",
    sortOrder: 0,
    children: [
      { name: "Salary", icon: "💼", color: "#16a34a", sortOrder: 0 },
      { name: "Freelance", icon: "💻", color: "#16a34a", sortOrder: 1 },
      { name: "Investments", icon: "📈", color: "#16a34a", sortOrder: 2 },
      { name: "Other Income", icon: "💵", color: "#16a34a", sortOrder: 3 },
    ],
  },
  {
    name: "Fixed Expenses",
    icon: "📌",
    color: "#dc2626",
    sortOrder: 10,
    children: [
      { name: "Rent / Mortgage", icon: "🏠", color: "#dc2626", sortOrder: 0 },
      { name: "Utilities", icon: "⚡", color: "#dc2626", sortOrder: 1 },
      { name: "Insurance", icon: "🛡️", color: "#dc2626", sortOrder: 2 },
      { name: "Subscriptions", icon: "📱", color: "#dc2626", sortOrder: 3 },
      { name: "Loan Payments", icon: "🏦", color: "#dc2626", sortOrder: 4 },
    ],
  },
  {
    name: "Variable Expenses",
    icon: "🔀",
    color: "#ea580c",
    sortOrder: 20,
    children: [
      { name: "Groceries", icon: "🛒", color: "#ea580c", sortOrder: 0 },
      { name: "Dining Out", icon: "🍽️", color: "#ea580c", sortOrder: 1 },
      { name: "Transport", icon: "🚗", color: "#ea580c", sortOrder: 2 },
      { name: "Healthcare", icon: "🏥", color: "#ea580c", sortOrder: 3 },
      { name: "Entertainment", icon: "🎬", color: "#ea580c", sortOrder: 4 },
      { name: "Shopping", icon: "🛍️", color: "#ea580c", sortOrder: 5 },
      { name: "Personal Care", icon: "💅", color: "#ea580c", sortOrder: 6 },
      { name: "Education", icon: "📚", color: "#ea580c", sortOrder: 7 },
    ],
  },
  {
    name: "Savings & Funds",
    icon: "🐷",
    color: "#2563eb",
    sortOrder: 30,
    children: [
      { name: "Emergency Fund", icon: "🆘", color: "#2563eb", sortOrder: 0 },
      { name: "Savings", icon: "🐷", color: "#2563eb", sortOrder: 1 },
      { name: "Retirement", icon: "🏖️", color: "#2563eb", sortOrder: 2 },
    ],
  },
  {
    name: "Transfers",
    icon: "🔄",
    color: "#6b7280",
    sortOrder: 40,
    children: [
      { name: "Transfer", icon: "🔄", color: "#6b7280", sortOrder: 0 },
    ],
  },
  {
    name: "Uncategorized",
    icon: "❓",
    color: "#9ca3af",
    sortOrder: 99,
  },
];

const SHARED_INVESTMENT_GROUPS: CategoryGroup[] = [
  {
    name: "Investment",
    icon: "📈",
    color: "#3b82f6",
    sortOrder: 0,
    type: "INVESTMENT",
    children: [
      { name: "Buy", icon: "📈", color: "#3b82f6", sortOrder: 0 },
      { name: "Sell", icon: "📉", color: "#3b82f6", sortOrder: 1 },
      { name: "Dividend", icon: "💰", color: "#3b82f6", sortOrder: 2 },
      { name: "Interest", icon: "🏦", color: "#3b82f6", sortOrder: 3 },
      { name: "Fee", icon: "💸", color: "#3b82f6", sortOrder: 4 },
      { name: "Other", icon: "📋", color: "#3b82f6", sortOrder: 5 },
    ],
  },
];

const PERSONAL_INVESTMENT_GROUPS: CategoryGroup[] = [
  {
    name: "Investment",
    icon: "📈",
    color: "#3b82f6",
    sortOrder: 0,
    type: "INVESTMENT",
    children: [
      { name: "Buy", icon: "📈", color: "#3b82f6", sortOrder: 0 },
      { name: "Sell", icon: "📉", color: "#3b82f6", sortOrder: 1 },
      { name: "Dividend", icon: "💰", color: "#3b82f6", sortOrder: 2 },
      { name: "Interest", icon: "🏦", color: "#3b82f6", sortOrder: 3 },
      { name: "Fee", icon: "💸", color: "#3b82f6", sortOrder: 4 },
      { name: "Other", icon: "📋", color: "#3b82f6", sortOrder: 5 },
    ],
  },
];

const PERSONAL_CATEGORY_GROUPS: CategoryGroup[] = [
  {
    name: "Personal Income",
    icon: "💰",
    color: "#16a34a",
    sortOrder: 0,
    children: [
      { name: "Salary", icon: "💼", color: "#16a34a", sortOrder: 0 },
      { name: "Side Income", icon: "💻", color: "#16a34a", sortOrder: 1 },
      { name: "Other Income", icon: "💵", color: "#16a34a", sortOrder: 2 },
    ],
  },
  {
    name: "Personal Expenses",
    icon: "🛍️",
    color: "#ea580c",
    sortOrder: 10,
    children: [
      { name: "Clothing", icon: "👔", color: "#ea580c", sortOrder: 0 },
      { name: "Hobbies", icon: "🎨", color: "#ea580c", sortOrder: 1 },
      { name: "Personal Care", icon: "💅", color: "#ea580c", sortOrder: 2 },
      { name: "Subscriptions", icon: "📱", color: "#ea580c", sortOrder: 3 },
      { name: "Dining Out", icon: "🍽️", color: "#ea580c", sortOrder: 4 },
      { name: "Entertainment", icon: "🎬", color: "#ea580c", sortOrder: 5 },
      { name: "Health & Fitness", icon: "💪", color: "#ea580c", sortOrder: 6 },
      { name: "Education", icon: "📚", color: "#ea580c", sortOrder: 7 },
    ],
  },
  {
    name: "Personal Savings",
    icon: "🐷",
    color: "#2563eb",
    sortOrder: 20,
    children: [
      { name: "Personal Savings", icon: "🐷", color: "#2563eb", sortOrder: 0 },
      { name: "Investments", icon: "📈", color: "#2563eb", sortOrder: 1 },
    ],
  },
  {
    name: "Transfers",
    icon: "🔄",
    color: "#6b7280",
    sortOrder: 30,
    children: [
      { name: "Transfer", icon: "🔄", color: "#6b7280", sortOrder: 0 },
    ],
  },
  {
    name: "Uncategorized",
    icon: "❓",
    color: "#9ca3af",
    sortOrder: 99,
  },
];

async function seedCategoryGroups(
  prisma: PrismaClient,
  householdId: string,
  groups: CategoryGroup[],
  visibility: Visibility
) {
  for (const group of groups) {
    const { children, type: groupType, ...groupData } = group;

    let parent = await prisma.category.findFirst({
      where: { householdId, name: groupData.name, parentId: null, visibility },
    });

    if (!parent) {
      parent = await prisma.category.create({
        data: {
          ...groupData,
          householdId,
          visibility,
          ...(groupType && { type: groupType }),
        },
      });
    }

    if (children) {
      for (const child of children) {
        const existing = await prisma.category.findFirst({
          where: { householdId, name: child.name, parentId: parent.id, visibility },
        });
        if (!existing) {
          await prisma.category.create({
            data: {
              ...child,
              parentId: parent.id,
              householdId,
              visibility,
              ...(groupType && { type: groupType }),
            },
          });
        }
      }
    }
  }
}

export async function seedDefaultCategories(prisma: PrismaClient, householdId: string) {
  await seedCategoryGroups(prisma, householdId, SHARED_CATEGORY_GROUPS, "SHARED");
  await seedCategoryGroups(prisma, householdId, PERSONAL_CATEGORY_GROUPS, "PERSONAL");
  await seedCategoryGroups(prisma, householdId, SHARED_INVESTMENT_GROUPS, "SHARED");
  await seedCategoryGroups(prisma, householdId, PERSONAL_INVESTMENT_GROUPS, "PERSONAL");
}
