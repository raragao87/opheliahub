import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, type User, type Auth } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, getDoc, deleteDoc, doc, updateDoc, setDoc, where, writeBatch, limit, startAfter, deleteField, type Firestore, type QueryDocumentSnapshot, type DocumentReference } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import { config, getCurrentDomain, isDomainAllowed, getSecurityInfo } from '../config/environment';
import type { HierarchyItem, HierarchyLevel } from '../types/hierarchy';

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
let auth: Auth, db: Firestore, storage: FirebaseStorage, googleProvider: GoogleAuthProvider;
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
  } catch (error: unknown) {
    console.error('Error signing in with Google:', error);
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
  category: 'family' | 'personal' | 'assets';
  accountType: 'bank' | 'pseudo' | 'asset'; // NEW FIELD
  lastValueUpdate?: number; // Track when balance was last manually updated for asset accounts
  notes?: string; // Optional notes
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
  date?: string; // Optional for atemporal transactions like initial balance
  isManual: boolean;
  source: 'manual' | 'csv' | 'excel' | 'asset-valuation' | 'initial-balance';
  tagIds?: string[]; // Array of tag IDs assigned to this transaction
  isSplit?: boolean; // Whether this transaction has been split
  splitIds?: string[]; // References to TransactionSplit records
  createdAt: number;
  updatedAt: number;
}

// Helper type for initial balance transactions
export interface InitialBalanceTransaction extends Omit<Transaction, 'date'> {
  source: 'initial-balance';
  date?: never; // Initial balance transactions are atemporal
}

// Helper function to check if a transaction is an initial balance transaction
export const isInitialBalanceTransaction = (transaction: Transaction): boolean => {
  return transaction.source === 'initial-balance';
};

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
  category?: string; // Optional grouping for display only (legacy)
  subcategoryId?: string; // Reference to subcategory (new approach)
  userId: string;
  isDefault: boolean; // System vs user-created
  createdAt: number;
  updatedAt: number;
}

export interface TagCategory {
  id: string;
  name: string;
  color: string;
  userId: string;
  isDefault: boolean; // System vs user-created
  createdAt: number;
  updatedAt: number;
}

export interface TagSubcategory {
  id: string;
  name: string;
  categoryId: string;
  color: string;
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
  category: 'family' | 'personal' | 'assets';
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
  visibleCards: {
    familyAccounts: boolean;
    familyBudget: boolean;
    familyInvestments: boolean;
    familyCommitments: boolean;
    personalAccounts: boolean;
    personalBudget: boolean;
    personalInvestments: boolean;
    personalCommitments: boolean;
    taskManager: boolean;
    shoppingLists: boolean;
    homeMaintenance: boolean;
    familyCalendar: boolean;
    growthTracker: boolean;
    cloudStorage: boolean;
    medicalRecords: boolean;
    schoolActivities: boolean;
  };
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

export interface DateFormatInfo {
  format: string;
  examples: string[];
  confidence: number;
}

export interface ImportPreview {
  fileName: string;
  totalRows: number;
  columns: string[];
  sampleData: Record<string, string>[];
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('Error sending sharing invitation:', error);
    throw error;
  }
};

// Get pending invitations for a user

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
  } catch (error: unknown) {
    console.error('Error getting sent invitations:', error);
    throw error;
  }
};

// Get invitations received by a user (for future use)

// Accept sharing invitation

// Decline sharing invitation
export const declineSharingInvitation = async (invitationId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'sharingInvitations', invitationId), {
      status: 'declined',
    });
  } catch (error: unknown) {
    console.error('Error declining sharing invitation:', error);
    throw error;
  }
};

// Remove sharing access

// Get shared users for a child profile

export const saveGrowthRecord = async (userId: string, record: Omit<GrowthRecord, 'timestamp'>) => {
  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'growthRecords'), {
      ...record,
      timestamp: Date.now(),
    });
    return docRef;
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('Error getting growth records:', error);
    throw error;
  }
};

export const deleteGrowthRecord = async (userId: string, recordId: string) => {
  try {
    await deleteDoc(doc(db, 'users', userId, 'growthRecords', recordId));
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
      } catch (error: unknown) {
        console.error('Error uploading profile image:', error);
        // Don't fail the entire save operation if image upload fails
      }
    }
    
    return { id: finalProfileId, profileImageUrl };
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('Error uploading profile image:', error);
    throw new Error('Failed to upload image');
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
      id: 'cash',
      name: 'Cash',
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
      id: 'property',
      name: 'Property',
      defaultSign: 'positive',
      category: 'asset',
      isCustom: false
    },
    {
      id: 'vehicle',
      name: 'Vehicle',
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
    },
    {
      id: 'loan',
      name: 'Personal Loan',
      defaultSign: 'negative',
      category: 'liability',
      isCustom: false
    },
    {
      id: 'mortgage',
      name: 'Mortgage',
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
    const accountId = docRef.id;
    
    // CREATE INITIAL BALANCE TRANSACTION - ALWAYS create for every account
    const initialTransaction: Omit<Transaction, 'id'> = {
      accountId: accountId,
      amount: accountData.initialBalance, // Use the actual initial balance amount (can be 0)
      description: `${accountData.name}: Initial balance`,
      // No date field for atemporal initial balance transactions
      isManual: false,
      source: 'initial-balance',
      tagIds: [], // No tags for initial balance
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await createTransaction(userId, initialTransaction);
    console.log('✅ Initial balance transaction created with amount:', accountData.initialBalance);
    
    console.log('✅ Account created successfully with ID:', accountId);
    return accountId;
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error getting accounts:', error);
    throw error;
  }
};

// Alias for backward compatibility
export const getAccounts = getAccountsByUser;

// Get all accessible accounts (owned + shared) for a user
export const getAccessibleAccounts = async (userId: string): Promise<Account[]> => {
  try {
    console.log('💰 Fetching accessible accounts for user:', userId);
    
    // Get owned accounts
    const ownedAccounts = await getAccountsByUser(userId);
    console.log(`✅ Found ${ownedAccounts.length} owned accounts`);
    
    // Get shared accounts from sharedProfiles collection
    const sharedAccounts: Account[] = [];
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error updating account:', error);
    throw error;
  }
};

