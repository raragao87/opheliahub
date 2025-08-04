import React, { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { config, isDomainAllowed, getSecurityInfo } from '../config/environment';

const SecurityTest: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [securityInfo, setSecurityInfo] = useState(getSecurityInfo());
  const [testResults, setTestResults] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setSecurityInfo(getSecurityInfo());
    });

    return unsubscribe;
  }, []);

  const runSecurityTests = () => {
    setTestResults([]);
    const results: string[] = [];

    // Test 1: Environment detection
    results.push(`🔍 Environment: ${securityInfo.environment}`);
    results.push(`🔍 Current Domain: ${securityInfo.currentDomain}`);
    results.push(`🔍 Domain Allowed: ${securityInfo.isAllowed ? '✅ Yes' : '❌ No'}`);
    results.push(`🔍 Restrictions Enabled: ${securityInfo.restrictionsEnabled ? '🔒 Yes' : '🔓 No'}`);

    // Test 2: Domain validation
    if (isDomainAllowed(securityInfo.currentDomain)) {
      results.push('✅ Domain validation: PASSED');
    } else {
      results.push('❌ Domain validation: FAILED');
      results.push(`   Current domain "${securityInfo.currentDomain}" not in allowed list`);
      results.push(`   Allowed domains: ${config.allowedDomains.join(', ')}`);
    }

    // Test 3: Authentication status
    if (user) {
      results.push('✅ Authentication: User signed in');
      results.push(`   User: ${user.email}`);
      results.push(`   UID: ${user.uid}`);
    } else {
      results.push('⚠️  Authentication: No user signed in');
      results.push('   Note: Some Firebase operations require authentication');
    }

    // Test 4: Security configuration
    if (securityInfo.environment === 'development') {
      results.push('🔓 Development Mode: API restrictions disabled');
      results.push('   This is normal for development');
    } else {
      results.push('🔒 Production Mode: API restrictions enabled');
      results.push('   This is the secure configuration for production');
    }

    // Test 5: Domain-specific checks
    if (securityInfo.currentDomain.includes('localhost')) {
      results.push('🏠 Local Development: localhost detected');
      results.push('   Expected for development environment');
    } else if (securityInfo.currentDomain.includes('firebaseapp.com')) {
      results.push('☁️  Firebase Hosting: firebaseapp.com detected');
      results.push('   Expected for production environment');
    } else {
      results.push('🌐 Custom Domain: Custom domain detected');
      results.push('   Make sure this domain is in your API key restrictions');
    }

    setTestResults(results);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Security Configuration Test</h2>
      
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-600">Environment</span>
            <div className={`text-sm ${securityInfo.environment === 'development' ? 'text-blue-600' : 'text-green-600'}`}>
              {securityInfo.environment}
            </div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-600">Domain</span>
            <div className={`text-sm ${securityInfo.isAllowed ? 'text-green-600' : 'text-red-600'}`}>
              {securityInfo.currentDomain}
            </div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-600">Domain Allowed</span>
            <div className={`text-sm ${securityInfo.isAllowed ? 'text-green-600' : 'text-red-600'}`}>
              {securityInfo.isAllowed ? '✅ Yes' : '❌ No'}
            </div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-600">Restrictions</span>
            <div className={`text-sm ${securityInfo.restrictionsEnabled ? 'text-green-600' : 'text-blue-600'}`}>
              {securityInfo.restrictionsEnabled ? '🔒 Enabled' : '🔓 Disabled'}
            </div>
          </div>
        </div>
        
        <button
          onClick={runSecurityTests}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
        >
          Run Security Tests
        </button>
      </div>

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

      <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
        <h4 className="font-medium text-yellow-800 mb-2">Security Recommendations:</h4>
        <ul className="text-sm text-yellow-700 space-y-1">
          {securityInfo.environment === 'development' && (
            <>
              <li>• Development: API restrictions should be disabled</li>
              <li>• Use unrestricted API key for local development</li>
            </>
          )}
          {securityInfo.environment === 'production' && (
            <>
              <li>• Production: API restrictions should be enabled</li>
              <li>• Verify domain is in Google Cloud Console restrictions</li>
              <li>• Ensure HTTPS is used in production</li>
            </>
          )}
          {!securityInfo.isAllowed && (
            <li>• Add current domain to allowed domains list</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default SecurityTest; 