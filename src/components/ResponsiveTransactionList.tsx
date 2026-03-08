import React from 'react';
import { type Transaction, type TransactionSplit } from '../firebase/config';
import InlineTagInput from './InlineTagInput';

interface ResponsiveTransactionListProps {
  transactions: (Transaction & { id: string; splits?: TransactionSplit[] })[];
  selectedTransactions: Set<string>;
  editingTransaction: string | null;
  editFormData: any;
  isTransactionDragging: (transactionId: string) => boolean;
  onSelectTransaction: (transactionId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onEditTransaction: (transaction: Transaction & { id: string }) => void;
  onUpdateTransaction: (e: React.FormEvent, transactionId: string) => void;
  onCancelEdit: () => void;
  onSplitTransaction: (transaction: Transaction & { id: string }) => void;
  onLinkTransaction: (transaction: Transaction & { id: string }) => void;
  onDeleteTransaction: (transactionId: string) => void;
  onSortChange: (field: string) => void;
  formatCurrency: (amount: number) => string;
  getTagNames: (tagIds: string[]) => string;
  updateEditFormData: (field: string, value: any) => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  renderSortIcon: (field: string) => React.ReactNode;
}

const ResponsiveTransactionList: React.FC<ResponsiveTransactionListProps> = ({
  transactions,
  selectedTransactions,
  editingTransaction,
  editFormData,
  isTransactionDragging,
  onSelectTransaction,
  onSelectAll,
  onEditTransaction,
  onUpdateTransaction,
  onCancelEdit,
  onSplitTransaction,
  onLinkTransaction,
  onDeleteTransaction,
  onSortChange,
  formatCurrency,
  getTagNames,
  updateEditFormData,
  sortField,
  sortDirection,
  renderSortIcon
}) => {
  return (
    <>
      {/* Desktop Table View (hidden on mobile) */}
      <div className="hidden md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={transactions.length > 0 && transactions.every(t => selectedTransactions.has(t.id))}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th 
                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSortChange('date')}
              >
                <div className="flex items-center justify-between">
                  Date
                  {renderSortIcon('date')}
                </div>
              </th>
              <th 
                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSortChange('description')}
              >
                <div className="flex items-center justify-between">
                  Description
                  {renderSortIcon('description')}
                </div>
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tags
              </th>
              <th 
                className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSortChange('amount')}
              >
                <div className="flex items-center justify-end">
                  Amount
                  {renderSortIcon('amount')}
                </div>
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <tr 
                key={transaction.id}
                className={`transition-all duration-200 hover:bg-gray-50 ${
                  selectedTransactions.has(transaction.id) ? 'bg-blue-50' : ''
                } ${
                  isTransactionDragging(transaction.id) ? 'opacity-50' : ''
                }`}
              >
                {editingTransaction === transaction.id ? (
                  // Editing row
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.has(transaction.id)}
                        onChange={(e) => onSelectTransaction(transaction.id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={editFormData.date}
                        onChange={(e) => updateEditFormData('date', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editFormData.description}
                        onChange={(e) => updateEditFormData('description', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <InlineTagInput
                        selectedTagIds={editFormData.tagIds || []}
                        onTagChange={(tagIds) => updateEditFormData('tagIds', tagIds)}
                        mode="inline"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={editFormData.amount}
                        onChange={(e) => updateEditFormData('amount', parseFloat(e.target.value))}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => onUpdateTransaction(e, transaction.id)}
                          className="text-green-600 hover:text-green-800"
                          title="Save"
                        >
                          ✓
                        </button>
                        <button
                          onClick={onCancelEdit}
                          className="text-gray-600 hover:text-gray-800"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  // Display row
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.has(transaction.id)}
                        onChange={(e) => onSelectTransaction(transaction.id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center">
                        <span className="text-sm text-gray-900">{transaction.description}</span>
                        {transaction.splits && transaction.splits.length > 0 && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                            Split
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {getTagNames(transaction.tagIds || [])}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-sm font-medium ${
                        transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(transaction.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => onEditTransaction(transaction)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => onSplitTransaction(transaction)}
                          className="text-purple-600 hover:text-purple-800"
                          title="Split"
                        >
                          ✂️
                        </button>
                        <button
                          onClick={() => onLinkTransaction(transaction)}
                          className="text-indigo-600 hover:text-indigo-800"
                          title="Link"
                        >
                          🔗
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(transaction.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (visible only on mobile) */}
      <div className="block md:hidden space-y-4">
        {/* Mobile Header with Bulk Actions */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={transactions.length > 0 && transactions.every(t => selectedTransactions.has(t.id))}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              {selectedTransactions.size} of {transactions.length} selected
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onSortChange('date')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-1 rounded hover:bg-gray-200"
            >
              Date {renderSortIcon('date')}
            </button>
            <button
              onClick={() => onSortChange('amount')}
              className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-1 rounded hover:bg-gray-200"
            >
              Amount {renderSortIcon('amount')}
            </button>
          </div>
        </div>

        {/* Mobile Transaction Cards */}
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className={`bg-white rounded-lg border shadow-sm ${
              selectedTransactions.has(transaction.id) ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
            } ${isTransactionDragging(transaction.id) ? 'opacity-50' : ''}`}
          >
            {editingTransaction === transaction.id ? (
              // Editing card
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedTransactions.has(transaction.id)}
                      onChange={(e) => onSelectTransaction(transaction.id, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-600">Editing</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => onUpdateTransaction(e, transaction.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm"
                      title="Save"
                    >
                      Save
                    </button>
                    <button
                      onClick={onCancelEdit}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
                      title="Cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                    <input
                      type="date"
                      value={editFormData.date}
                      onChange={(e) => updateEditFormData('date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <input
                      type="text"
                      value={editFormData.description}
                      onChange={(e) => updateEditFormData('description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFormData.amount}
                      onChange={(e) => updateEditFormData('amount', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tags</label>
                    <InlineTagInput
                      selectedTagIds={editFormData.tagIds || []}
                      onTagChange={(tagIds) => updateEditFormData('tagIds', tagIds)}
                      mode="inline"
                    />
                  </div>
                </div>
              </div>
            ) : (
              // Display card
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedTransactions.has(transaction.id)}
                      onChange={(e) => onSelectTransaction(transaction.id, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1"
                    />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{transaction.description}</h4>
                      <p className="text-xs text-gray-500">
                        {new Date(transaction.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${
                      transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(transaction.amount)}
                    </span>
                    {transaction.splits && transaction.splits.length > 0 && (
                      <div className="mt-1">
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                          Split
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {(transaction.tagIds?.length || 0) > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500">{getTagNames(transaction.tagIds || [])}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => onEditTransaction(transaction)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onSplitTransaction(transaction)}
                      className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                    >
                      Split
                    </button>
                    <button
                      onClick={() => onLinkTransaction(transaction)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    >
                      Link
                    </button>
                  </div>
                  <button
                    onClick={() => onDeleteTransaction(transaction.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

export default ResponsiveTransactionList;