// Asset Balance Update Function
export const updateAssetAccountBalance = async (
  userId: string, 
  accountId: string, 
  newBalance: number,
  notes?: string
): Promise<void> => {
  try {
    console.log('🏠 Updating asset account balance:', { accountId, newBalance, notes });
    
    // Get current account
    const accountRef = doc(db, 'users', userId, 'accounts', accountId);
    const accountSnap = await getDoc(accountRef);
    
    if (!accountSnap.exists()) {
      throw new Error('Account not found');
    }
    
    const currentAccount = accountSnap.data() as Account;
    const difference = newBalance - currentAccount.balance;
    
    if (difference === 0) {
      console.log('💰 No balance change detected');
      return;
    }
    
    // Update account balance and timestamp
    await updateDoc(accountRef, {
      balance: newBalance,
      lastValueUpdate: Date.now(),
      updatedAt: Date.now()
    });
    
    // Create auto-transaction for the difference
    const transactionData: Omit<Transaction, 'id'> = {
      accountId,
      amount: difference,
      description: notes || `Asset value update: ${difference > 0 ? '+' : ''}${difference.toFixed(2)}`,
      date: new Date().toISOString().split('T')[0],
      isManual: false,
      source: 'asset-valuation',
      tagIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await createTransaction(userId, transactionData);
    
    console.log('✅ Asset balance updated successfully with auto-transaction');
  } catch (error: unknown) {
    console.error('❌ Error updating asset balance:', error);
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error updating account type:', error);
    throw error;
  }
};

export const deleteAccountType = async (typeId: string, userId: string): Promise<void> => {
  try {
    console.log('🗑️ Deleting account type:', typeId);
    
    await deleteDoc(doc(db, 'users', userId, 'accountTypes', typeId));
    
    console.log('✅ Account type deleted successfully');
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error creating transaction:', error);
    throw error;
  }
};

// Recalculate account balance based on all transactions
export const recalculateAccountBalance = async (userId: string, accountId: string): Promise<number> => {
  try {
    console.log('🔄 Recalculating balance for account:', accountId);
    
    // Get all transactions for this account
    const transactions = await getTransactionsByAccount(userId, accountId);
    
    // FIXED: Pure transaction-based calculation (no double counting)
    const newBalance = transactions.reduce((balance, transaction) => {
      return balance + transaction.amount;
    }, 0); // FIXED: Start from 0, NOT initialBalance
    
    console.log(`✅ Balance recalculated: Sum of all transactions = ${newBalance}`);
    console.log('Transaction breakdown:', transactions.map(t => ({
      id: t.id,
      amount: t.amount,
      source: t.source,
      description: t.description
    })));
    
    return newBalance;
  } catch (error: unknown) {
    console.error('❌ Error recalculating account balance:', error);
    throw error;
  }
};

// Emergency fix function to run once
export const emergencyFixAccountBalances = async (userId: string): Promise<void> => {
  try {
    console.log('🚨 Starting emergency fix for account balances...');
    
    const accounts = await getAccountsByUser(userId);
    
    for (const account of accounts) {
      console.log(`🔍 Fixing account: ${account.name}`);
      
      // Get all transactions
      const transactions = await getTransactionsByAccount(userId, account.id);
      
      // Remove duplicate initial balance transactions
      const initialBalanceTransactions = transactions.filter(t => t.source === 'initial-balance');
      if (initialBalanceTransactions.length > 1) {
        console.log(`🔧 Removing ${initialBalanceTransactions.length - 1} duplicate initial balance transactions`);
        for (let i = 1; i < initialBalanceTransactions.length; i++) {
          await deleteDoc(doc(db, 'users', userId, 'transactions', initialBalanceTransactions[i].id));
        }
      }
      
      // Fix initial balance transaction format if needed
      if (initialBalanceTransactions.length > 0) {
        const initialTransaction = initialBalanceTransactions[0];
        const correctDescription = `${account.name}: Initial balance`;
        
        if (initialTransaction.description !== correctDescription || initialTransaction.date) {
          await updateDoc(doc(db, 'users', userId, 'transactions', initialTransaction.id), {
            description: correctDescription,
            date: deleteField(), // Remove date field to make atemporal
            updatedAt: Date.now()
          });
          console.log(`✅ Fixed initial balance transaction format for ${account.name}`);
        }
      }
      
      // Recalculate correct balance using fixed method
      const correctBalance = await recalculateAccountBalance(userId, account.id);
      
      console.log(`Account ${account.name}:`);
      console.log(`  Current balance: ${account.balance}`);
      console.log(`  Correct balance: ${correctBalance}`);
      
      if (Math.abs(account.balance - correctBalance) > 0.01) {
        // Update the account balance
        await updateDoc(doc(db, 'users', userId, 'accounts', account.id), {
          balance: correctBalance,
          updatedAt: Date.now()
        });
        console.log(`✅ Fixed balance for ${account.name}: ${account.balance} → ${correctBalance}`);
      }
    }
    
    console.log('🎉 Emergency fix completed!');
  } catch (error: unknown) {
    console.error('❌ Error during emergency fix:', error);
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
  } catch (error: unknown) {
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
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    
    // Sort transactions: initial balance first, then by createdAt desc
    transactions.sort((a, b) => {
      const aIsInitialBalance = isInitialBalanceTransaction(a);
      const bIsInitialBalance = isInitialBalanceTransaction(b);
      
      // Initial balance transactions always come first
      if (aIsInitialBalance && !bIsInitialBalance) return -1;
      if (!aIsInitialBalance && bIsInitialBalance) return 1;
      
      // Both are initial balance or both are regular - sort by createdAt desc
      return b.createdAt - a.createdAt;
    });
    
    console.log(`✅ Found ${transactions.length} transactions for account`);
    return transactions;
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error updating transaction:', error);
    throw error;
  }
};

export const deleteTransaction = async (transactionId: string, userId: string): Promise<void> => {
  try {
    console.log('💰 Deleting transaction:', transactionId);
    
    // Get the transaction before deleting it
    const transactionDoc = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    if (!transactionDoc.exists()) {
      throw new Error('Transaction not found');
    }
    
    const transaction = transactionDoc.data() as Transaction;
    
    // Prevent deletion of initial balance transactions
    if (isInitialBalanceTransaction(transaction)) {
      throw new Error('Initial balance transactions cannot be deleted');
    }
    
    const accountId = transaction.accountId;
    
    await deleteDoc(doc(db, 'users', userId, 'transactions', transactionId));
    console.log('✅ Transaction deleted successfully');
    
    // Force update account balance after deleting transaction
    await forceUpdateAccountBalance(userId, accountId);
  } catch (error: unknown) {
    console.error('❌ Error deleting transaction:', error);
    throw error;
  }
};

// Transaction-Tag Management Functions

// Tag Functions

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
    } catch {
      console.log('⚠️ No user-created tags found (this is normal for new users)');
    }
    
    // Get deleted default tags to filter them out
    let deletedDefaultTags: string[] = [];
    try {
      const deletedTagsQuery = query(collection(db, 'users', userId, 'deletedTags'));
      const deletedTagsSnapshot = await getDocs(deletedTagsQuery);
      deletedDefaultTags = deletedTagsSnapshot.docs.map(doc => doc.data().tagId);
      console.log(`✅ Found ${deletedDefaultTags.length} deleted default tags to filter out`);
    } catch {
      console.log('⚠️ No deleted tags found (this is normal)');
    }
    
    // Get default tags and filter out deleted ones
    const defaultTags = getDefaultTags().filter(tag => !deletedDefaultTags.includes(tag.id));
    console.log(`✅ Found ${defaultTags.length} available default tags`);
    
    // Combine user tags and available default tags
    const allTags = [...userTags, ...defaultTags];
    console.log(`✅ Total tags: ${allTags.length} (${userTags.length} user + ${defaultTags.length} default)`);
    
    return allTags;
  } catch (error: unknown) {
    console.error('❌ Error getting tags:', error);
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
  } catch (error: unknown) {
    console.error('❌ Error bulk assigning tags:', error);
    throw error;
  }
};

