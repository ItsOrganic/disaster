import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  MapPin, 
  Users, 
  MessageSquare, 
  Shield, 
  Clock,
  Plus,
  Search,
  Filter
} from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: string;
}

interface Disaster {
  id: string;
  title: string;
  location_name: string;
  description: string;
  tags: string[];
  owner_id: string;
  created_at: string;
}

interface SocialMediaPost {
  id: string;
  post: string;
  user: string;
  timestamp: string;
  priority: string;
  verified: boolean;
}

interface Resource {
  id: string;
  name: string;
  type: string;
  location_name: string;
  capacity: number;
  distance_km?: number;
}

// Mock data for demo purposes
const MOCK_DISASTERS: Disaster[] = [
  {
    id: '1',
    title: 'Flood Emergency in Downtown',
    location_name: 'Manhattan, NYC',
    description: 'Heavy rainfall causing street flooding and transportation disruptions.',
    tags: ['flood', 'emergency', 'transportation'],
    owner_id: 'demo',
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    title: 'Wildfire Alert - Northern Region',
    location_name: 'Northern California',
    description: 'Fast-moving wildfire threatening residential areas.',
    tags: ['wildfire', 'evacuation', 'emergency'],
    owner_id: 'demo',
    created_at: new Date(Date.now() - 3600000).toISOString()
  }
];

const MOCK_SOCIAL_MEDIA: SocialMediaPost[] = [
  {
    id: '1',
    post: 'Emergency shelter available at Community Center. Capacity for 200 people.',
    user: 'local_responder',
    timestamp: new Date().toISOString(),
    priority: 'high',
    verified: true
  },
  {
    id: '2',
    post: 'Road closures on Main Street due to flooding. Seek alternate routes.',
    user: 'traffic_dept',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    priority: 'medium',
    verified: true
  }
];

const MOCK_RESOURCES: Resource[] = [
  {
    id: '1',
    name: 'Emergency Shelter',
    type: 'shelter',
    location_name: 'Community Center',
    capacity: 200
  },
  {
    id: '2',
    name: 'Medical Station',
    type: 'medical',
    location_name: 'City Hospital',
    capacity: 50
  }
];

