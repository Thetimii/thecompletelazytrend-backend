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

    // Extract and parse video analyses
    const videoAnalyses = analyzedVideos.map(video => {
      let analysisData = {};
      // The analysis is now stored in the 'summary' field as a JSON string or object
      if (typeof video.summary === 'string') {
        try {
          analysisData = JSON.parse(video.summary);
        } catch (e) {
          console.warn(`Could not parse summary for video ${video.id}. Using raw string.`);
          analysisData = { summary: video.summary }; // Fallback
        }
      } else if (typeof video.summary === 'object' && video.summary !== null) {
        analysisData = video.summary;
      }

      return {
        id: video.id,
        ...analysisData, // Spread the detailed analysis fields
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        shares: video.shares,
        title: video.caption || video.title
      };
    });

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
