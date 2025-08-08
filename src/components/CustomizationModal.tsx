import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getDashboardPreferences, 
  saveDashboardPreferences, 
  type DashboardPreferences 
} from '../firebase/config';

interface CustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPreferencesUpdated: () => void;
}

interface CheckboxItem {
  id: keyof DashboardPreferences['visibleCards'];
  label: string;
  description: string;
  category: string;
}

const CustomizationModal: React.FC<CustomizationModalProps> = ({
  isOpen,
  onClose,
  onPreferencesUpdated
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<DashboardPreferences | null>(null);
  const [personalDetails, setPersonalDetails] = useState({
    displayName: '',
    email: ''
  });
  const [editingPersonalDetails, setEditingPersonalDetails] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        setPersonalDetails({
          displayName: user.displayName || '',
          email: user.email || ''
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen && user) {
      loadPreferences();
    }
  }, [isOpen, user]);

  const loadPreferences = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const userPreferences = await getDashboardPreferences(user.uid);
      setPreferences(userPreferences);
    } catch (error) {
      console.error('Error loading preferences:', error);
      setError('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !preferences) return;
    
    try {
      setLoading(true);
      setError(null);
      
      await saveDashboardPreferences(user.uid, preferences);
      onPreferencesUpdated();
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      setError('Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleCardToggle = (cardId: keyof DashboardPreferences['visibleCards']) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      visibleCards: {
        ...preferences.visibleCards,
        [cardId]: !preferences.visibleCards[cardId]
      }
    });
  };

  const handleResetToDefaults = () => {
    if (!user) return;
    
    const defaultPreferences: DashboardPreferences = {
      userId: user.uid,
      visibleCards: {
        // Financial Hub - Family
        familyAccounts: true,
        familyBudget: true,
        familyInvestments: false,
        familyCommitments: false,
        // Financial Hub - Personal
        personalAccounts: true,
        personalBudget: true,
        personalInvestments: false,
        personalCommitments: false,
        // Household Hub
        taskManager: false,
        shoppingLists: false,
        homeMaintenance: false,
        // Family Hub
        familyCalendar: false,
        growthTracker: true,
        cloudStorage: false,
        medicalRecords: false,
        schoolActivities: false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    setPreferences(defaultPreferences);
  };

  const checkboxItems: CheckboxItem[] = [
    // Financial Hub - Family
    {
      id: 'familyAccounts',
      label: 'Family Accounts',
      description: 'Shared financial accounts and balances',
      category: 'family'
    },
    {
      id: 'familyBudget',
      label: 'Family Budget',
      description: 'Monthly family budget tracking',
      category: 'family'
    },
    {
      id: 'familyInvestments',
      label: 'Family Investments',
      description: 'Investment portfolios and performance',
      category: 'family'
    },
    {
      id: 'familyCommitments',
      label: 'Family Commitments',
      description: 'Loans, mortgages, and financial obligations',
      category: 'family'
    },
    // Financial Hub - Personal
    {
      id: 'personalAccounts',
      label: 'Personal Accounts',
      description: 'Individual financial accounts',
      category: 'personal'
    },
    {
      id: 'personalBudget',
      label: 'Personal Budget',
      description: 'Individual monthly budget tracking',
      category: 'personal'
    },
    {
      id: 'personalInvestments',
      label: 'Personal Investments',
      description: 'Personal investment portfolios',
      category: 'personal'
    },
    {
      id: 'personalCommitments',
      label: 'Personal Commitments',
      description: 'Personal loans and obligations',
      category: 'personal'
    },
    // Household Hub
    {
      id: 'taskManager',
      label: 'Task Manager',
      description: 'Household tasks and chores',
      category: 'household'
    },
    {
      id: 'shoppingLists',
      label: 'Shopping Lists',
      description: 'Grocery and shopping lists',
      category: 'household'
    },
    {
      id: 'homeMaintenance',
      label: 'Home Maintenance',
      description: 'Home maintenance and repairs',
      category: 'household'
    },
    // Family Hub
    {
      id: 'familyCalendar',
      label: 'Family Calendar',
      description: 'Family events and schedules',
      category: 'family-hub'
    },
    {
      id: 'growthTracker',
      label: 'Growth Tracker',
      description: 'Child growth and development tracking',
      category: 'family-hub'
    },
    {
      id: 'cloudStorage',
      label: 'Cloud Storage',
      description: 'Family file storage and sharing',
      category: 'family-hub'
    },
    {
      id: 'medicalRecords',
      label: 'Medical Records',
      description: 'Family health records and appointments',
      category: 'family-hub'
    },
    {
      id: 'schoolActivities',
      label: 'School Activities',
      description: 'School events and activities',
      category: 'family-hub'
    }
  ];

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'family': return '👨‍👩‍👧‍👦 Family Finance';
      case 'personal': return '👤 Personal Finance';
      case 'household': return '🏡 Household Hub';
      case 'family-hub': return '👨‍👩‍👧‍👦 Family Hub';
      default: return category;
    }
  };

  const getCategoryItems = (category: string) => {
    return checkboxItems.filter(item => item.category === category);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-medium text-gray-900">Settings</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading preferences...</span>
            </div>
          ) : preferences ? (
            <div className="space-y-8">
              {/* Personal Details */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-gray-900">Personal Details</h4>
                  <button
                    onClick={() => setEditingPersonalDetails(!editingPersonalDetails)}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    {editingPersonalDetails ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {editingPersonalDetails ? (
                  <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={personalDetails.displayName}
                        onChange={(e) => setPersonalDetails({...personalDetails, displayName: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter your display name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={personalDetails.email}
                        onChange={(e) => setPersonalDetails({...personalDetails, email: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter your email"
                      />
                    </div>
                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => setEditingPersonalDetails(false)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          // Here you would typically update the user profile
                          // For now, we'll just close the editing mode
                          setEditingPersonalDetails(false);
                        }}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{personalDetails.displayName || 'No display name set'}</p>
                        <p className="text-sm text-gray-500">{personalDetails.email}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Financial Hub - Family */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  {getCategoryTitle('family')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {getCategoryItems('family').map((item) => (
                    <div key={item.id} className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg">
                      <input
                        type="checkbox"
                        id={item.id}
                        checked={preferences.visibleCards[item.id]}
                        onChange={() => handleCardToggle(item.id)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <label htmlFor={item.id} className="block text-sm font-medium text-gray-900 cursor-pointer">
                          {item.label}
                        </label>
                        <p className="text-sm text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Hub - Personal */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  {getCategoryTitle('personal')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {getCategoryItems('personal').map((item) => (
                    <div key={item.id} className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg">
                      <input
                        type="checkbox"
                        id={item.id}
                        checked={preferences.visibleCards[item.id]}
                        onChange={() => handleCardToggle(item.id)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <label htmlFor={item.id} className="block text-sm font-medium text-gray-900 cursor-pointer">
                          {item.label}
                        </label>
                        <p className="text-sm text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Household Hub */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  {getCategoryTitle('household')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {getCategoryItems('household').map((item) => (
                    <div key={item.id} className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg">
                      <input
                        type="checkbox"
                        id={item.id}
                        checked={preferences.visibleCards[item.id]}
                        onChange={() => handleCardToggle(item.id)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <label htmlFor={item.id} className="block text-sm font-medium text-gray-900 cursor-pointer">
                          {item.label}
                        </label>
                        <p className="text-sm text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Family Hub */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  {getCategoryTitle('family-hub')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {getCategoryItems('family-hub').map((item) => (
                    <div key={item.id} className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg">
                      <input
                        type="checkbox"
                        id={item.id}
                        checked={preferences.visibleCards[item.id]}
                        onChange={() => handleCardToggle(item.id)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <label htmlFor={item.id} className="block text-sm font-medium text-gray-900 cursor-pointer">
                          {item.label}
                        </label>
                        <p className="text-sm text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex justify-between items-center pt-6 border-t border-gray-200 mt-8">
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Reset to Defaults
            </button>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomizationModal;
