import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, deleteDoc, doc, updateDoc, setDoc, where, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDczqvwh8gZLDaT9eM76y5kJ0fiWsLH9VU",
  authDomain: "opheliahub-f9851.firebaseapp.com",
  projectId: "opheliahub-f9851",
  storageBucket: "opheliahub-f9851.firebasestorage.app",
  messagingSenderId: "608092538743",
  appId: "1:608092538743:web:b19d4d1812ac66304c0372"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// Growth Tracker Functions
export interface GrowthRecord {
  date: string;
  weight: number;
  height: number;
  timestamp: number;
}

export interface ChildProfile {
  name: string;
  dateOfBirth: string;
  gender: 'Female' | 'Male';
  timestamp: number;
  sharedWith?: string[]; // Array of user IDs who have access
  ownerId: string; // Original owner's user ID
}

// Sharing Interfaces
export interface SharingInvitation {
  id: string;
  fromUserId: string;
  fromUserEmail: string;
  toUserEmail: string;
  childProfileId: string;
  childName: string;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: number;
}

export interface SharedChildProfile {
  childProfileId: string;
  childName: string;
  ownerId: string;
  ownerEmail: string;
  sharedAt: number;
}

// Get user's accessible child profiles (own + shared)
export const getAccessibleChildProfiles = async (userId: string): Promise<(ChildProfile & { id: string })[]> => {
  try {
    // Get own profiles
    const ownProfilesQuery = query(
      collection(db, 'users', userId, 'profile'),
      orderBy('timestamp', 'desc')
    );
    const ownProfilesSnapshot = await getDocs(ownProfilesQuery);
    
    // Get shared profiles
    const sharedProfilesQuery = query(
      collection(db, 'sharedProfiles'),
      where('sharedWith', 'array-contains', userId)
    );
    const sharedProfilesSnapshot = await getDocs(sharedProfilesQuery);
    
    const ownProfiles = ownProfilesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as (ChildProfile & { id: string })[];
    
    const sharedProfiles = sharedProfilesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as (ChildProfile & { id: string })[];
    
    return [...ownProfiles, ...sharedProfiles];
  } catch (error) {
    console.error('Error getting accessible child profiles:', error);
    throw error;
  }
};

