import React, { useEffect, useState } from 'react';
import { auth, storage } from '../firebase/config';
import { ref, listAll, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { onAuthStateChanged, type User } from 'firebase/auth';

const StorageTest: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [testStatus, setTestStatus] = useState<string>('Ready to test');
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        setTestResults(prev => [...prev, `✅ User authenticated: ${user.email}`]);
      } else {
        setTestResults(prev => [...prev, '❌ No user authenticated']);
      }
    });

    return unsubscribe;
  }, []);

  const runStorageTests = async () => {
    setTestStatus('Running tests...');
    setError(null);
    setTestResults([]);

    if (!user) {
      setTestStatus('❌ Cannot test storage - User not authenticated');
      setError('Please sign in to test storage functionality');
      return;
    }

    try {
      // Test 1: List files in test directory
      setTestResults(prev => [...prev, '🔍 Testing: List files in test directory']);
      const testRef = ref(storage, 'test');
      const result = await listAll(testRef);
      setTestResults(prev => [...prev, `✅ List test successful - Found ${result.items.length} files`]);

      // Test 2: Create a test file
      setTestResults(prev => [...prev, '🔍 Testing: Create test file']);
      const testFileRef = ref(storage, `test/test-${Date.now()}.txt`);
      const testContent = new Blob(['Test file content'], { type: 'text/plain' });
      await uploadBytes(testFileRef, testContent);
      setTestResults(prev => [...prev, '✅ Test file created successfully']);

      // Test 3: Get download URL
      setTestResults(prev => [...prev, '🔍 Testing: Get download URL']);
      const downloadURL = await getDownloadURL(testFileRef);
      setTestResults(prev => [...prev, `✅ Download URL generated successfully (${downloadURL.substring(0, 50)}...)`]);

      // Test 4: Delete test file
      setTestResults(prev => [...prev, '🔍 Testing: Delete test file']);
      await deleteObject(testFileRef);
      setTestResults(prev => [...prev, '✅ Test file deleted successfully']);

      // Test 5: Test profile images directory
      setTestResults(prev => [...prev, '🔍 Testing: Profile images directory access']);
      const profileRef = ref(storage, `profile-images/${user.uid}`);
      await listAll(profileRef);
      setTestResults(prev => [...prev, '✅ Profile images directory accessible']);

      setTestStatus('✅ All storage tests passed!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Storage test error:', error);
      
      let errorType = 'Unknown error';
      if (errorMessage.includes('403')) {
        errorType = '403 Forbidden - Authentication or permission issue';
      } else if (errorMessage.includes('401')) {
        errorType = '401 Unauthorized - Authentication required';
      } else if (errorMessage.includes('404')) {
        errorType = '404 Not Found - Directory may not exist';
      }

      setTestStatus(`❌ Storage test failed: ${errorType}`);
      setError(`Storage error: ${errorMessage}`);
      setTestResults(prev => [...prev, `❌ Test failed: ${errorType}`]);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Firebase Storage Test</h2>
      
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">User Status:</span>
          <span className={`text-sm ${user ? 'text-green-600' : 'text-red-600'}`}>
            {user ? `✅ ${user.email}` : '❌ Not signed in'}
          </span>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <span className="font-medium">Test Status:</span>
          <span className={`text-sm ${testStatus.includes('✅') ? 'text-green-600' : testStatus.includes('❌') ? 'text-red-600' : 'text-blue-600'}`}>
            {testStatus}
          </span>
        </div>
        
        <button
          onClick={runStorageTests}
          disabled={!user}
          className={`px-4 py-2 rounded-lg text-white font-medium ${
            user 
              ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300' 
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          {user ? 'Run Storage Tests' : 'Sign in to test storage'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 rounded-lg">
          <span className="text-sm text-red-800">
            ❌ Error: {error}
          </span>
        </div>
      )}

      {testResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700">Test Results:</h3>
          <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
            {testResults.map((result, index) => (
              <div key={index} className="text-sm mb-1">
                {result}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>User ID: {user?.uid || 'Not available'}</p>
        <p>Storage Bucket: {storage.app.options.storageBucket}</p>
      </div>
    </div>
  );
};

export default StorageTest; 