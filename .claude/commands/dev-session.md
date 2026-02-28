Start a focused development session for OpheliaHub.

Follow these steps:

1. Check the current git status and branch with `git status` and `git branch`
2. Review any open TODOs or FIXME comments in recently changed files: `git diff --name-only HEAD~5 | xargs grep -n 'TODO\|FIXME' 2>/dev/null`
3. Check the current state of the project — which Phase 1 features exist and which are still needed:
   - Authentication (NextAuth + Google OAuth)
   - Household creation and partner linking
   - Account management (CRUD, multiple types)
   - Transaction CRUD with privacy enforcement
   - Bank file import (CSV + MT940)
   - Duplicate detection
   - Tagging system
   - Dashboard (personal and shared views)
   - Net worth calculator
   - Zero-based budgeting
4. Ask what feature or task to work on this session
5. Before implementing, outline:
   - What files will be created or modified
   - Which subagents are relevant (db-architect, privacy-enforcer, finance-logic, import-parser, ui-builder)
   - Any database schema changes needed
6. Implement incrementally — build one piece at a time, verify it works before moving on
7. After implementation, invoke the code-reviewer subagent to check for privacy and correctness issues
8. Run tests: `pnpm test`
9. Summarize what was accomplished and suggest what to work on next
