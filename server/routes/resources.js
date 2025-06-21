import express from 'express';
import { supabase } from '../database/supabase.js';
import { authenticateUser } from './auth.js';
import { logger } from '../utils/logger.js';
import { getCachedData, setCachedData } from '../utils/cache.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get resources for a disaster with geospatial filtering
router.get('/:disasterId', async (req, res) => {
  try {
    const { disasterId } = req.params;
    const { lat, lng, radius = 10000, type } = req.query; // radius in meters
    
    const cacheKey = `resources_${disasterId}_${lat}_${lng}_${radius}_${type}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      logger.info(`Serving cached resources data for disaster: ${disasterId}`);
      return res.json(cachedData);
    }
    
    // Verify disaster exists
    const { data: disaster, error: disasterError } = await supabase
      .from('disasters')
      .select('id, title')
      .eq('id', disasterId)
      .single();
    
    if (disasterError) {
      if (disasterError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Disaster not found' });
      }
      logger.error('Error fetching disaster for resources:', disasterError);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    let query = supabase
      .from('resources')
      .select('*')
      .eq('disaster_id', disasterId);
    
    // Add type filter if specified
    if (type) {
      query = query.eq('type', type);
    }
    
    // Add geospatial filter if coordinates provided
    if (lat && lng) {
      // Use PostGIS ST_DWithin for distance-based filtering
      query = query.rpc('get_resources_within_distance', {
        disaster_id: disasterId,
        center_lat: parseFloat(lat),
        center_lng: parseFloat(lng),
        radius_meters: parseInt(radius)
      });
    }
    
    const { data: resources, error } = await query;
    
    if (error) {
      logger.error('Error fetching resources:', error);
      return res.status(500).json({ error: 'Failed to fetch resources' });
    }
    
    // If no resources exist, generate some mock data
    if (resources.length === 0) {
      const mockResources = await generateMockResources(disasterId, lat, lng);
      
      const response = {
        disaster_id: disasterId,
        disaster_title: disaster.title,
        search_center: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null,
        search_radius_km: radius / 1000,
        total_resources: mockResources.length,
        resources: mockResources,
        last_updated: new Date().toISOString()
      };
      
      // Cache for 30 minutes
      await setCachedData(cacheKey, response, 1800);
      
      return res.json(response);
    }
    
    const response = {
      disaster_id: disasterId,
      disaster_title: disaster.title,
      search_center: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null,
      search_radius_km: radius / 1000,
      total_resources: resources.length,
      resources: resources,
      last_updated: new Date().toISOString()
    };
    
    // Cache for 30 minutes
    await setCachedData(cacheKey, response, 1800);
    
    logger.info(`Resources fetched for disaster: ${disaster.title}, count: ${resources.length}`);
    
    res.json(response);
  } catch (error) {
    logger.error('Unexpected error in GET /resources/:disasterId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate mock resources for demonstration
async function generateMockResources(disasterId, centerLat, centerLng) {
  const baseResources = [
    {
      name: 'Community Emergency Shelter',
      type: 'shelter',
      capacity: 200,
      contact_info: { phone: '(555) 123-4567', email: 'shelter@community.org' }
    },
    {
      name: 'City General Hospital',
      type: 'medical',
      capacity: 150,
      contact_info: { phone: '(555) 987-6543', emergency: '911' }
    },
    {
      name: 'Food Distribution Center',
      type: 'food',
      capacity: 500,
      contact_info: { phone: '(555) 456-7890', hours: '9AM-6PM' }
    },
    {
      name: 'Emergency Supply Station',
      type: 'supplies',
      capacity: 300,
      contact_info: { phone: '(555) 234-5678', coordinator: 'Jane Smith' }
    },
    {
      name: 'Temporary Housing Complex',
      type: 'housing',
      capacity: 100,
      contact_info: { phone: '(555) 345-6789', manager: 'Bob Johnson' }
    }
  ];
  
  // Generate locations around center point if provided
  const resources = baseResources.map((resource, index) => {
    let lat, lng;
    
    if (centerLat && centerLng) {
      // Generate random coordinates within ~10km of center
      const offsetLat = (Math.random() - 0.5) * 0.1; // ~10km offset
      const offsetLng = (Math.random() - 0.5) * 0.1;
      lat = parseFloat(centerLat) + offsetLat;
      lng = parseFloat(centerLng) + offsetLng;
    } else {
      // Default to NYC area coordinates
      lat = 40.7128 + (Math.random() - 0.5) * 0.1;
      lng = -74.0060 + (Math.random() - 0.5) * 0.1;
    }
    
    return {
      id: uuidv4(),
      disaster_id: disasterId,
      ...resource,
      location_name: `${resource.name} Location`,
      latitude: lat,
      longitude: lng,
      distance_km: centerLat && centerLng ? 
        calculateDistance(centerLat, centerLng, lat, lng) : null,
      created_at: new Date().toISOString()
    };
  });
  
  return resources;
}

// Create new resource
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { 
      disaster_id, 
      name, 
      location_name, 
      lat, 
      lng, 
      type, 
      capacity = 0, 
      contact_info = {} 
    } = req.body;
    
    if (!disaster_id || !name || !type) {
      return res.status(400).json({ 
        error: 'disaster_id, name, and type are required' 
      });
    }
    
    const resource = {
      id: uuidv4(),
      disaster_id,
      name,
      location_name,
      type,
      capacity,
      contact_info
    };
    
    // Add geospatial location if coordinates provided
    if (lat && lng) {
      resource.location = `POINT(${lng} ${lat})`;
    }
    
    const { data, error } = await supabase
      .from('resources')
      .insert([resource])
      .select()
      .single();
    
    if (error) {
      logger.error('Error creating resource:', error);
      return res.status(500).json({ error: 'Failed to create resource' });
    }
    
    logger.info(`Resource created: ${data.name} by ${req.user.username}`);
    
    // Broadcast real-time update
    req.io.to(`disaster_${disaster_id}`).emit('resources_updated', data);
    
    res.status(201).json({ resource: data });
  } catch (error) {
    logger.error('Unexpected error in POST /resources:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to calculate distance between two points
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default router;