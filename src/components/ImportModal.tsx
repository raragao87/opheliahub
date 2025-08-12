import React, { useState, useRef } from 'react';
import { 
  parseImportFile, 
  processImportData, 
  bulkCreateTransactions, 
  suggestTagsForImport,
  detectDateFormat,
  type ImportMapping, 
  type ImportPreview,
  type Transaction,
  type Account,
  type Tag,
  type DateFormatInfo
} from '../firebase/config';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  accounts: Account[];
  userId: string;
}

const ImportModal: React.FC<ImportModalProps> = ({ 
  isOpen, 
  onClose, 
  onImportComplete, 
  accounts, 
  userId 
}) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');

  const [importData, setImportData] = useState<any[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mappings, setMappings] = useState<ImportMapping>({
    dateColumn: '',
    amountColumn: '',
    descriptionColumn: '',
    accountColumn: '',
    categoryColumn: ''
  });
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [importProgress, setImportProgress] = useState(0);
  const [processedTransactions, setProcessedTransactions] = useState<Omit<Transaction, 'id'>[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<{ [key: string]: Tag[] }>({});
  const [detectedDateFormats, setDetectedDateFormats] = useState<DateFormatInfo[]>([]);
  const [selectedDateFormat, setSelectedDateFormat] = useState<string>('');
  const [dateFormatTestResult, setDateFormatTestResult] = useState<string>('');
  const [showDateFormatModal, setShowDateFormatModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetModal = () => {
    setStep('upload');
    setImportData([]);
    setPreview(null);
    setMappings({
      dateColumn: '',
      amountColumn: '',
      descriptionColumn: '',
      accountColumn: '',
      categoryColumn: ''
    });
    setSelectedAccount('');
    setIsLoading(false);
    setError('');
    setImportProgress(0);
    setProcessedTransactions([]);
    setSuggestedTags({});
    setDetectedDateFormats([]);
    setSelectedDateFormat('');
    setDateFormatTestResult('');
    setShowDateFormatModal(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setIsLoading(true);
    setError('');

    try {
      // Parse the file
      const data = await parseImportFile(selectedFile);
      setImportData(data);

      if (data.length === 0) {
        throw new Error('No data found in the file');
      }

      // Create preview
      const columns = Object.keys(data[0] || {});
      const sampleData = data.slice(0, 5);
      
      const previewData: ImportPreview = {
        fileName: selectedFile.name,
        totalRows: data.length,
        columns,
        sampleData,
        mappings: {
          dateColumn: columns.find(col => col.toLowerCase().includes('date')) || '',
          amountColumn: columns.find(col => col.toLowerCase().includes('amount')) || '',
          descriptionColumn: columns.find(col => col.toLowerCase().includes('description') || col.toLowerCase().includes('memo') || col.toLowerCase().includes('note')) || '',
          accountColumn: columns.find(col => col.toLowerCase().includes('account')) || '',
          categoryColumn: columns.find(col => col.toLowerCase().includes('category')) || ''
        }
      };

      // Detect date formats if we have a date column
      if (previewData.mappings.dateColumn) {
        const dateValues = data.slice(0, 100).map(row => row[previewData.mappings.dateColumn]).filter(Boolean);
        const formats = detectDateFormat(dateValues);
        setDetectedDateFormats(formats);
        
        // Auto-select the most confident format
        if (formats.length > 0) {
          setSelectedDateFormat(formats[0].format);
        }
      }

      setPreview(previewData);
      setMappings(previewData.mappings);
      setStep('mapping');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to parse file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMappingChange = (field: keyof ImportMapping, value: string) => {
    setMappings(prev => ({
      ...prev,
      [field]: value
    }));
    
    // If date column changed, re-detect formats and reset selection
    if (field === 'dateColumn') {
      if (value && importData.length > 0) {
        const dateValues = importData.slice(0, 100).map(row => row[value]).filter(Boolean);
        const formats = detectDateFormat(dateValues);
        setDetectedDateFormats(formats);
        
        // Auto-select the most confident format
        if (formats.length > 0) {
          setSelectedDateFormat(formats[0].format);
        } else {
          setSelectedDateFormat('');
        }
      } else {
        setDetectedDateFormats([]);
        setSelectedDateFormat('');
      }
      setDateFormatTestResult('');
    }
  };

  const testDateFormat = () => {
    if (!selectedDateFormat || !mappings.dateColumn || importData.length === 0) return;
    
    // Get a sample date value
    const sampleDate = importData[0]?.[mappings.dateColumn];
    if (!sampleDate) {
      setDateFormatTestResult('No sample date found to test');
      return;
    }
    
    // Import the parseDateString function to test
    import('../firebase/config').then(({ parseDateString }) => {
      const parsed = parseDateString(sampleDate);
      if (parsed) {
        setDateFormatTestResult(`✅ Parsed successfully: ${sampleDate} → ${parsed}`);
      } else {
        setDateFormatTestResult(`❌ Failed to parse: ${sampleDate}`);
      }
    });
  };

  const handlePreview = async () => {
    if (!selectedAccount) {
      setError('Please select an account for import');
      return;
    }

    if (!mappings.dateColumn || !mappings.amountColumn || !mappings.descriptionColumn) {
      setError('Please map all required columns (Date, Amount, Description)');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('🔄 Starting data processing...');
      console.log('📊 Import data:', importData.length, 'rows');
      console.log('🗺️ Mappings:', mappings);
      console.log('📅 Selected date format:', selectedDateFormat);
      
      // Process the data with selected date format
      console.log('🔍 About to call processImportData with:');
      console.log('  - importData length:', importData.length);
      console.log('  - mappings:', mappings);
      console.log('  - selectedAccount:', selectedAccount);
      console.log('  - userId:', userId);
      console.log('  - selectedDateFormat:', selectedDateFormat);
      
      // Test a sample date first
      if (importData.length > 0 && mappings.dateColumn) {
        const sampleDate = importData[0][mappings.dateColumn];
        console.log('🔍 Sample date value:', sampleDate, 'Type:', typeof sampleDate);
        
        // Test the date parsing directly
        import('../firebase/config').then(({ parseDateString, parseDateStringWithFormat }) => {
          if (selectedDateFormat && selectedDateFormat !== 'Auto-detect (recommended)') {
            const parsedWithFormat = parseDateStringWithFormat(sampleDate, selectedDateFormat);
            console.log('🔍 parseDateStringWithFormat result:', parsedWithFormat);
          }
          const parsedAuto = parseDateString(sampleDate);
          console.log('🔍 parseDateString (auto) result:', parsedAuto);
        });
      }
      
      const transactions = await processImportData(importData, mappings, selectedAccount, userId, selectedDateFormat);
      console.log('✅ Processed transactions:', transactions.length);
      
      if (transactions.length === 0) {
        setError('No valid transactions found. Please check your data and column mappings.');
        return;
      }
      
      setProcessedTransactions(transactions);

      // Get tag suggestions for each transaction
      const tagSuggestions: { [key: string]: Tag[] } = {};
      for (const transaction of transactions.slice(0, 10)) { // Limit to first 10 for performance
        const suggestions = await suggestTagsForImport(transaction.description, transaction.amount, userId);
        tagSuggestions[transaction.description] = suggestions;
      }
      setSuggestedTags(tagSuggestions);

      setStep('preview');
    } catch (error) {
      console.error('❌ Error in handlePreview:', error);
      setError(error instanceof Error ? error.message : 'Failed to process data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    setError('');
    setStep('importing');

    try {
      const totalTransactions = processedTransactions.length;
      let completed = 0;

      // Import in batches of 50
      const batchSize = 50;
      const transactionIds: string[] = [];

      for (let i = 0; i < totalTransactions; i += batchSize) {
        const batch = processedTransactions.slice(i, i + batchSize);
        const batchIds = await bulkCreateTransactions(batch, userId);
        transactionIds.push(...batchIds);
        
        completed += batch.length;
        setImportProgress((completed / totalTransactions) * 100);
      }

      console.log(`✅ Successfully imported ${transactionIds.length} transactions`);
      onImportComplete();
      handleClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to import transactions');
      setStep('preview');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            Import Transactions
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-4">
            {['upload', 'mapping', 'preview', 'importing'].map((stepName, index) => (
              <div key={stepName} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === stepName 
                    ? 'bg-blue-600 text-white' 
                    : step === 'importing' && stepName === 'importing'
                    ? 'bg-blue-600 text-white'
                    : index < ['upload', 'mapping', 'preview', 'importing'].indexOf(step)
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                {index < 3 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    index < ['upload', 'mapping', 'preview', 'importing'].indexOf(step)
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Step 1: File Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Upload CSV or Excel File
                </h3>
                <p className="text-gray-600 mb-4">
                  Upload a CSV or Excel file containing your transaction data. 
                  The file should have columns for date, amount, and description.
                </p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Choose File
                    </>
                  )}
                </button>
                <p className="mt-2 text-sm text-gray-500">
                  CSV, XLSX, or XLS files up to 10MB
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && preview && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Map Columns
                </h3>
                <p className="text-gray-600 mb-4">
                  Map the columns in your file to the required transaction fields.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date Column *
                  </label>
                  <select
                    value={mappings.dateColumn}
                    onChange={(e) => handleMappingChange('dateColumn', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a column</option>
                    {preview.columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                  
                  {/* Date Format Detection - Compact */}
                  {mappings.dateColumn && (
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {detectedDateFormats.length > 0 && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            📅 {detectedDateFormats[0]?.format} ({Math.round((detectedDateFormats[0]?.confidence || 0) * 100)}%)
                          </span>
                        )}
                        {selectedDateFormat && selectedDateFormat !== 'Auto-detect (recommended)' && (
                          <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                            🔧 {selectedDateFormat}
                          </span>
                        )}
                      </div>
                      
                      <button
                        onClick={() => setShowDateFormatModal(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Configure Date Format
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount Column *
                  </label>
                  <select
                    value={mappings.amountColumn}
                    onChange={(e) => handleMappingChange('amountColumn', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a column</option>
                    {preview.columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description Column *
                  </label>
                  <select
                    value={mappings.descriptionColumn}
                    onChange={(e) => handleMappingChange('descriptionColumn', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a column</option>
                    {preview.columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account for Import
                  </label>
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select an account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sample Data Preview */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-2">
                  Sample Data Preview
                </h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {preview.columns.map((column) => (
                          <th key={column} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.sampleData.map((row, index) => (
                        <tr key={index}>
                          {preview.columns.map((column) => (
                            <td key={column} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {row[column] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handlePreview}
                  disabled={isLoading || !selectedAccount || !mappings.dateColumn || !mappings.amountColumn || !mappings.descriptionColumn}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : 'Preview & Import'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-6">
              {processedTransactions.length > 0 ? (
                <>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Preview Transactions
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Review the {processedTransactions.length} transactions that will be imported.
                    </p>
                    
                    {/* Date Format Validation Summary */}
                    {detectedDateFormats.length > 0 && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <h4 className="text-sm font-medium text-green-800 mb-2">
                          ✅ Date Format Validation
                        </h4>
                        <div className="space-y-1 text-sm text-green-700">
                          {detectedDateFormats.map((format, index) => (
                            <div key={index}>
                              • {format.format}: {Math.round(format.confidence * 100)}% of dates detected
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-green-600 mt-2">
                          All detected date formats will be automatically parsed during import.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-3xl mb-3">⚠️</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Transactions to Preview
                  </h3>
                  <p className="text-gray-600 mb-4">
                    No valid transactions were found during processing. This could be due to:
                  </p>
                  <ul className="text-sm text-gray-500 text-left max-w-md mx-auto space-y-1">
                    <li>• Invalid date formats in your data</li>
                    <li>• Missing or incorrect column mappings</li>
                    <li>• Empty or invalid data rows</li>
                    <li>• Date parsing errors</li>
                  </ul>
                  <div className="mt-4">
                    <button
                      onClick={() => setStep('mapping')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                    >
                      Back to Column Mapping
                    </button>
                  </div>
                </div>
              )}

              {processedTransactions.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Description
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Suggested Tags
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {processedTransactions.slice(0, 10).map((transaction, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {transaction.date ? formatDate(transaction.date) : 'Atemporal'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <span 
                                title={transaction.description.length > 40 ? transaction.description : undefined}
                                className="cursor-help"
                              >
                                {transaction.description.length > 40 
                                  ? transaction.description.substring(0, 40) + '...' 
                                  : transaction.description
                                }
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className={transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {formatAmount(transaction.amount)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="flex flex-wrap gap-1">
                                {suggestedTags[transaction.description]?.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                                    style={{ backgroundColor: tag.color + '20', color: tag.color }}
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {processedTransactions.length > 10 && (
                    <p className="text-sm text-gray-500 text-center">
                      Showing first 10 transactions. {processedTransactions.length - 10} more will be imported.
                    </p>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setStep('mapping')}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleImport}
                      className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
                    >
                      Import {processedTransactions.length} Transactions
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Importing Transactions
                </h3>
                <p className="text-gray-600 mb-4">
                  Please wait while we import your transactions...
                </p>
                
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  ></div>
                </div>
                
                <p className="text-sm text-gray-500">
                  {Math.round(importProgress)}% complete
                </p>
              </div>
            </div>
          )}

          {/* Date Format Configuration Modal */}
          {showDateFormatModal && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="mt-3">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    📅 Configure Date Format
                  </h3>
                  
                  {/* Detected Formats */}
                  {detectedDateFormats.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-800 mb-2">
                        Detected Formats
                      </h4>
                      <div className="space-y-2">
                        {detectedDateFormats.map((format, index) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <span className="font-medium text-blue-700">{format.format}</span>
                            <span className="text-blue-600">
                              {Math.round(format.confidence * 100)}% confidence
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Manual Format Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date Format
                    </label>
                    <select
                      value={selectedDateFormat}
                      onChange={(e) => setSelectedDateFormat(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Auto-detect (recommended)</option>
                      <option value="YYYYMMDD">YYYYMMDD (e.g., 20241201)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (e.g., 2024-12-01)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (e.g., 12/01/2024)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (e.g., 01/12/2024)</option>
                      <option value="MM-DD-YYYY">MM-DD-YYYY (e.g., 12-01-2024)</option>
                      <option value="DD-MM-YYYY">DD-MM-YYYY (e.g., 01-12-2024)</option>
                      <option value="YYYY/MM/DD">YYYY/MM/DD (e.g., 2024/12/01)</option>
                      <option value="MM.DD.YYYY">MM.DD.YYYY (e.g., 12.01.2024)</option>
                      <option value="DD.MM.YYYY">DD.MM.YYYY (e.g., 01.12.2024)</option>
                      <option value="Excel Date Number">Excel Date Number</option>
                      <option value="Timestamp">Timestamp (milliseconds)</option>
                    </select>
                  </div>
                  
                  {/* Test Format */}
                  {selectedDateFormat && (
                    <div className="mb-4">
                      <button
                        onClick={testDateFormat}
                        className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      >
                        Test Format
                      </button>
                      {dateFormatTestResult && (
                        <div className="mt-2 p-2 text-sm rounded" 
                             style={{ 
                               backgroundColor: dateFormatTestResult.includes('✅') ? '#f0f9ff' : '#fef2f2',
                               color: dateFormatTestResult.includes('✅') ? '#1e40af' : '#dc2626'
                             }}>
                          {dateFormatTestResult}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Current Status */}
                  <div className="mb-4 p-2 bg-gray-50 rounded text-sm text-gray-600">
                    {selectedDateFormat && selectedDateFormat !== 'Auto-detect (recommended)' 
                      ? `Using manual format: ${selectedDateFormat}`
                      : 'Using auto-detection (recommended for most files)'
                    }
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setShowDateFormatModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
