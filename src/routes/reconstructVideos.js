import express from 'express';
import { reconstructVideos } from '../services/openrouterService.js';

const router = express.Router();

/**
 * @route POST /api/reconstruct-videos
 * @desc Reconstruct and summarize TikTok marketing strategies
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { analyzedVideos, businessDescription, userId } = req.body;

    if (!analyzedVideos || !Array.isArray(analyzedVideos) || analyzedVideos.length === 0) {
      return res.status(400).json({ message: 'Valid analyzed videos array is required' });
    }

    if (!businessDescription) {
      return res.status(400).json({ message: 'Business description is required' });
    }

    const marketingStrategy = await reconstructVideos(analyzedVideos, businessDescription, userId);

    res.json({
      success: true,
      data: {
        businessDescription,
        userId,
        videosAnalyzed: analyzedVideos.length,
        marketingStrategy
      }
    });
  } catch (error) {
    console.error('Error in reconstruct videos route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reconstruct marketing strategy'
    });
  }
});

export default router;