// Send sharing invitation
export const sendSharingInvitation = async (
  fromUserId: string,
  fromUserEmail: string,
  toUserEmail: string,
  childProfileId: string,
  childName: string
): Promise<void> => {
  try {
    // Check if invitation already exists
    const existingInvitationQuery = query(
      collection(db, 'sharingInvitations'),
      where('fromUserId', '==', fromUserId),
      where('toUserEmail', '==', toUserEmail),
      where('childProfileId', '==', childProfileId),
      where('status', '==', 'pending')
    );
    const existingInvitationSnapshot = await getDocs(existingInvitationQuery);
    
    if (!existingInvitationSnapshot.empty) {
      throw new Error('Invitation already sent to this email');
    }
    
    // Create invitation
    await addDoc(collection(db, 'sharingInvitations'), {
      fromUserId,
      fromUserEmail,
      toUserEmail,
      childProfileId,
      childName,
      status: 'pending',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error sending sharing invitation:', error);
    throw error;
  }
};

// Get pending invitations for a user
export const getPendingInvitations = async (userEmail: string): Promise<SharingInvitation[]> => {
  try {
    console.log('Getting pending invitations for email:', userEmail);
    
    const q = query(
      collection(db, 'sharingInvitations'),
      where('toUserEmail', '==', userEmail),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log('Found invitations:', querySnapshot.docs.length);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as SharingInvitation[];
  } catch (error) {
    console.error('Error getting pending invitations:', error);
    throw error;
  }
};

// Get invitations sent by a user
export const getSentInvitations = async (userId: string): Promise<SharingInvitation[]> => {
  try {
    console.log('Getting sent invitations for user:', userId);
    
    const q = query(
      collection(db, 'sharingInvitations'),
      where('fromUserId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log('Found sent invitations:', querySnapshot.docs.length);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as SharingInvitation[];
  } catch (error) {
    console.error('Error getting sent invitations:', error);
    throw error;
  }
};

// Accept sharing invitation
export const acceptSharingInvitation = async (invitationId: string, userId: string): Promise<void> => {
  try {
    console.log('Accepting invitation:', invitationId, 'for user:', userId);
    
    const batch = writeBatch(db);
    
    // Update invitation status
    const invitationRef = doc(db, 'sharingInvitations', invitationId);
    batch.update(invitationRef, { status: 'accepted' });
    
    // Get invitation details
    const invitationDoc = await getDocs(query(
      collection(db, 'sharingInvitations'),
      where('__name__', '==', invitationId)
    ));
    
    if (!invitationDoc.empty) {
      const invitation = invitationDoc.docs[0].data() as SharingInvitation;
      console.log('Invitation details:', invitation);
      
      // Add to shared profiles collection
      const sharedProfileRef = doc(db, 'sharedProfiles', invitation.childProfileId);
      batch.set(sharedProfileRef, {
        childProfileId: invitation.childProfileId,
        childName: invitation.childName,
        ownerId: invitation.fromUserId,
        ownerEmail: invitation.fromUserEmail,
        sharedWith: [userId],
        sharedAt: Date.now(),
      }, { merge: true });
      
      // Update child profile to include shared user
      const childProfileRef = doc(db, 'users', invitation.fromUserId, 'profile', invitation.childProfileId);
      batch.update(childProfileRef, {
        sharedWith: [userId],
      });
    }
    
    await batch.commit();
    console.log('Invitation accepted successfully');
  } catch (error) {
    console.error('Error accepting sharing invitation:', error);
    throw error;
  }
};

// Decline sharing invitation
export const declineSharingInvitation = async (invitationId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'sharingInvitations', invitationId), {
      status: 'declined',
    });
  } catch (error) {
    console.error('Error declining sharing invitation:', error);
    throw error;
  }
};

// Remove sharing access
export const removeSharingAccess = async (childProfileId: string, userIdToRemove: string): Promise<void> => {
  try {
    const batch = writeBatch(db);
    
    // Remove from shared profiles
    const sharedProfileRef = doc(db, 'sharedProfiles', childProfileId);
    batch.update(sharedProfileRef, {
      sharedWith: [userIdToRemove],
    });
    
    // Update child profile
    const childProfileQuery = query(
      collection(db, 'users'),
      where('profile', 'array-contains', childProfileId)
    );
    const childProfileSnapshot = await getDocs(childProfileQuery);
    
    if (!childProfileSnapshot.empty) {
      const childProfileDoc = childProfileSnapshot.docs[0];
      const childProfileRef = doc(db, 'users', childProfileDoc.id, 'profile', childProfileId);
      batch.update(childProfileRef, {
        sharedWith: [userIdToRemove],
      });
    }
    
    await batch.commit();
  } catch (error) {
    console.error('Error removing sharing access:', error);
    throw error;
  }
};

// Get shared users for a child profile
export const getSharedUsers = async (childProfileId: string): Promise<string[]> => {
  try {
    const sharedProfileDoc = await getDocs(query(
      collection(db, 'sharedProfiles'),
      where('childProfileId', '==', childProfileId)
    ));
    
    if (!sharedProfileDoc.empty) {
      const sharedProfile = sharedProfileDoc.docs[0].data();
      return sharedProfile.sharedWith || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error getting shared users:', error);
    throw error;
  }
};

export const saveGrowthRecord = async (userId: string, record: Omit<GrowthRecord, 'timestamp'>) => {
  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'growthRecords'), {
      ...record,
      timestamp: Date.now(),
    });
    return docRef;
  } catch (error) {
    console.error('Error saving growth record:', error);
    throw error;
  }
};

export const getGrowthRecords = async (userId: string): Promise<(GrowthRecord & { id: string })[]> => {
  try {
    const q = query(
      collection(db, 'users', userId, 'growthRecords'),
      orderBy('date', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as (GrowthRecord & { id: string })[];
  } catch (error) {
    console.error('Error getting growth records:', error);
    throw error;
  }
};

export const deleteGrowthRecord = async (userId: string, recordId: string) => {
  try {
    await deleteDoc(doc(db, 'users', userId, 'growthRecords', recordId));
  } catch (error) {
    console.error('Error deleting growth record:', error);
    throw error;
  }
};

export const updateGrowthRecord = async (userId: string, recordId: string, record: Omit<GrowthRecord, 'timestamp'>) => {
  try {
    await updateDoc(doc(db, 'users', userId, 'growthRecords', recordId), {
      ...record,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error updating growth record:', error);
    throw error;
  }
};

// Child Profile Functions
export const saveChildProfile = async (userId: string, profile: Omit<ChildProfile, 'timestamp'>, profileId?: string) => {
  try {
    const profileWithTimestamp = { 
      ...profile, 
      timestamp: Date.now(),
      ownerId: userId,
    };
    if (profileId) {
      // Update existing profile
      await setDoc(doc(db, 'users', userId, 'profile', profileId), profileWithTimestamp);
    } else {
      // Create new profile
      const docRef = await addDoc(collection(db, 'users', userId, 'profile'), profileWithTimestamp);
      return docRef;
    }
  } catch (error) {
    console.error('Error saving child profile:', error);
    throw error;
  }
};

export const getChildProfile = async (userId: string): Promise<(ChildProfile & { id: string }) | null> => {
  try {
    const q = query(
      collection(db, 'users', userId, 'profile'),
      orderBy('timestamp', 'desc')
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as ChildProfile & { id: string };
  } catch (error) {
    console.error('Error getting child profile:', error);
    throw error;
  }
};