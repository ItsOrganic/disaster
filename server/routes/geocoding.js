import express from 'express';
import axios from 'axios'; // For HTTP requests
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { getCachedData, setCachedData } from '../utils/cache.js';
import { authenticateUser } from './auth.js';


dotenv.config();

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Extract location from text using Gemini AI
async function extractLocationWithGemini(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `
      Extract all location names from the following text. Return ONLY a JSON array of location names.
      Include cities, states, countries, landmarks, and any other geographic references.
      If no locations are found, return an empty array.
      
      Text: "${text}"
      
      Example response format: ["New York City", "Manhattan", "Times Square"]
    `;
    
    // For demo purposes, we'll simulate Gemini AI response
    // In production, you would make actual API call:
    // const result = await model.generateContent(prompt);
    // const response = result.response.text();
    
    // Mock location extraction based on common patterns
    const locations = [];
    const locationPatterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2}|[A-Z][a-z]+)\b/g, // City, State/Country
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:County|Parish|District)\b/g, // County patterns
      /\b(?:downtown|uptown|central|north|south|east|west)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, // Directional patterns
    ];
    
    for (const pattern of locationPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[2]) {
          locations.push(`${match[1]}, ${match[2]}`);
        } else if (match[1]) {
          locations.push(match[1]);
        }
      }
    }
    
    // Remove duplicates and return unique locations
    return [...new Set(locations)];
    
  } catch (error) {
    logger.error('Error extracting locations with Gemini:', error);
    
    // Fallback to simple keyword extraction
    const commonLocations = [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
      'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
      'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
      'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Washington'
    ];
    
    return commonLocations.filter(location => 
      text.toLowerCase().includes(location.toLowerCase())
    );
  }
}

