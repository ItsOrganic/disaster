import express from 'express';
import { supabase } from '../database/supabase.js';
import { logger } from '../utils/logger.js';
import { getCachedData, setCachedData } from '../utils/cache.js';

const router = express.Router();

// Mock social media data generator
function generateMockSocialMediaData(disasterTags = []) {
  const mockPosts = [
    {
      id: '1',
      post: '#floodrelief Need urgent help in downtown area. Water levels rising fast!',
      user: 'citizen_alert',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      engagement: { likes: 45, retweets: 23, replies: 12 },
      verified: false,
      priority: 'high'
    },
    {
      id: '2',
      post: 'Shelter available at Community Center on Main St. Capacity for 200 people. #DisasterRelief',
      user: 'local_responder',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      engagement: { likes: 128, retweets: 89, replies: 34 },
      verified: true,
      priority: 'medium'
    },
    {
      id: '3',
      post: 'URGENT: Medical supplies needed at Emergency Center. Anyone with first aid supplies please help! #emergency',
      user: 'medical_volunteer',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      engagement: { likes: 67, retweets: 45, replies: 23 },
      verified: false,
      priority: 'high'
    },
    {
      id: '4',
      post: 'Roads cleared on Highway 101. Safe passage restored for emergency vehicles. #infrastructure',
      user: 'highway_dept',
      timestamp: new Date(Date.now() - 5400000).toISOString(),
      engagement: { likes: 89, retweets: 56, replies: 18 },
      verified: true,
      priority: 'low'
    },
    {
      id: '5',
      post: 'Food distribution starting at 3PM at Central Park. Please bring ID. #foodrelief',
      user: 'food_bank_org',
      timestamp: new Date(Date.now() - 900000).toISOString(),
      engagement: { likes: 156, retweets: 98, replies: 45 },
      verified: true,
      priority: 'medium'
    }
  ];

  // Filter based on disaster tags if provided
  if (disasterTags.length > 0) {
    return mockPosts.filter(post => {
      const postLower = post.post.toLowerCase();
      return disasterTags.some(tag => 
        postLower.includes(tag.toLowerCase()) || 
        postLower.includes('#' + tag.toLowerCase())
      );
    });
  }

  return mockPosts;
}

// Priority classification based on keywords
function classifyPriority(content) {
  const urgentKeywords = ['urgent', 'emergency', 'sos', 'help', 'critical', 'immediate'];
  const mediumKeywords = ['need', 'looking for', 'available', 'shelter', 'food'];
  
  const contentLower = content.toLowerCase();
  
  if (urgentKeywords.some(keyword => contentLower.includes(keyword))) {
    return 'high';
  } else if (mediumKeywords.some(keyword => contentLower.includes(keyword))) {
    return 'medium';
  }
  
  return 'low';
}

// Get social media reports for a disaster
router.get('/:disasterId', async (req, res) => {
  try {
    const { disasterId } = req.params;
    const cacheKey = `social_media_${disasterId}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      logger.info(`Serving cached social media data for disaster: ${disasterId}`);
      return res.json(cachedData);
    }
    
    // Fetch disaster to get tags for filtering
    const { data: disaster, error: disasterError } = await supabase
      .from('disasters')
      .select('tags, title')
      .eq('id', disasterId)
      .single();
    
    if (disasterError) {
      if (disasterError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Disaster not found' });
      }
      logger.error('Error fetching disaster for social media:', disasterError);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    // Generate mock social media data
    let socialMediaData = generateMockSocialMediaData(disaster.tags);
    
    // Add priority classification
    socialMediaData = socialMediaData.map(post => ({
      ...post,
      priority: classifyPriority(post.post)
    }));
    
    // Sort by priority and timestamp
    socialMediaData.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    const response = {
      disaster_id: disasterId,
      disaster_title: disaster.title,
      total_posts: socialMediaData.length,
      high_priority_count: socialMediaData.filter(p => p.priority === 'high').length,
      posts: socialMediaData,
      last_updated: new Date().toISOString()
    };
    
    // Cache the response for 1 hour
    await setCachedData(cacheKey, response, 3600);
    
    logger.info(`Social media data processed for disaster: ${disaster.title}`);
    
    // Broadcast real-time update
    req.io.to(`disaster_${disasterId}`).emit('social_media_updated', response);
    
    res.json(response);
  } catch (error) {
    logger.error('Unexpected error in GET /social-media/:disasterId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mock endpoint for social media monitoring
router.get('/mock/latest', async (req, res) => {
  try {
    const { keywords = '', limit = 20 } = req.query;
    
    const cacheKey = `mock_social_media_${keywords}_${limit}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }
    
    let mockData = generateMockSocialMediaData();
    
    // Filter by keywords if provided
    if (keywords) {
      const keywordList = keywords.split(',').map(k => k.trim().toLowerCase());
      mockData = mockData.filter(post =>
        keywordList.some(keyword => post.post.toLowerCase().includes(keyword))
      );
    }
    
    // Limit results
    mockData = mockData.slice(0, parseInt(limit));
    
    const response = {
      query: keywords,
      total_results: mockData.length,
      posts: mockData,
      generated_at: new Date().toISOString()
    };
    
    // Cache for 30 minutes
    await setCachedData(cacheKey, response, 1800);
    
    res.json(response);
  } catch (error) {
    logger.error('Unexpected error in GET /social-media/mock/latest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;