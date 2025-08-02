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
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    weight: '',
    height: '',
  });
  const [editFormData, setEditFormData] = useState({
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

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfileImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
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
      setEditingProfile(false);
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

  const handleEditRecord = (record: GrowthRecord & { id: string }) => {
    console.log('Editing record:', record); // Debug log
    setEditFormData({
      date: record.date,
      weight: record.weight.toString(),
      height: record.height.toString(),
    });
    setEditingRecord(record.id);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFormData.date || !editFormData.weight || !editFormData.height) {
      alert('Please fill in all fields');
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user || !editingRecord) {
        navigate('/');
        return;
      }

      // Delete the old record and create a new one
      await deleteGrowthRecord(user.uid, editingRecord);
      await saveGrowthRecord(user.uid, {
        date: editFormData.date,
        weight: parseFloat(editFormData.weight),
        height: parseFloat(editFormData.height),
      });

      setEditFormData({ date: '', weight: '', height: '' });
      setEditingRecord(null);
      await loadData();
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Error updating record');
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

  const calculateAgeInDays = (birthDate: string, recordDate: string) => {
    const birth = new Date(birthDate);
    const record = new Date(recordDate);
    const diffTime = Math.abs(record.getTime() - birth.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const calculateAgeInWeeks = (birthDate: string, recordDate: string) => {
    const days = calculateAgeInDays(birthDate, recordDate);
    return Math.floor(days / 7);
  };

  const calculateAgeInMonths = (birthDate: string, recordDate: string) => {
    const days = calculateAgeInDays(birthDate, recordDate);
    return days / 30.44;
  };

  // Fixed chart data mapping function - convert to array format for compatibility
  const mapRecordsToChartData = (records: (GrowthRecord & { id: string })[], birthDate: string, dataType: 'weight' | 'height') => {
    if (!records.length || !birthDate) return [];
    
    // Create array of 25 elements (0-24 months) filled with null
    const dataArray = new Array(25).fill(null);
    
    records.forEach(record => {
      const ageInMonths = calculateAgeInMonths(birthDate, record.date);
      if (ageInMonths >= 0 && ageInMonths <= 24) {
        const monthIndex = Math.round(ageInMonths);
        dataArray[monthIndex] = dataType === 'weight' ? record.weight : record.height;
      }
    });

    return dataArray;
  };

  // Debug logging
  console.log('Records:', records);
  console.log('Child profile:', childProfile);
  console.log('Weight chart data:', mapRecordsToChartData(records, childProfile?.dateOfBirth || '', 'weight'));
  console.log('Height chart data:', mapRecordsToChartData(records, childProfile?.dateOfBirth || '', 'height'));

  // Prepare chart data with proper age-based mapping
  const weightChartData = {
    labels: weightPercentiles.labels.map(label => `${label} months`),
    datasets: [
      ...weightPercentiles.datasets,
      {
        label: childProfile ? `${childProfile.name}'s Weight` : 'Your Baby',
        data: childProfile ? mapRecordsToChartData(records, childProfile.dateOfBirth, 'weight') : [],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        fill: false,
        tension: 0.4,
      },
    ],
  };

  const heightChartData = {
    labels: heightPercentiles.labels.map(label => `${label} months`),
    datasets: [
      ...heightPercentiles.datasets,
      {
        label: childProfile ? `${childProfile.name}'s Height` : 'Your Baby',
        data: childProfile ? mapRecordsToChartData(records, childProfile.dateOfBirth, 'height') : [],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        fill: false,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: 'bold' as const,
          },
        },
      },
      title: {
        display: true,
        text: 'Growth Chart',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: '#1F2937',
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1F2937',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        position: 'bottom' as const,
        title: {
          display: true,
          text: 'Age (months)',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
          color: '#374151',
        },
        grid: {
          color: '#E5E7EB',
        },
        ticks: {
          color: '#6B7280',
        },
        min: 0,
        max: 24
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Weight (kg) / Height (cm)',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
          color: '#374151',
        },
        grid: {
          color: '#E5E7EB',
        },
        ticks: {
          color: '#6B7280',
        },
      },
    },
  };

  const weightChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        title: {
          ...chartOptions.scales.y.title,
          text: 'Weight (kg)',
        },
      },
    },
  };

  const heightChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        title: {
          ...chartOptions.scales.y.title,
          text: 'Height (cm)',
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading growth tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
              {childProfile ? `${childProfile.name}'s Growth Tracker` : 'Growth Tracker'}
            </h1>
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-white hover:bg-gray-50 text-gray-700 font-semibold py-2 px-4 rounded-xl transition-all duration-200 flex items-center space-x-2 shadow-sm hover:shadow-md border border-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Back to Dashboard</span>
            </button>
          </div>
          <p className="text-gray-600 text-lg">Track your baby's growth and compare with WHO standards</p>
        </div>

        {/* Child Profile Section */}
        {!childProfile ? (
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-6 md:p-8 mb-8 border border-gray-200 max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Child Information</h2>
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              {/* Profile Picture Upload */}
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-gray-100 rounded-full flex items-center justify-center border-2 border-gray-200">
                    {profileImage ? (
                      <img 
                        src={profileImage} 
                        alt="Profile" 
                        className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover"
                      />
                    ) : (
                      <svg className="w-10 h-10 md:w-12 md:h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-2 rounded-full cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-sm text-gray-500">Click to add a profile picture</p>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Child's Name</label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                  <select
                    value={profileData.gender}
                    onChange={(e) => setProfileData({ ...profileData, gender: e.target.value as 'Female' | 'Male' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  {savingProfile ? 'Saving...' : 'Save Child Profile'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-6 mb-8 border border-gray-200 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full flex items-center justify-center">
                  {profileImage ? (
                    <img 
                      src={profileImage} 
                      alt="Profile" 
                      className="w-10 h-10 md:w-14 md:h-14 rounded-full object-cover"
                    />
                  ) : (
                    <svg className="w-6 h-6 md:w-8 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{childProfile.name}</h3>
                  <p className="text-gray-600">Born {formatDate(childProfile.dateOfBirth)} • {childProfile.gender}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm text-gray-500">Age</p>
                  <p className="text-lg font-semibold text-gray-800">
                    {calculateAgeInWeeks(childProfile.dateOfBirth, new Date().toISOString().split('T')[0])} weeks
                  </p>
                </div>
                <button
                  onClick={() => setEditingProfile(true)}
                  className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-xl transition-all duration-200 flex items-center space-x-2 shadow-sm hover:shadow-md border border-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Profile Modal */}
        {editingProfile && childProfile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-gray-800 mb-6">Edit Child Profile</h3>
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                {/* Profile Picture Upload */}
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center border-2 border-gray-200">
                      {profileImage ? (
                        <img 
                          src={profileImage} 
                          alt="Profile" 
                          className="w-16 h-16 rounded-full object-cover"
                        />
                      ) : (
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    <label className="absolute bottom-0 right-0 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-1.5 rounded-full cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Child's Name</label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                    <input
                      type="date"
                      value={profileData.dateOfBirth}
                      onChange={(e) => setProfileData({ ...profileData, dateOfBirth: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                    <select
                      value={profileData.gender}
                      onChange={(e) => setProfileData({ ...profileData, gender: e.target.value as 'Female' | 'Male' })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                    </select>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className="flex-1 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Input Form */}
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-6 md:p-8 mb-8 border border-gray-200 max-w-6xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Add New Record</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
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
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
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
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                placeholder="0.0"
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving || !childProfile}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-8">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Weight Growth Chart</h3>
            <div className="h-80">
              <Line data={weightChartData} options={weightChartOptions} />
            </div>
          </div>
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Height Growth Chart</h3>
            <div className="h-80">
              <Line data={heightChartData} options={heightChartOptions} />
            </div>
          </div>
        </div>

        {/* Records Table */}
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-6 md:p-8 border border-gray-200 max-w-6xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Growth Records</h2>
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
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors duration-200">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatDate(record.date)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                        {childProfile ? `${calculateAgeInWeeks(childProfile.dateOfBirth, record.date)} weeks` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{record.weight}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{record.height}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditRecord(record)}
                            className="text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="text-red-600 hover:text-red-800 font-medium transition-colors duration-200"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Record Modal */}
        {editingRecord && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
              <h3 className="text-xl font-semibold text-gray-800 mb-6">Edit Growth Record</h3>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editFormData.weight}
                    onChange={(e) => setEditFormData({ ...editFormData, weight: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Height (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editFormData.height}
                    onChange={(e) => setEditFormData({ ...editFormData, height: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecord(null);
                      setEditFormData({ date: '', weight: '', height: '' });
                    }}
                    className="flex-1 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GrowthTrackerPage; 