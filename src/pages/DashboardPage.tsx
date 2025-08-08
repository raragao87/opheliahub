import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, getSentInvitations, getReceivedInvitations, signOutUser } from '../firebase/config';

interface FamilyMember {
  id: string;
  name: string;
  email: string;
  isCurrentUser: boolean;
  avatar?: string;
}

const DashboardPage: FC = () => {
  const navigate = useNavigate();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    loadFamilyMembers();
  }, []);

  const loadFamilyMembers = async () => {
    if (!auth.currentUser) return;

    setLoadingMembers(true);
    try {
      const currentUser: FamilyMember = {
        id: auth.currentUser.uid,
        name: auth.currentUser.displayName || 'You',
        email: auth.currentUser.email || '',
        isCurrentUser: true,
        avatar: auth.currentUser.photoURL || undefined,
      };

      // Get sent invitations to find family members
      const sentInvitations = await getSentInvitations(auth.currentUser.uid);
      const acceptedInvitations = sentInvitations.filter(inv => inv.status === 'accepted');
      
      // Get received invitations
      const receivedInvitations = await getReceivedInvitations(auth.currentUser.email || '');
      const acceptedReceivedInvitations = receivedInvitations.filter(inv => inv.status === 'accepted');

      // Create family members from accepted invitations
      const invitedMembers: FamilyMember[] = acceptedInvitations.map(inv => ({
        id: inv.toUserEmail, // Using email as ID for now
        name: inv.toUserEmail.split('@')[0], // Use email prefix as name
        email: inv.toUserEmail,
        isCurrentUser: false,
      }));

      const receivedMembers: FamilyMember[] = acceptedReceivedInvitations.map(inv => ({
        id: inv.fromUserEmail,
        name: inv.fromUserEmail.split('@')[0],
        email: inv.fromUserEmail,
        isCurrentUser: false,
      }));

      // Combine all family members, starting with current user
      const allMembers = [currentUser, ...invitedMembers, ...receivedMembers];
      
      // Remove duplicates based on email
      const uniqueMembers = allMembers.filter((member, index, self) => 
        index === self.findIndex(m => m.email === member.email)
      );

      setFamilyMembers(uniqueMembers);
    } catch (error) {
      console.error('Error loading family members:', error);
      // Fallback to just current user
      if (auth.currentUser) {
        setFamilyMembers([{
          id: auth.currentUser.uid,
          name: auth.currentUser.displayName || 'You',
          email: auth.currentUser.email || '',
          isCurrentUser: true,
          avatar: auth.currentUser.photoURL || undefined,
        }]);
      }
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome back! 👋
              </h1>
              <p className="text-gray-600">
                Manage your family's important information and track what matters most.
              </p>
            </div>
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
        
        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Growth Tracker Card */}
          <div 
            className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
            onClick={() => navigate('/growth-tracker')}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <svg className="w-6 h-6 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Growth Tracker</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Track your baby's development and compare with WHO growth standards. Monitor weight, height, and milestones.
            </p>
            <div className="flex items-center text-green-600 font-medium text-sm">
              <span>View Tracker</span>
              <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          {/* Financial Hub Card */}
          <div 
            className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
            onClick={() => navigate('/financial-hub')}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <svg className="w-6 h-6 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Financial Hub</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Manage accounts, track transactions, and monitor your financial health with advanced budgeting tools.
            </p>
            <div className="flex items-center text-emerald-600 font-medium text-sm">
              <span>View Hub</span>
              <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          {/* Budget Card */}
          <div 
            className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
            onClick={() => navigate('/budgets')}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <svg className="w-6 h-6 text-gray-400 group-hover:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Monthly Budgets</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Create and manage monthly budgets using tag-based categories. Track spending vs budget in real-time.
            </p>
            <div className="flex items-center text-purple-600 font-medium text-sm">
              <span>View Budgets</span>
              <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          {/* Family Finance Card */}
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 opacity-75">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                Coming Soon
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Family Finance</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Manage shared and individual accounts with your partner. Budget for your goals and gain clarity on spending.
            </p>
            <div className="flex items-center text-gray-400 font-medium text-sm">
              <span>Coming Soon</span>
            </div>
          </div>

          {/* Health Records Card */}
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 opacity-75">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                Coming Soon
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Health Records</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              Keep track of vaccinations, appointments, and important health information for your family.
            </p>
            <div className="flex items-center text-gray-400 font-medium text-sm">
              <span>Coming Soon</span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Modules</p>
                <p className="text-2xl font-bold text-gray-900">1</p>
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
          
          {loadingMembers ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
              <p className="text-gray-500 text-sm mt-2">Loading family members...</p>
            </div>
          ) : familyMembers.length > 0 ? (
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
    </div>
  );
};

export default DashboardPage; 