import express from 'express';
import { deleteVideosFromStorageBucket } from '../services/supabaseService.js';

const router = express.Router();

/**
 * @route POST /api/delete-videos
 * @desc Delete videos from storage bucket
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { fileNames, videoIds } = req.body;
    
    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'File names are required and must be a non-empty array' 
      });
    }
    
    console.log(`Deleting ${fileNames.length} videos from storage bucket...`);
    
    // Delete videos from storage bucket
    const result = await deleteVideosFromStorageBucket(fileNames);
    
    // Return the result
    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount,
        videoIds: videoIds || []
      }
    });
  } catch (error) {
    console.error('Error deleting videos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete videos'
    });
  }
});

export default router;
