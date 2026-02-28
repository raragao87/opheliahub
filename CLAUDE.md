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
- Visibility model: transactions are either `shared` or `personal`. Personal transactions are NEVER returned to non-owners, even via API.
- Zero-based budgeting: income − allocated = 0. Track allocated vs spent per category.

## Code Conventions

- Use `src/` directory structure
- Server components by default, `"use client"` only when needed
- Prisma schema in `prisma/schema.prisma`
- tRPC routers in `src/server/routers/`
- Shared types in `src/types/`
- Financial calculations in `src/lib/finance/` — always with unit tests
- Import parsers in `src/lib/parsers/`
- Reusable UI components in `src/components/`
- Page-specific components co-located with their page in `src/app/`

## Key Entities

User, Household, HouseholdMember, Account, Transaction, TransactionTag,
Category, Tag, TagGroup, Budget, Asset, Debt, Goal, ImportBatch, ImportProfile,
RecurringRule, AuditLog

## Privacy Rules (CRITICAL — read before writing ANY data-access code)

1. Partner A **NEVER** sees Partner B's personal transactions, accounts, or balances (and vice versa).
2. Both partners see all shared/household transactions and accounts.
3. A single account (e.g., a personal credit card) can contain a **mix** of shared and personal transactions. The account owner controls visibility per transaction.
4. Tags respect privacy: filtering by a tag only returns transactions the current user has permission to see.
5. Net worth views:
   - **"My Net Worth"** = my personal accounts + shared accounts + my assets − my debt
   - **"Family Net Worth"** = all shared accounts + combined assets − combined debt (personal balances included only if both partners explicitly opt in)
6. A transaction's visibility is set at creation or during import review, and can be changed later **only by its creator**.
7. Visibility changes must be logged in AuditLog.

## Standard Privacy Query Pattern

Every query that returns transactions must include a visibility filter:

```typescript
// Always scope transaction queries like this:
where: {
  OR: [
    { visibility: 'shared', account: { household_id: userHouseholdId } },
    { visibility: 'personal', created_by: currentUserId },
  ],
}
```

For accounts:
```typescript
where: {
  OR: [
    { owner_type: 'household', owner_id: userHouseholdId },
    { owner_type: 'user', owner_id: currentUserId },
  ],
}
```

## Money Utilities

All monetary operations should use helpers from `src/lib/finance/money.ts`:
- `toCents(amount: number): number` — convert a decimal amount to integer cents
- `fromCents(cents: number): number` — convert cents to display amount
- `formatMoney(cents: number, currency: string): string` — format for display
- `splitEvenly(cents: number, parts: number): number[]` — split handling remainders
- Never do raw arithmetic on money without these helpers.

## Testing Requirements

- All financial calculations must have unit tests
- Privacy enforcement must have integration tests (test both allowed AND denied access)
- Import parsers must have tests with sample bank files in `src/lib/parsers/__fixtures__/`
- Budget validation must test the zero-balance constraint

## Git Conventions

- Branch naming: `feature/description`, `fix/description`, `chore/description`
- Commit messages: conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `refactor:`)
- Always run `pnpm typecheck && pnpm test` before committing
