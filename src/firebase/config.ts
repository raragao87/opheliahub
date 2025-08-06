import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, getDoc, deleteDoc, doc, updateDoc, setDoc, where, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { config, getCurrentDomain, isDomainAllowed, getSecurityInfo } from '../config/environment';

// Environment variable validation with enhanced security
const requiredEnvVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Enhanced validation with specific error messages
const validateEnvironmentVariables = () => {
  const missingVars = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => `VITE_FIREBASE_${key.toUpperCase()}`);

  if (missingVars.length > 0) {
    const errorMessage = `
🚨 CRITICAL SECURITY ERROR: Missing Firebase environment variables!

Missing variables: ${missingVars.join(', ')}

To fix this:
1. Copy .env.example to .env: cp .env.example .env
2. Add your Firebase credentials to .env file
3. Restart the development server

For security reasons, the app cannot start without proper environment configuration.
    `;
    throw new Error(errorMessage);
  }

  // Validate API key format
  const apiKey = requiredEnvVars.apiKey;
  if (apiKey && !apiKey.startsWith('AIzaSy')) {
    console.warn('⚠️  Warning: Firebase API key format appears incorrect. Expected format: AIzaSy...');
  }

  // Validate project ID format
  const projectId = requiredEnvVars.projectId;
  if (projectId && projectId.includes(' ')) {
    throw new Error('❌ Invalid project ID: Contains spaces. Project ID should be lowercase with hyphens only.');
  }

  console.log('✅ Firebase environment variables validated successfully');
};

// Run validation
validateEnvironmentVariables();

// Domain and security validation
const validateDomainAndSecurity = () => {
  const currentDomain = getCurrentDomain();
  const securityInfo = getSecurityInfo();
  
  console.log('🔒 Security Validation:', securityInfo);
  
  if (!isDomainAllowed(currentDomain)) {
    console.warn('⚠️  Warning: Current domain not in allowed list:', currentDomain);
    console.warn('   Allowed domains:', config.allowedDomains);
  } else {
    console.log('✅ Domain validation passed:', currentDomain);
  }
  
  if (config.apiKeyRestrictions.enabled) {
    console.log('🔒 API key restrictions are ENABLED (production mode)');
  } else {
    console.log('🔓 API key restrictions are DISABLED (development mode)');
  }
};

// Safe debug logging (without exposing full credentials)
const debugFirebaseConfig = () => {
  console.log('🔍 Firebase Configuration Debug:');
  console.log('✅ API Key present:', !!requiredEnvVars.apiKey);
  console.log('✅ Auth Domain present:', !!requiredEnvVars.authDomain);
  console.log('✅ Project ID present:', !!requiredEnvVars.projectId);
  console.log('✅ Storage Bucket present:', !!requiredEnvVars.storageBucket);
  console.log('✅ Messaging Sender ID present:', !!requiredEnvVars.messagingSenderId);
  console.log('✅ App ID present:', !!requiredEnvVars.appId);
  
  // Show partial values for verification (safe)
  if (requiredEnvVars.apiKey) {
    console.log('🔑 API Key format:', requiredEnvVars.apiKey.substring(0, 8) + '...');
  }
  if (requiredEnvVars.authDomain) {
    console.log('🌐 Auth Domain:', requiredEnvVars.authDomain);
  }
  if (requiredEnvVars.projectId) {
    console.log('📁 Project ID:', requiredEnvVars.projectId);
  }
  
  console.log('🔍 Current domain:', window.location.hostname);
  console.log('🔍 Current origin:', window.location.origin);
};

// Run debug logging in development
if (import.meta.env.DEV) {
  debugFirebaseConfig();
  validateDomainAndSecurity();
}

const firebaseConfig = {
  apiKey: requiredEnvVars.apiKey,
  authDomain: requiredEnvVars.authDomain,
  projectId: requiredEnvVars.projectId,
  storageBucket: requiredEnvVars.storageBucket,
  messagingSenderId: requiredEnvVars.messagingSenderId,
  appId: requiredEnvVars.appId,
};

// Initialize Firebase with error handling
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase initialized successfully');
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('❌ Firebase initialization failed:', error);
  throw new Error(`Firebase initialization failed: ${errorMessage}`);
}

// Initialize Firebase services with error handling
let auth: any, db: any, storage: any, googleProvider: any;
try {
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  googleProvider = new GoogleAuthProvider();
  console.log('✅ Firebase services initialized successfully');
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('❌ Firebase services initialization failed:', error);
  throw new Error(`Firebase services initialization failed: ${errorMessage}`);
}

