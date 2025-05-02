import express from 'express';
import { generateSearchQueries } from '../services/openrouterService.js';
import { scrapeTikTokVideos } from '../services/rapidApiService.js';
import { analyzeVideos } from '../services/qwenService.js';
import { reconstructVideos } from '../services/openrouterService.js';
import { deleteVideosFromStorageBucket } from '../services/supabaseService.js';

const router = express.Router();

/**
 * @route POST /api/complete-workflow
 * @desc Run the complete workflow from search queries to video analysis
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { businessDescription, userId, videosPerQuery = 5 } = req.body;

    if (!businessDescription) {
      return res.status(400).json({ message: 'Business description is required' });
    }

    // Step 1: Generate search queries
    console.log('Step 1: Generating search queries...');
    const searchQueries = await generateSearchQueries(businessDescription);

    // Step 2: Scrape TikTok videos
    console.log('Step 2: Scraping TikTok videos...');
    const videos = await scrapeTikTokVideos(searchQueries, videosPerQuery, userId);

    // Step 3: Analyze videos
    console.log('Step 3: Analyzing videos...');
    const analyzedVideos = await analyzeVideos(videos, businessDescription);

    // Step 4: Reconstruct videos
    console.log('Step 4: Reconstructing videos...');
    const marketingStrategy = await reconstructVideos(analyzedVideos, businessDescription, userId);

    // Step 5: Delete videos from storage bucket
    console.log('Step 5: Deleting videos from storage bucket...');
    const videoFileNames = [];

    // Extract filenames from video URLs
    for (const video of videos) {
      if (video.supabaseUrl) {
        const urlParts = video.supabaseUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];
        if (fileName) {
          videoFileNames.push(fileName);
        }
      }
    }

    console.log(`Found ${videoFileNames.length} videos to delete`);

    // Delete videos from storage bucket
    let deletionResult = { deletedCount: 0 };
    if (videoFileNames.length > 0) {
      try {
        deletionResult = await deleteVideosFromStorageBucket(videoFileNames);
        console.log(`Successfully deleted ${deletionResult.deletedCount} videos from storage bucket`);
      } catch (deletionError) {
        console.error('Error deleting videos:', deletionError);
        // Continue even if deletion fails
      }
    }

    // Return the complete workflow results
    res.json({
      success: true,
      data: {
        businessDescription,
        userId,
        searchQueries,
        videosCount: videos.length,
        analyzedVideosCount: analyzedVideos.length,
        marketingStrategy,
        deletedVideosCount: deletionResult.deletedCount
      }
    });
  } catch (error) {
    console.error('Error in complete workflow route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete workflow'
    });
  }
});

export default router;