// Smart tag suggestions based on transaction description and amount

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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error updating transaction split:', error);
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
    
    // Get the original transaction
    const originalTransaction = await getDoc(doc(db, 'users', userId, 'transactions', transactionId));
    if (!originalTransaction.exists()) {
      throw new Error('Original transaction not found');
    }
    
    const transaction = originalTransaction.data() as Transaction;
    
    // Prevent splitting of initial balance transactions
    if (isInitialBalanceTransaction(transaction)) {
      throw new Error('Initial balance transactions cannot be split');
    }
    
    const originalAmount = transaction.amount;
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error merging transaction splits:', error);
    throw error;
  }
};

// Transaction Linking Functions

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
  } catch (error: unknown) {
    console.error('❌ Error getting linked transactions:', error);
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
        visibleCards: {
          familyAccounts: true,
          familyBudget: true,
          familyInvestments: true,
          familyCommitments: true,
          personalAccounts: true,
          personalBudget: true,
          personalInvestments: true,
          personalCommitments: true,
          taskManager: true,
          shoppingLists: true,
          homeMaintenance: true,
          familyCalendar: true,
          growthTracker: true,
          cloudStorage: true,
          medicalRecords: true,
          schoolActivities: true
        },
        cardOrder: ['familyAccounts', 'familyBudget', 'familyInvestments', 'familyCommitments', 'personalAccounts', 'personalBudget', 'personalInvestments', 'personalCommitments', 'taskManager', 'shoppingLists', 'homeMaintenance', 'familyCalendar', 'growthTracker', 'cloudStorage', 'medicalRecords', 'schoolActivities'],
        theme: 'light'
      };
      
      console.log('✅ Created default dashboard preferences:', defaultPreferences);
      return defaultPreferences;
    }
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error saving dashboard preferences:', error);
    throw error;
  }
};

// Get accounts by category
export const getAccountsByCategory = async (userId: string, category: 'family' | 'personal' | 'assets'): Promise<Account[]> => {
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
  } catch (error: unknown) {
    console.error(`❌ Error getting ${category} accounts:`, error);
    throw error;
  }
};

// Get budgets by category
export const getBudgetsByCategory = async (userId: string, category: 'family' | 'personal' | 'assets'): Promise<(Budget & { id: string })[]> => {
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
  } catch (error: unknown) {
    console.error(`❌ Error loading ${category} budgets:`, error);
    throw error;
  }
};

// CSV/Excel Import System Functions
export const parseImportFile = async (file: File): Promise<Record<string, string>[]> => {
  try {
    console.log('📁 Parsing import file:', file.name);
    
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      return await parseCSVFile(file);
    } else if (file.type.includes('excel') || file.type.includes('spreadsheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      return await parseExcelFile(file);
    } else {
      throw new Error('Unsupported file type. Please upload a CSV or Excel file (.xls, .xlsx).');
    }
  } catch (error: unknown) {
    console.error('❌ Error parsing import file:', error);
    throw error;
  }
};

const parseCSVFile = async (file: File): Promise<Record<string, string>[]> => {
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
          const row: Record<string, string> = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          return row;
        });

        resolve(data);
      } catch (error: unknown) {
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

const parseExcelFile = async (file: File): Promise<Record<string, string>[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Failed to read file'));
          return;
        }

        // Import xlsx dynamically to avoid SSR issues
        const XLSX = await import('xlsx');
        
        // Parse the Excel file
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
          reject(new Error('No worksheet found in Excel file'));
          return;
        }
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          blankrows: false
        });
        
        if (jsonData.length === 0) {
          resolve([]);
          return;
        }
        
        // Extract headers from first row
        const headers = jsonData[0] as string[];
        
        // Convert remaining rows to objects
        const result = jsonData.slice(1).map((row: unknown) => {
          const obj: Record<string, string> = {};
          headers.forEach((header, index) => {
            obj[header] = (row as string[])[index] || '';
          });
          return obj;
        });
        
        resolve(result);
      } catch (error: unknown) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
};