// Demo users
const DEMO_USERS = {
  'netrunnerX': { id: '1', username: 'netrunnerX', role: 'contributor', password: 'password123' },
  'reliefAdmin': { id: '2', username: 'reliefAdmin', role: 'admin', password: 'admin123' }
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [disasters, setDisasters] = useState<Disaster[]>([]);
  const [selectedDisaster, setSelectedDisaster] = useState<Disaster | null>(null);
  const [socialMediaData, setSocialMediaData] = useState<SocialMediaPost[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [newDisaster, setNewDisaster] = useState({
    title: '',
    location_name: '',
    description: '',
    tags: ''
  });
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: ''
  });

  // Enhanced API call function with better error handling
  const makeApiCall = async (url: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Check if response is ok
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            // If it's not JSON, it might be HTML error page
            const textResponse = await response.text();
            if (textResponse.includes('<html>') || textResponse.includes('<!DOCTYPE')) {
              errorMessage = 'Server returned HTML instead of JSON. API endpoint may be incorrect.';
            } else {
              errorMessage = textResponse || errorMessage;
            }
          }
        } catch (parseError) {
          // If we can't parse the error response, use the original message
          console.error('Error parsing error response:', parseError);
        }
        
        throw new Error(errorMessage);
      }

      // Check if response contains JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        if (textResponse.includes('<html>') || textResponse.includes('<!DOCTYPE')) {
          throw new Error('Server returned HTML instead of JSON. Check your API endpoint configuration.');
        }
        throw new Error('Server did not return JSON response');
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Check if your backend is running.');
      }
      throw error;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Check demo users first
      const demoUser = DEMO_USERS[loginForm.username as keyof typeof DEMO_USERS];
      if (demoUser && demoUser.password === loginForm.password) {
        setUser({ id: demoUser.id, username: demoUser.username, role: demoUser.role });
        setDisasters(MOCK_DISASTERS);
        return;
      }

      // Try API login
      const apiUrl = window.location.origin.includes('localhost') 
        ? 'http://localhost:3001' 
        : window.location.origin;
      
      const data = await makeApiCall(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      
      setUser(data.user);
      // Store token if returned
      if (data.token) {
        sessionStorage.setItem('auth_token', data.token);
      }
      
      // Fetch disasters after successful login
      await fetchDisasters();
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      
      // Fallback to demo mode if API fails
      const demoUser = DEMO_USERS[loginForm.username as keyof typeof DEMO_USERS];
      if (demoUser && demoUser.password === loginForm.password) {
        setUser({ id: demoUser.id, username: demoUser.username, role: demoUser.role });
        setDisasters(MOCK_DISASTERS);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDisasters = async () => {
    try {
      const apiUrl = window.location.origin.includes('localhost') 
        ? 'http://localhost:3001' 
        : window.location.origin;
      
      const data = await makeApiCall(`${apiUrl}/api/disasters`);
      setDisasters(data.disasters || []);
    } catch (err) {
      console.error('Error fetching disasters:', err);
      // Use mock data as fallback
      setDisasters(MOCK_DISASTERS);
    }
  };

  const createDisaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const apiUrl = window.location.origin.includes('localhost') 
        ? 'http://localhost:3001' 
        : window.location.origin;
      
      const token = sessionStorage.getItem('auth_token');
      
      const data = await makeApiCall(`${apiUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          ...newDisaster,
          tags: newDisaster.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        }),
      });
      
      // Add to local state
      setDisasters(prev => [data.disaster, ...prev]);
      setNewDisaster({ title: '', location_name: '', description: '', tags: '' });
    } catch (err) {
      console.error('Create disaster error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create disaster');
      
      // Fallback: Add to mock data
      const newMockDisaster: Disaster = {
        id: Date.now().toString(),
        title: newDisaster.title,
        location_name: newDisaster.location_name,
        description: newDisaster.description,
        tags: newDisaster.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        owner_id: user?.id || 'demo',
        created_at: new Date().toISOString()
      };
      
      setDisasters(prev => [newMockDisaster, ...prev]);
      setNewDisaster({ title: '', location_name: '', description: '', tags: '' });
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSocialMedia = async (disasterId: string) => {
    try {
      const apiUrl = window.location.origin.includes('localhost') 
        ? 'http://localhost:3001' 
        : window.location.origin;
      
      const data = await makeApiCall(`${apiUrl}/api/social-media/${disasterId}`);
      setSocialMediaData(data.posts || []);
    } catch (err) {
      console.error('Error fetching social media:', err);
      // Use mock data as fallback
      setSocialMediaData(MOCK_SOCIAL_MEDIA);
    }
  };

  const fetchResources = async (disasterId: string, lat?: number, lng?: number) => {
    try {
      const apiUrl = window.location.origin.includes('localhost') 
        ? 'http://localhost:3001' 
        : window.location.origin;
      
      let url = `${apiUrl}/api/resources/${disasterId}`;
      if (lat && lng) {
        url += `?lat=${lat}&lng=${lng}&radius=10000`;
      }
      
      const data = await makeApiCall(url);
      setResources(data.resources || []);
    } catch (err) {
      console.error('Error fetching resources:', err);
      // Use mock data as fallback
      setResources(MOCK_RESOURCES);
    }
  };

  const selectDisaster = (disaster: Disaster) => {
    setSelectedDisaster(disaster);
    fetchSocialMedia(disaster.id);
    fetchResources(disaster.id);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Disaster Response Platform</h1>
            <p className="text-gray-600">Real-time disaster management and response coordination</p>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="netrunnerX or reliefAdmin"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="password123 or admin123"
                required
              />
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600 text-sm">{error}</p>
                <p className="text-red-500 text-xs mt-1">Falling back to demo mode if credentials are correct.</p>
              </div>
            )}
            
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 font-medium mb-2">Demo Accounts:</p>
            <p className="text-xs text-gray-500">
              • netrunnerX / password123 (Contributor)<br/>
              • reliefAdmin / admin123 (Admin)
            </p>
            <p className="text-xs text-orange-600 mt-2">
              Note: Will fallback to demo mode if backend API is unavailable.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <AlertTriangle className="w-8 h-8 text-red-500 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">Disaster Response Platform</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, <span className="font-medium">{user.username}</span>
                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  {user.role}
                </span>
              </span>
              <button
                onClick={() => {
                  setUser(null);
                  sessionStorage.removeItem('auth_token');
                  setDisasters([]);
                  setSelectedDisaster(null);
                  setSocialMediaData([]);
                  setResources([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Disasters List and Create Form */}
          <div className="lg:col-span-1 space-y-6">
            {/* Create Disaster Form */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Report New Disaster
              </h2>
              
              <form onSubmit={createDisaster} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newDisaster.title}
                    onChange={(e) => setNewDisaster(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Flood in Downtown Area"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={newDisaster.location_name}
                    onChange={(e) => setNewDisaster(prev => ({ ...prev, location_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Manhattan, NYC"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newDisaster.description}
                    onChange={(e) => setNewDisaster(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Heavy rainfall causing street flooding..."
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={newDisaster.tags}
                    onChange={(e) => setNewDisaster(prev => ({ ...prev, tags: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="flood, emergency, rescue"
                  />
                  <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Report Disaster'}
                </button>
              </form>
            </div>

            {/* Disasters List */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Active Disasters ({disasters.length})
              </h2>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {disasters.map((disaster) => (
                  <div
                    key={disaster.id}
                    onClick={() => selectDisaster(disaster)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedDisaster?.id === disaster.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <h3 className="font-medium text-gray-900">{disaster.title}</h3>
                    {disaster.location_name && (
                      <p className="text-sm text-gray-600 flex items-center mt-1">
                        <MapPin className="w-4 h-4 mr-1" />
                        {disaster.location_name}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex flex-wrap gap-1">
                        {disaster.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(disaster.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Selected Disaster Details */}
          <div className="lg:col-span-2">
            {selectedDisaster ? (
              <div className="space-y-6">
                {/* Disaster Details */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {selectedDisaster.title}
                  </h2>
                  {selectedDisaster.location_name && (
                    <p className="text-gray-600 flex items-center mb-3">
                      <MapPin className="w-4 h-4 mr-1" />
                      {selectedDisaster.location_name}
                    </p>
                  )}
                  <p className="text-gray-700 mb-4">{selectedDisaster.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedDisaster.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Social Media Reports */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <MessageSquare className="w-5 h-5 mr-2" />
                    Social Media Reports ({socialMediaData.length})
                  </h3>
                  
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {socialMediaData.map((post) => (
                      <div
                        key={post.id}
                        className={`p-3 rounded-lg border-l-4 ${
                          post.priority === 'high'
                            ? 'border-red-500 bg-red-50'
                            : post.priority === 'medium'
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-gray-300 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">{post.post}</p>
                            <div className="flex items-center mt-2 space-x-3">
                              <span className="text-xs text-gray-600">@{post.user}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(post.timestamp).toLocaleTimeString()}
                              </span>
                              {post.verified && (
                                <Shield className="w-4 h-4 text-blue-500" />
                              )}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              post.priority === 'high'
                                ? 'bg-red-100 text-red-800'
                                : post.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {post.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resources */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Available Resources ({resources.length})
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {resources.map((resource) => (
                      <div
                        key={resource.id}
                        className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                      >
                        <h4 className="font-medium text-gray-900">{resource.name}</h4>
                        <p className="text-sm text-gray-600 capitalize">{resource.type}</p>
                        {resource.location_name && (
                          <p className="text-sm text-gray-500 flex items-center mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            {resource.location_name}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-gray-600">
                            Capacity: {resource.capacity}
                          </span>
                          {resource.distance_km && (
                            <span className="text-xs text-gray-500">
                              {resource.distance_km.toFixed(1)} km away
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                <AlertTriangle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Select a Disaster
                </h3>
                <p className="text-gray-600">
                  Choose a disaster from the list to view real-time social media reports, resources, and official updates.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;