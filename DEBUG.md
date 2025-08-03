# 🔍 Firebase Authentication Debug Guide

## 🚨 Common Issues After API Key Regeneration

### Issue 1: "Failed to load resource: the server responded with a status of 400"

**Possible Causes:**
- Invalid API key format
- Incorrect project ID
- Missing or incorrect environment variables
- Domain not authorized in Firebase

**Debug Steps:**
1. Check console logs for Firebase configuration debug info
2. Verify `.env` file has correct values
3. Ensure API key starts with `AIzaSy`
4. Check project ID matches Firebase console

### Issue 2: "Unable to verify that the app domain is authorized"

**Possible Causes:**
- Domain not added to Firebase authorized domains
- Using wrong domain in development
- Firebase project configuration issues

**Debug Steps:**
1. Run the domain check script: `node scripts/check-firebase-auth.js`
2. Check Firebase Console > Authentication > Settings > Authorized domains
3. Add `localhost` and `127.0.0.1` to authorized domains
4. Verify you're using the correct Firebase project

## 🔧 Step-by-Step Debugging

### Step 1: Verify Environment Variables

Check your `.env` file has all required variables:

```bash
VITE_FIREBASE_API_KEY=AIzaSy...your_new_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Step 2: Check Console Debug Output

Open browser console and look for:
- ✅ Firebase Configuration Debug section
- ✅ API Key present: true
- ✅ Auth Domain present: true
- ✅ Project ID present: true

### Step 3: Test Firebase Connection

The FirebaseTest component will show:
- Authentication status
- Firestore status  
- Storage status
- Current domain information

### Step 4: Verify Firebase Console Settings

1. **Go to Firebase Console:** https://console.firebase.google.com
2. **Select your project**
3. **Check Authentication > Settings > Authorized domains:**
   - Should include `localhost`
   - Should include `127.0.0.1`
   - Add your production domain if needed

4. **Check Project Settings > General:**
   - Verify project ID matches your `.env` file
   - Check that the project is active

### Step 5: Check API Key Permissions

1. **Go to Google Cloud Console:** https://console.cloud.google.com
2. **Select your Firebase project**
3. **Go to APIs & Services > Credentials**
4. **Find your API key and check:**
   - API restrictions (should include Firebase APIs)
   - Application restrictions (should allow your domain)

## 🛠️ Troubleshooting Commands

### Check Environment Variables
```bash
# Verify .env file exists and has correct format
cat .env | grep VITE_FIREBASE
```

### Test Build Process
```bash
# Ensure build works with new credentials
npm run build
```

### Check Domain Authorization
```bash
# Run the domain check script
node scripts/check-firebase-auth.js
```

### Test Development Server
```bash
# Start dev server and check console
npm run dev
```

## 🔍 Debug Information to Collect

When reporting issues, include:

1. **Console Output:**
   - Firebase configuration debug info
   - Any error messages
   - Network tab errors

2. **Environment Info:**
   - Current domain (localhost:5173)
   - Browser being used
   - Development vs production

3. **Firebase Console Info:**
   - Project ID
   - Authorized domains list
   - API key restrictions

## 🚨 Emergency Fixes

### If Authentication Completely Broken:

1. **Regenerate API Key Again:**
   - Go to Firebase Console > Project Settings > General
   - Click "Regenerate" next to Web API Key
   - Update `.env` file with new key

2. **Reset Firebase Configuration:**
   - Delete `.env` file
   - Copy `.env.example` to `.env`
   - Add fresh credentials

3. **Check Firebase Project Status:**
   - Ensure project is not suspended
   - Verify billing is set up (if required)
   - Check if project has any restrictions

## 📋 Pre-flight Checklist

Before testing authentication:

- [ ] `.env` file exists and has all variables
- [ ] API key starts with `AIzaSy`
- [ ] Project ID matches Firebase console
- [ ] Domain is in authorized domains list
- [ ] Firebase project is active
- [ ] No console errors during initialization
- [ ] FirebaseTest component shows all ✅

## 🆘 Still Having Issues?

If the above steps don't resolve the issue:

1. **Check Firebase Status:** https://status.firebase.google.com
2. **Verify Google Cloud Console:** https://console.cloud.google.com
3. **Review Firebase Documentation:** https://firebase.google.com/docs
4. **Check for known issues:** https://github.com/firebase/firebase-js-sdk/issues

---

**Remember:** Never share your actual API keys or credentials in bug reports! 