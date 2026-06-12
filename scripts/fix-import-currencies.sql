-- Fix imported transactions that defaulted to EUR on non-EUR accounts.
-- Run after deploying the currency fix.
UPDATE transactions t
SET currency = a.currency
FROM financial_accounts a
WHERE t."accountId" = a.id
  AND a.currency != 'EUR'
  AND t.currency = 'EUR'
  AND t."deletedAt" IS NULL;
