import express from 'express';
import { supabase } from '../database/supabase.js';
import { authenticateUser } from './auth.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios'; // For HTTP requests
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// Helper to geocode location using your own API
async function geocodeLocation(location) {
  const response = await axios.post('http://localhost:3001/api/geocoding/location', {
    location_name: location
  });
  return response.data.result;
}

// Helper to post to Twitter (pseudo-code, you need to implement OAuth etc.)
async function postToTwitter({ text, lat, lng }) {
  // Use Twitter API v2 or v1.1 with OAuth1.0a or OAuth2.0 Bearer Token
  // This is a placeholder; you must use a Twitter SDK or direct API call
  await axios.post('https://api.twitter.com/2/tweets', {
    text,
    geo: { coordinates: { type: 'Point', coordinates: [lng, lat] } }
  }, {
    headers: {
      Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
    }
  });
}

// Get all disasters with optional filtering
router.get('/', async (req, res) => {
  try {
    const { tag, owner_id, limit = 50, offset = 0 } = req.query;
    
    let query = supabase
      .from('disasters')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (tag) {
      query = query.contains('tags', [tag]);
    }
    
    if (owner_id) {
      query = query.eq('owner_id', owner_id);
    }
    
    const { data, error } = await query;
    
    if (error) {
      logger.error('Error fetching disasters:', error);
      return res.status(500).json({ error: 'Failed to fetch disasters' });
    }
    
    logger.info(`Fetched ${data.length} disasters`);
    res.json({ disasters: data });
  } catch (error) {
    logger.error('Unexpected error in GET /disasters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single disaster by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('disasters')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Disaster not found' });
      }
      logger.error('Error fetching disaster:', error);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    res.json({ disaster: data });
  } catch (error) {
    logger.error('Unexpected error in GET /disasters/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new disaster
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { title, location_name, description, tags = [], lat, lng } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    
    const disaster = {
      id: uuidv4(),
      title,
      location_name,
      description,
      tags,
      owner_id: req.user.id,
      audit_trail: [{
        action: 'create',
        user_id: req.user.id,
        timestamp: new Date().toISOString()
      }]
    };
    
    // Add geospatial location if coordinates provided
    if (lat && lng) {
      disaster.location = `POINT(${lng} ${lat})`;
    } else {
      // If location_name is not provided, get from .env
      let finalLocation = location_name || process.env.DEFAULT_LOCATION;
      let geo = { lat, lng };

      // If lat/lng not provided, geocode
      if ((!lat || !lng) && finalLocation) {
        const geocoded = await geocodeLocation(finalLocation);
        geo.lat = geocoded.lat;
        geo.lng = geocoded.lng;
      }

      if (geo.lat && geo.lng) {
        disaster.location = `POINT(${geo.lng} ${geo.lat})`;
      }
    }
    
    const { data, error } = await supabase
      .from('disasters')
      .insert([disaster])
      .select()
      .single();
    
    if (error) {
      logger.error('Error creating disaster:', error);
      return res.status(500).json({ error: 'Failed to create disaster' });
    }
    
    logger.info(`Disaster created: ${data.title} by ${req.user.username}`);
    
    // Broadcast real-time update
    req.io.emit('disaster_created', data);
    
    // After disaster is created, post to Twitter
    const tweetText = `Disaster reported: ${title}\nLocation: ${location_name}\nDescription: ${description}`;
    if (lat && lng) {
      await postToTwitter({ text: tweetText, lat, lng });
    }
    
    res.status(201).json({ disaster: data });
  } catch (error) {
    logger.error('Unexpected error in POST /disasters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update disaster
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, location_name, description, tags, lat, lng } = req.body;
    
    // Check if disaster exists and user has permission
    const { data: existingDisaster, error: fetchError } = await supabase
      .from('disasters')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Disaster not found' });
      }
      logger.error('Error fetching disaster for update:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    // Check permissions
    if (existingDisaster.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to update this disaster' });
    }
    
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (location_name !== undefined) updates.location_name = location_name;
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) updates.tags = tags;
    
    // Update geospatial location if coordinates provided
    if (lat && lng) {
      updates.location = `POINT(${lng} ${lat})`;
    }
    
    // Add to audit trail
    const newAuditEntry = {
      action: 'update',
      user_id: req.user.id,
      timestamp: new Date().toISOString(),
      changes: Object.keys(updates)
    };
    
    updates.audit_trail = [...(existingDisaster.audit_trail || []), newAuditEntry];
    
    const { data, error } = await supabase
      .from('disasters')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      logger.error('Error updating disaster:', error);
      return res.status(500).json({ error: 'Failed to update disaster' });
    }
    
    logger.info(`Disaster updated: ${data.title} by ${req.user.username}`);
    
    // Broadcast real-time update
    req.io.emit('disaster_updated', data);
    req.io.to(`disaster_${id}`).emit('disaster_updated', data);
    
    res.json({ disaster: data });
  } catch (error) {
    logger.error('Unexpected error in PUT /disasters/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete disaster
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if disaster exists and user has permission
    const { data: existingDisaster, error: fetchError } = await supabase
      .from('disasters')
      .select('owner_id, title')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Disaster not found' });
      }
      logger.error('Error fetching disaster for deletion:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    // Check permissions
    if (existingDisaster.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this disaster' });
    }
    
    const { error } = await supabase
      .from('disasters')
      .delete()
      .eq('id', id);
    
    if (error) {
      logger.error('Error deleting disaster:', error);
      return res.status(500).json({ error: 'Failed to delete disaster' });
    }
    
    logger.info(`Disaster deleted: ${existingDisaster.title} by ${req.user.username}`);
    
    // Broadcast real-time update
    req.io.emit('disaster_deleted', { id });
    
    res.json({ message: 'Disaster deleted successfully' });
  } catch (error) {
    logger.error('Unexpected error in DELETE /disasters/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;