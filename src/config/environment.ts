/**
 * Environment Configuration
 * 
 * This file handles environment-specific settings for security and API restrictions.
 * It provides different configurations for development and production environments.
 */

export interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  allowedDomains: string[];
  apiKeyRestrictions: {
    enabled: boolean;
    domains: string[];
    referrers: string[];
  };
  firebase: {
    authDomain: string;
    projectId: string;
    storageBucket: string;
  };
}

// Development configuration (unrestricted for easier development)
const developmentConfig: EnvironmentConfig = {
  isDevelopment: true,
  isProduction: false,
  allowedDomains: [
    'localhost',
    '127.0.0.1',
    'localhost:5173',
    'localhost:5174',
    'localhost:5175',
    'localhost:5176',
    '127.0.0.1:5173',
    '127.0.0.1:5174',
    '127.0.0.1:5175',
    '127.0.0.1:5176'
  ],
  apiKeyRestrictions: {
    enabled: false, // No restrictions in development
    domains: [],
    referrers: []
  },
  firebase: {
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || ''
  }
};

// Production configuration (restricted for security)
const productionConfig: EnvironmentConfig = {
  isDevelopment: false,
  isProduction: true,
  allowedDomains: [
    'opheliahub-f9851.firebaseapp.com',
    'opheliahub.com',
    'www.opheliahub.com'
  ],
  apiKeyRestrictions: {
    enabled: true, // Restrictions enabled in production
    domains: [
      'opheliahub-f9851.firebaseapp.com',
      'opheliahub.com',
      'www.opheliahub.com'
    ],
    referrers: [
      'https://opheliahub-f9851.firebaseapp.com/*',
      'https://opheliahub.com/*',
      'https://www.opheliahub.com/*'
    ]
  },
  firebase: {
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || ''
  }
};

// Determine current environment
const isDevelopment = import.meta.env.DEV;

// Export the appropriate configuration
export const config: EnvironmentConfig = isDevelopment ? developmentConfig : productionConfig;

// Helper functions
export const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return 'localhost';
};

export const isDomainAllowed = (domain: string): boolean => {
  return config.allowedDomains.includes(domain);
};

export const getSecurityInfo = () => {
  const currentDomain = getCurrentDomain();
  return {
    currentDomain,
    isAllowed: isDomainAllowed(currentDomain),
    environment: isDevelopment ? 'development' : 'production',
    restrictionsEnabled: config.apiKeyRestrictions.enabled
  };
};

// Console logging for development
if (isDevelopment) {
  console.log('🔧 Environment Configuration:', {
    environment: 'development',
    currentDomain: getCurrentDomain(),
    allowedDomains: config.allowedDomains,
    restrictionsEnabled: config.apiKeyRestrictions.enabled
  });
} 