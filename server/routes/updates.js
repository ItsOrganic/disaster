import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';
import { getCachedData, setCachedData } from '../utils/cache.js';

const router = express.Router();

// Mock official sources for demonstration
const mockOfficialSources = [
  {
    url: 'https://www.fema.gov',
    name: 'FEMA',
    selector: '.news-item',
    type: 'government'
  },
  {
    url: 'https://www.redcross.org',
    name: 'American Red Cross',
    selector: '.article',
    type: 'relief_org'
  }
];

// Generate mock official updates
function generateMockOfficialUpdates(disasterTags = []) {
  const mockUpdates = [
    {
      id: '1',
      title: 'Emergency Declaration Issued for Affected Areas',
      content: 'Federal emergency declaration has been issued to provide immediate assistance to affected communities. Relief funds are being mobilized.',
      source: 'FEMA',
      source_type: 'government',
      url: 'https://www.fema.gov/press-release/emergency-declaration',
      published_at: new Date(Date.now() - 3600000).toISOString(),
      urgency: 'high'
    },
    {
      id: '2',
      title: 'Red Cross Establishes Emergency Shelters',
      content: 'The American Red Cross has opened multiple emergency shelters throughout the affected region. Trained volunteers are providing food, comfort, and emergency assistance.',
      source: 'American Red Cross',
      source_type: 'relief_org',
      url: 'https://www.redcross.org/about-us/news-and-events/news/shelter-update',
      published_at: new Date(Date.now() - 7200000).toISOString(),
      urgency: 'medium'
    },
    {
      id: '3',
      title: 'Transportation Infrastructure Assessment Update',
      content: 'Department of Transportation teams are conducting comprehensive assessments of roads, bridges, and transit systems. Priority routes for emergency services have been identified.',
      source: 'Department of Transportation',
      source_type: 'government',
      url: 'https://www.transportation.gov/briefings/infrastructure-update',
      published_at: new Date(Date.now() - 5400000).toISOString(),
      urgency: 'low'
    },
    {
      id: '4',
      title: 'Medical Response Coordination Center Activated',
      content: 'The National Disaster Medical System has activated coordination centers to manage medical resources and personnel deployment to affected areas.',
      source: 'HHS ASPR',
      source_type: 'government',
      url: 'https://www.phe.gov/emergency/news/healthalerts/2024/Pages/medical-response.aspx',
      published_at: new Date(Date.now() - 1800000).toISOString(),
      urgency: 'high'
    },
    {
      id: '5',
      title: 'Volunteer Coordination and Safety Guidelines',
      content: 'Guidelines for volunteer organizations and spontaneous volunteers have been updated. Safety protocols and coordination procedures are now in effect.',
      source: 'National Voluntary Organizations Active in Disaster',
      source_type: 'relief_org',
      url: 'https://www.nvoad.org/volunteer-guidelines',
      published_at: new Date(Date.now() - 900000).toISOString(),
      urgency: 'medium'
    }
  ];

  // Filter based on disaster tags if provided
  if (disasterTags.length > 0) {
    return mockUpdates.filter(update => {
      const contentLower = update.content.toLowerCase();
      const titleLower = update.title.toLowerCase();
      return disasterTags.some(tag => 
        contentLower.includes(tag.toLowerCase()) || 
        titleLower.includes(tag.toLowerCase())
      );
    });
  }

  return mockUpdates;
}

// Scrape official updates (mock implementation for demonstration)
async function scrapeOfficialUpdates(sources, tags = []) {
  const updates = [];
  
  for (const source of sources) {
    try {
      // In a real implementation, this would make actual HTTP requests
      // For demo purposes, we'll generate mock data
      const mockUpdates = generateMockOfficialUpdates(tags);
      
      const sourceUpdates = mockUpdates
        .filter(update => update.source === source.name)
        .map(update => ({
          ...update,
          scraped_at: new Date().toISOString(),
          source_url: source.url
        }));
      
      updates.push(...sourceUpdates);
    } catch (error) {
      logger.error(`Error scraping ${source.name}:`, error);
    }
  }
  
  return updates;
}

// Get official updates for a disaster
router.get('/:disasterId', async (req, res) => {
  try {
    const { disasterId } = req.params;
    const { source_type, urgency } = req.query;
    
    const cacheKey = `official_updates_${disasterId}_${source_type}_${urgency}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      logger.info(`Serving cached official updates for disaster: ${disasterId}`);
      return res.json(cachedData);
    }
    
    // Fetch disaster to get context
    const { data: disaster, error: disasterError } = await supabase
      .from('disasters')
      .select('tags, title')
      .eq('id', disasterId)
      .single();
    
    if (disasterError) {
      if (disasterError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Disaster not found' });
      }
      logger.error('Error fetching disaster for updates:', disasterError);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    // Scrape official updates
    let updates = await scrapeOfficialUpdates(mockOfficialSources, disaster.tags);
    
    // Apply filters
    if (source_type) {
      updates = updates.filter(update => update.source_type === source_type);
    }
    
    if (urgency) {
      updates = updates.filter(update => update.urgency === urgency);
    }
    
    // Sort by publication date (newest first)
    updates.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    
    const response = {
      disaster_id: disasterId,
      disaster_title: disaster.title,
      total_updates: updates.length,
      filters: {
        source_type: source_type || 'all',
        urgency: urgency || 'all'
      },
      sources_checked: mockOfficialSources.map(s => s.name),
      updates: updates,
      last_scraped: new Date().toISOString()
    };
    
    // Cache for 1 hour
    await setCachedData(cacheKey, response, 3600);
    
    logger.info(`Official updates processed for disaster: ${disaster.title}, count: ${updates.length}`);
    
    res.json(response);
  } catch (error) {
    logger.error('Unexpected error in GET /updates/:disasterId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get updates from specific sources
router.get('/sources/:sourceName', async (req, res) => {
  try {
    const { sourceName } = req.params;
    const { limit = 10 } = req.query;
    
    const cacheKey = `source_updates_${sourceName}_${limit}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }
    
    const source = mockOfficialSources.find(s => 
      s.name.toLowerCase().replace(/\s+/g, '-') === sourceName.toLowerCase()
    );
    
    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    const updates = await scrapeOfficialUpdates([source]);
    const limitedUpdates = updates.slice(0, parseInt(limit));
    
    const response = {
      source: source.name,
      source_type: source.type,
      total_updates: limitedUpdates.length,
      updates: limitedUpdates,
      last_scraped: new Date().toISOString()
    };
    
    // Cache for 30 minutes
    await setCachedData(cacheKey, response, 1800);
    
    res.json(response);
  } catch (error) {
    logger.error('Unexpected error in GET /updates/sources/:sourceName:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;