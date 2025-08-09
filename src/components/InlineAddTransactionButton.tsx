import React from 'react';

interface InlineAddTransactionButtonProps {
  onClick: () => void;
}

const InlineAddTransactionButton: React.FC<InlineAddTransactionButtonProps> = ({ onClick }) => {
  return (
    <tr 
      className="hover:bg-gray-50 cursor-pointer transition-colors group" 
      onClick={onClick}
    >
      <td colSpan={5} className="px-6 py-4 text-center">
        <div className="border-2 border-dashed border-gray-300 rounded-lg py-6 group-hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-center space-x-2 text-gray-500 group-hover:text-blue-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-medium">Add new transaction</span>
          </div>
          <p className="text-xs text-gray-400 mt-1 group-hover:text-blue-400 transition-colors">
            Click here or press the + button to add a transaction inline
          </p>
        </div>
      </td>
    </tr>
  );
};

export default InlineAddTransactionButton;
