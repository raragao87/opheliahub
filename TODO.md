# OpheliaHub - Finance Module TODO

## Priority 1: Core Finance Features (MVP)
- [x] **Transactions:**
    - [x] Add ability to *edit* transaction date/description/amount inline (Verified).
    - [x] Verify **Transaction Tagging** (Refactored `InlineTagInput` to support both modes).
    - [ ] Ensure **Split Transactions** work correctly (UI & backend).
- [ ] **Accounts:**
    - [x] Create/Edit/Delete accounts (Verified & Fixed Types).
    - [x] Sync account balances with transaction history (auto-calc) - ENHANCED with validation and admin tools.
- [ ] **Budgeting:**
    - [ ] Create monthly budgets by Category/Tag.
    - [ ] Visual progress bars for budget vs actuals.

## Priority 2: Reporting & Dashboard
- [ ] **Dashboard Cards:**
    - [ ] "Family Budget" overview card (Income vs Expense).
    - [ ] "Recent Transactions" list widget.
- [ ] **Reports Page:**
    - [ ] Monthly spending breakdown by Category.
    - [ ] Net Worth tracking (Assets - Liabilities).

## Priority 3: Polish & UX
- [ ] **Mobile Responsiveness:** Ensure finance tables work on mobile.
- [ ] **Dark Mode:** Verify colors for charts/tables.
- [ ] **Data Import:** CSV import for bank statements (already started?).

## Bugs / Tech Debt
- [x] Fix unused variable warnings in `CreateAccountModal.tsx`.
- [x] Add `notes` field to `Account` interface.
- [ ] Check console for React warnings/errors.
- [ ] Audit `firebase/config.ts` for security rules.

## New Features Added
### Enhanced Balance Sync System:
- [x] **Automatic sync** on all transaction operations (create/update/delete)
- [x] **Balance validation utility** (`utils/balanceSync.ts`) with comprehensive testing
- [x] **Admin dashboard component** (`BalanceSyncStatus.tsx`) for sync status monitoring
- [x] **Settings page** (`BalanceSyncSettings.tsx`) for manual sync operations
- [x] **Transfer detection** and validation for large transactions
- [x] **Scheduled sync** function for maintenance operations
- [x] **Real-time discrepancy detection** with detailed reporting
