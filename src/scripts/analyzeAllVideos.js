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
    const updatePayload = {
      summary: analysisData.summary,
      hooks: analysisData.hooks,
      ctas: analysisData.ctas,
      content_style: analysisData.content_style,
      success_factors: analysisData.success_factors,
      transcript: analysisData.transcript,
      last_analyzed_at: new Date().toISOString(),
      // We are not updating frame_analysis for now
    };

    console.log(`Updating video ${videoId} with payload:`, JSON.stringify(updatePayload, null, 2));

    const { data, error } = await supabaseService.supabase
      .from('tiktok_videos')
      .update(updatePayload)
      .eq('id', videoId)
      .select();

    if (error) {
      console.error(`Supabase error for video ${videoId}:`, error);
      throw new Error(`Error updating video analysis: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error(`No data returned after updating video ${videoId}. It might not exist.`);
    }

    console.log(`Successfully updated video ${videoId} in Supabase.`);
    return data[0];
  } catch (error) {
    console.error(`Error in updateVideoAnalysis for video ${videoId}:`, error);
    // Re-throw the error to be caught by the calling function
    throw new Error(`Failed to update video analysis for ${videoId}`);
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
    const videoUrl = video.storageUrl;
    console.log(`Using video URL: ${videoUrl}`);

    const prompt = `
Analyze this TikTok video and provide a detailed marketing analysis. The video has ${video.likes || 0} likes, ${video.comments || 0} comments, and ${video.views || 0} views. The caption is: "${video.caption || ''}".

Your response MUST be a valid JSON object with the following structure:
{
  "summary": "A concise, one-paragraph summary of the video's content and marketing angle.",
  "hooks": [
    "A list of specific hooks used in the first 3 seconds to grab attention. E.g., 'Uses a controversial statement', 'Starts with a surprising visual'."
  ],
  "ctas": [
    "A list of calls-to-action in the video. E.g., 'Asks users to comment', 'Points to a link in bio'."
  ],
  "content_style": "Describe the content style. E.g., 'Fast-paced editing with trending audio', 'User-generated content style', 'Educational tutorial'.",
  "success_factors": [
    "A list of key reasons why this video is successful. E.g., 'Relatable humor', 'Addresses a common pain point', 'High production quality'."
  ],
  "transcript": "A full transcript of the spoken words in the video. If no speech, return an empty string."
}
`;

    const requestBody = {
      model: 'qwen2.5-vl-72b-instruct',
      input: {
        messages: [
          {
            role: "system",
            content: [{
              text: "You are an expert at analyzing TikTok marketing strategies. Your task is to analyze the provided video and extract key marketing elements that make it successful. You must return your analysis in a valid JSON format."
            }]
          },
          {
            role: "user",
            content: [
              {
                video: videoUrl,
                fps: 1,
                start_time: 0,
                end_time: 60
              },
              {
                text: prompt
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
    axios.defaults.baseURL = 'https://dashscope-intl.aliyuncs.com/api/v1';

    const response = await axios.post(
      '/services/aigc/multimodal-generation/generation',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'X-DashScope-DataInspection': 'enable'
        },
        timeout: 300000
      }
    );

    console.log(`Response received for video: ${video.id}`);
    const rawContent = response.data.output.choices[0].message.content[0].text;

    // Clean the response to extract only the JSON part
    const jsonMatch = rawContent.match(/\{.*\}/s);
    if (!jsonMatch) {
      console.error(`Failed to find valid JSON in response for video ${video.id}. Raw content:`, rawContent);
      throw new Error(`Malformed AI response: No JSON object found for video ${video.id}.`);
    }

    try {
      const analysisData = JSON.parse(jsonMatch[0]);
      console.log(`Successfully parsed JSON for video ${video.id}`);
      return analysisData;
    } catch (parseError) {
      console.error(`Failed to parse JSON for video ${video.id}. Raw JSON string:`, jsonMatch[0]);
      throw new Error(`Malformed AI response: Invalid JSON format for video ${video.id}.`);
    }

  } catch (error) {
    console.error(`Error in analyzeVideo for video ${video.id}:`, error.message);
    // Add more context to the error and re-throw
    if (error.response) {
      console.error('DashScope API Error Body:', error.response.data);
    }
    throw new Error(`Failed to analyze video ${video.id}. Reason: ${error.message}`);
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
