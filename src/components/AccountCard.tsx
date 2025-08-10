import React, { useState } from 'react';
import { type Account } from '../firebase/config';
import AccountDetailsModal from './AccountDetailsModal';
import EditAccountModal from './EditAccountModal';
import SharingModal from './SharingModal';
import UpdateAssetBalanceModal from './UpdateAssetBalanceModal';

interface AccountCardProps {
  account: Account;
  onUpdate: () => void;
}

const AccountCard: React.FC<AccountCardProps> = ({ account, onUpdate }) => {
  const [showAccountDetailsModal, setShowAccountDetailsModal] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [showUpdateAssetBalanceModal, setShowUpdateAssetBalanceModal] = useState(false);
  const getAccountTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'checking':
        return '🏦';
      case 'savings':
        return '💰';
      case 'investment':
        return '📈';
      case 'credit-card':
        return '💳';
      case 'mortgage':
        return '🏠';
      case 'auto-loan':
        return '🚗';
      default:
        return '💼';
    }
  };

  const getAccountTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'checking':
      case 'savings':
      case 'investment':
        return 'bg-blue-100 text-blue-800';
      case 'credit-card':
      case 'mortgage':
      case 'auto-loan':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'BRL': return 'R$';
      case 'AUD': return 'A$';
      case 'GBP': return '£';
      case 'CAD': return 'C$';
      case 'JPY': return '¥';
      case 'CHF': return 'Fr';
      default: return '$';
    }
  };

  const formatBalance = (balance: number, defaultSign: 'positive' | 'negative', currency: string = 'USD') => {
    const sign = defaultSign === 'positive' ? '+' : '-';
    const absBalance = Math.abs(balance);
    const currencySymbol = getCurrencySymbol(currency);
    return `${sign}${currencySymbol}${absBalance.toLocaleString()}`;
  };

  const getBalanceColor = (balance: number, defaultSign: 'positive' | 'negative') => {
    console.log(`🔍 Balance color check: balance=${balance}, defaultSign=${defaultSign}`);
    
    if (defaultSign === 'positive') {
      // For assets: positive balance is good (green), negative is bad (red)
      const color = balance >= 0 ? 'text-green-600' : 'text-red-600';
      console.log(`📈 Asset account: balance ${balance} → ${color}`);
      return color;
    } else {
      // For liabilities: negative balance is good (green), positive is bad (red)
      const color = balance <= 0 ? 'text-green-600' : 'text-red-600';
      console.log(`📉 Liability account: balance ${balance} → ${color}`);
      return color;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="text-2xl mr-3">{getAccountTypeIcon(account.type)}</div>
            <div>
              <div className="flex items-center">
                <h3 className="font-semibold text-gray-800">{account.name}</h3>
                {account.sharedWith.length > 0 && (
                  <span className="ml-2 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full" title={`Shared with ${account.sharedWith.length} person(s)`}>
                    Shared
                  </span>
                )}
              </div>
              <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getAccountTypeColor(account.type)}`}>
                {account.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowSharingModal(true)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Share account"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
            </button>
            <button
              onClick={() => setShowEditAccountModal(true)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Edit account"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Balance */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-1">Current Balance</p>
          <p className={`text-2xl font-bold ${getBalanceColor(account.balance, account.defaultSign)}`}>
            {formatBalance(account.balance, account.defaultSign, account.currency)}
          </p>
        </div>

        {/* Account Details */}
                  <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Initial Balance:</span>
              <span>{formatBalance(account.initialBalance, account.defaultSign, account.currency)}</span>
            </div>
          <div className="flex justify-between">
            <span>Account Type:</span>
            <span className="capitalize">{account.type.replace('-', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span>Account Category:</span>
            <span className={account.isReal ? 'text-green-600' : 'text-orange-600'}>
              {account.isReal ? 'Bank Account' : 'Pseudo Account'}
            </span>
          </div>
          {account.sharedWith.length > 0 && (
            <div className="flex justify-between">
              <span>Shared with:</span>
              <span className="text-blue-600">{account.sharedWith.length} person(s)</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex space-x-3">
            {account.accountType === 'asset' && (
              <button
                onClick={() => setShowUpdateAssetBalanceModal(true)}
                className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                Update Value
              </button>
            )}
            <button
              onClick={() => setShowAccountDetailsModal(true)}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Account
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAccountDetailsModal && (
        <AccountDetailsModal
          isOpen={showAccountDetailsModal}
          onClose={() => setShowAccountDetailsModal(false)}
          account={account}
          onUpdate={onUpdate}
        />
      )}

      {/* Edit Account Modal */}
      {showEditAccountModal && (
        <EditAccountModal
          isOpen={showEditAccountModal}
          onClose={() => setShowEditAccountModal(false)}
          account={account}
          onAccountUpdated={() => {
            setShowEditAccountModal(false);
            onUpdate(); // Refresh accounts after editing
          }}
        />
      )}

      {/* Sharing Modal */}
      {showSharingModal && (
        <SharingModal
          isOpen={showSharingModal}
          onClose={() => {
            setShowSharingModal(false);
            onUpdate(); // Refresh accounts after sharing modal closes
          }}
          itemId={account.id}
          itemName={account.name}
          itemType="account"
        />
      )}

      {/* Update Asset Balance Modal */}
      {showUpdateAssetBalanceModal && (
        <UpdateAssetBalanceModal
          isOpen={showUpdateAssetBalanceModal}
          onClose={() => setShowUpdateAssetBalanceModal(false)}
          account={account}
          onSuccess={() => {
            setShowUpdateAssetBalanceModal(false);
            onUpdate(); // Refresh accounts after updating asset balance
          }}
        />
      )}
    </div>
  );
};

export default AccountCard; 