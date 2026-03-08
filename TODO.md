# OpheliaHub - Finance Module TODO

## Priority 1: Core Finance Features (MVP)
- [x] **Transactions:**
    - [x] Add ability to *edit* transaction date/description/amount inline (Verified).
    - [x] Verify **Transaction Tagging** (Refactored `InlineTagInput` to support both modes).
    - [x] **Ensure Split Transactions work correctly (UI & backend)** - Fixed critical bug in getTransactionSplitsBatch function.
- [x] **Accounts:**
    - [x] Create/Edit/Delete accounts (Verified & Fixed Types).
    - [x] Sync account balances with transaction history (auto-calc) ✅ VERIFIED: Implemented in createTransaction/updateTransaction/deleteTransaction functions.
- [x] **Budgeting:**
    - [x] Create monthly budgets by Category/Tag. ✅ COMPLETED: BudgetPage with CreateBudgetModal implemented
    - [x] Visual progress bars for budget vs actuals. ✅ COMPLETED: BudgetDetailsModal includes progress bars with color coding

## Priority 2: Reporting & Dashboard
- [x] **Dashboard Cards:**
    - [x] "Family Budget" overview card (Income vs Expense). ✅ COMPLETED: FamilyBudgetCard implemented 
    - [x] "Recent Transactions" list widget. ✅ COMPLETED: RecentTransactionsCard implemented
- [x] **Reports Page:**
    - [x] Monthly spending breakdown by Category (✅ Implemented with visual charts).
    - [x] Net Worth tracking (Assets - Liabilities). ✅ COMPLETED: Implemented in FinancialHub and Reports pages

## Priority 3: Polish & UX
- [ ] **Mobile Responsiveness:** Ensure finance tables work on mobile.
- [ ] **Dark Mode:** Verify colors for charts/tables.
- [ ] **Data Import:** CSV import for bank statements (already started?).

## Bugs / Tech Debt
- [x] Fix unused variable warnings in `CreateAccountModal.tsx`.
- [x] Add `notes` field to `Account` interface.
- [x] Check console for React warnings/errors (Fixed useEffect dependency warnings, removed 'any' types, cleaned up debug logs).
- [x] **Audit `firebase/config.ts` for security rules** ✅ COMPLETED: Removed dangerous fallback rule, implemented explicit granular rules for all collections, added data validation and comprehensive security documentation.
