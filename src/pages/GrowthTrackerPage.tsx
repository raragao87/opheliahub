import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { auth, saveGrowthRecord, getGrowthRecords, deleteGrowthRecord, saveChildProfile, getChildProfile, type GrowthRecord, type ChildProfile } from '../firebase/config';
import { weightPercentiles, heightPercentiles } from '../utils/growthData';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const GrowthTrackerPage: FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<(GrowthRecord & { id: string })[]>([]);
  const [childProfile, setChildProfile] = useState<(ChildProfile & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    weight: '',
    height: '',
  });
  const [profileData, setProfileData] = useState({
    name: '',
    dateOfBirth: '',
    gender: 'Female' as 'Female' | 'Male',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        navigate('/');
        return;
      }
      
      const [userRecords, userProfile] = await Promise.all([
        getGrowthRecords(user.uid),
        getChildProfile(user.uid)
      ]);
      
      setRecords(userRecords);
      setChildProfile(userProfile);
      
      if (userProfile) {
        setProfileData({
          name: userProfile.name,
          dateOfBirth: userProfile.dateOfBirth,
          gender: userProfile.gender,
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData.name || !profileData.dateOfBirth) {
      alert('Please fill in all fields');
      return;
    }

    setSavingProfile(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        navigate('/');
        return;
      }

      await saveChildProfile(user.uid, profileData);
      await loadData();
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error saving profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.weight || !formData.height) {
      alert('Please fill in all fields');
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        navigate('/');
        return;
      }

      await saveGrowthRecord(user.uid, {
        date: formData.date,
        weight: parseFloat(formData.weight),
        height: parseFloat(formData.height),
      });

      setFormData({ date: '', weight: '', height: '' });
      await loadData();
    } catch (error) {
      console.error('Error saving record:', error);
      alert('Error saving record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;

    try {
      const user = auth.currentUser;
      if (!user) {
        navigate('/');
        return;
      }

      await deleteGrowthRecord(user.uid, recordId);
      await loadData();
    } catch (error) {
      console.error('Error deleting record:', error);
      alert('Error deleting record');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const calculateAgeInMonths = (birthDate: string, recordDate: string) => {
    const birth = new Date(birthDate);
    const record = new Date(recordDate);
    const diffTime = Math.abs(record.getTime() - birth.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 30.44);
  };

  // Prepare chart data
  const weightChartData = {
    labels: weightPercentiles.labels,
    datasets: [
      ...weightPercentiles.datasets,
      {
        label: childProfile ? `${childProfile.name}'s Weight` : 'Your Baby',
        data: childProfile ? records.map(record => {
          const ageInMonths = calculateAgeInMonths(childProfile.dateOfBirth, record.date);
          return ageInMonths >= 0 && ageInMonths <= 24 ? record.weight : null;
        }).filter(weight => weight !== null) : [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        fill: false,
      },
    ],
  };

  const heightChartData = {
    labels: heightPercentiles.labels,
    datasets: [
      ...heightPercentiles.datasets,
      {
        label: childProfile ? `${childProfile.name}'s Height` : 'Your Baby',
        data: childProfile ? records.map(record => {
          const ageInMonths = calculateAgeInMonths(childProfile.dateOfBirth, record.date);
          return ageInMonths >= 0 && ageInMonths <= 24 ? record.height : null;
        }).filter(height => height !== null) : [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        fill: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Growth Chart',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading growth tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">
              {childProfile ? `${childProfile.name}'s Growth Tracker` : 'Growth Tracker'}
            </h1>
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-xl transition-all duration-200 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Dashboard</span>
            </button>
          </div>
          <p className="text-gray-600">Track your baby's growth and compare with WHO standards</p>
        </div>

        {/* Child Profile Section */}
        {!childProfile ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Child Information</h2>
            <form onSubmit={handleProfileSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Child's Name</label>
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter child's name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                <input
                  type="date"
                  value={profileData.dateOfBirth}
                  onChange={(e) => setProfileData({ ...profileData, dateOfBirth: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                <select
                  value={profileData.gender}
                  onChange={(e) => setProfileData({ ...profileData, gender: e.target.value as 'Female' | 'Male' })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
                >
                  {savingProfile ? 'Saving...' : 'Save Child Profile'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{childProfile.name}</h3>
                <p className="text-gray-600">Born {formatDate(childProfile.dateOfBirth)} • {childProfile.gender}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Age</p>
                <p className="text-lg font-semibold text-gray-900">
                  {calculateAgeInMonths(childProfile.dateOfBirth, new Date().toISOString().split('T')[0])} months
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Input Form */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Add New Record</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
              <input
                type="number"
                step="0.01"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Height (cm)</label>
              <input
                type="number"
                step="0.1"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.0"
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving || !childProfile}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
              >
                {saving ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </form>
          {!childProfile && (
            <p className="text-amber-600 text-sm mt-4">⚠️ Please complete the child profile above before adding growth records.</p>
          )}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Weight Growth Chart</h3>
            <Line data={weightChartData} options={chartOptions} />
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Height Growth Chart</h3>
            <Line data={heightChartData} options={chartOptions} />
          </div>
        </div>

        {/* Records Table */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Growth Records</h2>
          {records.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg mb-2">No growth records yet</p>
              <p className="text-gray-400">Add your first record above to start tracking!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight (kg)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Height (cm)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(record.date)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {childProfile ? `${calculateAgeInMonths(childProfile.dateOfBirth, record.date)} months` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.weight}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.height}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="text-red-600 hover:text-red-900 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GrowthTrackerPage; 