// Helper function to parse date with specific format
export const parseDateStringWithFormat = (dateStr: string | number | Date, format: string): string | null => {
  if (!dateStr) return null;
  
  try {
    let year: number, month: number, day: number;
    
    // Convert to string and clean up
    const cleanDateStr = String(dateStr).trim().replace(/\s+/g, '');
    
    switch (format) {
      case 'YYYYMMDD':
        // More flexible YYYYMMDD parsing
        if (/^\d{8}$/.test(cleanDateStr)) {
          year = parseInt(cleanDateStr.substring(0, 4));
          month = parseInt(cleanDateStr.substring(4, 6)) - 1;
          day = parseInt(cleanDateStr.substring(6, 8));
        } else if (/^\d{6,8}$/.test(cleanDateStr)) {
          // Handle cases with leading zeros or shorter formats
          const padded = cleanDateStr.padStart(8, '0');
          year = parseInt(padded.substring(0, 4));
          month = parseInt(padded.substring(4, 6)) - 1;
          day = parseInt(padded.substring(6, 8));
        } else {
          return null;
        }
        break;
        
      case 'YYYY-MM-DD':
        if (typeof dateStr === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
          const parts = dateStr.split('-');
          year = parseInt(parts[0]);
          month = parseInt(parts[1]) - 1;
          day = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'MM/DD/YYYY':
        if (typeof dateStr === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('/');
          month = parseInt(parts[0]) - 1;
          day = parseInt(parts[1]);
          year = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'DD/MM/YYYY':
        if (typeof dateStr === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('/');
          day = parseInt(parts[0]);
          month = parseInt(parts[1]) - 1;
          year = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'MM-DD-YYYY':
        if (typeof dateStr === 'string' && /^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('-');
          month = parseInt(parts[0]) - 1;
          day = parseInt(parts[1]);
          year = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'DD-MM-YYYY':
        if (typeof dateStr === 'string' && /^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('-');
          day = parseInt(parts[0]);
          month = parseInt(parts[1]) - 1;
          year = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'YYYY/MM/DD':
        if (typeof dateStr === 'string' && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
          const parts = dateStr.split('/');
          year = parseInt(parts[0]);
          month = parseInt(parts[1]) - 1;
          day = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'MM.DD.YYYY':
        if (typeof dateStr === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('.');
          month = parseInt(parts[0]) - 1;
          day = parseInt(parts[1]);
          year = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'DD.MM.YYYY':
        if (typeof dateStr === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('.');
          day = parseInt(parts[0]);
          month = parseInt(parts[1]) - 1;
          year = parseInt(parts[2]);
        } else {
          return null;
        }
        break;
        
      case 'Excel Date Number':
        if (typeof dateStr === 'number' && dateStr > 1 && dateStr < 100000) {
          // Excel dates are days since 1900-01-01
          const excelDate = new Date((dateStr - 25569) * 86400 * 1000);
          return excelDate.toISOString().split('T')[0];
        } else {
          return null;
        }
        
      case 'Timestamp':
        if (typeof dateStr === 'number' && dateStr > 100000) {
          // Timestamp in milliseconds
          return new Date(dateStr).toISOString().split('T')[0];
        } else {
          return null;
        }
        
      default:
        // Fallback to auto-detection
        return parseDateString(dateStr);
    }
    
    // Validate the date
    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const date = new Date(year, month, day);
      if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
        return date.toISOString().split('T')[0];
      }
    }
    
    return null;
  } catch (error: unknown) {
    console.warn('Error parsing date with format:', format, 'value:', dateStr, error);
    return null;
  }
};

// Helper function to parse various date formats
export const parseDateString = (dateStr: string | number | Date): string | null => {
  if (!dateStr) return null;
  
  // If it's already a Date object or timestamp
  if (dateStr instanceof Date) {
    return dateStr.toISOString().split('T')[0];
  }
  
  // If it's a number (timestamp or Excel date number)
  if (typeof dateStr === 'number') {
    // Excel dates are days since 1900-01-01, convert to milliseconds
    if (dateStr > 100000) {
      // Likely a timestamp in milliseconds
      return new Date(dateStr).toISOString().split('T')[0];
    } else {
      // Likely an Excel date number (days since 1900-01-01)
      const excelDate = new Date((dateStr - 25569) * 86400 * 1000);
      return excelDate.toISOString().split('T')[0];
    }
  }
  
  // If it's a string, try various formats
  if (typeof dateStr === 'string') {
    const trimmed = dateStr.trim();
    
    // Try common date formats
    const formats = [
      // YYYYMMDD (your specific case)
      /^(\d{4})(\d{2})(\d{2})$/,
      // YYYY-MM-DD
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
      // MM/DD/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      // DD/MM/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      // MM-DD-YYYY
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      // DD-MM-YYYY
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      // YYYY/MM/DD
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
      // MM.DD.YYYY
      /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
      // DD.MM.YYYY
      /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    ];
    
    for (const format of formats) {
      const match = trimmed.match(format);
      if (match) {
        let year, month, day;
        
        if (format.source.includes('YYYY')) {
          // Format starts with year
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1; // Month is 0-indexed
          day = parseInt(match[3]);
        } else {
          // Format starts with month or day
          if (format.source.includes('MM') && format.source.includes('DD')) {
            if (format.source.indexOf('MM') < format.source.indexOf('DD')) {
              // MM/DD/YYYY format
              month = parseInt(match[1]) - 1;
              day = parseInt(match[2]);
              year = parseInt(match[3]);
            } else {
              // DD/MM/YYYY format
              day = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              year = parseInt(match[3]);
            }
          } else {
            // Fallback to first two as month/day
            month = parseInt(match[1]) - 1;
            day = parseInt(match[2]);
            year = parseInt(match[3]);
          }
        }
        
        // Validate the date
        if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
          const date = new Date(year, month, day);
          if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
            return date.toISOString().split('T')[0];
          }
        }
      }
    }
    
    // Try standard Date parsing as fallback
    const parsedDate = new Date(trimmed);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split('T')[0];
    }
  }
  
  return null;
};

// Function to detect date format from sample data
export const detectDateFormat = (dateValues: (string | number)[]): DateFormatInfo[] => {
  const formatCounts: { [key: string]: { count: number; examples: string[] } } = {};
  
  dateValues.forEach(value => {
    if (!value) return;
    
    const strValue = String(value).trim();
    
    // Check for YYYYMMDD format
    if (/^\d{8}$/.test(strValue)) {
      const format = 'YYYYMMDD';
      if (!formatCounts[format]) formatCounts[format] = { count: 0, examples: [] };
      formatCounts[format].count++;
      if (formatCounts[format].examples.length < 3) {
        formatCounts[format].examples.push(strValue);
      }
    }
    
    // Check for YYYY-MM-DD format
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(strValue)) {
      const format = 'YYYY-MM-DD';
      if (!formatCounts[format]) formatCounts[format] = { count: 0, examples: [] };
      formatCounts[format].count++;
      if (formatCounts[format].examples.length < 3) {
        formatCounts[format].examples.push(strValue);
      }
    }
    
    // Check for MM/DD/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(strValue)) {
      const format = 'MM/DD/YYYY';
      if (!formatCounts[format]) formatCounts[format] = { count: 0, examples: [] };
      formatCounts[format].count++;
      if (formatCounts[format].examples.length < 3) {
        formatCounts[format].examples.push(strValue);
      }
    }
    
    // Check for DD/MM/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(strValue)) {
      const format = 'DD/MM/YYYY';
      if (!formatCounts[format]) formatCounts[format] = { count: 0, examples: [] };
      formatCounts[format].count++;
      if (formatCounts[format].examples.length < 3) {
        formatCounts[format].examples.push(strValue);
      }
    }
    
    // Check for Excel date numbers
    if (typeof value === 'number' && value > 1 && value < 100000) {
      const format = 'Excel Date Number';
      if (!formatCounts[format]) formatCounts[format] = { count: 0, examples: [] };
      formatCounts[format].count++;
      if (formatCounts[format].examples.length < 3) {
        formatCounts[format].examples.push(String(value));
      }
    }
  });
  
  // Convert to array and sort by confidence
  const results: DateFormatInfo[] = Object.entries(formatCounts).map(([format, data]) => ({
    format,
    examples: data.examples,
    confidence: data.count / dateValues.filter(v => v).length
  }));
  
  return results.sort((a, b) => b.confidence - a.confidence);
};

