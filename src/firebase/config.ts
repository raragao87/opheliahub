import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, deleteDoc, doc, updateDoc, setDoc, where, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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
export const storage = getStorage(app);
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
  profileImageUrl?: string; // URL of the profile image in Firebase Storage
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
    console.log('=== SENDING SHARING INVITATION ===');
    console.log('From user ID:', fromUserId);
    console.log('From email:', fromUserEmail);
    console.log('To email:', toUserEmail);
    console.log('Child profile ID:', childProfileId);
    console.log('Child name:', childName);
    
    // Normalize emails for consistent storage and querying
    const normalizedFromEmail = fromUserEmail.toLowerCase().trim();
    const normalizedToEmail = toUserEmail.toLowerCase().trim();
    
    console.log('Normalized from email:', normalizedFromEmail);
    console.log('Normalized to email:', normalizedToEmail);
    
    // Check if invitation already exists
    const existingInvitationQuery = query(
      collection(db, 'sharingInvitations'),
      where('fromUserId', '==', fromUserId),
      where('toUserEmail', '==', normalizedToEmail),
      where('childProfileId', '==', childProfileId),
      where('status', '==', 'pending')
    );
    const existingInvitationSnapshot = await getDocs(existingInvitationQuery);
    
    if (!existingInvitationSnapshot.empty) {
      console.log('Invitation already exists, throwing error');
      throw new Error('Invitation already sent to this email');
    }
    
    // Create invitation with normalized emails
    const invitationData = {
      fromUserId,
      fromUserEmail: normalizedFromEmail,
      toUserEmail: normalizedToEmail,
      childProfileId,
      childName,
      status: 'pending',
      timestamp: Date.now(),
    };
    
    console.log('Creating invitation with data:', invitationData);
    await addDoc(collection(db, 'sharingInvitations'), invitationData);
    console.log('Invitation created successfully');
    console.log('=== END SENDING INVITATION ===');
  } catch (error) {
    console.error('Error sending sharing invitation:', error);
    throw error;
  }
};

