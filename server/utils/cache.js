import { supabase } from '../database/supabase.js';
import { logger } from './logger.js';

// Get cached data if not expired
export async function getCachedData(key) {
  try {
    const { data, error } = await supabase
      .from('cache')
      .select('value, expires_at')
      .eq('key', key)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        return null;
      }
      logger.error('Error fetching from cache:', error);
      return null;
    }
    
    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      // Delete expired entry
      await supabase.from('cache').delete().eq('key', key);
      return null;
    }
    
    return data.value;
  } catch (error) {
    logger.error('Error in getCachedData:', error);
    return null;
  }
}

// Set cached data with TTL in seconds
export async function setCachedData(key, value, ttlSeconds = 3600) {
  try {
    const expiresAt = new Date(Date.now() + (ttlSeconds * 1000));
    
    const { error } = await supabase
      .from('cache')
      .upsert({
        key,
        value,
        expires_at: expiresAt.toISOString()
      });
    
    if (error) {
      logger.error('Error setting cache:', error);
    }
  } catch (error) {
    logger.error('Error in setCachedData:', error);
  }
}

// Clean expired cache entries
export async function cleanExpiredCache() {
  try {
    const { error } = await supabase
      .from('cache')
      .delete()
      .lt('expires_at', new Date().toISOString());
    
    if (error) {
      logger.error('Error cleaning expired cache:', error);
    } else {
      logger.info('Expired cache entries cleaned');
    }
  } catch (error) {
    logger.error('Error in cleanExpiredCache:', error);
  }
}

// Schedule periodic cache cleanup
setInterval(cleanExpiredCache, 3600000); // Run every hour