export const processImportData = async (
  data: Record<string, string>[],
  mappings: ImportMapping, 
  accountId: string,
  _userId: string,
  dateFormat?: string
): Promise<Omit<Transaction, 'id'>[]> => {
  try {
    console.log('🔄 Processing import data:', data.length, 'rows');
    
    const transactions: Omit<Transaction, 'id'>[] = [];
    
    for (const row of data) {
      try {
        // Parse date using our comprehensive parser
        const dateStr = row[mappings.dateColumn];
        let date: string | null;
        
        console.log('🔍 Processing row date:', dateStr, 'Type:', typeof dateStr, 'Format:', dateFormat);
        
        if (dateFormat && dateFormat !== 'Auto-detect (recommended)') {
          // Use manual format parsing
          date = parseDateStringWithFormat(dateStr, dateFormat);
          console.log('🔍 Manual format result:', date);
        } else {
          // Use auto-detection
          date = parseDateString(dateStr);
          console.log('🔍 Auto-detection result:', date);
        }
        
        if (!date) {
          console.warn('⚠️ Invalid date format:', dateStr, 'with format:', dateFormat);
          continue;
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
      } catch (error: unknown) {
        console.warn('⚠️ Error processing row:', row, error);
        continue;
      }
    }
    
    console.log('✅ Processed', transactions.length, 'valid transactions');
    return transactions;
  } catch (error: unknown) {
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
    const transactionRefs: DocumentReference[] = [];
    
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('❌ Error suggesting tags for import:', error);
    return [];
  }
};

export const getTransactionsByAccountWithData = async (userId: string, accountId: string): Promise<{
  transactions: Transaction[];
  tagsMap: Record<string, Tag[]>;
  splitsMap: Record<string, TransactionSplit[]>;
  linkedMap: Record<string, { link: TransactionLink; transaction: Transaction }[]>;
}> => {
  try {
    console.log('💰 Fetching transactions with related data for account:', accountId);
    
    // Get transactions with limit for performance
    // Note: Using createdAt instead of date to include atemporal initial balance transactions
    const q = query(
      collection(db, 'users', userId, 'transactions'),
      where('accountId', '==', accountId),
      orderBy('createdAt', 'desc'),
      limit(100) // Limit initial load to 100 transactions
    );
    
    const querySnapshot = await getDocs(q);
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    
    // Sort transactions: initial balance first, then by createdAt desc
    transactions.sort((a, b) => {
      const aIsInitialBalance = isInitialBalanceTransaction(a);
      const bIsInitialBalance = isInitialBalanceTransaction(b);
      
      // Initial balance transactions always come first
      if (aIsInitialBalance && !bIsInitialBalance) return -1;
      if (!aIsInitialBalance && bIsInitialBalance) return 1;
      
      // Both are initial balance or both are regular - sort by createdAt desc
      return b.createdAt - a.createdAt;
    });
    
    if (transactions.length === 0) {
      return {
        transactions: [],
        tagsMap: {},
        splitsMap: {},
        linkedMap: {}
      };
    }
    
    // Batch load all related data efficiently
    const [allTags, allSplits, allLinks] = await Promise.all([
      // Resolve tags from both legacy collection and hierarchy
      getAllResolvableTags(userId),
      // Get all splits for transactions that are split
      getTransactionSplitsBatch(transactions.filter(t => t.isSplit).map(t => t.id), userId),
      // Get all linked transactions in one query
      getLinkedTransactionsBatch(transactions.map(t => t.id), userId)
    ]);
    
    // Build maps efficiently
    const tagsMap: Record<string, Tag[]> = {};
    const splitsMap: Record<string, TransactionSplit[]> = {};
    const linkedMap: Record<string, { link: TransactionLink; transaction: Transaction }[]> = {};
    
    // Process transactions and build maps
    for (const transaction of transactions) {
      // Build tags map
      if (transaction.tagIds && transaction.tagIds.length > 0) {
        tagsMap[transaction.id] = transaction.tagIds
          .map(tagId => allTags.find((tag: Tag) => tag.id === tagId))
          .filter(Boolean) as Tag[];
      } else {
        tagsMap[transaction.id] = [];
      }
      
      // Build splits map
      if (transaction.isSplit) {
        splitsMap[transaction.id] = allSplits.filter((split: TransactionSplit) => split.transactionId === transaction.id);
      } else {
        splitsMap[transaction.id] = [];
      }
      
      // Build linked map
      linkedMap[transaction.id] = allLinks.filter((link: { link: TransactionLink; transaction: Transaction }) => link.transaction.id === transaction.id);
    }
    
    console.log(`✅ Loaded ${transactions.length} transactions with related data`);
    
    return {
      transactions,
      tagsMap,
      splitsMap,
      linkedMap
    };
  } catch (error: unknown) {
    console.error('❌ Error fetching transactions with data:', error);
    throw error;
  }
};

export const getTransactionsByAccountPaginated = async (
  userId: string, 
  accountId: string, 
  pageSize: number = 100,
  lastDoc?: QueryDocumentSnapshot
): Promise<{
  transactions: Transaction[];
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot | undefined;
}> => {
  try {
    console.log(`💰 Fetching ${pageSize} transactions for account:`, accountId);
    
    let q = query(
      collection(db, 'users', userId, 'transactions'),
      where('accountId', '==', accountId),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    
    // Add pagination cursor if provided
    if (lastDoc) {
      q = query(
        collection(db, 'users', userId, 'transactions'),
        where('accountId', '==', accountId),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
    }
    
    const querySnapshot = await getDocs(q);
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    
    const hasMore = querySnapshot.docs.length === pageSize;
    const newLastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    
    console.log(`✅ Found ${transactions.length} transactions (hasMore: ${hasMore})`);
    
    return {
      transactions,
      hasMore,
      lastDoc: newLastDoc
    };
  } catch (error: unknown) {
    console.error('❌ Error getting paginated transactions:', error);
    throw error;
  }
};

export const getTransactionsByAccountPage = async (
  userId: string, 
  accountId: string, 
  pageSize: number = 100,
  pageNumber: number = 1
): Promise<{
  transactions: Transaction[];
  tagsMap: Record<string, Tag[]>;
  splitsMap: Record<string, TransactionSplit[]>;
}> => {
  try {
    console.log(`📄 Fetching page ${pageNumber} with ${pageSize} transactions for account:`, accountId);
    
    // For page-based pagination, we need to fetch all transactions up to the desired page
    // This is not ideal for large datasets, but Firebase doesn't support offset-based pagination
    // In a production app, you'd implement cursor-based pagination with page tracking
    
    const q = query(
      collection(db, 'users', userId, 'transactions'),
      where('accountId', '==', accountId),
      orderBy('createdAt', 'desc'),
      limit(pageSize * pageNumber)
    );
    
    const querySnapshot = await getDocs(q);
    const allTransactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    
    // Get the transactions for the specific page
    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageTransactions = allTransactions.slice(startIndex, endIndex);
    
    console.log(`📊 Page ${pageNumber}: ${pageTransactions.length} transactions (${startIndex + 1}-${endIndex} of ${allTransactions.length})`);
    
    // Get related data for the page transactions
    const transactionIds = pageTransactions.map(t => t.id);
    const [tags, splits] = await Promise.all([
      getTransactionTagsBatch(transactionIds, userId),
      getTransactionSplitsBatch(transactionIds, userId)
    ]);
    
    // Build maps
    const tagsMap: Record<string, Tag[]> = {};
    const splitsMap: Record<string, TransactionSplit[]> = {};
    
    pageTransactions.forEach(transaction => {
      // For tags, filter by the transaction's tagIds
      if (transaction.tagIds && transaction.tagIds.length > 0) {
        tagsMap[transaction.id] = tags.filter(tag => transaction.tagIds!.includes(tag.id));
      } else {
        tagsMap[transaction.id] = [];
      }
      
      // For splits, filter by the transaction's ID
      splitsMap[transaction.id] = splits.filter(split => split.transactionId === transaction.id);
    });
    
    return {
      transactions: pageTransactions,
      tagsMap,
      splitsMap
    };
  } catch (error: unknown) {
    console.error('❌ Error getting transactions by page:', error);
    throw error;
  }
};



export const getTransactionTagsBatch = async (transactionIds: string[], userId: string): Promise<Tag[]> => {
  try {
    if (transactionIds.length === 0) return [];
    
    console.log(`💰 Batch loading tags for ${transactionIds.length} transactions`);
    
    // Get all transactions to extract tag IDs
    const transactionBatches = [];
    for (let i = 0; i < transactionIds.length; i += 10) {
      const batch = transactionIds.slice(i, i + 10);
      transactionBatches.push(
        getDocs(query(
          collection(db, 'users', userId, 'transactions'),
          where('__name__', 'in', batch)
        ))
      );
    }
    
    const transactionResults = await Promise.all(transactionBatches);
    const allTagIds = new Set<string>();
    
    transactionResults.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        const transaction = doc.data() as Transaction;
        if (transaction.tagIds) {
          transaction.tagIds.forEach(tagId => allTagIds.add(tagId));
        }
      });
    });
    
    // Get all tags from both legacy collection and hierarchy
    const allTags = await getAllResolvableTags(userId);
    const tagMap = new Map(allTags.map(tag => [tag.id, tag]));

    // Filter tags that are assigned to any of the transactions
    const relevantTags = Array.from(allTagIds).map(tagId => tagMap.get(tagId)).filter((t): t is Tag => t !== undefined);
    
    console.log(`✅ Loaded ${relevantTags.length} relevant tags for ${transactionIds.length} transactions`);
    return relevantTags;
  } catch (error: unknown) {
    console.error('❌ Error batch loading tags:', error);
    return [];
  }
};