// Get pending invitations for a user
export const getPendingInvitations = async (userEmail: string): Promise<SharingInvitation[]> => {
  try {
    console.log('=== DEBUGGING PENDING INVITATIONS ===');
    console.log('Query email:', userEmail);
    console.log('Query email type:', typeof userEmail);
    console.log('Query email length:', userEmail.length);
    
    // Normalize email to lowercase for consistent comparison
    const normalizedEmail = userEmail.toLowerCase().trim();
    console.log('Normalized email:', normalizedEmail);
    
    // First, let's get ALL invitations to debug
    const allInvitationsQuery = query(
      collection(db, 'sharingInvitations'),
      orderBy('timestamp', 'desc')
    );
    
    console.log('Fetching all invitations for debugging...');
    const allInvitationsSnapshot = await getDocs(allInvitationsQuery);
    console.log('Total invitations in collection:', allInvitationsSnapshot.docs.length);
    
    // Log all invitations to see what's in the database
    allInvitationsSnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Invitation ${index + 1}:`, {
        id: doc.id,
        toUserEmail: data.toUserEmail,
        toUserEmailType: typeof data.toUserEmail,
        toUserEmailLength: data.toUserEmail?.length,
        status: data.status,
        fromUserEmail: data.fromUserEmail,
        childName: data.childName,
        timestamp: data.timestamp
      });
    });
    
    // Now try the actual query with normalized email
    console.log('Trying query with normalized email:', normalizedEmail);
    const q = query(
      collection(db, 'sharingInvitations'),
      where('toUserEmail', '==', normalizedEmail),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log('Query result count:', querySnapshot.docs.length);
    
    // If query returns empty, try without status filter
    if (querySnapshot.docs.length === 0) {
      console.log('No results with status filter, trying without status...');
      const qWithoutStatus = query(
        collection(db, 'sharingInvitations'),
        where('toUserEmail', '==', normalizedEmail),
        orderBy('timestamp', 'desc')
      );
      
      const querySnapshotWithoutStatus = await getDocs(qWithoutStatus);
      console.log('Results without status filter:', querySnapshotWithoutStatus.docs.length);
      
      if (querySnapshotWithoutStatus.docs.length > 0) {
        console.log('Found invitations without status filter:');
        querySnapshotWithoutStatus.docs.forEach((doc, index) => {
          const data = doc.data();
          console.log(`  ${index + 1}. Status: "${data.status}", Email: "${data.toUserEmail}"`);
        });
      }
    }
    
    // Also try with original email (case-sensitive)
    if (querySnapshot.docs.length === 0) {
      console.log('Trying with original email (case-sensitive):', userEmail);
      const qOriginal = query(
        collection(db, 'sharingInvitations'),
        where('toUserEmail', '==', userEmail),
        where('status', '==', 'pending'),
        orderBy('timestamp', 'desc')
      );
      
      const querySnapshotOriginal = await getDocs(qOriginal);
      console.log('Results with original email:', querySnapshotOriginal.docs.length);
    }
    
    // Client-side filtering as fallback
    console.log('Performing client-side filtering...');
    const clientSideFiltered = allInvitationsSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((invitation: any) => {
        const matchesEmail = invitation.toUserEmail?.toLowerCase() === normalizedEmail ||
                           invitation.toUserEmail === userEmail;
        const matchesStatus = invitation.status === 'pending';
        console.log(`Client-side check: Email "${invitation.toUserEmail}" matches "${normalizedEmail}": ${matchesEmail}, Status "${invitation.status}" matches "pending": ${matchesStatus}`);
        return matchesEmail && matchesStatus;
      });
    
    console.log('Client-side filtered results:', clientSideFiltered.length);
    
    // Return client-side filtered results if query failed
    if (querySnapshot.docs.length === 0 && clientSideFiltered.length > 0) {
      console.log('Using client-side filtered results');
      return clientSideFiltered as SharingInvitation[];
    }
    
    const results = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as SharingInvitation[];
    
    console.log('Final results:', results.length);
    console.log('=== END DEBUGGING ===');
    
    return results;
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

// Get invitations received by a user (for future use)
export const getReceivedInvitations = async (userEmail: string): Promise<SharingInvitation[]> => {
  try {
    console.log('Getting received invitations for email:', userEmail);
    
    const normalizedEmail = userEmail.toLowerCase().trim();
    const q = query(
      collection(db, 'sharingInvitations'),
      where('toUserEmail', '==', normalizedEmail),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    console.log('Found received invitations:', querySnapshot.docs.length);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as SharingInvitation[];
  } catch (error) {
    console.error('Error getting received invitations:', error);
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
    
    // Get invitation details using document reference
    const invitationSnapshot = await getDocs(query(
      collection(db, 'sharingInvitations'),
      where('__name__', '==', invitationId)
    ));
    
    if (!invitationSnapshot.empty) {
      const invitation = invitationSnapshot.docs[0].data() as SharingInvitation;
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
export const saveChildProfile = async (
  userId: string, 
  profile: Omit<ChildProfile, 'timestamp'>, 
  profileId?: string,
  imageFile?: File
) => {
  try {
    let profileImageUrl = profile.profileImageUrl;
    
    // Create the profile first to get the ID
    const profileWithTimestamp = { 
      ...profile, 
      timestamp: Date.now(),
      ownerId: userId,
      ...(profileImageUrl && { profileImageUrl }),
    };
    
    let finalProfileId = profileId;
    
    if (profileId) {
      // Update existing profile
      await setDoc(doc(db, 'users', userId, 'profile', profileId), profileWithTimestamp);
    } else {
      // Create new profile
      const docRef = await addDoc(collection(db, 'users', userId, 'profile'), profileWithTimestamp);
      finalProfileId = docRef.id;
    }
    
    // Upload image after we have the profile ID
    if (imageFile && finalProfileId) {
      try {
        profileImageUrl = await uploadProfileImage(userId, finalProfileId, imageFile);
        
        // Only update if we got a valid URL
        if (profileImageUrl) {
          await updateDoc(doc(db, 'users', userId, 'profile', finalProfileId), {
            profileImageUrl,
          });
        }
      } catch (error) {
        console.error('Error uploading profile image:', error);
        // Don't fail the entire save operation if image upload fails
      }
    }
    
    return { id: finalProfileId, profileImageUrl };
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

// Image upload functions
export const uploadProfileImage = async (userId: string, childProfileId: string, file: File): Promise<string> => {
  try {
    console.log('Starting image upload for user:', userId, 'profile:', childProfileId);
    console.log('File details:', { name: file.name, size: file.size, type: file.type });
    
    // Create a unique filename
    const fileExtension = file.name.split('.').pop();
    const fileName = `profile-images/${userId}/${childProfileId}-${Date.now()}.${fileExtension}`;
    
    console.log('Uploading to path:', fileName);
    
    // Create a reference to the file location
    const storageRef = ref(storage, fileName);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    console.log('Upload completed, getting download URL...');
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('Download URL obtained:', downloadURL);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading profile image:', error);
    throw new Error('Failed to upload image');
  }
};

export const deleteProfileImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract the file path from the URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1].split('?')[0];
    const filePath = `profile-images/${fileName}`;
    
    const storageRef = ref(storage, filePath);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting profile image:', error);
    // Don't throw error as this is not critical
  }
};