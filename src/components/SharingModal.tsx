import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { auth, sendSharingInvitation, getSentInvitations, declineSharingInvitation, type SharingInvitation } from '../firebase/config';

interface SharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;        // Can be childProfileId OR accountId
  itemName: string;      // Can be childName OR accountName  
  itemType: 'child' | 'account';  // Determines the context
}

const SharingModal: FC<SharingModalProps> = ({ isOpen, onClose, itemId, itemName, itemType }) => {
  const [partnerEmail, setPartnerEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<SharingInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      loadPendingInvitations();
    }
  }, [isOpen]);

  const loadPendingInvitations = async () => {
    if (!auth.currentUser?.uid) return;
    
    setLoadingInvitations(true);
    setError('');
    try {
      console.log(`Loading sent invitations for ${itemType}:`, itemId);
      const allSentInvitations = await getSentInvitations(auth.currentUser.uid);
      console.log('All sent invitations:', allSentInvitations);
      
      // Filter for pending invitations for this specific item only
      const pendingInvitations = allSentInvitations.filter(invitation => 
        invitation.status === 'pending' && 
        invitation.childProfileId === itemId
      );
      console.log(`Pending invitations for ${itemType} ${itemId}:`, pendingInvitations);
      
      setPendingInvitations(pendingInvitations);
    } catch (error) {
      console.error('Error loading invitations:', error);
      setError(error instanceof Error ? error.message : 'Failed to load invitations');
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !partnerEmail.trim()) return;

    setSending(true);
    setError('');
    setSuccess('');

    try {
      await sendSharingInvitation(
        auth.currentUser.uid,
        auth.currentUser.email!,
        partnerEmail.trim(),
        itemId,
        itemName
      );
      setSuccess('Invitation sent successfully!');
      setPartnerEmail('');
      await loadPendingInvitations();
    } catch (error) {
      console.error('Error sending invitation:', error);
      setError(error instanceof Error ? error.message : 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };



  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await declineSharingInvitation(invitationId);
      setSuccess('Invitation cancelled.');
      await loadPendingInvitations();
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      setError('Failed to cancel invitation');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-800">
              {itemType === 'account' ? 'Share Your Account' : 'Share Your Child Information'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          )}

          {/* Send Invitation Form */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-4">Send Invitation</h3>
            <form onSubmit={handleSendInvitation} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {itemType === 'account' ? 'Partner\'s Email Address' : 'Partner\'s Email Address'}
                </label>
                <input
                  type="email"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="partner@example.com"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={sending || !partnerEmail.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send Invitation'}
              </button>
            </form>
          </div>

          {/* Pending Invitations */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-4">Invitations You Sent (Pending)</h3>
            {loadingInvitations ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-gray-500 text-sm mt-2">Loading invitations...</p>
              </div>
            ) : pendingInvitations.length > 0 ? (
              <div className="space-y-3">
                {pendingInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-800">
                          {invitation.childName}
                        </p>
                        <p className="text-sm text-gray-600">
                          Sent to {invitation.toUserEmail}
                        </p>
                        <p className="text-xs text-gray-500">
                          {itemType === 'account' ? 'Account' : 'Child'} • Sent on {new Date(invitation.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleCancelInvitation(invitation.id)}
                        className="flex-1 bg-red-500 text-white text-sm font-medium py-2 px-3 rounded-lg hover:bg-red-600 transition-colors"
                      >
                        Cancel Invitation
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm">No pending invitations sent</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharingModal; 