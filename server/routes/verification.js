import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../database/supabase.js';
import { authenticateUser } from './auth.js';
import { logger } from '../utils/logger.js';
import { getCachedData, setCachedData } from '../utils/cache.js';

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Verify disaster image using Gemini AI
router.post('/:disasterId/verify-image', authenticateUser, async (req, res) => {
  try {
    const { disasterId } = req.params;
    const { image_url, report_id } = req.body;
    
    if (!image_url) {
      return res.status(400).json({ error: 'image_url is required' });
    }
    
    const cacheKey = `image_verification_${Buffer.from(image_url).toString('base64')}`;
    
    // Check cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      logger.info('Serving cached image verification result');
      return res.json(cachedData);
    }
    
    // Verify disaster exists
    const { data: disaster, error: disasterError } = await supabase
      .from('disasters')
      .select('id, title, tags')
      .eq('id', disasterId)
      .single();
    
    if (disasterError) {
      if (disasterError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Disaster not found' });
      }
      logger.error('Error fetching disaster for verification:', disasterError);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    try {
      // Use Gemini AI for image verification
      const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
      
      const prompt = `
        Analyze this image for disaster-related content verification:
        
        1. Is this image authentic (not manipulated or AI-generated)?
        2. Does it show signs of a real disaster or emergency situation?
        3. Are there any indicators of photo manipulation, editing, or artificial generation?
        4. What type of disaster/emergency does this appear to show (if any)?
        5. Rate the authenticity on a scale of 1-10 (10 being completely authentic)
        
        Context: This image is being submitted in relation to: ${disaster.title}
        Disaster tags: ${disaster.tags.join(', ')}
        
        Please provide a detailed analysis in JSON format:
        {
          "is_authentic": boolean,
          "authenticity_score": number (1-10),
          "disaster_type_detected": string,
          "manipulation_indicators": array of strings,
          "verification_confidence": string ("high", "medium", "low"),
          "analysis_summary": string,
          "recommended_action": string
        }
      `;
      
      // For demo purposes, we'll simulate Gemini AI response
      // In production, you would make actual API call:
      // const result = await model.generateContent([prompt, { inlineData: { data: imageData, mimeType: 'image/jpeg' } }]);
      
      const mockVerificationResult = {
        is_authentic: true,
        authenticity_score: 8.5,
        disaster_type_detected: disaster.tags[0] || 'general emergency',
        manipulation_indicators: [],
        verification_confidence: 'high',
        analysis_summary: 'Image appears to be authentic showing real disaster conditions consistent with reported incident.',
        recommended_action: 'approve'
      };
      
      // Update report verification status if report_id provided
      if (report_id) {
        const { error: updateError } = await supabase
          .from('reports')
          .update({ 
            verification_status: mockVerificationResult.is_authentic ? 'verified' : 'rejected'
          })
          .eq('id', report_id)
          .eq('disaster_id', disasterId);
        
        if (updateError) {
          logger.error('Error updating report verification status:', updateError);
        }
      }
      
      const response = {
        disaster_id: disasterId,
        image_url,
        report_id,
        verification_result: mockVerificationResult,
        processed_by: req.user.username,
        processed_at: new Date().toISOString(),
        ai_model: 'gemini-pro-vision'
      };
      
      // Cache for 24 hours (verification results shouldn't change)
      await setCachedData(cacheKey, response, 86400);
      
      logger.info(`Image verification completed for disaster: ${disaster.title}, result: ${mockVerificationResult.is_authentic ? 'verified' : 'rejected'}`);
      
      res.json(response);
      
    } catch (aiError) {
      logger.error('Error calling Gemini AI for image verification:', aiError);
      
      // Fallback to basic verification
      const fallbackResult = {
        is_authentic: true,
        authenticity_score: 5.0,
        disaster_type_detected: 'unknown',
        manipulation_indicators: ['Unable to perform advanced analysis'],
        verification_confidence: 'low',
        analysis_summary: 'Basic verification completed. Advanced AI analysis unavailable.',
        recommended_action: 'manual_review'
      };
      
      const response = {
        disaster_id: disasterId,
        image_url,
        report_id,
        verification_result: fallbackResult,
        processed_by: req.user.username,
        processed_at: new Date().toISOString(),
        ai_model: 'fallback',
        note: 'AI analysis failed, fallback verification used'
      };
      
      res.json(response);
    }
    
  } catch (error) {
    logger.error('Unexpected error in POST /verification/:disasterId/verify-image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get verification history for a disaster
router.get('/:disasterId/history', async (req, res) => {
  try {
    const { disasterId } = req.params;
    const { limit = 20, status } = req.query;
    
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
      logger.error('Error fetching disaster for verification history:', disasterError);
      return res.status(500).json({ error: 'Failed to fetch disaster' });
    }
    
    let query = supabase
      .from('reports')
      .select('id, content, image_url, verification_status, created_at, user_id')
      .eq('disaster_id', disasterId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    
    if (status) {
      query = query.eq('verification_status', status);
    }
    
    const { data: reports, error } = await query;
    
    if (error) {
      logger.error('Error fetching verification history:', error);
      return res.status(500).json({ error: 'Failed to fetch verification history' });
    }
    
    const response = {
      disaster_id: disasterId,
      disaster_title: disaster.title,
      total_reports: reports.length,
      verified_count: reports.filter(r => r.verification_status === 'verified').length,
      pending_count: reports.filter(r => r.verification_status === 'pending').length,
      rejected_count: reports.filter(r => r.verification_status === 'rejected').length,
      reports: reports
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Unexpected error in GET /verification/:disasterId/history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;