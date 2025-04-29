import dotenv from 'dotenv';
import supabaseService from '../services/supabaseService.js';
import axios from 'axios';

// Load environment variables
dotenv.config();

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

/**
 * Update video with analysis data
 * @param {string} videoId - Video ID
 * @param {Object} analysisData - Analysis data
 * @returns {Promise<Object>} - Updated video data
 */
const updateVideoAnalysis = async (videoId, analysisData) => {
  try {
    const { data, error } = await supabase
      .from('tiktok_videos')
      .update({
        summary: analysisData.summary,
        transcript: analysisData.transcript || '',
        frame_analysis: analysisData.frameAnalysis || {},
        last_analyzed_at: new Date().toISOString()
      })
      .eq('id', videoId)
      .select();

    if (error) {
      throw new Error(`Error updating video analysis: ${error.message}`);
    }

    return data[0];
  } catch (error) {
    console.error('Error updating video analysis:', error);
    throw new Error('Failed to update video analysis');
  }
};

/**
 * Analyze a video using DashScope API
 * @param {Object} video - Video data with storageUrl
 * @returns {Promise<Object>} - Analysis data
 */
const analyzeVideo = async (video) => {
  try {
    console.log(`Analyzing video: ${video.id}`);

    // Get the video URL from the storage bucket
    const videoUrl = video.storageUrl;

    console.log(`Using video URL: ${videoUrl}`);

    // Prepare the request to DashScope API
    const requestBody = {
      model: 'qwen2.5-vl-72b-instruct', // Using the model that works with video
      input: {
        messages: [
          {
            role: "system",
            content: [{
              text: "You are an expert at analyzing TikTok marketing strategies. Your task is to analyze the provided video and extract key marketing elements that make it successful."
            }]
          },
          {
            role: "user",
            content: [
              {
                video: videoUrl,
                fps: 1, // Lower fps to reduce data size
                start_time: 0,
                end_time: 60 // Limit to first 60 seconds
              },
              {
                text: `Analyze this TikTok video. Extract the key marketing elements, content style, hooks used, and why it might be successful. The video has ${video.likes || 0} likes, ${video.comments || 0} comments, and ${video.views || 0} views. The caption is: "${video.caption || ''}"`
              }
            ]
          }
        ]
      },
      parameters: {
        result_format: "message"
      }
    };

    console.log(`Making API call to DashScope for video: ${video.id}`);

    // Set base URL for international API
    axios.defaults.baseURL = 'https://dashscope-intl.aliyuncs.com/api/v1';

    const response = await axios.post(
      '/services/aigc/multimodal-generation/generation',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'X-DashScope-DataInspection': 'enable' // Enable data inspection for debugging
        },
        timeout: 300000 // 5 minutes timeout for longer processing
      }
    );

    console.log(`Response received for video: ${video.id}`);

    // Extract the analysis from the response
    const analysis = response.data.output.choices[0].message.content[0].text;

    return {
      summary: analysis,
      transcript: '',
      frameAnalysis: {}
    };
  } catch (error) {
    console.error(`Error analyzing video ${video.id}:`, error);
    throw error;
  }
};

/**
 * Get videos from storage bucket for a specific trend query
 * @param {Object} trendQuery - Trend query object
 * @returns {Promise<Array>} - Array of video objects with storage URLs
 */
const getVideosForTrendQuery = async (trendQuery) => {
  try {
    // List all files in the videos folder of the storage bucket
    const { data: files, error } = await supabaseService.supabase.storage
      .from('tiktok-videos')
      .list('videos');

    if (error) {
      throw new Error(`Error listing files in storage bucket: ${error.message}`);
    }

    console.log(`Found ${files.length} files in storage bucket`);

    // Filter files that contain the trend query ID in the filename
    const matchingFiles = files.filter(file =>
      file.name.includes(`tq-${trendQuery.id}`) ||
      file.name.includes(`trend-${trendQuery.id}`)
    );

    console.log(`Found ${matchingFiles.length} files matching trend query ID: ${trendQuery.id}`);

    // Create video objects with storage URLs
    const videoObjects = [];

    for (const file of matchingFiles) {
      // Get the public URL for the file
      const { data: publicUrlData } = supabaseService.supabase.storage
        .from('tiktok-videos')
        .getPublicUrl(`videos/${file.name}`);

      const storageUrl = publicUrlData.publicUrl;

      // Find the corresponding database record if it exists
      const dbVideo = trendQuery.videos.find(v =>
        (v.download_url && v.download_url.includes(file.name))
      );

      videoObjects.push({
        id: dbVideo?.id || `storage-${file.name}`,
        fileName: file.name,
        storageUrl: storageUrl,
        dbRecord: dbVideo || null,
        trend_query_id: trendQuery.id,
        query: trendQuery.query
      });

      console.log(`Added video object for file: ${file.name}`);
    }

    return videoObjects;
  } catch (error) {
    console.error(`Error getting videos for trend query ${trendQuery.id}:`, error);
    return [];
  }
};

/**
 * Analyze videos for a specific trend query
 * @param {Object} trendQuery - Trend query object with associated videos
 * @returns {Promise<void>}
 */
const analyzeVideosForTrendQuery = async (trendQuery) => {
  try {
    console.log(`\n=== Processing trend query: "${trendQuery.query}" (ID: ${trendQuery.id}) ===`);
    console.log(`This query has ${trendQuery.videos.length} associated videos in the database`);

    // Get videos from storage bucket for this trend query
    const videos = await getVideosForTrendQuery(trendQuery);
    console.log(`Found ${videos.length} matching videos in storage bucket`);

    if (videos.length === 0) {
      console.log(`No videos found in storage for trend query: ${trendQuery.query}`);
      return;
    }

    // Analyze each video
    for (const video of videos) {
      try {
        console.log(`\nProcessing video: ${video.id} for query "${trendQuery.query}"`);

        // Analyze the video
        const analysisData = await analyzeVideo(video);

        // Update the video with the analysis data
        const updatedVideo = await updateVideoAnalysis(video.id, analysisData);
        console.log(`Successfully analyzed and updated video: ${updatedVideo.id}`);
      } catch (error) {
        console.error(`Error processing video ${video.id}:`, error);
        // Continue with the next video
      }
    }

    console.log(`\n=== Completed analysis for trend query: "${trendQuery.query}" ===`);
  } catch (error) {
    console.error(`Error analyzing videos for trend query ${trendQuery.id}:`, error);
  }
};

/**
 * Main function to analyze videos by trend query batches
 */
const analyzeAllVideos = async () => {
  try {
    console.log('Starting to analyze videos by trend query batches...');

    // Get recent trend queries with their associated videos
    const trendQueriesWithVideos = await supabaseService.getRecentTrendQueriesWithVideos(5); // Process 5 most recent queries
    console.log(`Found ${trendQueriesWithVideos.length} recent trend queries to process`);

    // Process each trend query batch
    for (const trendQuery of trendQueriesWithVideos) {
      await analyzeVideosForTrendQuery(trendQuery);
    }

    console.log('\nFinished analyzing all trend query batches');
  } catch (error) {
    console.error('Error analyzing videos:', error);
  }
};

// Run the main function
analyzeAllVideos()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
