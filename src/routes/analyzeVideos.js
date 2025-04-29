import express from 'express';
import { analyzeVideos } from '../services/qwenService.js';

const router = express.Router();

/**
 * @route POST /api/analyze-videos
 * @desc Analyze TikTok videos using Qwen
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { videos, businessDescription } = req.body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ message: 'Valid videos array is required' });
    }

    if (!businessDescription) {
      return res.status(400).json({ message: 'Business description is required' });
    }

    const analyzedVideos = await analyzeVideos(videos, businessDescription);

    res.json({
      success: true,
      data: {
        businessDescription,
        videosCount: analyzedVideos.length,
        analyzedVideos
      }
    });
  } catch (error) {
    console.error('Error in analyze videos route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze videos'
    });
  }
});

export default router;