export const getTransactionSplitsBatch = async (transactionIds: string[], userId: string): Promise<TransactionSplit[]> => {
  try {
    if (transactionIds.length === 0) return [];
    
    console.log(`💰 Batch loading splits for ${transactionIds.length} transactions`);
    
    const splitsQuery = query(
      collection(db, 'users', userId, 'transactionSplits'),
      where('transactionId', 'in', transactionIds)
    );
    
    const splitsSnapshot = await getDocs(splitsQuery);
    const splits = splitsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as TransactionSplit[];
    
    console.log(`✅ Loaded ${splits.length} splits`);
    return splits;
  } catch (error: unknown) {
    console.error('❌ Error batch loading splits:', error);
    return [];
  }
};

export const getLinkedTransactionsBatch = async (transactionIds: string[], userId: string): Promise<{ link: TransactionLink; transaction: Transaction }[]> => {
  try {
    if (transactionIds.length === 0) return [];
    
    console.log(`💰 Batch loading linked transactions for ${transactionIds.length} transactions`);
    
    // Get all links where these transactions are source or target
    // Firestore 'in' query has a limit of 10, so we need to batch
    const sourceLinksBatches = [];
    const targetLinksBatches = [];
    
    for (let i = 0; i < transactionIds.length; i += 10) {
      const batch = transactionIds.slice(i, i + 10);
      sourceLinksBatches.push(
        getDocs(query(
          collection(db, 'users', userId, 'transactionLinks'),
          where('sourceTransactionId', 'in', batch)
        ))
      );
      targetLinksBatches.push(
        getDocs(query(
          collection(db, 'users', userId, 'transactionLinks'),
          where('targetTransactionId', 'in', batch)
        ))
      );
    }
    
    const [sourceLinksResults, targetLinksResults] = await Promise.all([
      Promise.all(sourceLinksBatches),
      Promise.all(targetLinksBatches)
    ]);
    
    // Combine all source and target links
    const sourceLinks = sourceLinksResults.flatMap(result => result.docs);
    const targetLinks = targetLinksResults.flatMap(result => result.docs);
    
    // Collect all linked transaction IDs
    const linkedIds = new Set<string>();
    sourceLinks.forEach(doc => {
      const link = doc.data() as TransactionLink;
      linkedIds.add(link.targetTransactionId);
    });
    targetLinks.forEach(doc => {
      const link = doc.data() as TransactionLink;
      linkedIds.add(link.sourceTransactionId);
    });
    
    // Batch load all linked transactions
    const linkedTransactions: Transaction[] = [];
    if (linkedIds.size > 0) {
      const linkedIdsArray = Array.from(linkedIds);
      // Firestore 'in' query has a limit of 10, so we need to batch
      const batches = [];
      for (let i = 0; i < linkedIdsArray.length; i += 10) {
        const batch = linkedIdsArray.slice(i, i + 10);
        batches.push(
          getDocs(query(
            collection(db, 'users', userId, 'transactions'),
            where('__name__', 'in', batch)
          ))
        );
      }
      
      const batchResults = await Promise.all(batches);
      batchResults.forEach(snapshot => {
        const transactions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Transaction[];
        linkedTransactions.push(...transactions);
      });
    }
    
    // Build result map
    const linkedMap: { link: TransactionLink; transaction: Transaction }[] = [];
    
    // Process source links
    sourceLinks.forEach(doc => {
      const link = { id: doc.id, ...doc.data() } as TransactionLink;
      const targetTransaction = linkedTransactions.find(t => t.id === link.targetTransactionId);
      if (targetTransaction) {
        linkedMap.push({ link, transaction: targetTransaction });
      }
    });
    
    // Process target links
    targetLinks.forEach(doc => {
      const link = { id: doc.id, ...doc.data() } as TransactionLink;
      const sourceTransaction = linkedTransactions.find(t => t.id === link.sourceTransactionId);
      if (sourceTransaction) {
        linkedMap.push({ link, transaction: sourceTransaction });
      }
    });
    
    console.log(`✅ Loaded ${linkedMap.length} linked transactions`);
    return linkedMap;
  } catch (error: unknown) {
    console.error('❌ Error batch loading linked transactions:', error);
    return [];
  }
};

// Link transactions function for manual linking
export const linkTransactions = async (userId: string, transactionId1: string, transactionId2: string): Promise<void> => {
  try {
    console.log('🔗 Linking transactions:', transactionId1, 'and', transactionId2);
    
    // Create a link record
    await addDoc(collection(db, 'users', userId, 'transactionLinks'), {
      sourceTransactionId: transactionId1,
      targetTransactionId: transactionId2,
      linkType: 'manual_link',
      description: 'Manually linked transactions',
      createdAt: Date.now(),
      userId: userId
    });
    
    console.log('✅ Transactions linked successfully');
  } catch (error: unknown) {
    console.error('❌ Error linking transactions:', error);
    throw error;
  }
};

// Migration function to create initial balance transactions for existing accounts

// =====================================
// HIERARCHY MANAGEMENT FUNCTIONS
// =====================================

