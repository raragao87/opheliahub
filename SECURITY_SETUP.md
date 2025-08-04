# 🔒 Security Setup Guide

## Overview

This guide explains how to set up proper security for Firebase API keys with domain restrictions for production while maintaining smooth development workflow.

## 🏗️ Architecture

### Development Environment
- **API Key Restrictions**: Disabled
- **Allowed Domains**: localhost, 127.0.0.1 (all ports)
- **Security Level**: Low (for development convenience)

### Production Environment
- **API Key Restrictions**: Enabled
- **Allowed Domains**: Firebase hosting + custom domains
- **Security Level**: High (proper restrictions)

## 🔧 Google Cloud Console Setup

### Step 1: Access API Key Settings

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project: `opheliahub-f9851`
3. Navigate to **APIs & Services** > **Credentials**
4. Find your Firebase API key (starts with `AIzaSy`)

### Step 2: Configure API Key Restrictions

#### For Development (Unrestricted)
1. Click on your API key
2. Under **Application restrictions**, select **None**
3. Under **API restrictions**, select **Don't restrict key**
4. Click **Save**

#### For Production (Restricted)
1. Click on your API key
2. Under **Application restrictions**, select **HTTP referrers (web sites)**
3. Add the following referrers:
   ```
   https://opheliahub-f9851.firebaseapp.com/*
   https://opheliahub.com/*
   https://www.opheliahub.com/*
   ```
4. Under **API restrictions**, select **Restrict key**
5. Select these APIs:
   - Firebase Authentication API
   - Firebase Realtime Database API
   - Firebase Cloud Firestore API
   - Firebase Cloud Storage API
6. Click **Save**

## 🌐 Domain Configuration

### Development Domains
```
localhost
127.0.0.1
localhost:5173
localhost:5174
localhost:5175
localhost:5176
127.0.0.1:5173
127.0.0.1:5174
127.0.0.1:5175
127.0.0.1:5176
```

### Production Domains
```
opheliahub-f9851.firebaseapp.com
opheliahub.com
www.opheliahub.com
```

## 🔄 Environment Switching

### Development Mode
```bash
# Start development server
npm run dev

# Environment: Development
# API Restrictions: Disabled
# Domain Validation: localhost allowed
```

### Production Mode
```bash
# Build for production
npm run build

# Environment: Production
# API Restrictions: Enabled
# Domain Validation: Production domains only
```

## 🛠️ Configuration Files

### Environment Configuration (`src/config/environment.ts`)
```typescript
// Development config (unrestricted)
const developmentConfig = {
  apiKeyRestrictions: { enabled: false },
  allowedDomains: ['localhost', '127.0.0.1', ...]
};

// Production config (restricted)
const productionConfig = {
  apiKeyRestrictions: { enabled: true },
  allowedDomains: ['opheliahub-f9851.firebaseapp.com', ...]
};
```

### Firebase Configuration (`src/firebase/config.ts`)
```typescript
// Automatic environment detection
const config = import.meta.env.DEV ? developmentConfig : productionConfig;

// Domain validation
const currentDomain = getCurrentDomain();
const isAllowed = isDomainAllowed(currentDomain);
```

## 🧪 Testing Security Configuration

### Development Testing
1. Start development server: `npm run dev`
2. Open browser console
3. Look for security validation messages:
   ```
   🔧 Environment Configuration: { environment: 'development', ... }
   🔓 API key restrictions are DISABLED (development mode)
   ✅ Domain validation passed: localhost
   ```

### Production Testing
1. Build for production: `npm run build`
2. Deploy to Firebase: `firebase deploy`
3. Test on production domain
4. Check console for security validation:
   ```
   🔒 API key restrictions are ENABLED (production mode)
   ✅ Domain validation passed: opheliahub-f9851.firebaseapp.com
   ```

## 🚨 Troubleshooting

### Common Issues

#### 1. "API key not valid" in development
**Solution**: Ensure API key restrictions are disabled for development
- Go to Google Cloud Console > Credentials
- Set Application restrictions to "None"
- Set API restrictions to "Don't restrict key"

#### 2. "API key not valid" in production
**Solution**: Check domain restrictions
- Verify your domain is in the allowed list
- Check HTTP referrers in Google Cloud Console
- Ensure HTTPS is used in production

#### 3. Authentication fails on custom domain
**Solution**: Add custom domain to Firebase
- Go to Firebase Console > Authentication > Settings
- Add your custom domain to "Authorized domains"
- Update API key restrictions to include custom domain

### Debug Commands

```bash
# Check current environment
npm run dev    # Development mode
npm run build  # Production mode

# Test domain validation
node scripts/check-firebase-auth.js

# Check security configuration
# Look for console logs in browser
```

## 📋 Security Checklist

### Development Setup
- [ ] API key restrictions disabled
- [ ] localhost domains allowed
- [ ] Environment config set to development
- [ ] Console shows "restrictions DISABLED"

### Production Setup
- [ ] API key restrictions enabled
- [ ] Production domains in referrers list
- [ ] Firebase APIs restricted
- [ ] Custom domains added to Firebase
- [ ] HTTPS enabled on production
- [ ] Console shows "restrictions ENABLED"

### Deployment Checklist
- [ ] Build successful: `npm run build`
- [ ] Deploy successful: `firebase deploy`
- [ ] Production domain accessible
- [ ] Authentication works on production
- [ ] Storage operations work on production
- [ ] No console errors on production

## 🔐 Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for all credentials
3. **Enable restrictions** in production
4. **Regularly rotate** API keys
5. **Monitor usage** in Google Cloud Console
6. **Use HTTPS** in production
7. **Validate domains** before deployment

## 📞 Support

If you encounter issues:

1. Check the [DEBUG.md](./DEBUG.md) guide
2. Review console logs for security validation
3. Verify Google Cloud Console settings
4. Test with the FirebaseTest component
5. Check Firebase Console for domain authorization

---

**Remember**: Security is a continuous process. Regularly review and update your security configuration! 