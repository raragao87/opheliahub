# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server (Vite)
- `npm run build` - Build for production (TypeScript compilation + Vite build)
- `npm run lint` - Run ESLint code linting
- `npm run preview` - Preview production build locally

### Environment Setup
- Copy `.env.example` to `.env` and configure Firebase credentials
- Required environment variables: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`

### Firebase Deployment
- `firebase deploy` - Deploy to Firebase Hosting
- `node scripts/check-firebase-auth.js` - Debug Firebase authentication issues

## Architecture Overview

### Tech Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4.x
- **Routing**: React Router DOM 7.x
- **Charts**: Chart.js + React Chart.js 2
- **Backend**: Firebase (Firestore, Auth, Storage, Hosting)
- **State Management**: React hooks + Firebase real-time subscriptions

### Core Application Structure

**Main Application Flow:**
- `src/App.tsx` - Router setup with protected routes
- `src/pages/` - Main page components (Dashboard, FinancialHub, GrowthTracker, Budgets)
- `src/components/` - Reusable UI components and modals
- `src/firebase/config.ts` - Firebase configuration and data operations

**Authentication & Security:**
- All pages except HomePage require authentication via `ProtectedRoute`
- Firebase Auth with Google sign-in
- Environment variable validation with security checks
- Domain authorization validation

### Key Data Models

**Account System:**
- Three account categories: Bank, Pseudo, Assets
- Assets accounts support value updates with auto-transaction generation
- Collapsible account sections in UI
- Multi-currency support (EUR, USD, BRL, AUD, GBP, CAD, JPY, CHF)

**Transaction Management:**
- Comprehensive transaction tracking with sources, tags, and categories
- Split transaction functionality for complex entries
- Initial balance transactions (atemporal, standardized formatting)
- Inline editing capabilities for quick updates

**Sharing & Collaboration:**
- Account sharing system with invitation management
- User access control and permissions
- Real-time data synchronization across shared users

**Growth Tracking:**
- Child profile management
- Growth metrics tracking over time
- Data visualization with Chart.js

### UI Architecture

**Page Components:**
- `FinancialHubSplitViewPage.tsx` - Main financial management interface with split view
- `DashboardPage.tsx` - Customizable dashboard with various cards
- `GrowthTrackerPage.tsx` - Child growth tracking interface
- `BudgetPage.tsx` - Budget planning and management

**Modal System:**
- Transaction management: `AddTransactionModal`, `SplitTransactionModal`, `LinkTransactionModal`
- Account management: `CreateAccountModal`, `EditAccountModal`, `UpdateAssetBalanceModal`
- System features: `SharingModal`, `ImportModal`, `TagsModal`

**Component Patterns:**
- Inline editing components for quick data entry
- Real-time Firebase subscriptions for live updates
- Collapsible UI sections for better organization
- Tag system with color coding and autocomplete

### Data Flow

**Firebase Integration:**
- Direct Firestore subscriptions for real-time updates
- Batch operations for data consistency
- Security rules for user data protection
- Emergency fix functions for data cleanup

**State Management:**
- Local component state with React hooks
- Firebase authentication state via `onAuthStateChanged`
- Real-time data subscriptions eliminate need for global state

### Security Implementation

- Environment variable validation on startup
- Domain authorization checks
- Firebase security rules for data access
- Pre-commit hooks to prevent credential exposure
- API key format validation

## Important Development Notes

### Financial Hub Features
- Asset accounts automatically generate transactions when values are updated
- Initial balance transactions are atemporal and use standardized formatting
- Emergency fix function `emergencyFixAccountBalances()` exists for data cleanup
- Transaction splitting supports complex multi-category entries

### UI/UX Patterns
- Inline editing preferred over modals for quick updates
- Collapsible sections for better space utilization
- Real-time updates across all shared accounts
- Compact interface design for efficient data entry

### Testing & Debugging
- Multiple test components available: `FirebaseTest`, `SecurityTest`, `AccountTypeTest`
- Comprehensive Firebase connection debugging in console
- Domain authorization testing utilities
- Debug scripts in `scripts/` directory

### Critical Dependencies
- Firebase SDK v12+ for latest features
- React 19 for concurrent features
- Tailwind CSS 4.x for modern styling
- Chart.js for data visualization

## File Organization

- `src/components/dashboard/` - Dashboard-specific cards and components  
- `src/firebase/` - Firebase configuration and data operations
- `src/config/` - Environment and security configuration
- `src/utils/` - Utility functions and data processing
- `src/hooks/` - Custom React hooks
- `scripts/` - Firebase and API management utilities

Always run `npm run lint` before committing code changes to ensure code quality standards.