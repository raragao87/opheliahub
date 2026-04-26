# OpheliaHub — CLAUDE.md

## Project Overview

OpheliaHub is a personal & family finance management app for couples. It unifies household and personal finance tracking with strict privacy boundaries, bank file imports, zero-based budgeting, tagging, and net worth tracking.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth.js with Google OAuth
- **API**: tRPC for type-safe API layer
- **Testing**: Vitest
- **Package manager**: pnpm

## Core Architecture Rules

- All monetary values are **integers (cents/minor units)**. Never use floats for money.
- Multi-currency: every transaction and account stores its currency code (EUR default).
- Privacy is enforced at the **database query level**, not just UI. Every Prisma query involving transactions, accounts, or balances must be scoped by user permissions.
- Transaction visibility is derived from **account ownership** — all transactions on a SHARED account are shared, all on a PERSONAL account are personal. There is no per-transaction visibility field.
- **Transaction types**: INCOME, EXPENSE, FUND, TRANSFER, INVESTMENT — each type has distinct budget semantics.
- Zero-based budgeting: availableToSpend − allocated = 0. Track allocated vs spent per category.

## Code Conventions

- Use `src/` directory structure
- Server components by default, `"use client"` only when needed
- Prisma schema in `prisma/schema.prisma`
- tRPC routers in `src/trpc/routers/`
- Shared types in `src/types/`
- Financial calculations in `src/lib/finance/` — always with unit tests
- Import parsers in `src/lib/parsers/`
- Reusable UI components in `src/components/`
- Page-specific components co-located with their page in `src/app/`

## Key Entities

User, Household, HouseholdMember, FinancialAccount, Transaction, TransactionTag,
Category, Tag, TagGroup, Tracker, TrackerAllocation, InvestmentTrackerAllocation,
FundTrackerAllocation, TagTrackerAllocation, Fund, ImportBatch, ImportProfile,
RecurringRule, AuditLog

## Account Groups

Accounts are organized into three sidebar groups:
- **SPENDING** (CHECKING, SAVINGS, CREDIT_CARD, CASH) — budgetable transactions
- **INVESTMENT** (INVESTMENT, CRYPTO) — monthly allocations per account
- **ASSETS_DEBTS** (PROPERTY, VEHICLE, OTHER_ASSET, LOAN, MORTGAGE, OTHER_DEBT) — net worth only

Use `SPENDING_ACCOUNT_TYPES` constant for budget/tracker queries.

## Privacy Rules (CRITICAL — read before writing ANY data-access code)

1. Partner A **NEVER** sees Partner B's personal transactions, accounts, or balances (and vice versa).
2. Both partners see all shared/household transactions and accounts.
3. Transaction visibility is determined by account ownership (`FinancialAccount.ownership`). There is no per-transaction visibility field.
4. Tags respect privacy: filtering by a tag only returns transactions the current user has permission to see.
5. Net worth views:
   - **"My Net Worth"** = my personal accounts + shared accounts
   - **"Family Net Worth"** = all shared accounts (personal included only if both partners opt in)
6. Enforced at the DB layer: `chk_ownership_household_consistency` on `financial_accounts` rejects any row where SHARED accounts have null `householdId` or PERSONAL accounts have a non-null `householdId`. Code that flips `ownership` MUST also update `householdId` in the same statement.

## Standard Privacy Query Pattern

Transaction visibility is derived from account ownership:

```typescript
import { visibleTransactionsWhere, transactionOwnershipFilter } from "@/lib/privacy";

// See all visible transactions (own + shared household):
where: visibleTransactionsWhere(userId, householdId)

// Scope to SHARED or PERSONAL budget context:
where: transactionOwnershipFilter(userId, householdId, "SHARED")
```

For accounts:
```typescript
import { visibleAccountsWhere } from "@/lib/privacy";
where: visibleAccountsWhere(userId, householdId)
```

## Tracker Model

- Income budget is derived from the sum of INCOME category allocations (no `totalIncome` field)
- Carry-in is auto-computed from previous month's `toNextMonth` (no manual override)
- Investment budgets are per-account via `InvestmentTrackerAllocation`
- `toNextMonth = carryIn + actualIncome + actualInvestment - actualExpenses - fundAllocations`
- `readyToAssign = carryIn + incomeBudgeted + investmentBudgeted - expenseBudgeted - fundContributions`

## Money Utilities

All monetary operations should use helpers from `src/lib/finance/money.ts`:
- `toCents(amount: number): number` — convert a decimal amount to integer cents
- `fromCents(cents: number): number` — convert cents to display amount
- `formatMoney(cents: number, currency: string): string` — format for display
- `splitEvenly(cents: number, parts: number): number[]` — split handling remainders
- Never do raw arithmetic on money without these helpers.

## Database Setup

Use `pnpm db:setup` to bring a database to the current schema. This runs:

1. `prisma db push` — applies schema changes
2. `pnpm db:apply-constraints` — applies non-Prisma DB constraints (CHECK, etc.)
3. `prisma generate` — regenerates the Prisma Client

**Never run `prisma db push` alone** for a fresh database — it will skip the
CHECK constraints defined in `scripts/apply-db-constraints.ts` and the privacy
invariants will not be enforced. Always use `pnpm db:setup`.

To audit a database for privacy invariant violations:
`pnpm check:privacy-integrity`

## Testing Requirements

- All financial calculations must have unit tests
- Privacy enforcement must have integration tests (test both allowed AND denied access)
- Import parsers must have tests with sample bank files in `src/lib/parsers/__fixtures__/`
- Budget validation must test the zero-balance constraint

## Git Conventions

- Branch naming: `feature/description`, `fix/description`, `chore/description`
- Commit messages: conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `refactor:`)
- Always run `pnpm typecheck && pnpm test` before committing
