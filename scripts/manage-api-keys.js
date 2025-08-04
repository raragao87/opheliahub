#!/usr/bin/env node

/**
 * API Key Management Script
 * 
 * This script helps manage Firebase API key restrictions for different environments.
 * It provides guidance on setting up proper security configurations.
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔑 Firebase API Key Management Tool');
console.log('=====================================\n');

const environments = {
  development: {
    name: 'Development',
    description: 'Local development with unrestricted API key',
    restrictions: 'Disabled',
    domains: ['localhost', '127.0.0.1'],
    instructions: [
      '1. Go to Google Cloud Console > APIs & Services > Credentials',
      '2. Find your Firebase API key',
      '3. Set Application restrictions to "None"',
      '4. Set API restrictions to "Don\'t restrict key"',
      '5. Click Save'
    ]
  },
  production: {
    name: 'Production',
    description: 'Production with restricted API key for security',
    restrictions: 'Enabled',
    domains: [
      'opheliahub-f9851.firebaseapp.com',
      'opheliahub.com',
      'www.opheliahub.com'
    ],
    instructions: [
      '1. Go to Google Cloud Console > APIs & Services > Credentials',
      '2. Find your Firebase API key',
      '3. Set Application restrictions to "HTTP referrers (web sites)"',
      '4. Add these referrers:',
      '   - https://opheliahub-f9851.firebaseapp.com/*',
      '   - https://opheliahub.com/*',
      '   - https://www.opheliahub.com/*',
      '5. Set API restrictions to "Restrict key"',
      '6. Select these APIs:',
      '   - Firebase Authentication API',
      '   - Firebase Realtime Database API',
      '   - Firebase Cloud Firestore API',
      '   - Firebase Cloud Storage API',
      '7. Click Save'
    ]
  }
};

function showEnvironmentInfo(env) {
  console.log(`\n📋 ${env.name} Environment Configuration`);
  console.log('='.repeat(50));
  console.log(`Description: ${env.description}`);
  console.log(`Restrictions: ${env.restrictions}`);
  console.log(`Allowed Domains: ${env.domains.join(', ')}`);
  console.log('\n🔧 Setup Instructions:');
  env.instructions.forEach((instruction, index) => {
    console.log(`   ${instruction}`);
  });
}

function showSecurityChecklist() {
  console.log('\n📋 Security Checklist');
  console.log('=====================');
  console.log('Development:');
  console.log('  ☐ API key restrictions disabled');
  console.log('  ☐ localhost domains allowed');
  console.log('  ☐ Environment config set to development');
  console.log('  ☐ Console shows "restrictions DISABLED"');
  console.log('\nProduction:');
  console.log('  ☐ API key restrictions enabled');
  console.log('  ☐ Production domains in referrers list');
  console.log('  ☐ Firebase APIs restricted');
  console.log('  ☐ Custom domains added to Firebase');
  console.log('  ☐ HTTPS enabled on production');
  console.log('  ☐ Console shows "restrictions ENABLED"');
}

function showTroubleshooting() {
  console.log('\n🚨 Troubleshooting Guide');
  console.log('========================');
  console.log('Common Issues:');
  console.log('1. "API key not valid" in development');
  console.log('   → Ensure API key restrictions are disabled');
  console.log('\n2. "API key not valid" in production');
  console.log('   → Check domain restrictions in Google Cloud Console');
  console.log('   → Verify HTTPS is used in production');
  console.log('\n3. Authentication fails on custom domain');
  console.log('   → Add custom domain to Firebase authorized domains');
  console.log('   → Update API key restrictions to include custom domain');
}

function main() {
  console.log('Select an option:');
  console.log('1. Show Development Configuration');
  console.log('2. Show Production Configuration');
  console.log('3. Show Security Checklist');
  console.log('4. Show Troubleshooting Guide');
  console.log('5. Exit');
  
  rl.question('\nEnter your choice (1-5): ', (choice) => {
    switch (choice.trim()) {
      case '1':
        showEnvironmentInfo(environments.development);
        break;
      case '2':
        showEnvironmentInfo(environments.production);
        break;
      case '3':
        showSecurityChecklist();
        break;
      case '4':
        showTroubleshooting();
        break;
      case '5':
        console.log('\n👋 Goodbye!');
        rl.close();
        return;
      default:
        console.log('\n❌ Invalid choice. Please enter 1-5.');
    }
    
    rl.question('\nPress Enter to continue...', () => {
      console.clear();
      main();
    });
  });
}

// Show initial information
console.log('This tool helps you configure Firebase API key restrictions');
console.log('for different environments (development vs production).\n');

main(); 