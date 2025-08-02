import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';

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
}

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
    const profileWithTimestamp = { ...profile, timestamp: Date.now() };
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