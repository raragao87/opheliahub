import React from 'react';
import { 
  getAccountsByUser, 
  getTransactionsByAccount, 
  recalculateAccountBalance,
  forceUpdateAccountBalance,
  type Account,
  type Transaction
} from '../firebase/config';

/**
 * Comprehensive balance sync utility for all accounts
 */
export class AccountBalanceSync {
  
  /**
   * Verify that all account balances match their transaction history
   */
  static async verifyAllAccountBalances(userId: string): Promise<{
    isValid: boolean;
    discrepancies: Array<{
      accountId: string;
      accountName: string;
      storedBalance: number;
      calculatedBalance: number;
      difference: number;
    }>;
  }> {
    try {
      console.log('🔍 Verifying balance sync for all accounts...');
      
      const accounts = await getAccountsByUser(userId);
      const discrepancies = [];
      
      for (const account of accounts) {
        const calculatedBalance = await recalculateAccountBalance(userId, account.id);
        const storedBalance = account.balance;
        const difference = Math.abs(calculatedBalance - storedBalance);
        
        // Consider balances equal if difference is less than 0.01 (cent precision)
        if (difference > 0.01) {
          discrepancies.push({
            accountId: account.id,
            accountName: account.name,
            storedBalance,
            calculatedBalance,
            difference
          });
        }
      }
      
      const isValid = discrepancies.length === 0;
      
      console.log(`✅ Balance verification complete. Valid: ${isValid}, Discrepancies: ${discrepancies.length}`);
      
      return { isValid, discrepancies };
      
    } catch (error) {
      console.error('❌ Error verifying account balances:', error);
      throw error;
    }
  }
  
  /**
   * Fix all account balance discrepancies
   */
  static async fixAllAccountBalances(userId: string): Promise<{
    fixed: number;
    errors: Array<{ accountId: string; error: string }>;
  }> {
    try {
      console.log('🔧 Fixing all account balance discrepancies...');
      
      const verification = await this.verifyAllAccountBalances(userId);
      
      if (verification.isValid) {
        console.log('✅ All balances are already in sync.');
        return { fixed: 0, errors: [] };
      }
      
      let fixed = 0;
      const errors = [];
      
      for (const discrepancy of verification.discrepancies) {
        try {
          await forceUpdateAccountBalance(userId, discrepancy.accountId);
          console.log(`✅ Fixed balance for ${discrepancy.accountName}: ${discrepancy.storedBalance} → ${discrepancy.calculatedBalance}`);
          fixed++;
        } catch (error) {
          console.error(`❌ Error fixing balance for ${discrepancy.accountName}:`, error);
          errors.push({
            accountId: discrepancy.accountId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      console.log(`🔧 Balance fix complete. Fixed: ${fixed}, Errors: ${errors.length}`);
      
      return { fixed, errors };
      
    } catch (error) {
      console.error('❌ Error fixing account balances:', error);
      throw error;
    }
  }
  
  /**
   * Get balance history for an account (useful for debugging)
   */
  static async getBalanceHistory(userId: string, accountId: string): Promise<{
    currentBalance: number;
    transactionCount: number;
    transactions: Array<{
      id: string;
      amount: number;
      description: string;
      date: string | undefined;
      runningBalance: number;
    }>;
  }> {
    try {
      const transactions = await getTransactionsByAccount(userId, accountId);
      
      // Sort transactions by date (oldest first), with undated transactions first
      transactions.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return -1;
        if (!b.date) return 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      
      let runningBalance = 0;
      const transactionHistory = transactions.map(transaction => {
        runningBalance += transaction.amount;
        return {
          id: transaction.id,
          amount: transaction.amount,
          description: transaction.description,
          date: transaction.date,
          runningBalance
        };
      });
      
      return {
        currentBalance: runningBalance,
        transactionCount: transactions.length,
        transactions: transactionHistory
      };
      
    } catch (error) {
      console.error('❌ Error getting balance history:', error);
      throw error;
    }
  }
  
  /**
   * Schedule periodic balance verification (call this from a maintenance function)
   */
  static async scheduleBalanceCheck(userId: string, fixDiscrepancies: boolean = false): Promise<void> {
    try {
      console.log('⏰ Running scheduled balance check...');
      
      const verification = await this.verifyAllAccountBalances(userId);
      
      if (!verification.isValid) {
        console.warn(`⚠️ Found ${verification.discrepancies.length} balance discrepancies:`, verification.discrepancies);
        
        if (fixDiscrepancies) {
          await this.fixAllAccountBalances(userId);
        } else {
          console.warn('💡 Set fixDiscrepancies=true to automatically fix these issues.');
        }
      } else {
        console.log('✅ All account balances are in sync.');
      }
      
    } catch (error) {
      console.error('❌ Error in scheduled balance check:', error);
    }
  }
}

/**
 * Hook for components to verify balance sync status
 */
export const useBalanceSync = (userId: string | null) => {
  const [syncStatus, setSyncStatus] = React.useState<{
    loading: boolean;
    isValid: boolean;
    discrepancies: number;
    lastChecked: Date | null;
  }>({
    loading: false,
    isValid: true,
    discrepancies: 0,
    lastChecked: null
  });
  
  const checkBalanceSync = React.useCallback(async () => {
    if (!userId) return;
    
    setSyncStatus(prev => ({ ...prev, loading: true }));
    
    try {
      const result = await AccountBalanceSync.verifyAllAccountBalances(userId);
      setSyncStatus({
        loading: false,
        isValid: result.isValid,
        discrepancies: result.discrepancies.length,
        lastChecked: new Date()
      });
    } catch (error) {
      console.error('Error checking balance sync:', error);
      setSyncStatus(prev => ({ ...prev, loading: false }));
    }
  }, [userId]);
  
  const fixBalanceSync = React.useCallback(async () => {
    if (!userId) return;
    
    setSyncStatus(prev => ({ ...prev, loading: true }));
    
    try {
      await AccountBalanceSync.fixAllAccountBalances(userId);
      await checkBalanceSync();
    } catch (error) {
      console.error('Error fixing balance sync:', error);
      setSyncStatus(prev => ({ ...prev, loading: false }));
    }
  }, [userId, checkBalanceSync]);
  
  return {
    syncStatus,
    checkBalanceSync,
    fixBalanceSync
  };
};