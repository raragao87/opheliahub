import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import GrowthTrackerPage from './pages/GrowthTrackerPage';
import FinancialHubPage from './pages/FinancialHubPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/growth-tracker" 
          element={
            <ProtectedRoute>
              <GrowthTrackerPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/financial-hub" 
          element={
            <ProtectedRoute>
              <FinancialHubPage />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
