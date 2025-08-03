# 🔒 Security Guidelines

## 🚨 Critical Security Information

This document outlines security best practices and procedures for the OpheliaHub project.

## Environment Variables

### Required Environment Variables

All Firebase credentials must be stored in environment variables:

```bash
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Security Rules

1. **NEVER commit `.env` files to version control**
2. **NEVER hardcode credentials in source code**
3. **NEVER share API keys in public repositories**
4. **ALWAYS use environment variables for sensitive data**

## Pre-commit Security Hook

A pre-commit hook is installed to prevent accidental commits of secrets:

- Scans for API keys, private keys, and other secrets
- Blocks commits containing `.env` files
- Blocks commits containing service account files
- Provides clear error messages for security violations

## Files to Never Commit

The following files are automatically ignored by `.gitignore`:

```
# Environment files
.env
.env.local
.env.*.local

# Firebase service accounts
serviceAccountKey.json
firebase-adminsdk-*.json
google-services.json

# Private keys and certificates
*.pem
*.key
*.crt
*.p12
*.pfx
*.p8

# API keys and secrets
secrets.json
config.json
credentials.json
*.secret
*.key.json
```

## Security Checklist

Before committing code:

- [ ] No hardcoded API keys in source code
- [ ] No `.env` files in staging area
- [ ] No service account files in staging area
- [ ] No private keys or certificates
- [ ] Environment variables properly configured
- [ ] Pre-commit hook passes

## Incident Response

If you accidentally commit secrets:

1. **IMMEDIATELY** revoke the exposed credentials
2. Remove the commit from Git history
3. Force push to overwrite the repository
4. Generate new credentials
5. Update all environment variables
6. Notify team members

## Deployment Security

For production deployments:

1. Set environment variables on hosting platform
2. Never commit production credentials
3. Use different credentials for each environment
4. Regularly rotate API keys
5. Monitor for unauthorized access

## Firebase Security Rules

Ensure proper Firestore and Storage security rules:

- Users can only access their own data
- Shared data requires explicit permissions
- Storage rules restrict file access
- Authentication required for all operations

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** create a public issue
2. Contact the project maintainer privately
3. Provide detailed information about the vulnerability
4. Wait for acknowledgment before public disclosure

## Regular Security Audits

Perform regular security audits:

- [ ] Review all environment variables
- [ ] Check for exposed credentials in logs
- [ ] Verify security rules are properly configured
- [ ] Update dependencies for security patches
- [ ] Rotate API keys periodically

---

**Remember: Security is everyone's responsibility!** 