import express from 'express';
import { summarizeTrends } from '../services/openrouterService.js';

const router = express.Router();

/**
 * @route POST /api/summarize-trends
 * @desc Summarize trends from analyzed videos and provide recreation instructions
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { analyzedVideos, businessDescription, userId } = req.body;
    
    if (!analyzedVideos || !Array.isArray(analyzedVideos) || analyzedVideos.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Analyzed videos are required and must be a non-empty array' 
      });
    }
    
    console.log(`Summarizing trends from ${analyzedVideos.length} videos...`);
    
    // Extract video analyses
    const videoAnalyses = analyzedVideos.map(video => ({
      id: video.id || video.dbId,
      analysis: video.analysis || video.summary,
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      title: video.title || video.description
    }));
    
    // Get trend summary and recreation instructions
    const trendSummary = await summarizeTrends(videoAnalyses, businessDescription, userId);
    
    // Return the trend summary
    res.json({
      success: true,
      data: {
        trendSummary,
        analyzedVideosCount: analyzedVideos.length,
        businessDescription
      }
    });
  } catch (error) {
    console.error('Error in summarize trends route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to summarize trends'
    });
  }
});

export default router;
