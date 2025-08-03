# 🚀 Deployment Guide

## Environment Setup

### Development Environment

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Configure Firebase credentials:**
   Edit `.env` with your Firebase project settings:
   ```bash
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

### Production Deployment

#### Firebase Hosting

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Set environment variables in Firebase:**
   ```bash
   firebase functions:config:set firebase.api_key="your_api_key"
   firebase functions:config:set firebase.auth_domain="your_auth_domain"
   firebase functions:config:set firebase.project_id="your_project_id"
   firebase functions:config:set firebase.storage_bucket="your_storage_bucket"
   firebase functions:config:set firebase.messaging_sender_id="your_sender_id"
   firebase functions:config:set firebase.app_id="your_app_id"
   ```

3. **Deploy to Firebase:**
   ```bash
   firebase deploy
   ```

#### Vercel Deployment

1. **Connect your repository to Vercel**

2. **Set environment variables in Vercel dashboard:**
   - Go to Project Settings → Environment Variables
   - Add all Firebase environment variables
   - Set them for Production, Preview, and Development environments

3. **Deploy:**
   ```bash
   vercel --prod
   ```

#### Netlify Deployment

1. **Connect your repository to Netlify**

2. **Set environment variables:**
   - Go to Site Settings → Environment Variables
   - Add all Firebase environment variables

3. **Build settings:**
   - Build command: `npm run build`
   - Publish directory: `dist`

## Security Checklist for Deployment

### Pre-deployment

- [ ] Environment variables configured
- [ ] No secrets in source code
- [ ] Firebase security rules deployed
- [ ] Storage security rules deployed
- [ ] Authentication properly configured

### Post-deployment

- [ ] Application loads without errors
- [ ] Authentication works correctly
- [ ] File uploads work (if applicable)
- [ ] Database operations work
- [ ] No console errors

## Environment-Specific Configurations

### Development
- Uses local `.env` file
- Debug logging enabled
- Hot reload enabled

### Staging
- Uses staging environment variables
- Limited debug logging
- Production-like configuration

### Production
- Uses production environment variables
- No debug logging
- Optimized for performance
- CDN enabled

## Troubleshooting

### Common Issues

1. **Environment variables not loading:**
   - Ensure `.env` file exists in project root
   - Restart development server after changes
   - Check variable names start with `VITE_`

2. **Firebase connection errors:**
   - Verify API key is correct
   - Check project ID matches Firebase console
   - Ensure Firebase services are enabled

3. **Build failures:**
   - Check for TypeScript errors
   - Verify all dependencies are installed
   - Clear build cache: `npm run build -- --force`

### Security Issues

1. **Exposed credentials:**
   - Immediately revoke exposed credentials
   - Generate new credentials
   - Update all environment variables
   - Remove from Git history if committed

2. **Unauthorized access:**
   - Review Firebase security rules
   - Check authentication configuration
   - Monitor Firebase console for unusual activity

## Monitoring

### Firebase Console
- Monitor authentication attempts
- Check Firestore usage
- Review Storage access logs
- Monitor function executions

### Application Monitoring
- Set up error tracking (Sentry, etc.)
- Monitor performance metrics
- Track user analytics
- Set up alerts for security events

---

**Remember: Never commit production credentials to version control!** 