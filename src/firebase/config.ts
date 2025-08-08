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
  category: 'family' | 'personal';
  createdAt: number;
  updatedAt: number;
}

export interface TransactionSplit {
  id: string;
  transactionId: string; // Parent transaction
  amount: number;
  description: string;
  tagIds: string[]; // Different tags per split
  createdAt: number;
  updatedAt: number;
}

export interface TransactionLink {
  id: string;
  sourceTransactionId: string;
  targetTransactionId: string;
  linkType: 'transfer' | 'payment' | 'related';
  description?: string;
  userId: string;
  createdAt: number;
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
  isSplit?: boolean; // Whether this transaction has been split
  splitIds?: string[]; // References to TransactionSplit records
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
  category?: string; // Optional grouping for display only
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

export interface Budget {
  id: string;
  name: string;
  month: number; // 1-12
  year: number;
  userId: string;
  isActive: boolean;
  category: 'family' | 'personal';
  createdAt: number;
  updatedAt: number;
}

export interface BudgetItem {
  id: string;
  budgetId: string;
  tagIds: string[]; // Tags included in this budget item
  budgetedAmount: number;
  category: string; // e.g., "Housing", "Food", "Transportation"
  createdAt: number;
  updatedAt: number;
}

export interface DashboardPreferences {
  visibleCards: string[];
  cardOrder: string[];
  theme: 'light' | 'dark';
}

// CSV/Excel Import System
export interface ImportMapping {
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  accountColumn?: string;
  categoryColumn?: string;
}

export interface ImportPreview {
  fileName: string;
  totalRows: number;
  columns: string[];
  sampleData: any[];
  mappings: ImportMapping;
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
    const accounts = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        category: data.category || 'personal' // Default to 'personal' for existing accounts
      };
    }) as Account[];
    
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
              category: accountData.category || 'personal' // Default to 'personal' for existing accounts
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
    
    // Force update account balance after creating transaction
    await forceUpdateAccountBalance(userId, transactionData.accountId);
    
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

// Force update account balance in Firestore
export const forceUpdateAccountBalance = async (userId: string, accountId: string): Promise<void> => {
  try {
    console.log('🔧 Force updating account balance for account:', accountId);
    
    // Recalculate the balance
    const newBalance = await recalculateAccountBalance(userId, accountId);
    
    // Update the account balance in Firestore directly
    // FIX: Use updateDoc directly instead of updateAccount wrapper to avoid ownerId corruption
    await updateDoc(doc(db, 'users', userId, 'accounts', accountId), {
      balance: newBalance,
      updatedAt: Date.now()
    });
    
    console.log(`✅ Account balance force updated to: ${newBalance}`);
  } catch (error) {
    console.error('❌ Error force updating account balance:', error);
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
    
    // Get the account ID from the transaction to update balance
    const transactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    if (transactionDoc.exists()) {
      const transaction = transactionDoc.data() as Transaction;
      // Force update account balance after updating transaction
      await forceUpdateAccountBalance(userId, transaction.accountId);
    }
  } catch (error) {
    console.error('❌ Error updating transaction:', error);
    throw error;
  }
};

