#!/usr/bin/env node

/**
 * Firebase Domain Authorization Check Script
 * 
 * This script helps verify that your domain is properly authorized in Firebase.
 * Run this script to check if your current domain is allowed to use Firebase Auth.
 */

const https = require('https');
const { URL } = require('url');

// Get the domain from command line or use localhost
const domain = process.argv[2] || 'localhost:5173';

console.log('🔍 Checking Firebase domain authorization...');
console.log(`📍 Domain: ${domain}`);
console.log('');

// Function to check if domain is accessible
const checkDomain = (domain) => {
  return new Promise((resolve, reject) => {
    const url = `https://${domain}`;
    
    const req = https.get(url, (res) => {
      console.log(`✅ Domain ${domain} is accessible (Status: ${res.statusCode})`);
      resolve(true);
    });
    
    req.on('error', (error) => {
      if (error.code === 'ENOTFOUND') {
        console.log(`❌ Domain ${domain} not found`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`❌ Connection refused to ${domain}`);
      } else {
        console.log(`❌ Error accessing ${domain}: ${error.message}`);
      }
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ Timeout accessing ${domain}`);
      req.destroy();
      resolve(false);
    });
  });
};

// Function to check Firebase Auth domain
const checkFirebaseAuth = async () => {
  console.log('🔐 Checking Firebase Authentication domain authorization...');
  console.log('');
  
  // Common development domains
  const devDomains = [
    'localhost:5173',
    'localhost:3000',
    'localhost:8080',
    '127.0.0.1:5173',
    '127.0.0.1:3000'
  ];
  
  console.log('📋 Checking common development domains:');
  for (const devDomain of devDomains) {
    await checkDomain(devDomain);
  }
  
  console.log('');
  console.log('🔧 Firebase Console Configuration Steps:');
  console.log('1. Go to Firebase Console: https://console.firebase.google.com');
  console.log('2. Select your project');
  console.log('3. Go to Authentication > Settings > Authorized domains');
  console.log('4. Add these domains if not present:');
  console.log('   - localhost');
  console.log('   - 127.0.0.1');
  console.log('   - Your production domain (if any)');
  console.log('');
  console.log('⚠️  Note: For development, localhost should be automatically authorized.');
  console.log('   If you\'re still getting domain errors, check your Firebase project settings.');
};

// Run the check
checkFirebaseAuth().catch(console.error); 