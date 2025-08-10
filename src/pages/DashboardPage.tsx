import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getDashboardPreferences, 
  type DashboardPreferences 
} from '../firebase/config';
import CustomizationModal from '../components/CustomizationModal';

// Import all dashboard cards
import {
  FamilyAccountsCard,
  FamilyBudgetCard,
  FamilyInvestmentsCard,
  FamilyCommitmentsCard,
  PersonalAccountsCard,
  PersonalBudgetCard,
  PersonalInvestmentsCard,
  PersonalCommitmentsCard,
  FinancialHubSplitTestCard,
  TaskManagerCard,
  ShoppingListsCard,
  HomeMaintenanceCard,
  FamilyCalendarCard,
  GrowthTrackerCard,
  CloudStorageCard,
  MedicalRecordsCard,
  SchoolActivitiesCard
} from '../components/dashboard';

interface FamilyMember {
  id: string;
  name: string;
  email: string;
  isCurrentUser: boolean;
  avatar?: string;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<DashboardPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCustomization, setShowCustomization] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  useEffect(() => {
    console.log('🔍 DashboardPage useEffect started');
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('🔍 Auth state changed:', user ? 'User logged in' : 'No user');
      setUser(user);
      if (user) {
        try {
          console.log('🔍 Loading dashboard data for user:', user.uid);
          setLoading(true);
          setError(null);
          
          // Load preferences first
          const userPreferences = await getDashboardPreferences(user.uid);
          console.log('🔍 Loaded preferences:', userPreferences);
          setPreferences(userPreferences);
          
          // Load family members
          await loadFamilyMembers(user);
          console.log('🔍 Loaded family members');
        } catch (error) {
          console.error('❌ Error loading dashboard data:', error);
          setError('Failed to load dashboard data');
          
          // Set default preferences as fallback
          const defaultPreferences: DashboardPreferences = {

            visibleCards: {
              familyAccounts: true,
              familyBudget: true,
              familyInvestments: false,
              familyCommitments: false,
              personalAccounts: true,
              personalBudget: true,
              personalInvestments: false,
              personalCommitments: false,
              taskManager: false,
              shoppingLists: false,
              homeMaintenance: false,
              familyCalendar: false,
              growthTracker: true,
              cloudStorage: false,
              medicalRecords: false,
              schoolActivities: false,
            },
            cardOrder: [],
            theme: 'light'
          };
          setPreferences(defaultPreferences);
        } finally {
          setLoading(false);
        }
      } else {
        console.log('🔍 No user, setting loading to false');
        setLoading(false);
        setPreferences(null);
        setFamilyMembers([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadPreferences = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const userPreferences = await getDashboardPreferences(user.uid);
      setPreferences(userPreferences);
    } catch (error) {
      console.error('Error loading preferences:', error);
      setError('Failed to load dashboard preferences');
    } finally {
      setLoading(false);
    }
  };

  const loadFamilyMembers = async (currentUser?: User) => {
    const userToUse = currentUser || user;
    if (!userToUse) return;

    try {
      const currentUserMember: FamilyMember = {
        id: userToUse.uid,
        name: userToUse.displayName || 'You',
        email: userToUse.email || '',
        isCurrentUser: true,
        avatar: userToUse.photoURL || undefined,
      };

      setFamilyMembers([currentUserMember]);
    } catch (error) {
      console.error('Error loading family members:', error);
      if (userToUse) {
        setFamilyMembers([{
          id: userToUse.uid,
          name: userToUse.displayName || 'You',
          email: userToUse.email || '',
          isCurrentUser: true,
          avatar: userToUse.photoURL || undefined,
        }]);
      }
    }
  };

  const handlePreferencesUpdated = () => {
    loadPreferences();
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Dashboard</h3>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={loadPreferences}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome to OpheliaHub
              </h1>
              <p className="text-gray-600">
                Manage your family's important information and track what matters most.
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowCustomization(true)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-xl transition-all duration-200"
                title="Customize Dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={handleLogout}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        {preferences && (
          <div className="space-y-8">
            {/* Financial Hub */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">💰 Financial Hub</h2>
              
              {/* Family Section */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">👨‍👩‍👧‍👦 Family</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {preferences.visibleCards.familyAccounts && <FamilyAccountsCard />}
                  {preferences.visibleCards.familyBudget && <FamilyBudgetCard />}
                  {preferences.visibleCards.familyInvestments && <FamilyInvestmentsCard />}
                  {preferences.visibleCards.familyCommitments && <FamilyCommitmentsCard />}
                </div>
              </div>

              {/* Personal Section */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">👤 Personal</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {preferences.visibleCards.personalAccounts && <PersonalAccountsCard />}
                  {preferences.visibleCards.personalBudget && <PersonalBudgetCard />}
                  {preferences.visibleCards.personalInvestments && <PersonalInvestmentsCard />}
                  {preferences.visibleCards.personalCommitments && <PersonalCommitmentsCard />}
                </div>
              </div>

              {/* Test Features Section */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">🧪 Test Features</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FinancialHubSplitTestCard />
                </div>
              </div>
            </div>

            {/* Household Hub */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">🏡 Household Hub</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {preferences.visibleCards.taskManager && <TaskManagerCard />}
                {preferences.visibleCards.shoppingLists && <ShoppingListsCard />}
                {preferences.visibleCards.homeMaintenance && <HomeMaintenanceCard />}
              </div>
            </div>

            {/* Family Hub */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">👨‍👩‍👧‍👦 Family Hub</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {preferences.visibleCards.familyCalendar && <FamilyCalendarCard />}
                {preferences.visibleCards.growthTracker && <GrowthTrackerCard />}
                {preferences.visibleCards.cloudStorage && <CloudStorageCard />}
                {preferences.visibleCards.medicalRecords && <MedicalRecordsCard />}
                {preferences.visibleCards.schoolActivities && <SchoolActivitiesCard />}
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Cards</p>
                <p className="text-2xl font-bold text-gray-900">
                  {preferences ? Object.values(preferences.visibleCards).filter(Boolean).length : 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Data Security</p>
                <p className="text-2xl font-bold text-gray-900">100%</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Family Members</p>
                <p className="text-2xl font-bold text-gray-900">{familyMembers.length}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Family Members Section */}
        <div className="mt-8 bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Family Members</h2>
            <button className="bg-purple-500 hover:bg-purple-600 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Invite</span>
            </button>
          </div>
          
          {familyMembers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {familyMembers.map((member) => (
                <div
                  key={member.id}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                    member.isCurrentUser
                      ? 'border-purple-200 bg-purple-50'
                      : 'border-gray-200 bg-gray-50 hover:border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                          {getInitials(member.name)}
                        </div>
                      )}
                      {member.isCurrentUser && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                          <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.name}
                        {member.isCurrentUser && (
                          <span className="ml-2 text-xs text-purple-600 font-medium">(You)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{member.email}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">No family members yet</p>
              <p className="text-gray-400 text-xs mt-1">Invite family members to share your data</p>
            </div>
          )}
        </div>
      </div>

      {/* Customization Modal */}
      {showCustomization && (
        <CustomizationModal
          isOpen={showCustomization}
          onClose={() => setShowCustomization(false)}
          onPreferencesUpdated={handlePreferencesUpdated}
        />
      )}
    </div>
  );
};

export default DashboardPage; 