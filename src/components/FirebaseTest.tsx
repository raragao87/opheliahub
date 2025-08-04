import React, { useEffect, useState } from 'react';
import { auth, db, storage } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';

const FirebaseTest: React.FC = () => {
  const [authStatus, setAuthStatus] = useState<string>('Checking...');
  const [firestoreStatus, setFirestoreStatus] = useState<string>('Checking...');
  const [storageStatus, setStorageStatus] = useState<string>('Checking...');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Test Firebase Auth
    const testAuth = async () => {
      try {
        setAuthStatus('Testing...');
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          setUser(user);
          setAuthStatus('✅ Auth working - User state updated');
        }, (error) => {
          setAuthStatus(`❌ Auth error: ${error.message}`);
          setError(`Auth error: ${error.message}`);
        });
        return unsubscribe;
      } catch (error) {
        setAuthStatus(`❌ Auth test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setError(`Auth test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    // Test Firestore
    const testFirestore = async () => {
      try {
        setFirestoreStatus('Testing...');
        const testCollection = collection(db, 'test');
        await getDocs(testCollection);
        setFirestoreStatus('✅ Firestore working - Can read collections');
      } catch (error) {
        setFirestoreStatus(`❌ Firestore error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setError(`Firestore error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    // Test Storage
    const testStorage = async () => {
      try {
        setStorageStatus('Testing...');
        
        // First check if user is authenticated
        if (!auth.currentUser) {
          setStorageStatus('❌ Storage error: User not authenticated');
          setError('Storage error: User not authenticated');
          return;
        }
        
        const testRef = ref(storage, 'test');
        await listAll(testRef);
        setStorageStatus('✅ Storage working - Can list files');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Storage test error:', error);
        
        if (errorMessage.includes('403')) {
          setStorageStatus('❌ Storage error: 403 Forbidden - Check authentication and rules');
          setError('Storage error: 403 Forbidden - User may not be authenticated or rules may be blocking access');
        } else if (errorMessage.includes('401')) {
          setStorageStatus('❌ Storage error: 401 Unauthorized - Authentication required');
          setError('Storage error: 401 Unauthorized - Please sign in to access storage');
        } else {
          setStorageStatus(`❌ Storage error: ${errorMessage}`);
          setError(`Storage error: ${errorMessage}`);
        }
      }
    };

    testAuth();
    testFirestore();
    testStorage();
  }, []);

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-md mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Firebase Connection Test</h2>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">Authentication:</span>
          <span className={`text-sm ${authStatus.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
            {authStatus}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="font-medium">User Status:</span>
          <span className={`text-sm ${user ? 'text-green-600' : 'text-orange-600'}`}>
            {user ? `✅ Signed in as ${user.email}` : '❌ Not signed in'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="font-medium">Firestore:</span>
          <span className={`text-sm ${firestoreStatus.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
            {firestoreStatus}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="font-medium">Storage:</span>
          <span className={`text-sm ${storageStatus.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
            {storageStatus}
          </span>
        </div>
        
        {user && (
          <div className="mt-4 p-3 bg-green-50 rounded">
            <span className="text-sm text-green-800">
              ✅ User authenticated: {user.email}
            </span>
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 rounded">
            <span className="text-sm text-red-800">
              ❌ Error: {error}
            </span>
          </div>
        )}
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        <p>Domain: {window.location.hostname}</p>
        <p>Origin: {window.location.origin}</p>
      </div>
    </div>
  );
};

export default FirebaseTest; 