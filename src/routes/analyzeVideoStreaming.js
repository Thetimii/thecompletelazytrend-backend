import express from 'express';
import { analyzeVideoStreaming } from '../services/qwenService.js';

const router = express.Router();

/**
 * @route POST /api/analyze-video-streaming
 * @desc Analyze a TikTok video using Qwen with streaming response
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { video, businessDescription } = req.body;
    
    if (!video) {
      return res.status(400).json({ message: 'Valid video object is required' });
    }
    
    if (!businessDescription) {
      return res.status(400).json({ message: 'Business description is required' });
    }
    
    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Function to send a chunk of data to the client
    const sendChunk = (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    };
    
    // Start the analysis with streaming
    try {
      const analyzedVideo = await analyzeVideoStreaming(video, businessDescription, sendChunk);
      
      // Send the complete analyzed video at the end
      res.write(`data: ${JSON.stringify({ 
        complete: true, 
        analyzedVideo 
      })}\n\n`);
      
      // End the response
      res.end();
    } catch (analysisError) {
      // Send error to client
      res.write(`data: ${JSON.stringify({ 
        error: true, 
        message: analysisError.message 
      })}\n\n`);
      
      // End the response
      res.end();
    }
  } catch (error) {
    console.error('Error in analyze video streaming route:', error);
    
    // If headers haven't been sent yet, send a regular error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to analyze video'
      });
    } else {
      // Otherwise, send error in the stream format
      res.write(`data: ${JSON.stringify({ 
        error: true, 
        message: error.message || 'Failed to analyze video'
      })}\n\n`);
      res.end();
    }
  }
});

export default router;