export const deleteTransaction = async (transactionId: string, userId: string): Promise<void> => {
  try {
    console.log('💰 Deleting transaction:', transactionId);
    
    // Get the account ID before deleting the transaction
    const transactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    let accountId: string | null = null;
    
    if (transactionDoc.exists()) {
      const transaction = transactionDoc.data() as Transaction;
      accountId = transaction.accountId;
    }
    
    await deleteDoc(doc(db, 'users', userId, 'transactions', transactionId));
    console.log('✅ Transaction deleted successfully');
    
    // Force update account balance after deleting transaction
    if (accountId) {
      await forceUpdateAccountBalance(userId, accountId);
    }
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
    
    // Get all tags (default + user tags) with deduplication
    const userTags = await getTags(userId);
    const defaultTags = getDefaultTags();
    
    // Create a map to deduplicate tags by ID (user tags take precedence)
    const tagMap = new Map();
    defaultTags.forEach(tag => tagMap.set(tag.id, tag));
    userTags.forEach(tag => tagMap.set(tag.id, tag));
    const allTags = Array.from(tagMap.values());
    
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
    console.log('🏷️ Creating tag:', tagData.name, 'for user:', userId);
    console.log('📁 Saving to path: users/', userId, '/tags');
    console.log('📄 Tag data:', tagData);
    
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
    
    // Get user-created tags
    let userTags: Tag[] = [];
    try {
      const q = query(
        collection(db, 'users', userId, 'tags'),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      userTags = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Tag[];
      
      console.log(`✅ Found ${userTags.length} user-created tags`);
    } catch (error) {
      console.log('⚠️ No user-created tags found (this is normal for new users)');
    }
    
    // Get deleted default tags to filter them out
    let deletedDefaultTags: string[] = [];
    try {
      const deletedTagsQuery = query(collection(db, 'users', userId, 'deletedTags'));
      const deletedTagsSnapshot = await getDocs(deletedTagsQuery);
      deletedDefaultTags = deletedTagsSnapshot.docs.map(doc => doc.data().tagId);
      console.log(`✅ Found ${deletedDefaultTags.length} deleted default tags to filter out`);
    } catch (error) {
      console.log('⚠️ No deleted tags found (this is normal)');
    }
    
    // Get default tags and filter out deleted ones
    const defaultTags = getDefaultTags().filter(tag => !deletedDefaultTags.includes(tag.id));
    console.log(`✅ Found ${defaultTags.length} available default tags`);
    
    // Combine user tags and available default tags
    const allTags = [...userTags, ...defaultTags];
    console.log(`✅ Total tags: ${allTags.length} (${userTags.length} user + ${defaultTags.length} default)`);
    
    return allTags;
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
    console.log('🗑️ Deleting tag:', tagId, 'for user:', userId);
    
    // Check if tag is in use by transactions
    const transactionsQuery = query(
      collection(db, 'users', userId, 'transactions'),
      where('tagIds', 'array-contains', tagId)
    );
    const transactionsSnapshot = await getDocs(transactionsQuery);
    
    if (!transactionsSnapshot.empty) {
      throw new Error('Cannot delete tag that is in use by transactions');
    }
    
    // Check if tag exists in user's tags collection
    const tagDoc = await getDoc(doc(db, 'users', userId, 'tags', tagId));
    if (tagDoc.exists()) {
      // User-created tag - delete from database
      await deleteDoc(doc(db, 'users', userId, 'tags', tagId));
      console.log('✅ User-created tag deleted successfully from database');
    } else {
      // Default tag - create a "deleted" record to hide it from UI
      console.log('🗑️ Hiding default tag from UI:', tagId);
      await setDoc(doc(db, 'users', userId, 'deletedTags', tagId), {
        tagId,
        userId,
        deletedAt: Date.now()
      });
      console.log('✅ Default tag hidden from UI');
    }
  } catch (error) {
    console.error('❌ Error deleting tag:', error);
    throw error;
  }
};

// Category management functions
export const getDefaultCategories = (): string[] => {
  return [
    'income',
    'housing',
    'transportation', 
    'food-dining',
    'entertainment',
    'healthcare',
    'shopping',
    'bills-services',
    'personal-care'
  ];
};

export const getUserCategories = async (userId: string): Promise<string[]> => {
  try {
    console.log('📂 Fetching user categories for user:', userId);
    
    // Get default categories
    const defaultCategories = getDefaultCategories();
    
    // Get user custom categories (if we implement this in the future)
    let customCategories: string[] = [];
    try {
      const categoriesQuery = query(collection(db, 'users', userId, 'categories'));
      const categoriesSnapshot = await getDocs(categoriesQuery);
      customCategories = categoriesSnapshot.docs.map(doc => doc.data().name);
      console.log(`✅ Found ${customCategories.length} custom categories`);
    } catch (error) {
      console.log('⚠️ No custom categories found (this is normal)');
    }
    
    // Combine default and custom categories
    const allCategories = [...defaultCategories, ...customCategories];
    console.log(`✅ Total categories: ${allCategories.length}`);
    
    return allCategories;
  } catch (error) {
    console.error('❌ Error getting user categories:', error);
    return getDefaultCategories();
  }
};

export const deleteCategory = async (categoryName: string, userId: string): Promise<void> => {
  try {
    console.log('🗑️ Deleting category:', categoryName, 'for user:', userId);
    
    // Check if category is in use by tags
    const tagsQuery = query(
      collection(db, 'users', userId, 'tags'),
      where('category', '==', categoryName)
    );
    const tagsSnapshot = await getDocs(tagsQuery);
    
    if (!tagsSnapshot.empty) {
      throw new Error(`Cannot delete category "${categoryName}" that is in use by ${tagsSnapshot.size} tags`);
    }
    
    // For now, we'll just log the deletion since categories are predefined
    // In the future, we could store custom categories in Firestore
    console.log(`✅ Category "${categoryName}" marked for deletion`);
  } catch (error) {
    console.error('❌ Error deleting category:', error);
    throw error;
  }
};

// Bulk operations functions
export const bulkAssignTags = async (
  transactionIds: string[], 
  tagIds: string[], 
  userId: string,
  mode: 'add' | 'replace' = 'add'
): Promise<void> => {
  try {
    console.log('🔄 Bulk assigning tags:', {
      transactionIds,
      tagIds,
      mode,
      userId
    });
    
    const batch = writeBatch(db);
    
    for (const transactionId of transactionIds) {
      const transactionRef = doc(db, 'users', userId, 'transactions', transactionId);
      
      if (mode === 'replace') {
        // Replace existing tags
        batch.update(transactionRef, {
          tagIds,
          updatedAt: Date.now()
        });
      } else {
        // Add to existing tags (avoid duplicates)
        const transactionDoc = await getDoc(transactionRef);
        if (transactionDoc.exists()) {
          const transaction = transactionDoc.data() as Transaction;
          const existingTagIds = transaction.tagIds || [];
          const newTagIds = [...new Set([...existingTagIds, ...tagIds])]; // Remove duplicates
          
          batch.update(transactionRef, {
            tagIds: newTagIds,
            updatedAt: Date.now()
          });
        }
      }
    }
    
    await batch.commit();
    console.log('✅ Bulk tag assignment completed');
  } catch (error) {
    console.error('❌ Error bulk assigning tags:', error);
    throw error;
  }
};

export const bulkRemoveTags = async (
  transactionIds: string[], 
  tagIds: string[], 
  userId: string
): Promise<void> => {
  try {
    console.log('🔄 Bulk removing tags:', {
      transactionIds,
      tagIds,
      userId
    });
    
    const batch = writeBatch(db);
    
    for (const transactionId of transactionIds) {
      const transactionRef = doc(db, 'users', userId, 'transactions', transactionId);
      const transactionDoc = await getDoc(transactionRef);
      
      if (transactionDoc.exists()) {
        const transaction = transactionDoc.data() as Transaction;
        const existingTagIds = transaction.tagIds || [];
        const newTagIds = existingTagIds.filter(id => !tagIds.includes(id));
        
        batch.update(transactionRef, {
          tagIds: newTagIds,
          updatedAt: Date.now()
        });
      }
    }
    
    await batch.commit();
    console.log('✅ Bulk tag removal completed');
  } catch (error) {
    console.error('❌ Error bulk removing tags:', error);
    throw error;
  }
};

export const bulkDeleteTransactions = async (
  transactionIds: string[], 
  userId: string
): Promise<void> => {
  try {
    console.log('🗑️ Bulk deleting transactions:', {
      transactionIds,
      userId
    });
    
    const batch = writeBatch(db);
    
    for (const transactionId of transactionIds) {
      const transactionRef = doc(db, 'users', userId, 'transactions', transactionId);
      batch.delete(transactionRef);
    }
    
    await batch.commit();
    console.log('✅ Bulk transaction deletion completed');
  } catch (error) {
    console.error('❌ Error bulk deleting transactions:', error);
    throw error;
  }
};

// Smart tag suggestions based on transaction description and amount
export const getSuggestedTags = async (
  description: string, 
  amount: number, 
  userId: string
): Promise<Tag[]> => {
  try {
    console.log('🤖 Getting tag suggestions for:', { description, amount });
    
    const allTags = await getTags(userId);
    const suggestions: Tag[] = [];
    
    const lowerDescription = description.toLowerCase();
    
    // Description-based suggestions
    const descriptionPatterns = [
      { pattern: /mcdonald|burger|kfc|subway|pizza|restaurant|cafe|coffee/, tags: ['Restaurants', 'Food & Dining'] },
      { pattern: /shell|exxon|bp|gas|fuel|petrol/, tags: ['Gas', 'Transportation'] },
      { pattern: /netflix|spotify|hulu|disney|streaming/, tags: ['Streaming', 'Entertainment'] },
      { pattern: /salary|payroll|income|bonus/, tags: ['Salary', 'Income'] },
      { pattern: /amazon|walmart|target|shopping/, tags: ['Shopping', 'Online Shopping'] },
      { pattern: /uber|lyft|taxi|transport/, tags: ['Transportation', 'Ride Share'] },
      { pattern: /gym|fitness|workout/, tags: ['Fitness', 'Personal Care'] },
      { pattern: /doctor|hospital|medical|pharmacy/, tags: ['Healthcare', 'Medical'] },
      { pattern: /electric|water|gas|utility/, tags: ['Utilities', 'Bills & Services'] },
      { pattern: /rent|mortgage|housing/, tags: ['Housing', 'Rent'] }
    ];
    
    for (const pattern of descriptionPatterns) {
      if (pattern.pattern.test(lowerDescription)) {
        const matchingTags = allTags.filter(tag => 
          pattern.tags.some(suggestion => 
            tag.name.toLowerCase().includes(suggestion.toLowerCase())
          )
        );
        suggestions.push(...matchingTags);
      }
    }
    
    // Amount-based suggestions
    if (amount > 0) {
      // Income suggestions
      const incomeTags = allTags.filter(tag => 
        tag.category === 'income' || 
        tag.name.toLowerCase().includes('salary') ||
        tag.name.toLowerCase().includes('income')
      );
      suggestions.push(...incomeTags);
    } else {
      // Expense suggestions based on amount ranges
      if (Math.abs(amount) > 1000) {
        // Large expenses - suggest housing, major purchases
        const largeExpenseTags = allTags.filter(tag => 
          tag.category === 'housing' || 
          tag.name.toLowerCase().includes('rent') ||
          tag.name.toLowerCase().includes('mortgage')
        );
        suggestions.push(...largeExpenseTags);
      } else if (Math.abs(amount) > 100) {
        // Medium expenses - suggest bills, services
        const mediumExpenseTags = allTags.filter(tag => 
          tag.category === 'bills-services' || 
          tag.name.toLowerCase().includes('utility') ||
          tag.name.toLowerCase().includes('service')
        );
        suggestions.push(...mediumExpenseTags);
      }
    }
    
    // Remove duplicates
    const uniqueSuggestions = suggestions.filter((tag, index, self) => 
      index === self.findIndex(t => t.id === tag.id)
    );
    
    console.log('✅ Tag suggestions:', uniqueSuggestions.map(t => t.name));
    return uniqueSuggestions.slice(0, 5); // Return top 5 suggestions
  } catch (error) {
    console.error('❌ Error getting tag suggestions:', error);
    return [];
  }
};

export const getDefaultTags = (): Tag[] => {
  return [
    // Income Tags
    {
      id: 'salary',
      name: 'Salary',
      color: '#10B981', // Green
      category: 'income',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'freelance',
      name: 'Freelance',
      color: '#3B82F6', // Blue
      category: 'income',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'investment-returns',
      name: 'Investment Returns',
      color: '#8B5CF6', // Purple
      category: 'income',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'other-income',
      name: 'Other Income',
      color: '#06B6D4', // Cyan
      category: 'income',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Housing Tags
    {
      id: 'housing',
      name: 'Housing',
      color: '#EF4444', // Red
      category: 'housing',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'rent-mortgage',
      name: 'Rent/Mortgage',
      color: '#DC2626', // Red-600
      category: 'housing',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'utilities',
      name: 'Utilities',
      color: '#EA580C', // Orange-600
      category: 'housing',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'maintenance',
      name: 'Maintenance',
      color: '#D97706', // Amber-600
      category: 'housing',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'insurance',
      name: 'Insurance',
      color: '#B91C1C', // Red-700
      category: 'housing',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Transportation Tags
    {
      id: 'transportation',
      name: 'Transportation',
      color: '#F59E0B', // Amber
      category: 'transportation',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'gas',
      name: 'Gas',
      color: '#D97706', // Amber-600
      category: 'transportation',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'public-transport',
      name: 'Public Transport',
      color: '#CA8A04', // Yellow-600
      category: 'transportation',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'car-payment',
      name: 'Car Payment',
      color: '#A16207', // Amber-700
      category: 'transportation',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'car-maintenance',
      name: 'Car Maintenance',
      color: '#92400E', // Amber-800
      category: 'transportation',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Food & Dining Tags
    {
      id: 'food-dining',
      name: 'Food & Dining',
      color: '#84CC16', // Lime
      category: 'food-dining',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'groceries',
      name: 'Groceries',
      color: '#65A30D', // Lime-600
      category: 'food-dining',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'restaurants',
      name: 'Restaurants',
      color: '#4D7C0F', // Lime-700
      category: 'food-dining',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'takeout',
      name: 'Takeout',
      color: '#3F6212', // Lime-800
      category: 'food-dining',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Entertainment Tags
    {
      id: 'entertainment',
      name: 'Entertainment',
      color: '#EC4899', // Pink
      category: 'entertainment',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'movies',
      name: 'Movies',
      color: '#F472B6', // Pink-400
      category: 'entertainment',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'streaming',
      name: 'Streaming',
      color: '#F9A8D4', // Pink-300
      category: 'entertainment',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'hobbies',
      name: 'Hobbies',
      color: '#F472B6', // Pink-400
      category: 'entertainment',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'travel',
      name: 'Travel',
      color: '#BE185D', // Pink-700
      category: 'entertainment',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Healthcare Tags
    {
      id: 'healthcare',
      name: 'Healthcare',
      color: '#14B8A6', // Teal
      category: 'healthcare',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'medical',
      name: 'Medical',
      color: '#0D9488', // Teal-600
      category: 'healthcare',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'dental',
      name: 'Dental',
      color: '#14B8A6', // Teal-500
      category: 'healthcare',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'pharmacy',
      name: 'Pharmacy',
      color: '#2DD4BF', // Teal-400
      category: 'healthcare',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'health-insurance',
      name: 'Health Insurance',
      color: '#0F766E', // Teal-700
      category: 'healthcare',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Shopping Tags
    {
      id: 'shopping',
      name: 'Shopping',
      color: '#F97316', // Orange
      category: 'shopping',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'clothing',
      name: 'Clothing',
      color: '#EA580C', // Orange-600
      category: 'shopping',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'electronics',
      name: 'Electronics',
      color: '#F97316', // Orange-500
      category: 'shopping',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'home-goods',
      name: 'Home Goods',
      color: '#FB923C', // Orange-400
      category: 'shopping',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Bills & Services Tags
    {
      id: 'bills-services',
      name: 'Bills & Services',
      color: '#6B7280', // Gray
      category: 'bills-services',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'phone',
      name: 'Phone',
      color: '#4B5563', // Gray-600
      category: 'bills-services',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'internet',
      name: 'Internet',
      color: '#6B7280', // Gray-500
      category: 'bills-services',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'subscriptions',
      name: 'Subscriptions',
      color: '#9CA3AF', // Gray-400
      category: 'bills-services',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    
    // Personal Care Tags
    {
      id: 'personal-care',
      name: 'Personal Care',
      color: '#8B5CF6', // Purple
      category: 'personal-care',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'haircuts',
      name: 'Haircuts',
      color: '#7C3AED', // Violet-600
      category: 'personal-care',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'gym',
      name: 'Gym',
      color: '#8B5CF6', // Violet-500
      category: 'personal-care',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'beauty',
      name: 'Beauty',
      color: '#A78BFA', // Violet-400
      category: 'personal-care',
      userId: 'system',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
};

// Transaction Split Management Functions
export const createTransactionSplit = async (
  userId: string, 
  splitData: Omit<TransactionSplit, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    console.log('🔧 Creating transaction split:', splitData);
    const splitDoc = {
      ...splitData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const docRef = await addDoc(
      collection(db, 'users', userId, 'transactionSplits'),
      splitDoc
    );
    
    console.log('✅ Transaction split created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating transaction split:', error);
    throw error;
  }
};

export const getTransactionSplits = async (
  transactionId: string, 
  userId: string
): Promise<TransactionSplit[]> => {
  try {
    console.log('🔧 Getting splits for transaction:', transactionId);
    const splitsQuery = query(
      collection(db, 'users', userId, 'transactionSplits'),
      where('transactionId', '==', transactionId),
      orderBy('createdAt', 'asc')
    );
    
    const splitsSnapshot = await getDocs(splitsQuery);
    const splits: TransactionSplit[] = [];
    
    splitsSnapshot.forEach((doc) => {
      splits.push({ id: doc.id, ...doc.data() } as TransactionSplit);
    });
    
    console.log(`✅ Found ${splits.length} splits for transaction ${transactionId}`);
    return splits;
  } catch (error) {
    console.error('❌ Error getting transaction splits:', error);
    throw error;
  }
};

export const updateTransactionSplit = async (
  splitId: string, 
  updates: Partial<TransactionSplit>, 
  userId: string
): Promise<void> => {
  try {
    console.log('🔧 Updating transaction split:', splitId, updates);
    await updateDoc(
      doc(db, 'users', userId, 'transactionSplits', splitId),
      {
        ...updates,
        updatedAt: Date.now()
      }
    );
    console.log('✅ Transaction split updated successfully');
  } catch (error) {
    console.error('❌ Error updating transaction split:', error);
    throw error;
  }
};

export const deleteTransactionSplit = async (
  splitId: string, 
  userId: string
): Promise<void> => {
  try {
    console.log('🔧 Deleting transaction split:', splitId);
    await deleteDoc(doc(db, 'users', userId, 'transactionSplits', splitId));
    console.log('✅ Transaction split deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting transaction split:', error);
    throw error;
  }
};

export const splitTransaction = async (
  transactionId: string, 
  splits: Omit<TransactionSplit, 'id' | 'transactionId' | 'createdAt' | 'updatedAt'>[], 
  userId: string
): Promise<void> => {
  try {
    console.log('🔧 Splitting transaction:', transactionId, 'into', splits.length, 'parts');
    
    // Validate that splits sum to original transaction amount
    const originalTransaction = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    if (!originalTransaction.exists()) {
      throw new Error('Original transaction not found');
    }
    
    const originalAmount = originalTransaction.data().amount;
    const splitSum = splits.reduce((sum, split) => sum + split.amount, 0);
    
    if (Math.abs(splitSum - originalAmount) > 0.01) {
      throw new Error(`Split amounts (${splitSum}) must equal original amount (${originalAmount})`);
    }
    
    // Create all splits in a batch
    const batch = writeBatch(db);
    const splitIds: string[] = [];
    
    for (const splitData of splits) {
      const splitDoc = {
        transactionId,
        ...splitData,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const splitRef = doc(collection(db, 'users', userId, 'transactionSplits'));
      batch.set(splitRef, splitDoc);
      splitIds.push(splitRef.id);
    }
    
    // Update the original transaction to mark it as split
    batch.update(
      doc(db, 'users', userId, 'transactions', transactionId),
      {
        isSplit: true,
        splitIds,
        updatedAt: Date.now()
      }
    );
    
    // Commit the batch
    await batch.commit();
    
    console.log('✅ Transaction split successfully into', splits.length, 'parts');
  } catch (error) {
    console.error('❌ Error splitting transaction:', error);
    throw error;
  }
};

export const mergeTransactionSplits = async (
  transactionId: string, 
  userId: string
): Promise<void> => {
  try {
    console.log('🔧 Merging splits for transaction:', transactionId);
    
    // Get all splits for this transaction
    const splits = await getTransactionSplits(transactionId, userId);
    
    // Delete all splits
    const batch = writeBatch(db);
    splits.forEach(split => {
      batch.delete(doc(db, 'users', userId, 'transactionSplits', split.id));
    });
    
    // Update the original transaction to remove split status
    batch.update(
      doc(db, 'users', userId, 'transactions', transactionId),
      {
        isSplit: false,
        splitIds: [],
        updatedAt: Date.now()
      }
    );
    
    // Commit the batch
    await batch.commit();
    
    console.log('✅ Transaction splits merged successfully');
  } catch (error) {
    console.error('❌ Error merging transaction splits:', error);
    throw error;
  }
};

// Transaction Linking Functions
export const createTransactionLink = async (
  userId: string, 
  linkData: Omit<TransactionLink, 'id' | 'createdAt'>
): Promise<string> => {
  try {
    console.log('🔗 Creating transaction link:', linkData);
    
    // Validate that both transactions exist
    const sourceTransaction = await getDoc(doc(db, 'users', userId, 'transactions', linkData.sourceTransactionId));
    const targetTransaction = await getDoc(doc(db, 'users', userId, 'transactions', linkData.targetTransactionId));
    
    if (!sourceTransaction.exists()) {
      throw new Error('Source transaction not found');
    }
    if (!targetTransaction.exists()) {
      throw new Error('Target transaction not found');
    }
    
    // Check if link already exists
    const existingLinkQuery = query(
      collection(db, 'users', userId, 'transactionLinks'),
      where('sourceTransactionId', '==', linkData.sourceTransactionId),
      where('targetTransactionId', '==', linkData.targetTransactionId)
    );
    const existingLinkSnapshot = await getDocs(existingLinkQuery);
    
    if (!existingLinkSnapshot.empty) {
      throw new Error('Transaction link already exists');
    }
    
    const cleanLinkData: any = {
      sourceTransactionId: linkData.sourceTransactionId,
      targetTransactionId: linkData.targetTransactionId,
      linkType: linkData.linkType,
      userId: linkData.userId,
      createdAt: Date.now()
    };

    // Only add description if it exists and is not empty
    if (linkData.description && linkData.description.trim()) {
      cleanLinkData.description = linkData.description.trim();
    }

    const linkDoc = cleanLinkData;
    
    const docRef = await addDoc(
      collection(db, 'users', userId, 'transactionLinks'),
      linkDoc
    );
    
    console.log('✅ Transaction link created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating transaction link:', error);
    throw error;
  }
};

export const getLinkedTransactions = async (
  transactionId: string, 
  userId: string
): Promise<{ link: TransactionLink; transaction: Transaction }[]> => {
  try {
    console.log('🔗 Getting linked transactions for:', transactionId);
    
    // Get all links where this transaction is source or target
    const linksQuery = query(
      collection(db, 'users', userId, 'transactionLinks'),
      where('sourceTransactionId', '==', transactionId)
    );
    const linksSnapshot = await getDocs(linksQuery);
    
    const linkedTransactions: { link: TransactionLink; transaction: Transaction }[] = [];
    
    for (const linkDoc of linksSnapshot.docs) {
      const link = { id: linkDoc.id, ...linkDoc.data() } as TransactionLink;
      
      // Get the target transaction
      const targetTransactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', link.targetTransactionId));
      if (targetTransactionDoc.exists()) {
        const transaction = { id: targetTransactionDoc.id, ...targetTransactionDoc.data() } as Transaction;
        linkedTransactions.push({ link, transaction });
      }
    }
    
    // Also check for links where this transaction is the target
    const reverseLinksQuery = query(
      collection(db, 'users', userId, 'transactionLinks'),
      where('targetTransactionId', '==', transactionId)
    );
    const reverseLinksSnapshot = await getDocs(reverseLinksQuery);
    
    for (const linkDoc of reverseLinksSnapshot.docs) {
      const link = { id: linkDoc.id, ...linkDoc.data() } as TransactionLink;
      
      // Get the source transaction
      const sourceTransactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', link.sourceTransactionId));
      if (sourceTransactionDoc.exists()) {
        const transaction = { id: sourceTransactionDoc.id, ...sourceTransactionDoc.data() } as Transaction;
        linkedTransactions.push({ link, transaction });
      }
    }
    
    console.log(`✅ Found ${linkedTransactions.length} linked transactions`);
    return linkedTransactions;
  } catch (error) {
    console.error('❌ Error getting linked transactions:', error);
    throw error;
  }
};

export const deleteTransactionLink = async (
  linkId: string, 
  userId: string
): Promise<void> => {
  try {
    console.log('🔗 Deleting transaction link:', linkId);
    await deleteDoc(doc(db, 'users', userId, 'transactionLinks', linkId));
    console.log('✅ Transaction link deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting transaction link:', error);
    throw error;
  }
};

export const suggestTransactionLinks = async (
  transactionId: string, 
  userId: string
): Promise<Transaction[]> => {
  try {
    console.log('🔗 Suggesting transaction links for:', transactionId);
    
    // Get the source transaction
    const sourceTransactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    if (!sourceTransactionDoc.exists()) {
      throw new Error('Source transaction not found');
    }
    
    const sourceTransaction = { id: sourceTransactionDoc.id, ...sourceTransactionDoc.data() } as Transaction;
    
    // Get all other transactions for the user
    const allTransactionsQuery = query(
      collection(db, 'users', userId, 'transactions'),
      where('id', '!=', transactionId)
    );
    const allTransactionsSnapshot = await getDocs(allTransactionsQuery);
    
    const allTransactions = allTransactionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    // Get existing links to exclude already linked transactions
    const existingLinks = await getLinkedTransactions(transactionId, userId);
    const linkedTransactionIds = new Set(existingLinks.map(lt => lt.transaction.id));
    
    // Filter out already linked transactions
    const unlinkedTransactions = allTransactions.filter(t => !linkedTransactionIds.has(t.id));
    
    // Score transactions based on similarity
    const scoredTransactions = unlinkedTransactions.map(transaction => {
      let score = 0;
      
      // Amount matching (exact or opposite)
      if (Math.abs(transaction.amount) === Math.abs(sourceTransaction.amount)) {
        score += 50; // High score for exact amount match
      } else if (Math.abs(transaction.amount - sourceTransaction.amount) < 0.01) {
        score += 30; // Good score for very close amounts
      }
      
      // Date proximity (within 3 days)
      const sourceDate = new Date(sourceTransaction.date);
      const targetDate = new Date(transaction.date);
      const daysDiff = Math.abs(sourceDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff <= 1) {
        score += 40; // High score for same day
      } else if (daysDiff <= 3) {
        score += 20; // Medium score for within 3 days
      } else if (daysDiff <= 7) {
        score += 10; // Low score for within a week
      }
      
      // Description similarity
      const sourceDesc = sourceTransaction.description.toLowerCase();
      const targetDesc = transaction.description.toLowerCase();
      
      if (sourceDesc.includes('transfer') && targetDesc.includes('transfer')) {
        score += 30;
      }
      if (sourceDesc.includes('payment') && targetDesc.includes('payment')) {
        score += 25;
      }
      if (sourceDesc.includes('loan') && targetDesc.includes('loan')) {
        score += 25;
      }
      
      // Account type matching (transfers between different accounts)
      if (transaction.accountId !== sourceTransaction.accountId) {
        score += 15; // Bonus for cross-account transactions
      }
      
      return { transaction, score };
    });
    
    // Sort by score and return top 10 suggestions
    const suggestions = scoredTransactions
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.transaction);
    
    console.log(`✅ Found ${suggestions.length} transaction link suggestions`);
    return suggestions;
  } catch (error) {
    console.error('❌ Error suggesting transaction links:', error);
    throw error;
  }
};

// ============================================================================
// BUDGET FUNCTIONS
// ============================================================================

export const createBudget = async (userId: string, budgetData: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    console.log('💰 Creating budget:', budgetData);
    
    const budgetDoc = {
      ...budgetData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const docRef = await addDoc(collection(db, 'users', userId, 'budgets'), budgetDoc);
    console.log('✅ Budget created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating budget:', error);
    throw error;
  }
};

export const getBudgets = async (userId: string): Promise<(Budget & { id: string })[]> => {
  try {
    console.log('💰 Loading budgets for user:', userId);
    
    const budgetsQuery = query(
      collection(db, 'users', userId, 'budgets'),
      orderBy('year', 'desc'),
      orderBy('month', 'desc')
    );
    const budgetsSnapshot = await getDocs(budgetsQuery);
    
    const budgets = budgetsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        category: data.category || 'personal' // Default to 'personal' for existing budgets
      };
    }) as (Budget & { id: string })[];
    
    console.log(`✅ Loaded ${budgets.length} budgets`);
    return budgets;
  } catch (error) {
    console.error('❌ Error loading budgets:', error);
    throw error;
  }
};

export const createBudgetItem = async (userId: string, budgetItemData: Omit<BudgetItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    console.log('💰 Creating budget item:', budgetItemData);
    
    const budgetItemDoc = {
      ...budgetItemData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const docRef = await addDoc(collection(db, 'users', userId, 'budgetItems'), budgetItemDoc);
    console.log('✅ Budget item created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating budget item:', error);
    throw error;
  }
};

export const getBudgetItems = async (budgetId: string, userId: string): Promise<(BudgetItem & { id: string })[]> => {
  try {
    console.log('💰 Loading budget items for budget:', budgetId);
    
    const budgetItemsQuery = query(
      collection(db, 'users', userId, 'budgetItems'),
      where('budgetId', '==', budgetId),
      orderBy('category')
    );
    const budgetItemsSnapshot = await getDocs(budgetItemsQuery);
    
    const budgetItems = budgetItemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as (BudgetItem & { id: string })[];
    
    console.log(`✅ Loaded ${budgetItems.length} budget items`);
    return budgetItems;
  } catch (error) {
    console.error('❌ Error loading budget items:', error);
    throw error;
  }
};

export const updateBudgetItem = async (budgetItemId: string, updates: Partial<BudgetItem>, userId: string): Promise<void> => {
  try {
    console.log('💰 Updating budget item:', budgetItemId, updates);
    
    const budgetItemRef = doc(db, 'users', userId, 'budgetItems', budgetItemId);
    await updateDoc(budgetItemRef, {
      ...updates,
      updatedAt: Date.now()
    });
    
    console.log('✅ Budget item updated successfully');
  } catch (error) {
    console.error('❌ Error updating budget item:', error);
    throw error;
  }
};

export const deleteBudgetItem = async (budgetItemId: string, userId: string): Promise<void> => {
  try {
    console.log('💰 Deleting budget item:', budgetItemId);
    
    const budgetItemRef = doc(db, 'users', userId, 'budgetItems', budgetItemId);
    await deleteDoc(budgetItemRef);
    
    console.log('✅ Budget item deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting budget item:', error);
    throw error;
  }
};

export const getBudgetVsActual = async (budgetId: string, userId: string): Promise<{
  budgetItems: (BudgetItem & { id: string; actualSpent: number; remaining: number; percentageUsed: number })[];
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  overallPercentageUsed: number;
}> => {
  try {
    console.log('💰 Calculating budget vs actual for budget:', budgetId);
    
    // Get budget items
    const budgetItems = await getBudgetItems(budgetId, userId);
    
    // Get budget details
    const budgetQuery = query(
      collection(db, 'users', userId, 'budgets'),
      where('__name__', '==', budgetId)
    );
    const budgetSnapshot = await getDocs(budgetQuery);
    const budget = budgetSnapshot.docs[0]?.data() as Budget;
    
    if (!budget) {
      throw new Error('Budget not found');
    }
    
    // Get all transactions for the month/year
    const startDate = new Date(budget.year, budget.month - 1, 1);
    const endDate = new Date(budget.year, budget.month, 0);
    
    const transactionsQuery = query(
      collection(db, 'users', userId, 'transactions'),
      where('date', '>=', startDate.toISOString().split('T')[0]),
      where('date', '<=', endDate.toISOString().split('T')[0])
    );
    const transactionsSnapshot = await getDocs(transactionsQuery);
    const transactions = transactionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    // Calculate actual spending for each budget item
    const budgetItemsWithActual = await Promise.all(
      budgetItems.map(async (budgetItem) => {
        // Get transactions that match the budget item's tags
        const matchingTransactions = transactions.filter(transaction => {
          const transactionTags = transaction.tagIds || [];
          return budgetItem.tagIds.some(tagId => transactionTags.includes(tagId));
        });
        
        // Calculate actual spent (only negative amounts for expenses)
        const actualSpent = Math.abs(
          matchingTransactions
            .filter(t => t.amount < 0) // Only expenses
            .reduce((sum, t) => sum + t.amount, 0)
        );
        
        const remaining = Math.max(0, budgetItem.budgetedAmount - actualSpent);
        const percentageUsed = budgetItem.budgetedAmount > 0 
          ? (actualSpent / budgetItem.budgetedAmount) * 100 
          : 0;
        
        return {
          ...budgetItem,
          actualSpent,
          remaining,
          percentageUsed
        };
      })
    );
    
    // Calculate totals
    const totalBudgeted = budgetItems.reduce((sum, item) => sum + item.budgetedAmount, 0);
    const totalSpent = budgetItemsWithActual.reduce((sum, item) => sum + item.actualSpent, 0);
    const totalRemaining = Math.max(0, totalBudgeted - totalSpent);
    const overallPercentageUsed = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    
    console.log('✅ Budget vs actual calculation completed');
    
    return {
      budgetItems: budgetItemsWithActual,
      totalBudgeted,
      totalSpent,
      totalRemaining,
      overallPercentageUsed
    };
  } catch (error) {
    console.error('❌ Error calculating budget vs actual:', error);
    throw error;
  }
};

// ============================================================================
// DASHBOARD PREFERENCES FUNCTIONS
// ============================================================================

export const getDashboardPreferences = async (userId: string): Promise<DashboardPreferences> => {
  try {
    console.log('🎛️ Loading dashboard preferences for user:', userId);
    console.log('🎛️ Firebase db object:', db);
    
    if (!db) {
      console.error('❌ Firebase db is not initialized');
      throw new Error('Firebase database is not initialized');
    }
    
    const preferencesDoc = await getDoc(doc(db, 'users', userId, 'preferences', 'dashboard'));
    console.log('🎛️ Preferences doc exists:', preferencesDoc.exists());
    
    if (preferencesDoc.exists()) {
      const preferences = preferencesDoc.data() as DashboardPreferences;
      console.log('✅ Loaded existing dashboard preferences:', preferences);
      return preferences;
    } else {
      // Return default preferences
      const defaultPreferences: DashboardPreferences = {
        visibleCards: ['familyAccounts', 'familyBudget', 'familyInvestments', 'familyCommitments', 'personalAccounts', 'personalBudget', 'personalInvestments', 'personalCommitments', 'taskManager', 'shoppingLists', 'homeMaintenance', 'familyCalendar', 'growthTracker', 'cloudStorage', 'medicalRecords', 'schoolActivities'],
        cardOrder: ['familyAccounts', 'familyBudget', 'familyInvestments', 'familyCommitments', 'personalAccounts', 'personalBudget', 'personalInvestments', 'personalCommitments', 'taskManager', 'shoppingLists', 'homeMaintenance', 'familyCalendar', 'growthTracker', 'cloudStorage', 'medicalRecords', 'schoolActivities'],
        theme: 'light'
      };
      
      console.log('✅ Created default dashboard preferences:', defaultPreferences);
      return defaultPreferences;
    }
  } catch (error) {
    console.error('❌ Error loading dashboard preferences:', error);
    throw error;
  }
};

export const saveDashboardPreferences = async (userId: string, preferences: Partial<DashboardPreferences>): Promise<void> => {
  try {
    console.log('🎛️ Saving dashboard preferences for user:', userId);
    
    const preferencesRef = doc(db, 'users', userId, 'preferences', 'dashboard');
    
    await setDoc(preferencesRef, {
      ...preferences,
      updatedAt: Date.now()
    }, { merge: true });
    
    console.log('✅ Dashboard preferences saved successfully');
  } catch (error) {
    console.error('❌ Error saving dashboard preferences:', error);
    throw error;
  }
};

export const updateCardVisibility = async (userId: string, cardId: string, visible: boolean): Promise<void> => {
  try {
    console.log('🎛️ Updating card visibility:', cardId, 'to', visible);
    
    const preferencesRef = doc(db, 'users', userId, 'preferences', 'dashboard');
    
    // Get current preferences
    const currentPrefs = await getDoc(preferencesRef);
    let visibleCards: string[] = [];
    
    if (currentPrefs.exists()) {
      const data = currentPrefs.data() as DashboardPreferences;
      visibleCards = data.visibleCards || [];
    }
    
    // Update the visible cards array
    if (visible) {
      if (!visibleCards.includes(cardId)) {
        visibleCards.push(cardId);
      }
    } else {
      visibleCards = visibleCards.filter(id => id !== cardId);
    }
    
    await setDoc(preferencesRef, {
      visibleCards,
      updatedAt: Date.now()
    }, { merge: true });
    
    console.log('✅ Card visibility updated successfully');
  } catch (error) {
    console.error('❌ Error updating card visibility:', error);
    throw error;
  }
};

// Get accounts by category
export const getAccountsByCategory = async (userId: string, category: 'family' | 'personal'): Promise<Account[]> => {
  try {
    console.log(`💰 Fetching ${category} accounts for user:`, userId);
    
    // First, get all accounts for the user
    const q = query(
      collection(db, 'users', userId, 'accounts'),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const allAccounts = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        category: data.category || 'personal' // Default to 'personal' for existing accounts
      };
    }) as Account[];
    
    // Filter by category
    const filteredAccounts = allAccounts.filter(account => account.category === category);
    
    console.log(`✅ Found ${filteredAccounts.length} ${category} accounts for user (out of ${allAccounts.length} total)`);
    return filteredAccounts;
  } catch (error) {
    console.error(`❌ Error getting ${category} accounts:`, error);
    throw error;
  }
};

// Get budgets by category
export const getBudgetsByCategory = async (userId: string, category: 'family' | 'personal'): Promise<(Budget & { id: string })[]> => {
  try {
    console.log(`💰 Loading ${category} budgets for user:`, userId);
    
    // First, get all budgets for the user
    const budgetsQuery = query(
      collection(db, 'users', userId, 'budgets'),
      orderBy('year', 'desc'),
      orderBy('month', 'desc')
    );
    const budgetsSnapshot = await getDocs(budgetsQuery);
    
    const allBudgets = budgetsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        category: data.category || 'personal' // Default to 'personal' for existing budgets
      };
    }) as (Budget & { id: string })[];
    
    // Filter by category
    const filteredBudgets = allBudgets.filter(budget => budget.category === category);
    
    console.log(`✅ Loaded ${filteredBudgets.length} ${category} budgets (out of ${allBudgets.length} total)`);
    return filteredBudgets;
  } catch (error) {
    console.error(`❌ Error loading ${category} budgets:`, error);
    throw error;
  }
};

// CSV/Excel Import System Functions
export const parseImportFile = async (file: File): Promise<any[]> => {
  try {
    console.log('📁 Parsing import file:', file.name);
    
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      return await parseCSVFile(file);
    } else if (file.type.includes('excel') || file.type.includes('spreadsheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      return await parseExcelFile(file);
    } else {
      throw new Error('Unsupported file type. Please upload a CSV or Excel file.');
    }
  } catch (error) {
    console.error('❌ Error parsing import file:', error);
    throw error;
  }
};

const parseCSVFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          resolve([]);
          return;
        }

        // Parse headers
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine).map(h => h.trim().replace(/"/g, ''));
        
        // Parse data rows
        const data = lines.slice(1).map(line => {
          const values = parseCSVLine(line);
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          return row;
        });

        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

// Helper function to parse CSV line with proper handling of quotes and commas
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  
  return result;
};

const parseExcelFile = async (file: File): Promise<any[]> => {
  // For now, we'll use a simple approach
  // In production, you might want to use a library like 'xlsx' or 'exceljs'
  throw new Error('Excel file parsing not yet implemented. Please use CSV files for now.');
};

export const processImportData = async (
  data: any[], 
  mappings: ImportMapping, 
  accountId: string,
  userId: string
): Promise<Omit<Transaction, 'id'>[]> => {
  try {
    console.log('🔄 Processing import data:', data.length, 'rows');
    
    const transactions: Omit<Transaction, 'id'>[] = [];
    
    for (const row of data) {
      try {
        // Parse date
        const dateStr = row[mappings.dateColumn];
        if (!dateStr) continue;
        
        let date: string;
        if (typeof dateStr === 'string') {
          // Try to parse common date formats
          const parsedDate = new Date(dateStr);
          if (isNaN(parsedDate.getTime())) {
            console.warn('⚠️ Invalid date format:', dateStr);
            continue;
          }
          date = parsedDate.toISOString().split('T')[0];
        } else {
          date = new Date(dateStr).toISOString().split('T')[0];
        }
        
        // Parse amount
        const amountStr = row[mappings.amountColumn];
        if (!amountStr) continue;
        
        let amount: number;
        if (typeof amountStr === 'string') {
          // Remove currency symbols and commas, handle negative amounts
          const cleanAmount = amountStr.replace(/[$,€£¥]/g, '').replace(/\(/g, '-').replace(/\)/g, '');
          amount = parseFloat(cleanAmount);
        } else {
          amount = parseFloat(amountStr);
        }
        
        if (isNaN(amount)) {
          console.warn('⚠️ Invalid amount:', amountStr);
          continue;
        }
        
        // Get description
        const description = row[mappings.descriptionColumn] || 'Imported transaction';
        
        // Create transaction object
        const transaction: Omit<Transaction, 'id'> = {
          accountId,
          amount,
          description: description.trim(),
          date,
          isManual: false,
          source: 'csv',
          tagIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        transactions.push(transaction);
      } catch (error) {
        console.warn('⚠️ Error processing row:', row, error);
        continue;
      }
    }
    
    console.log('✅ Processed', transactions.length, 'valid transactions');
    return transactions;
  } catch (error) {
    console.error('❌ Error processing import data:', error);
    throw error;
  }
};

export const bulkCreateTransactions = async (
  transactions: Omit<Transaction, 'id'>[], 
  userId: string
): Promise<string[]> => {
  try {
    console.log('📦 Creating', transactions.length, 'transactions in bulk');
    
    const batch = writeBatch(db);
    const transactionRefs: any[] = [];
    
    // Create document references and add to batch
    for (const transaction of transactions) {
      const transactionRef = doc(collection(db, 'users', userId, 'transactions'));
      batch.set(transactionRef, transaction);
      transactionRefs.push(transactionRef);
    }
    
    // Commit the batch
    await batch.commit();
    console.log('✅ Bulk transactions created successfully');
    
    // Get the IDs from the committed documents
    const transactionIds = transactionRefs.map(ref => ref.id);
    
    // Update account balances for affected accounts
    const accountIds = [...new Set(transactions.map(t => t.accountId))];
    for (const accountId of accountIds) {
      await forceUpdateAccountBalance(userId, accountId);
    }
    
    return transactionIds;
  } catch (error) {
    console.error('❌ Error creating bulk transactions:', error);
    throw error;
  }
};

export const suggestTagsForImport = async (
  description: string, 
  amount: number, 
  userId: string
): Promise<Tag[]> => {
  try {
    console.log('🏷️ Suggesting tags for import:', description, amount);
    
    // Get user's tags
    const userTags = await getTags(userId);
    
    // Simple pattern matching for common merchants/descriptions
    const suggestions: Tag[] = [];
    const lowerDesc = description.toLowerCase();
    
    // Groceries
    if (lowerDesc.includes('walmart') || lowerDesc.includes('target') || lowerDesc.includes('kroger') || 
        lowerDesc.includes('safeway') || lowerDesc.includes('food') || lowerDesc.includes('grocery')) {
      const groceryTag = userTags.find(t => t.name.toLowerCase().includes('grocery') || t.name.toLowerCase().includes('food'));
      if (groceryTag) suggestions.push(groceryTag);
    }
    
    // Gas/Transportation
    if (lowerDesc.includes('shell') || lowerDesc.includes('exxon') || lowerDesc.includes('chevron') || 
        lowerDesc.includes('gas') || lowerDesc.includes('fuel') || lowerDesc.includes('uber') || lowerDesc.includes('lyft')) {
      const transportTag = userTags.find(t => t.name.toLowerCase().includes('transport') || t.name.toLowerCase().includes('gas'));
      if (transportTag) suggestions.push(transportTag);
    }
    
    // Restaurants
    if (lowerDesc.includes('mcdonalds') || lowerDesc.includes('starbucks') || lowerDesc.includes('restaurant') || 
        lowerDesc.includes('pizza') || lowerDesc.includes('burger')) {
      const restaurantTag = userTags.find(t => t.name.toLowerCase().includes('restaurant') || t.name.toLowerCase().includes('dining'));
      if (restaurantTag) suggestions.push(restaurantTag);
    }
    
    // Bills/Recurring payments
    if (lowerDesc.includes('netflix') || lowerDesc.includes('spotify') || lowerDesc.includes('amazon prime') || 
        lowerDesc.includes('subscription') || lowerDesc.includes('bill')) {
      const billTag = userTags.find(t => t.name.toLowerCase().includes('bill') || t.name.toLowerCase().includes('subscription'));
      if (billTag) suggestions.push(billTag);
    }
    
    // Amount-based suggestions
    if (amount < 0) {
      const expenseTag = userTags.find(t => t.name.toLowerCase().includes('expense') || t.name.toLowerCase().includes('spending'));
      if (expenseTag) suggestions.push(expenseTag);
    } else {
      const incomeTag = userTags.find(t => t.name.toLowerCase().includes('income') || t.name.toLowerCase().includes('salary'));
      if (incomeTag) suggestions.push(incomeTag);
    }
    
    // Remove duplicates
    const uniqueSuggestions = suggestions.filter((tag, index, self) => 
      index === self.findIndex(t => t.id === tag.id)
    );
    
    console.log('✅ Suggested', uniqueSuggestions.length, 'tags');
    return uniqueSuggestions;
  } catch (error) {
    console.error('❌ Error suggesting tags for import:', error);
    return [];
  }
};