export { auth, db, storage, googleProvider };

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

// Financial Hub Interfaces
export interface Account {
  id: string;
  name: string;
  type: string;
  defaultSign: 'positive' | 'negative';
  initialBalance: number;
  balance: number;
  currency: string;
  sharedWith: string[];
  ownerId: string;
  isReal: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  description: string;
  date: string;
  isManual: boolean;
  source: 'manual' | 'csv' | 'excel';
  tagIds?: string[]; // Array of tag IDs assigned to this transaction
  createdAt: number;
  updatedAt: number;
}

export interface AccountType {
  id: string;
  name: string;
  defaultSign: 'positive' | 'negative';
  category: 'asset' | 'liability';
  isCustom: boolean;
  userId?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  parentTagId?: string; // For hierarchical structure
  level: number; // 0 = root, 1 = child, etc.
  userId: string;
  isDefault: boolean; // System vs user-created
  createdAt: number;
  updatedAt: number;
}

export interface TagGroup {
  id: string;
  name: string;
  description?: string;
  tagIds: string[]; // Tags included in this group
  color: string;
  isBudgetable: boolean; // Can be used in budgeting
  userId: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionTag {
  transactionId: string;
  tagId: string;
  userId: string;
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

// Financial Hub Functions

// Get default account types
export const getDefaultAccountTypes = (): AccountType[] => {
  return [
    {
      id: 'checking',
      name: 'Checking',
      defaultSign: 'positive',
      category: 'asset',
      isCustom: false
    },
    {
      id: 'savings',
      name: 'Savings',
      defaultSign: 'positive',
      category: 'asset',
      isCustom: false
    },
    {
      id: 'investment',
      name: 'Investment',
      defaultSign: 'positive',
      category: 'asset',
      isCustom: false
    },
    {
      id: 'credit-card',
      name: 'Credit Card',
      defaultSign: 'negative',
      category: 'liability',
      isCustom: false
    }
  ];
};

// Account Functions
export const createAccount = async (userId: string, accountData: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    console.log('💰 Creating account:', accountData.name);
    
    const accountWithTimestamps = {
      ...accountData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const docRef = await addDoc(collection(db, 'users', userId, 'accounts'), accountWithTimestamps);
    console.log('✅ Account created successfully with ID:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating account:', error);
    throw error;
  }
};

export const getAccountsByUser = async (userId: string): Promise<Account[]> => {
  try {
    console.log('💰 Fetching accounts for user:', userId);
    
    const q = query(
      collection(db, 'users', userId, 'accounts'),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const accounts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Account[];
    
    console.log(`✅ Found ${accounts.length} accounts for user`);
    return accounts;
  } catch (error) {
    console.error('❌ Error getting accounts:', error);
    throw error;
  }
};

// Get all accessible accounts (owned + shared) for a user
export const getAccessibleAccounts = async (userId: string): Promise<Account[]> => {
  try {
    console.log('💰 Fetching accessible accounts for user:', userId);
    
    // Get owned accounts
    const ownedAccounts = await getAccountsByUser(userId);
    console.log(`✅ Found ${ownedAccounts.length} owned accounts`);
    
    // Get shared accounts from sharedProfiles collection
    let sharedAccounts: Account[] = [];
    try {
      const sharedProfilesQuery = query(
        collection(db, 'sharedProfiles'),
        where('sharedWith', 'array-contains', userId)
      );
      
      const sharedProfilesSnapshot = await getDocs(sharedProfilesQuery);
      console.log(`✅ Found ${sharedProfilesSnapshot.docs.length} shared profiles`);
      
      // For each shared profile, get the actual account data
      for (const sharedProfileDoc of sharedProfilesSnapshot.docs) {
        const sharedProfile = sharedProfileDoc.data();
        const accountId = sharedProfile.childProfileId; // Reusing childProfileId field for account ID
        const ownerId = sharedProfile.ownerId;
        
        try {
          // Get the account from the owner's collection
          const accountDoc = await getDoc(doc(db, 'users', ownerId, 'accounts', accountId));
          if (accountDoc.exists()) {
            const accountData = accountDoc.data() as Account;
            const sharedAccount: Account = {
              ...accountData,
              id: accountId,
              // Mark as shared
              sharedWith: [userId],
            };
            sharedAccounts.push(sharedAccount);
          }
        } catch (accountError) {
          console.log(`⚠️ Could not fetch shared account ${accountId}:`, accountError);
        }
      }
    } catch (sharedError) {
      console.log('⚠️ Error fetching shared accounts:', sharedError);
    }
    
    // Combine owned and shared accounts
    const allAccounts = [...ownedAccounts, ...sharedAccounts];
    console.log(`✅ Total accessible accounts: ${allAccounts.length} (${ownedAccounts.length} owned, ${sharedAccounts.length} shared)`);
    
    return allAccounts;
  } catch (error) {
    console.error('❌ Error getting accessible accounts:', error);
    throw error;
  }
};

export const updateAccount = async (accountId: string, accountData: Partial<Account>): Promise<void> => {
  try {
    console.log('💰 Updating account:', accountId);
    
    const updateData = {
      ...accountData,
      updatedAt: Date.now(),
    };
    
    await updateDoc(doc(db, 'users', accountData.ownerId!, 'accounts', accountId), updateData);
    console.log('✅ Account updated successfully');
  } catch (error) {
    console.error('❌ Error updating account:', error);
    throw error;
  }
};

export const deleteAccount = async (accountId: string, userId: string): Promise<void> => {
  try {
    console.log('🗑️ Deleting account:', accountId);
    
    // First, delete all transactions for this account
    const transactions = await getTransactionsByAccount(userId, accountId);
    console.log(`🗑️ Found ${transactions.length} transactions to delete`);
    
    const batch = writeBatch(db);
    
    // Delete all transactions
    for (const transaction of transactions) {
      batch.delete(doc(db, 'users', userId, 'transactions', transaction.id));
    }
    
    // Delete the account
    batch.delete(doc(db, 'users', userId, 'accounts', accountId));
    
    // Commit the batch
    await batch.commit();
    console.log('✅ Account and all transactions deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    throw error;
  }
};

// Account Type Functions
export const getAccountTypes = async (userId: string): Promise<AccountType[]> => {
  try {
    console.log('💰 Fetching account types for user:', userId);
    
    // Get default account types
    const defaultTypes = getDefaultAccountTypes();
    console.log('✅ Default account types:', defaultTypes.map(t => t.name));
    
    // Get custom account types
    let customTypes: AccountType[] = [];
    try {
      const q = query(
        collection(db, 'users', userId, 'accountTypes'),
        where('isCustom', '==', true),
        orderBy('name', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      customTypes = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as AccountType[];
      
      console.log('✅ Custom account types found:', customTypes.map(t => t.name));
    } catch (customError) {
      console.log('⚠️ No custom account types found (this is normal for new users):', customError);
      // Return only default types if custom types query fails
      const allTypes = [...defaultTypes];
      console.log(`✅ Returning ${allTypes.length} account types (${defaultTypes.length} default, 0 custom)`);
      return allTypes;
    }
    
    // Combine default and custom types
    const allTypes = [...defaultTypes, ...customTypes];
    console.log(`✅ Found ${allTypes.length} account types (${defaultTypes.length} default, ${customTypes.length} custom)`);
    
    return allTypes;
  } catch (error) {
    console.error('❌ Error getting account types:', error);
    // Return default types even if there's an error
    console.log('🔄 Falling back to default account types');
    return getDefaultAccountTypes();
  }
};

export const createAccountType = async (userId: string, typeData: Omit<AccountType, 'id'>): Promise<string> => {
  try {
    console.log('💰 Creating account type:', typeData.name);
    
    const typeDataToSave = {
      ...typeData,
      isCustom: true,
      userId,
      createdAt: Date.now(),
    };
    
    const docRef = await addDoc(collection(db, 'users', userId, 'accountTypes'), typeDataToSave);
    console.log('✅ Account type created successfully with ID:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating account type:', error);
    throw error;
  }
};

export const updateAccountType = async (typeId: string, typeData: Partial<AccountType>, userId: string): Promise<void> => {
  try {
    console.log('🔄 Updating account type:', typeId, typeData);
    
    await updateDoc(doc(db, 'users', userId, 'accountTypes', typeId), {
      ...typeData,
      updatedAt: Date.now()
    });
    
    console.log('✅ Account type updated successfully');
  } catch (error) {
    console.error('❌ Error updating account type:', error);
    throw error;
  }
};

export const deleteAccountType = async (typeId: string, userId: string): Promise<void> => {
  try {
    console.log('🗑️ Deleting account type:', typeId);
    
    await deleteDoc(doc(db, 'users', userId, 'accountTypes', typeId));
    
    console.log('✅ Account type deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting account type:', error);
    throw error;
  }
};

// Transaction Functions
export const createTransaction = async (userId: string, transactionData: Omit<Transaction, 'id'>): Promise<string> => {
  try {
    console.log('💰 Creating transaction:', transactionData.description);
    
    const transactionWithTimestamps = {
      ...transactionData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const docRef = await addDoc(collection(db, 'users', userId, 'transactions'), transactionWithTimestamps);
    console.log('✅ Transaction created successfully with ID:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating transaction:', error);
    throw error;
  }
};

// Recalculate account balance based on all transactions
export const recalculateAccountBalance = async (userId: string, accountId: string): Promise<number> => {
  try {
    console.log('🔄 Recalculating balance for account:', accountId);
    
    // Get the account to get initial balance
    const accountDoc = await getDoc(doc(db, 'users', userId, 'accounts', accountId));
    if (!accountDoc.exists()) {
      throw new Error('Account not found');
    }
    
    const account = accountDoc.data() as Account;
    const initialBalance = account.initialBalance;
    
    // Get all transactions for this account
    const transactions = await getTransactionsByAccount(userId, accountId);
    
    // Calculate new balance: initial balance + sum of all transactions
    const newBalance = transactions.reduce((balance, transaction) => {
      return balance + transaction.amount;
    }, initialBalance);
    
    console.log(`✅ Balance recalculated: Initial ${initialBalance} + Transactions ${transactions.reduce((sum, t) => sum + t.amount, 0)} = ${newBalance}`);
    
    return newBalance;
  } catch (error) {
    console.error('❌ Error recalculating account balance:', error);
    throw error;
  }
};

export const getTransactionsByAccount = async (userId: string, accountId: string): Promise<Transaction[]> => {
  try {
    console.log('💰 Fetching transactions for account:', accountId);
    
    const q = query(
      collection(db, 'users', userId, 'transactions'),
      where('accountId', '==', accountId),
      orderBy('date', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    
    console.log(`✅ Found ${transactions.length} transactions for account`);
    return transactions;
  } catch (error) {
    console.error('❌ Error getting transactions:', error);
    throw error;
  }
};

export const updateTransaction = async (transactionId: string, transactionData: Partial<Transaction>, userId: string): Promise<void> => {
  try {
    console.log('💰 Updating transaction:', transactionId);
    
    const updateData = {
      ...transactionData,
      updatedAt: Date.now(),
    };
    
    await updateDoc(doc(db, 'users', userId, 'transactions', transactionId), updateData);
    console.log('✅ Transaction updated successfully');
  } catch (error) {
    console.error('❌ Error updating transaction:', error);
    throw error;
  }
};

export const deleteTransaction = async (transactionId: string, userId: string): Promise<void> => {
  try {
    console.log('💰 Deleting transaction:', transactionId);
    
    await deleteDoc(doc(db, 'users', userId, 'transactions', transactionId));
    console.log('✅ Transaction deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting transaction:', error);
    throw error;
  }
};

// Transaction-Tag Management Functions
export const assignTagsToTransaction = async (transactionId: string, tagIds: string[], userId: string): Promise<void> => {
  try {
    console.log('🏷️ Assigning tags to transaction:', transactionId, tagIds);
    
    await updateDoc(doc(db, 'users', userId, 'transactions', transactionId), {
      tagIds: tagIds,
      updatedAt: Date.now()
    });
    
    console.log('✅ Tags assigned to transaction successfully');
  } catch (error) {
    console.error('❌ Error assigning tags to transaction:', error);
    throw error;
  }
};

export const removeTagsFromTransaction = async (transactionId: string, tagIds: string[], userId: string): Promise<void> => {
  try {
    console.log('🏷️ Removing tags from transaction:', transactionId, tagIds);
    
    // Get current transaction
    const transactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    if (!transactionDoc.exists()) {
      throw new Error('Transaction not found');
    }
    
    const transaction = transactionDoc.data() as Transaction;
    const currentTagIds = transaction.tagIds || [];
    const updatedTagIds = currentTagIds.filter(id => !tagIds.includes(id));
    
    await updateDoc(doc(db, 'users', userId, 'transactions', transactionId), {
      tagIds: updatedTagIds,
      updatedAt: Date.now()
    });
    
    console.log('✅ Tags removed from transaction successfully');
  } catch (error) {
    console.error('❌ Error removing tags from transaction:', error);
    throw error;
  }
};

export const getTransactionTags = async (transactionId: string, userId: string): Promise<Tag[]> => {
  try {
    console.log('🏷️ Getting tags for transaction:', transactionId);
    
    const transactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    if (!transactionDoc.exists()) {
      return [];
    }
    
    const transaction = transactionDoc.data() as Transaction;
    const tagIds = transaction.tagIds || [];
    
    if (tagIds.length === 0) {
      return [];
    }
    
    // Get all tags (default + user tags)
    const userTags = await getTags(userId);
    const defaultTags = getDefaultTags();
    const allTags = [...defaultTags, ...userTags];
    
    // Filter tags that are assigned to this transaction
    const transactionTags = allTags.filter(tag => tagIds.includes(tag.id));
    
    console.log(`✅ Found ${transactionTags.length} tags for transaction`);
    return transactionTags;
  } catch (error) {
    console.error('❌ Error getting transaction tags:', error);
    throw error;
  }
};

export const getTransactionsByTag = async (tagId: string, userId: string): Promise<Transaction[]> => {
  try {
    console.log('🏷️ Getting transactions for tag:', tagId);
    
    const q = query(
      collection(db, 'users', userId, 'transactions'),
      where('tagIds', 'array-contains', tagId)
    );
    
    const querySnapshot = await getDocs(q);
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    
    console.log(`✅ Found ${transactions.length} transactions for tag`);
    return transactions;
  } catch (error) {
    console.error('❌ Error getting transactions by tag:', error);
    throw error;
  }
};

// Tag Functions
export const createTag = async (userId: string, tagData: Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    console.log('🏷️ Creating tag:', tagData.name);
    
    const tagWithTimestamps = {
      ...tagData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const docRef = await addDoc(collection(db, 'users', userId, 'tags'), tagWithTimestamps);
    console.log('✅ Tag created successfully with ID:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating tag:', error);
    throw error;
  }
};

export const getTags = async (userId: string): Promise<Tag[]> => {
  try {
    console.log('🏷️ Fetching tags for user:', userId);
    
    const q = query(
      collection(db, 'users', userId, 'tags'),
      orderBy('level', 'asc'),
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const tags = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Tag[];
    
    console.log(`✅ Found ${tags.length} tags for user`);
    return tags;
  } catch (error) {
    console.error('❌ Error getting tags:', error);
    throw error;
  }
};

export const updateTag = async (tagId: string, updates: Partial<Tag>, userId: string): Promise<void> => {
  try {
    console.log('🔄 Updating tag:', tagId, updates);
    
    await updateDoc(doc(db, 'users', userId, 'tags', tagId), {
      ...updates,
      updatedAt: Date.now()
    });
    
    console.log('✅ Tag updated successfully');
  } catch (error) {
    console.error('❌ Error updating tag:', error);
    throw error;
  }
};

export const deleteTag = async (tagId: string, userId: string): Promise<void> => {
  try {
    console.log('🗑️ Deleting tag:', tagId);
    
    // Check if tag is in use
    const transactionsQuery = query(
      collection(db, 'users', userId, 'transactionTags'),
      where('tagId', '==', tagId)
    );
    const transactionsSnapshot = await getDocs(transactionsQuery);
    
    if (!transactionsSnapshot.empty) {
      throw new Error('Cannot delete tag that is in use by transactions');
    }
    
    // Check for child tags
    const childTagsQuery = query(
      collection(db, 'users', userId, 'tags'),
      where('parentTagId', '==', tagId)
    );
    const childTagsSnapshot = await getDocs(childTagsQuery);
    
    if (!childTagsSnapshot.empty) {
      throw new Error('Cannot delete tag that has child tags');
    }
    
    await deleteDoc(doc(db, 'users', userId, 'tags', tagId));
    console.log('✅ Tag deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting tag:', error);
    throw error;
  }
};

export const getDefaultTags = (): Tag[] => {
  return [
    // Income Tags (Level 0)
    {
      id: 'salary',
      name: 'Salary',
      color: '#10B981', // Green
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'freelance',
      name: 'Freelance',
      color: '#3B82F6', // Blue
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'investment-returns',
      name: 'Investment Returns',
      color: '#8B5CF6', // Purple
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'other-income',
      name: 'Other Income',
      color: '#06B6D4', // Cyan
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Expense Tags - Root Categories (Level 0)
    {
      id: 'housing',
      name: 'Housing',
      color: '#EF4444', // Red
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'transportation',
      name: 'Transportation',
      color: '#F59E0B', // Amber
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'food-dining',
      name: 'Food & Dining',
      color: '#84CC16', // Lime
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'entertainment',
      name: 'Entertainment',
      color: '#EC4899', // Pink
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'healthcare',
      name: 'Healthcare',
      color: '#14B8A6', // Teal
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'shopping',
      name: 'Shopping',
      color: '#F97316', // Orange
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'bills-services',
      name: 'Bills & Services',
      color: '#6B7280', // Gray
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'personal-care',
      name: 'Personal Care',
      color: '#8B5CF6', // Purple
      level: 0,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Housing Subcategories (Level 1)
    {
      id: 'rent-mortgage',
      name: 'Rent/Mortgage',
      color: '#DC2626', // Red-600
      parentTagId: 'housing',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'utilities',
      name: 'Utilities',
      color: '#EA580C', // Orange-600
      parentTagId: 'housing',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'maintenance',
      name: 'Maintenance',
      color: '#D97706', // Amber-600
      parentTagId: 'housing',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'insurance',
      name: 'Insurance',
      color: '#B91C1C', // Red-700
      parentTagId: 'housing',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Transportation Subcategories (Level 1)
    {
      id: 'gas',
      name: 'Gas',
      color: '#D97706', // Amber-600
      parentTagId: 'transportation',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'public-transport',
      name: 'Public Transport',
      color: '#CA8A04', // Yellow-600
      parentTagId: 'transportation',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'car-payment',
      name: 'Car Payment',
      color: '#A16207', // Amber-700
      parentTagId: 'transportation',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'car-maintenance',
      name: 'Car Maintenance',
      color: '#92400E', // Amber-800
      parentTagId: 'transportation',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Food & Dining Subcategories (Level 1)
    {
      id: 'groceries',
      name: 'Groceries',
      color: '#65A30D', // Lime-600
      parentTagId: 'food-dining',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'restaurants',
      name: 'Restaurants',
      color: '#84CC16', // Lime-500
      parentTagId: 'food-dining',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'takeout',
      name: 'Takeout',
      color: '#A3E635', // Lime-400
      parentTagId: 'food-dining',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Entertainment Subcategories (Level 1)
    {
      id: 'movies',
      name: 'Movies',
      color: '#DB2777', // Pink-600
      parentTagId: 'entertainment',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'streaming',
      name: 'Streaming',
      color: '#EC4899', // Pink-500
      parentTagId: 'entertainment',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'hobbies',
      name: 'Hobbies',
      color: '#F472B6', // Pink-400
      parentTagId: 'entertainment',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'travel',
      name: 'Travel',
      color: '#BE185D', // Pink-700
      parentTagId: 'entertainment',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Healthcare Subcategories (Level 1)
    {
      id: 'medical',
      name: 'Medical',
      color: '#0D9488', // Teal-600
      parentTagId: 'healthcare',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'dental',
      name: 'Dental',
      color: '#14B8A6', // Teal-500
      parentTagId: 'healthcare',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'pharmacy',
      name: 'Pharmacy',
      color: '#2DD4BF', // Teal-400
      parentTagId: 'healthcare',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'health-insurance',
      name: 'Health Insurance',
      color: '#0F766E', // Teal-700
      parentTagId: 'healthcare',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Shopping Subcategories (Level 1)
    {
      id: 'clothing',
      name: 'Clothing',
      color: '#EA580C', // Orange-600
      parentTagId: 'shopping',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'electronics',
      name: 'Electronics',
      color: '#F97316', // Orange-500
      parentTagId: 'shopping',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'home-goods',
      name: 'Home Goods',
      color: '#FB923C', // Orange-400
      parentTagId: 'shopping',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Bills & Services Subcategories (Level 1)
    {
      id: 'phone',
      name: 'Phone',
      color: '#4B5563', // Gray-600
      parentTagId: 'bills-services',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'internet',
      name: 'Internet',
      color: '#6B7280', // Gray-500
      parentTagId: 'bills-services',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'subscriptions',
      name: 'Subscriptions',
      color: '#9CA3AF', // Gray-400
      parentTagId: 'bills-services',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Personal Care Subcategories (Level 1)
    {
      id: 'haircuts',
      name: 'Haircuts',
      color: '#7C3AED', // Purple-600
      parentTagId: 'personal-care',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'gym',
      name: 'Gym',
      color: '#8B5CF6', // Purple-500
      parentTagId: 'personal-care',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'beauty',
      name: 'Beauty',
      color: '#A78BFA', // Purple-400
      parentTagId: 'personal-care',
      level: 1,
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
};