export interface PageContext {
  /** Current route path, e.g. "/tracker" */
  path: string;
  /** Human-readable page name, e.g. "Budget Tracker" */
  pageName: string;
  /** Current visibility mode */
  visibility: "SHARED" | "PERSONAL";
  /** Current month being viewed (if applicable) */
  month?: string;
  /** Brief description of what's on screen */
  summary?: string;
  /** Suggested prompts relevant to this page */
  suggestedPrompts: string[];
}

const PAGE_CONFIGS: Record<string, { pageName: string; suggestedPrompts: string[] }> = {
  "/dashboard": {
    pageName: "Dashboard",
    suggestedPrompts: [
      "How am I doing this month?",
      "What's my biggest expense category?",
      "How has my net worth changed?",
    ],
  },
  "/tracker": {
    pageName: "Budget Tracker",
    suggestedPrompts: [
      "How can I allocate my unbudgeted money?",
      "Which categories am I overspending in?",
      "Explain zero-based budgeting",
    ],
  },
  "/planner": {
    pageName: "Planner",
    suggestedPrompts: [
      "What recurring expenses do I have?",
      "How much do I spend on subscriptions?",
      "Help me plan next month's budget",
    ],
  },
  "/transactions": {
    pageName: "Transactions",
    suggestedPrompts: [
      "Help me categorize uncategorized transactions",
      "Find duplicate transactions",
      "What's this transaction for?",
    ],
  },
  "/transactions/import": {
    pageName: "Import Transactions",
    suggestedPrompts: [
      "What do the duplicate warnings mean?",
      "How should I categorize these?",
      "Explain the import process",
    ],
  },
  "/net-worth": {
    pageName: "Net Worth",
    suggestedPrompts: [
      "How is my net worth trending?",
      "What's dragging my net worth down?",
      "How can I improve my net worth?",
    ],
  },
  "/accounts": {
    pageName: "Accounts",
    suggestedPrompts: [
      "Summarize this account's activity",
      "What are the biggest expenses here?",
      "Is this account healthy?",
    ],
  },
  "/settings": {
    pageName: "Settings",
    suggestedPrompts: [
      "How do I invite my partner?",
      "How do I change my categories?",
      "What are the privacy settings?",
    ],
  },
};

/** Resolve page config from a pathname, with fallback */
export function getPageConfig(pathname: string): { pageName: string; suggestedPrompts: string[] } {
  // Check for tab-specific overrides
  if (pathname === "/planner") {
    // Tab-specific prompts are handled by the page itself via summary
    return PAGE_CONFIGS["/planner"];
  }

  // Exact match first
  if (PAGE_CONFIGS[pathname]) return PAGE_CONFIGS[pathname];

  // Prefix match (e.g. /accounts/xxx → /accounts)
  for (const key of Object.keys(PAGE_CONFIGS)) {
    if (pathname.startsWith(key)) return PAGE_CONFIGS[key];
  }

  return {
    pageName: "OpheliaHub",
    suggestedPrompts: [
      "What can you help me with?",
      "How does OpheliaHub work?",
      "Help me manage my finances",
    ],
  };
}
