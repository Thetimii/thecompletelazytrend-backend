import axios from 'axios';
import dotenv from 'dotenv';
import { uploadVideoToSupabase, saveTikTokVideo, saveTrendQuery } from './supabaseService.js';

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// Using the TikTok Most Trending and Viral Content API endpoint from RapidAPI (NEW)
const TIKTOK_TRENDING_API_URL = 'https://tiktok-most-trending-and-viral-content.p.rapidapi.com/video';
const RAPIDAPI_HOST = 'tiktok-most-trending-and-viral-content.p.rapidapi.com';

/**
 * Scrape TikTok videos based on search queries using the new trending API
 * @param {string[]} searchQueries - Array of search queries
 * @param {number} videosPerQuery - Number of videos to fetch per query (default: 5)
 * @param {string} userId - User ID to associate trend queries with
 * @param {Object} customParams - Custom search parameters (sorting, days, videosLocation)
 * @returns {Promise<Object[]>} - Array of video data with Supabase URLs
 */
export const scrapeTikTokVideos = async (searchQueries, videosPerQuery = 5, userId = null, customParams = {}) => {
  try {
    const allVideos = [];
    let totalScrapedVideos = 0; // Keep track of total videos scraped across all queries

    // Process each search query
    for (const query of searchQueries) {
      console.log(`Processing query: "${query}"`);

      // Save trend query to database if userId is provided
      let trendQueryId = null;
      if (userId) {
        try {
          console.log(`Attempting to save trend query with userId: ${userId}`);
          const savedQuery = await saveTrendQuery({
            userId,
            query
          });
          trendQueryId = savedQuery.id;
          console.log(`Saved trend query to database: ${trendQueryId}`);
        } catch (dbError) {
          console.error(`Error saving trend query: ${dbError}`);
          console.log('Continuing without saving trend query to database');
        }
      } else {
        console.log('No userId provided, skipping trend query database save');
      }

      try {
        // Extract custom parameters with defaults
        const {
          sorting = 'rise', // 'rise' or 'rate'
          days = 7, // 1, 7, or 30
          videosLocation = null // country code like 'CH', 'US', etc.
        } = customParams;

        // Search for TikTok videos using the new Trending API
        console.log(`Searching TikTok for: "${query}" with sorting: ${sorting}, days: ${days}, location: ${videosLocation || 'worldwide'}`);
        
        const searchParams = {
          take: videosPerQuery.toString(),
          sorting: sorting,
          search: query,
          days: days.toString(),
          order: 'desc'
        };

        // Add location filter if specified
        if (videosLocation && videosLocation.trim() !== '') {
          searchParams.videosLocation = videosLocation;
        }

        const searchResponse = await axios.get(TIKTOK_TRENDING_API_URL, {
          params: searchParams,
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST
          }
        });

        // console.log('Search API response for query "${query}":', JSON.stringify(searchResponse.data, null, 2));

        // Parse the new API response structure
        if (!searchResponse.data || !searchResponse.data.data || !searchResponse.data.data.stats || !Array.isArray(searchResponse.data.data.stats)) {
          console.warn(`No search results or error for query: "${query}". API Response:`, searchResponse.data);
          continue;
        }

        const videosFromApi = searchResponse.data.data.stats;
        console.log(`Found ${videosFromApi.length} videos from API for query: "${query}" (sorting: ${sorting}, days: ${days})`);

        // Process up to videosPerQuery videos from search results
        const videosToProcess = videosFromApi.slice(0, videosPerQuery);
        console.log(`Attempting to process ${videosToProcess.length} trending videos for query: "${query}"`);

        for (let i = 0; i < videosToProcess.length; i++) {
          const video = videosToProcess[i];
          // console.log(`Video ${i} raw data for query "${query}":`, JSON.stringify(video, null, 2));

          // Validate required video data from new API format
          if (!video || !video.videoId || !video.authorName) {
            console.warn(`Invalid video data at index ${i} for query "${query}". Missing videoId or authorName. Video data:`, video);
            continue;
          }

          try {
            const videoUrl = video.videoUrl || `https://www.tiktok.com/@${video.authorName}/video/${video.videoId}`;
            console.log(`Processing video URL: ${videoUrl}`);

            // Note: New API doesn't provide direct download URLs, so we'll store the TikTok URL
            // and skip the video downloading/uploading part for now
            let supabaseUrl = videoUrl; // Use the TikTok URL directly

            const processedVideo = {
              author: video.authorName || video.user || 'Unknown Author',
              title: video.videoTitle || query,
              description: video.videoTitle || query, // Used for caption and hashtags extraction
              likes: video.likes || 0,
              comments: video.commentsCount || 0,
              shares: video.shares || 0,
              views: video.playCount || 0,
              originalUrl: videoUrl, // This will be mapped to video_url in supabaseService
              supabaseUrl: supabaseUrl, // This will be mapped to videoUrl in supabaseService
              coverUrl: '', // New API doesn't provide cover URLs directly
              searchQuery: query, // Used for context, not directly saved unless part of title/caption
              duration: video.videoDuration || 0,
              musicTitle: video.musicTitle || 'N/A',
              downloadCount: 0, // New API doesn't provide download count
              uploadedAt: video.videoCreateTime || null // Capture upload date from API
            };

            try {
              // Prepare the object for saveTikTokVideo, aligning with supabaseService.js expectations
              const videoMetadataToSave = {
                userId, // Passed for associating trend_query_id
                title: processedVideo.title,
                author: processedVideo.author,
                likes: processedVideo.likes,
                shares: processedVideo.shares,
                views: processedVideo.views,
                video_url: processedVideo.originalUrl, // Original TikTok URL
                videoUrl: processedVideo.supabaseUrl, // Supabase storage URL (mapped to 'videoUrl' column)
                thumbnail_url: processedVideo.coverUrl,
                caption: processedVideo.description, // Or a more specific caption field if available
                duration: processedVideo.duration,
                music_title: processedVideo.musicTitle,
                downloads: processedVideo.downloadCount, // Mapping API's download_count to DB's downloads
                uploaded_at: processedVideo.uploadedAt, // Add the upload date from TikTok API
                // trend_query_id is handled by saveTikTokVideo based on the passed trendQueryId or userId
              };
              
              // console.log(`Video metadata prepared for DB:`, JSON.stringify(videoMetadataToSave, null, 2));

              const savedVideo = await saveTikTokVideo(videoMetadataToSave, trendQueryId); // Pass trendQueryId explicitly
              console.log(`Saved TikTok video to database: ${savedVideo.id}`);
              processedVideo.dbId = savedVideo.id;
              allVideos.push(processedVideo);
              totalScrapedVideos++; // Increment count of successfully scraped and saved videos
              console.log(`Successfully processed and saved video: ${processedVideo.id} for query "${query}"`);

            } catch (dbError) {
              console.error(`Error saving TikTok video metadata to database for ${videoUrl}: ${dbError.message}`);
              // Decide if we should continue or count this as a failure
            }
          } catch (videoProcessingError) {
            console.error(`Error processing video ${video.video_id} for query "${query}":`, videoProcessingError.message);
          }
        } // End of for loop for videos in a query
      } catch (searchApiError) {
        console.error(`Error searching TikTok for query "${query}":`, searchApiError.message);
        if (searchApiError.response) {
          console.error('Search API Error Response Data:', searchApiError.response.data);
        }
      }
    } // End of for loop for searchQueries

    console.log(`Total videos scraped and processed across all queries: ${totalScrapedVideos}`);
    console.log(`Total videos in allVideos array: ${allVideos.length}`);
    return allVideos;
  } catch (error) {
    console.error('Overall error in scrapeTikTokVideos:', error);
    throw new Error('Failed to scrape TikTok videos');
  }
};

export default {
  scrapeTikTokVideos
};
