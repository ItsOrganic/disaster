import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
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

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [disasters, setDisasters] = useState<Disaster[]>([]);
  const [selectedDisaster, setSelectedDisaster] = useState<Disaster | null>(null);
  const [socialMediaData, setSocialMediaData] = useState<SocialMediaPost[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
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

  // Connect to WebSocket when user logs in
  useEffect(() => {
    if (user && !socket) {
      const newSocket = io('http://localhost:3001');
      setSocket(newSocket);
      
      newSocket.on('disaster_created', (disaster) => {
        setDisasters(prev => [disaster, ...prev]);
      });
      
      newSocket.on('disaster_updated', (disaster) => {
        setDisasters(prev => prev.map(d => d.id === disaster.id ? disaster : d));
      });
      
      newSocket.on('social_media_updated', (data) => {
        setSocialMediaData(data.posts || []);
      });
      
      return () => {
        newSocket.disconnect();
      };
    }
  }, [user, socket]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginForm),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      setUser(data.user);
      localStorage.setItem('auth_token', data.token);
      
      // Fetch disasters after login
      await fetchDisasters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchDisasters = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/disasters');
      const data = await response.json();
      
      if (response.ok) {
        setDisasters(data.disasters || []);
      }
    } catch (err) {
      console.error('Error fetching disasters:', err);
    }
  };

  const createDisaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('http://localhost:3001/api/disasters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newDisaster,
          tags: newDisaster.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create disaster');
      }
      
      setNewDisaster({ title: '', location_name: '', description: '', tags: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create disaster');
    } finally {
      setLoading(false);
    }
  };

  const fetchSocialMedia = async (disasterId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/social-media/${disasterId}`);
      const data = await response.json();
      
      if (response.ok) {
        setSocialMediaData(data.posts || []);
        if (socket) {
          socket.emit('join_disaster', disasterId);
        }
      }
    } catch (err) {
      console.error('Error fetching social media:', err);
    }
  };

  const fetchResources = async (disasterId: string, lat?: number, lng?: number) => {
    try {
      let url = `http://localhost:3001/api/resources/${disasterId}`;
      if (lat && lng) {
        url += `?lat=${lat}&lng=${lng}&radius=10000`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok) {
        setResources(data.resources || []);
      }
    } catch (err) {
      console.error('Error fetching resources:', err);
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
          
          <form onSubmit={handleLogin} className="space-y-6">
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
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 font-medium mb-2">Demo Accounts:</p>
            <p className="text-xs text-gray-500">
              • netrunnerX / password123 (Contributor)<br/>
              • reliefAdmin / admin123 (Admin)
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
                  localStorage.removeItem('auth_token');
                  if (socket) {
                    socket.disconnect();
                    setSocket(null);
                  }
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