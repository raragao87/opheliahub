import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutUser } from '../firebase/config';

const DashboardPage: FC = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOutUser();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">
              Welcome to your Dashboard
            </h1>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
            >
              Logout
            </button>
          </div>
          
          <div className="text-gray-600">
            <p className="text-lg">
              This is your personal dashboard. More features coming soon!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage; 