export const createHierarchyItem = async (
  userId: string,
  name: string,
  level: HierarchyLevel,
  parentId?: string
): Promise<string> => {
  try {
    console.log('🏗️ Creating hierarchy item:', { name, level, parentId, userId });
    
    // Calculate order for new item (append at end of current level)
    // Avoid composite index by fetching items and sorting in JavaScript
    let order = 0;
    
    const orderQuery = query(
      collection(db, 'users', userId, 'hierarchy'),
      where('level', '==', level)
    );
    
    const orderSnapshot = await getDocs(orderQuery);
    
    // Filter and sort in JavaScript to avoid composite index requirements
    let relevantItems;
    if (parentId) {
      relevantItems = orderSnapshot.docs
        .filter(doc => doc.data().parentId === parentId)
        .map(doc => doc.data())
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // Sort descending
    } else {
      relevantItems = orderSnapshot.docs
        .filter(doc => !doc.data().parentId)
        .map(doc => doc.data())
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // Sort descending
    }
    
    if (relevantItems.length > 0) {
      order = (relevantItems[0].order || 0) + 1;
    }

    const hierarchyData: Omit<HierarchyItem, 'id'> = {
      name,
      level,
      ...(parentId ? { parentId } : {}), // Only include parentId if it's not undefined
      userId,
      order,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const docRef = await addDoc(collection(db, 'users', userId, 'hierarchy'), hierarchyData);
    console.log('✅ Hierarchy item created with ID:', docRef.id);
    
    return docRef.id;
  } catch (error: unknown) {
    console.error('❌ Error creating hierarchy item:', error);
    throw error;
  }
};

export const updateHierarchyItem = async (
  userId: string,
  itemId: string,
  updates: Partial<HierarchyItem>
): Promise<void> => {
  try {
    console.log('🔄 Updating hierarchy item:', itemId, updates);
    
    await updateDoc(doc(db, 'users', userId, 'hierarchy', itemId), {
      ...updates,
      updatedAt: Date.now()
    });
    
    console.log('✅ Hierarchy item updated successfully');
  } catch (error: unknown) {
    console.error('❌ Error updating hierarchy item:', error);
    throw error;
  }
};

export const deleteHierarchyItem = async (userId: string, itemId: string): Promise<void> => {
  try {
    console.log('🗑️ Deleting hierarchy item and all children:', itemId);
    
    // Get the item to be deleted
    const itemDoc = await getDoc(doc(db, 'users', userId, 'hierarchy', itemId));
    if (!itemDoc.exists()) {
      throw new Error('Hierarchy item not found');
    }
    
    // Find all children recursively
    const findAllChildren = async (parentId: string): Promise<string[]> => {
      const childrenQuery = query(
        collection(db, 'users', userId, 'hierarchy'),
        where('parentId', '==', parentId)
      );
      const childrenSnapshot = await getDocs(childrenQuery);
      
      let allChildIds = childrenSnapshot.docs.map(doc => doc.id);
      
      // Recursively find grandchildren
      for (const childDoc of childrenSnapshot.docs) {
        const grandchildIds = await findAllChildren(childDoc.id);
        allChildIds = [...allChildIds, ...grandchildIds];
      }
      
      return allChildIds;
    };
    
    const childIds = await findAllChildren(itemId);
    
    // Use batch delete for all items
    const batch = writeBatch(db);
    
    // Delete the main item
    batch.delete(doc(db, 'users', userId, 'hierarchy', itemId));
    
    // Delete all children
    childIds.forEach(childId => {
      batch.delete(doc(db, 'users', userId, 'hierarchy', childId));
    });
    
    await batch.commit();
    console.log(`✅ Deleted hierarchy item and ${childIds.length} children`);
    
  } catch (error: unknown) {
    console.error('❌ Error deleting hierarchy item:', error);
    throw error;
  }
};

export const moveHierarchyItemLevel = async (
  userId: string,
  itemId: string,
  newLevel: HierarchyLevel,
  newParentId?: string
): Promise<void> => {
  try {
    console.log('📊 Moving item to new level:', { itemId, newLevel, newParentId });
    
    // Calculate new order at the destination
    // Avoid composite index by fetching items and sorting in JavaScript
    let newOrder = 0;
    
    const orderQuery = query(
      collection(db, 'users', userId, 'hierarchy'),
      where('level', '==', newLevel)
    );
    
    const orderSnapshot = await getDocs(orderQuery);
    
    // Filter and sort in JavaScript to avoid composite index requirements
    let relevantItems;
    if (newParentId) {
      relevantItems = orderSnapshot.docs
        .filter(doc => doc.data().parentId === newParentId)
        .map(doc => doc.data())
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // Sort descending
    } else {
      relevantItems = orderSnapshot.docs
        .filter(doc => !doc.data().parentId)
        .map(doc => doc.data())
        .sort((a, b) => (b.order || 0) - (a.order || 0)); // Sort descending
    }
    
    if (relevantItems.length > 0) {
      newOrder = (relevantItems[0].order || 0) + 1;
    }

    const updateData = {
      level: newLevel,
      order: newOrder,
      updatedAt: Date.now(),
      // Handle parentId properly - use deleteField() to remove it if newParentId is undefined
      ...(newParentId ? { parentId: newParentId } : { parentId: deleteField() })
    };

    console.log('🔍 Firebase move debug:', {
      itemId,
      newLevel,
      newParentId: newParentId || 'undefined (top level)',
      relevantItemsCount: relevantItems.length,
      calculatedOrder: newOrder
    });

    await updateDoc(doc(db, 'users', userId, 'hierarchy', itemId), updateData);
    
    console.log('✅ Item moved to new level successfully');
  } catch (error: unknown) {
    console.error('❌ Error moving hierarchy item:', error);
    throw error;
  }
};

// Returns tags from both the legacy `tags` collection and the hierarchy collection,
// deduplicating by ID. Use this wherever tag IDs on transactions need to be resolved.
export const getAllResolvableTags = async (userId: string): Promise<Tag[]> => {
  const [legacyTags, hierarchyTags] = await Promise.all([
    getTags(userId),
    getTagsFromHierarchy(userId),
  ]);
  const seen = new Set(legacyTags.map(t => t.id));
  const merged = [...legacyTags, ...hierarchyTags.filter(t => !seen.has(t.id))];
  return merged;
};

export const getTagsFromHierarchy = async (userId: string): Promise<Tag[]> => {
  try {
    console.log('🏷️ Fetching tags from hierarchy for user:', userId);
    
    // Get all hierarchy items
    const q = query(collection(db, 'users', userId, 'hierarchy'));
    const querySnapshot = await getDocs(q);
    
    // Filter only level 4 items (tags) and convert them to Tag format
    const tags: Tag[] = [];
    
    querySnapshot.docs.forEach(doc => {
      const item = doc.data() as HierarchyItem;
      if (item.level === 4) { // Only level 4 items are tags
        tags.push({
          id: doc.id, // doc.id is the Firestore document ID; item.id is not stored in the document
          name: item.name,
          color: item.color || '#3B82F6',
          category: 'custom',
          userId: item.userId,
          isDefault: false,
          createdAt: item.createdAt || Date.now(),
          updatedAt: item.updatedAt || Date.now()
        });
      }
    });
    
    // Sort by name for consistent ordering
    tags.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ Found ${tags.length} tags from hierarchy`);
    return tags;
    
  } catch (error: unknown) {
    console.error('❌ Error fetching tags from hierarchy:', error);
    throw error;
  }
};

export const getHierarchyItems = async (userId: string): Promise<HierarchyItem[]> => {
  try {
    console.log('📋 Fetching hierarchy items for user:', userId);
    
    // Avoid composite index by fetching all items and sorting in JavaScript
    const q = query(collection(db, 'users', userId, 'hierarchy'));
    
    const querySnapshot = await getDocs(q);
    const items: HierarchyItem[] = [];
    
    querySnapshot.docs.forEach(doc => {
      items.push({
        id: doc.id,
        ...doc.data()
      } as HierarchyItem);
    });
    
    // Sort in JavaScript to avoid composite index requirements
    // Primary sort by level (1-4), secondary sort by order within level
    items.sort((a, b) => {
      if (a.level !== b.level) {
        return a.level - b.level; // Sort by level first
      }
      return (a.order || 0) - (b.order || 0); // Then by order within level
    });
    
    console.log(`✅ Found ${items.length} hierarchy items`);
    return items;
    
  } catch (error: unknown) {
    console.error('❌ Error fetching hierarchy items:', error);
    throw error;
  }
};

export const getHierarchyItemUsageCount = async (userId: string, itemId: string): Promise<number> => {
  try {
    // Only tags (level 4) can have usage counts from transactions
    const transactionsQuery = query(
      collection(db, 'users', userId, 'transactions'),
      where('tagIds', 'array-contains', itemId)
    );
    
    const snapshot = await getDocs(transactionsQuery);
    return snapshot.docs.length;
    
  } catch (error: unknown) {
    console.error('❌ Error getting item usage count:', error);
    return 0;
  }
};

export const moveHierarchyItemWithChildren = async (
  userId: string,
  itemId: string,
  direction: 'up' | 'down'
): Promise<void> => {
  try {
    console.log('🔄 Moving item with children:', { itemId, direction });
    
    // Get all hierarchy items
    const allItemsQuery = query(collection(db, 'users', userId, 'hierarchy'));
    const allItemsSnapshot = await getDocs(allItemsQuery);
    const allItems = allItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HierarchyItem));
    
    // Find the item to move
    const targetItem = allItems.find(item => item.id === itemId);
    if (!targetItem) {
      throw new Error('Item not found');
    }
    
    // Get all descendants of the target item
    const getDescendants = (parentId: string): HierarchyItem[] => {
      const children = allItems.filter(item => item.parentId === parentId);
      const descendants: HierarchyItem[] = [...children];
      children.forEach(child => {
        descendants.push(...getDescendants(child.id));
      });
      return descendants;
    };
    
    const itemsToMove = [targetItem, ...getDescendants(targetItem.id)];
    
    // Get siblings at the same level and parent
    const siblings = allItems.filter(item => 
      item.level === targetItem.level && 
      item.parentId === targetItem.parentId
    ).sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const currentIndex = siblings.findIndex(item => item.id === targetItem.id);
    
    // Check if move is valid
    if ((direction === 'up' && currentIndex === 0) || 
        (direction === 'down' && currentIndex === siblings.length - 1)) {
      console.log('Cannot move item in that direction');
      return;
    }
    
    // Calculate new positions
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const swapSibling = siblings[targetIndex];
    
    // Get all descendants of the swap sibling
    const swapSiblingDescendants = getDescendants(swapSibling.id);
    const swapItemsToMove = [swapSibling, ...swapSiblingDescendants];
    
    // Calculate order adjustments
    const targetNewOrder = swapSibling.order || 0;
    const swapNewOrder = targetItem.order || 0;
    
    // Calculate the order offset for descendants
    const targetOrderOffset = targetNewOrder - (targetItem.order || 0);
    const swapOrderOffset = swapNewOrder - (swapSibling.order || 0);
    
    // Prepare batch updates
    const batch = writeBatch(db);
    
    // Update target item and its descendants
    itemsToMove.forEach(item => {
      const newOrder = (item.order || 0) + targetOrderOffset;
      batch.update(doc(db, 'users', userId, 'hierarchy', item.id), {
        order: newOrder,
        updatedAt: Date.now()
      });
    });
    
    // Update swap sibling and its descendants
    swapItemsToMove.forEach(item => {
      const newOrder = (item.order || 0) + swapOrderOffset;
      batch.update(doc(db, 'users', userId, 'hierarchy', item.id), {
        order: newOrder,
        updatedAt: Date.now()
      });
    });
    
    await batch.commit();
    console.log('✅ Items moved successfully');
    
  } catch (error: unknown) {
    console.error('❌ Error moving hierarchy item with children:', error);
    throw error;
  }
};

export const getTransactionsByAccountPageSimple = async (
  userId: string, 
  accountId: string, 
  pageSize: number = 100,
  pageNumber: number = 1
): Promise<{
  transactions: Transaction[];
  tagsMap: Record<string, Tag[]>;
  splitsMap: Record<string, TransactionSplit[]>;
}> => {
  try {
    console.log(`📄 Fetching page ${pageNumber} with ${pageSize} transactions for account:`, accountId);
    
    // Simple approach: load all transactions and slice them
    // This is not ideal for large datasets but will work for now
    const q = query(
      collection(db, 'users', userId, 'transactions'),
      where('accountId', '==', accountId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const allTransactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    
    // Get the transactions for the specific page
    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageTransactions = allTransactions.slice(startIndex, endIndex);
    
    console.log(`📊 Page ${pageNumber}: ${pageTransactions.length} transactions (${startIndex + 1}-${endIndex} of ${allTransactions.length})`);
    
    // Get related data for the page transactions
    const transactionIds = pageTransactions.map(t => t.id);
    const [tags, splits] = await Promise.all([
      getTransactionTagsBatch(transactionIds, userId),
      getTransactionSplitsBatch(transactionIds, userId)
    ]);
    
    // Build maps
    const tagsMap: Record<string, Tag[]> = {};
    const splitsMap: Record<string, TransactionSplit[]> = {};
    
    pageTransactions.forEach(transaction => {
      // For tags, filter by the transaction's tagIds
      if (transaction.tagIds && transaction.tagIds.length > 0) {
        tagsMap[transaction.id] = tags.filter(tag => transaction.tagIds!.includes(tag.id));
      } else {
        tagsMap[transaction.id] = [];
      }
      
      // For splits, filter by the transaction's ID
      splitsMap[transaction.id] = splits.filter(split => split.transactionId === transaction.id);
    });
    
    return {
      transactions: pageTransactions,
      tagsMap,
      splitsMap
    };
  } catch (error: unknown) {
    console.error('❌ Error getting transactions by page:', error);
    throw error;
  }
};

export const getTransactionCount = async (userId: string, accountId: string): Promise<number> => {
  try {
    console.log(`💰 Getting transaction count for account:`, accountId);
    
    const q = query(
      collection(db, 'users', userId, 'transactions'),
      where('accountId', '==', accountId)
    );
    
    const querySnapshot = await getDocs(q);
    const count = querySnapshot.size;
    
    console.log(`✅ Found ${count} total transactions for account`);
    
    return count;
  } catch (error: unknown) {
    console.error('❌ Error getting transaction count:', error);
    throw error;
  }
};