// Convert location name to coordinates using mapping service
async function geocodeLocation(locationName) {
  try {
    // Try Google Maps API first if available
    // if (process.env.GOOGLE_MAPS_API_KEY) {
    //   const response = await axios.get(
    //     'https://maps.googleapis.com/maps/api/geocode/json',
    //     {
    //       params: {
    //         address: locationName,
    //         key: process.env.GOOGLE_MAPS_API_KEY
    //       }
    //     }
    //   );
      
    //   if (response.data.results && response.data.results.length > 0) {
    //     const result = response.data.results[0];
    //     return {
    //       location_name: result.formatted_address,
    //       lat: result.geometry.location.lat,
    //       lng: result.geometry.location.lng,
    //       confidence: 'high',
    //       source: 'google_maps'
    //     };
    //   }
    // }
    
    // Fallback to Mapbox if available
    if (process.env.MAPBOX_ACCESS_TOKEN) {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationName)}.json`,
        {
          params: {
            access_token: process.env.MAPBOX_ACCESS_TOKEN,
            limit: 1
          }
        }
      );
      
      if (response.data.features && response.data.features.length > 0) {
        const feature = response.data.features[0];
        return {
          location_name: feature.place_name,
          lat: feature.center[1],
          lng: feature.center[0],
          confidence: 'high',
          source: 'mapbox'
        };
      }
    }
    
    // Fallback to OpenStreetMap Nominatim (free but limited)
    const response = await axios.get(
      'https://nominatim.openstreetmap.org/search',
      {
        params: {
          q: locationName,
          format: 'json',
          limit: 1,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'DisasterResponsePlatform/1.0'
        }
      }
    );
    
    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        location_name: result.display_name,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        confidence: 'medium',
        source: 'openstreetmap'
      };
    }
    
    throw new Error('No geocoding results found');
    
  } catch (error) {
    logger.error(`Error geocoding location "${locationName}":`, error);
    
    // Return mock coordinates for demo purposes
    return {
      location_name: locationName,
      lat: 40.7128 + (Math.random() - 0.5) * 0.1, // NYC area with random offset
      lng: -74.0060 + (Math.random() - 0.5) * 0.1,
      confidence: 'low',
      source: 'mock',
      note: 'Mock coordinates for demonstration'
    };
  }
}

// Extract locations from text and geocode them
router.post('/', async (req, res) => {
  try {
    const { text, description } = req.body;
    
    if (!text && !description) {
      return res.status(400).json({ error: 'text or description is required' });
    }
    
    const inputText = text || description;
    const cacheKey = `geocoding_${Buffer.from(inputText).toString('base64')}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      logger.info('Serving cached geocoding result');
      return res.json(cachedData);
    }
    
    // Extract locations using Gemini AI
    const extractedLocations = await extractLocationWithGemini(inputText);
    
    if (extractedLocations.length === 0) {
      const response = {
        input_text: inputText,
        extracted_locations: [],
        geocoded_locations: [],
        message: 'No locations found in the provided text',
        processed_at: new Date().toISOString()
      };
      
      // Cache for 1 hour
      await setCachedData(cacheKey, response, 3600);
      
      return res.json(response);
    }
    
    // Geocode each extracted location
    const geocodingPromises = extractedLocations.map(async (location) => {
      try {
        const geocoded = await geocodeLocation(location);
        return geocoded;
      } catch (error) {
        logger.error(`Failed to geocode location: ${location}`, error);
        return {
          location_name: location,
          error: 'Geocoding failed'
        };
      }
    });
    
    const geocodedLocations = await Promise.all(geocodingPromises);
    const successfulGeocodings = geocodedLocations.filter(loc => !loc.error);
    
    const response = {
      input_text: inputText,
      extracted_locations: extractedLocations,
      geocoded_locations: successfulGeocodings,
      total_extracted: extractedLocations.length,
      total_geocoded: successfulGeocodings.length,
      ai_model: 'gemini-pro',
      processed_at: new Date().toISOString()
    };
    
    // Cache for 24 hours
    await setCachedData(cacheKey, response, 86400);
    
    logger.info(`Geocoding completed: ${extractedLocations.length} locations extracted, ${successfulGeocodings.length} geocoded`);
    
    res.json(response);
    
  } catch (error) {
    logger.error('Unexpected error in POST /geocoding:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Geocode a specific location name
router.post('/location', async (req, res) => {
  try {
    const { location_name } = req.body;
    
    if (!location_name) {
      return res.status(400).json({ error: 'location_name is required' });
    }
    
    const cacheKey = `single_geocoding_${Buffer.from(location_name).toString('base64')}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      logger.info('Serving cached single geocoding result');
      return res.json(cachedData);
    }
    
    const geocoded = await geocodeLocation(location_name);
    
    const response = {
      query: location_name,
      result: geocoded,
      processed_at: new Date().toISOString()
    };
    
    // Cache for 24 hours
    await setCachedData(cacheKey, response, 86400);
    
    logger.info(`Single location geocoded: ${location_name}`);
    
    res.json(response);
    
  } catch (error) {
    logger.error('Unexpected error in POST /geocoding/location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// In your POST / route (disaster creation)
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { title, location_name, description, tags = [], lat, lng } = req.body;

    // If location_name is not provided, get from .env
    let finalLocation = location_name || process.env.DEFAULT_LOCATION;
    let geo = { lat, lng };

    // If lat/lng not provided, geocode
    if ((!lat || !lng) && finalLocation) {
      const geocoded = await geocodeLocation(finalLocation);
      geo.lat = geocoded.lat;
      geo.lng = geocoded.lng;
    }

    // ...existing code to create disaster...

    // After disaster is created, post to Twitter
    const tweetText = `Disaster reported: ${title}\nLocation: ${finalLocation}\nDescription: ${description}`;
    if (geo.lat && geo.lng) {
      await postToTwitter({ text: tweetText, lat: geo.lat, lng: geo.lng });
    }

    // ...existing code...
  } catch (error) {
    // ...existing error handling...
  }
});

export default router;