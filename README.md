# OpheliaHub - Family Growth Tracker & Financial Hub

A comprehensive React + TypeScript + Vite application for tracking child growth, family management, and financial organization with advanced features like asset tracking, transaction management, and collaborative sharing.

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Environment Setup

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Configure Firebase:**
   Edit `.env` with your Firebase project credentials:
   ```
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## 🔧 Environment Variables

The application requires the following environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase API Key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `your-project-id` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | `123456789` |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | `1:123456789:web:abc123` |

## ✨ Features

### 🌱 Growth Tracking
- **Child Profile Management**: Create and manage multiple child profiles
- **Growth Records**: Track height, weight, and other growth metrics over time
- **Data Visualization**: Visual charts and progress tracking
- **Sharing**: Collaborate with family members and caregivers

### 💰 Financial Management
- **Multi-Account Support**: Bank accounts, pseudo accounts, and specialized asset accounts
- **Transaction Management**: Track income, expenses, and transfers with comprehensive categorization
- **🏠 Asset Tracking**: Monitor real estate, investments, vehicles, and other valuable assets with auto-transaction generation
- **Transaction Splitting**: Split complex transactions into multiple categories
- **Tag System**: Organize transactions with customizable tags and categories
- **Budget Planning**: Create and track family, personal, and assets budgets
- **Import/Export**: CSV and Excel file support for bulk transaction import
- **💰 Initial Balance Management**: Atemporal initial balance transactions with standardized formatting

### 👥 Collaboration & Sharing
- **Account Sharing**: Share financial accounts with family members
- **Invitation System**: Send and manage sharing invitations
- **Access Control**: Granular permissions for shared resources
- **Real-time Updates**: Synchronized data across shared users

### 🎨 User Experience
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dark/Light Themes**: Customizable interface appearance
- **Dashboard Customization**: Personalized card layout and visibility
- **Inline Editing**: Quick transaction and account updates
- **Compact Interface**: Optimized for efficient data entry and viewing

## 🏗️ Technical Architecture

### Frontend Framework
- **React 18**: Modern React with hooks and functional components
- **TypeScript**: Type-safe development with comprehensive interfaces
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework for responsive design

### State Management
- **React Hooks**: useState, useEffect, useRef for local component state
- **Firebase Real-time**: Direct Firestore subscriptions for live data updates
- **Context API**: Authentication and user state management

### Database & Backend
- **Firebase Firestore**: NoSQL document database with real-time capabilities
- **Firebase Authentication**: Secure user authentication and authorization
- **Firebase Security Rules**: Row-level security and access control
- **Firebase Hosting**: Production deployment and hosting

### Key Components
- **Account Management**: CRUD operations for financial accounts with category-based organization
- **Transaction System**: Comprehensive transaction tracking with splitting and tagging
- **Asset Tracking**: Specialized asset accounts with auto-transaction generation
- **Growth Monitoring**: Child development tracking with data visualization
- **Sharing System**: Collaborative features with invitation and permission management

### Data Models
- **Account**: Supports bank, pseudo, and asset account types with category classification
- **Transaction**: Flexible transaction system with sources, tags, and splitting capabilities
- **Tag System**: Customizable tagging with color coding and real-time suggestions
- **User Management**: Multi-user support with sharing and collaboration features

### Performance Optimizations
- **Lazy Loading**: Component-based code splitting for better initial load times
- **Real-time Updates**: Efficient Firestore subscriptions with minimal re-renders
- **Inline Editing**: Optimized for quick data entry without modal overhead
- **Compact UI**: Streamlined interface for efficient data management

## 🔒 Security

## 📦 Build & Deploy

```bash
# Build for production
npm run build

# Deploy to Firebase Hosting
firebase deploy
```

## 🚀 Recent Updates

### Latest Release - Assets Account Category & Enhanced Financial Management
- **🏠 Assets Account Category**: New specialized account type for tracking real estate, investments, vehicles, and other valuable assets
- **🔄 Auto-Transaction Generation**: Automatically creates transactions when asset values are updated, maintaining complete audit trail
- **📊 Collapsible Account Sections**: Added collapse/expand functionality to all account sections in the Financial Hub sidebar for better organization
- **💰 Enhanced Initial Balance System**: Improved initial balance transactions with atemporal nature and standardized formatting
- **🔧 Critical Balance Fix**: Resolved double-counting issue in account balance calculations for accurate financial tracking
- **🚨 Emergency Data Cleanup**: Automated one-time fix for existing data inconsistencies and duplicate transactions
- **📱 Improved UI/UX**: Better visual indicators and responsive design for asset account management

### Previous Release - Transaction Management Improvements
- **🔧 Split Transaction Alignment**: Fixed alignment issues between split transaction items and column headers
- **📱 Compact Interface**: Reduced transaction row padding and improved overall table compactness
- **✂️ Enhanced Split Functionality**: Improved split transaction button with scissors icon and better modal integration
- **🏷️ Inline Tag Input**: Replaced bulky tag selector with compact inline tag input system
- **📊 Asset Account Support**: Added comprehensive asset account management with auto-transaction generation
- **✏️ Edit Account Integration**: Added edit buttons to account cards for quick modifications
- **🔄 Improved Sidebar**: Moved account creation and refresh buttons to sidebar for better UX

---

## Original Template Information

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
