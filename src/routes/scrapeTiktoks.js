import express from 'express';
import { scrapeTikTokVideos } from '../services/rapidApiService.js';

const router = express.Router();

/**
 * @route POST /api/scrape-tiktoks
 * @desc Scrape TikTok videos based on search queries
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { searchQueries, videosPerQuery = 5, userId, customParams = {} } = req.body;

    if (!searchQueries || !Array.isArray(searchQueries) || searchQueries.length === 0) {
      return res.status(400).json({ message: 'Valid search queries array is required' });
    }

    // Limit the number of queries to prevent abuse
    const limitedQueries = searchQueries.slice(0, 5);

    const videos = await scrapeTikTokVideos(limitedQueries, videosPerQuery, userId, customParams);

    res.json({
      success: true,
      data: {
        searchQueries: limitedQueries,
        videosCount: videos.length,
        userId: userId,
        customParams,
        videos
      }
    });
  } catch (error) {
    console.error('Error in scrape TikToks route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to scrape TikTok videos'
    });
  }
});

export default router;
