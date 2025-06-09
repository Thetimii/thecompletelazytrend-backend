import axios from 'axios';
import dotenv from 'dotenv';
import { uploadVideoToSupabase, saveTikTokVideo, saveTrendQuery } from './supabaseService.js';

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// Using the TikTok Feed Search API endpoint from RapidAPI (NEW)
const TIKTOK_SEARCH_API_URL = 'https://tiktok-scraper7.p.rapidapi.com/feed/search';
// REMOVED: const TIKTOK_DOWNLOAD_API_URL = 'https://tiktok-download-video1.p.rapidapi.com/getVideo';

/**
 * Scrape TikTok videos based on search queries
 * @param {string[]} searchQueries - Array of search queries
 * @param {number} videosPerQuery - Number of videos to fetch per query
 * @param {string} userId - User ID to associate trend queries with
 * @returns {Promise<Object[]>} - Array of video data with Supabase URLs
 */
export const scrapeTikTokVideos = async (searchQueries, videosPerQuery = 5, userId = null) => {
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
        // Search for TikTok videos using the Feed Search API
        console.log(`Searching TikTok for: "${query}" with count: ${videosPerQuery}`);
        const searchResponse = await axios.get(TIKTOK_SEARCH_API_URL, {
          params: {
            keywords: query,
            count: videosPerQuery.toString(), // Request exactly the number of videos we want to process
            cursor: '0',
            region: 'US',
            publish_time: '0',
            sort_type: '0' // 0 for relevance, 1 for latest
          },
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'tiktok-scraper7.p.rapidapi.com' // NEW HOST
          }
        });

        // console.log('Search API response for query "${query}":', JSON.stringify(searchResponse.data, null, 2));

        // IMPORTANT: The entire response parsing logic below this line will need to be adapted
        // to the new API's response structure.

        if (!searchResponse.data || searchResponse.data.code !== 0 || !searchResponse.data.data || !searchResponse.data.data.videos) {
          console.warn(`No search results or error for query: "${query}". API Response Code: ${searchResponse.data?.code}, Message: ${searchResponse.data?.msg}`);
          if (searchResponse.data && searchResponse.data.data && !searchResponse.data.data.videos) {
            console.warn('API returned data object, but videos array is missing or empty.');
          }
          continue;
        }

        const videosFromApi = searchResponse.data.data.videos;
        console.log(`Found ${videosFromApi.length} videos from API for query: "${query}" (requested ${videosPerQuery})`);

        // Process up to videosPerQuery videos from search results
        const videosToProcess = videosFromApi.slice(0, videosPerQuery);
        console.log(`Attempting to process ${videosToProcess.length} videos for query: "${query}"`);

        for (let i = 0; i < videosToProcess.length; i++) {
          const video = videosToProcess[i];
          // console.log(`Video ${i} raw data for query "${query}":`, JSON.stringify(video, null, 2));

          // Use video.video_id or video.aweme_id, ensure it's the correct one for URL construction
          // The new API provides video_id, which is typically used in TikTok URLs.
          if (!video || !video.video_id || !video.author?.unique_id) {
            console.warn(`Invalid video data at index ${i} for query "${query}". Missing video_id or author.unique_id. Video data:`, video);
            continue;
          }

          try {
            const videoUrl = `https://www.tiktok.com/@${video.author.unique_id}/video/${video.video_id}`;
            console.log(`Processing video URL: ${videoUrl}`);

            // Get download URL directly from the search result
            const videoDownloadUrl = video.play || video.wmplay; // Prefer non-watermarked

            if (!videoDownloadUrl) {
              console.warn(`No video download URL (play or wmplay) found for: ${videoUrl}. Video data:`, video);
              continue;
            }

            console.log(`Downloading video from: ${videoDownloadUrl}`);
            let supabaseUrl = null;
            let videoIdForSupabase = `video-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            const fileName = trendQueryId
              ? `tq-${trendQueryId}-${videoIdForSupabase}.mp4`
              : `${videoIdForSupabase}.mp4`;

            try {
              const videoBufferResponse = await axios({
                method: 'GET',
                url: videoDownloadUrl,
                responseType: 'arraybuffer'
              });

              console.log(`Uploading video to Supabase with filename: ${fileName}`);
              supabaseUrl = await uploadVideoToSupabase(videoBufferResponse.data, fileName);

              if (!supabaseUrl) {
                console.warn(`Failed to upload video to Supabase: ${videoUrl}`);
                continue;
              }
              console.log(`Successfully uploaded video to Supabase: ${supabaseUrl}`);
            } catch (downloadOrUploadError) {
              console.error(`Error downloading from ${videoDownloadUrl} or uploading ${fileName}: ${downloadOrUploadError.message}`);
              continue;
            }

            const processedVideo = {
              // id: videoIdForSupabase, // This is an internal ID for the allVideos array, not for DB
              author: video.author?.unique_id || 'Unknown Author',
              title: video.title || query,
              description: video.title || query, // Used for caption and hashtags extraction
              likes: video.digg_count || 0,
              comments: video.comment_count || 0, // Not in DB schema shown, but good to have
              shares: video.share_count || 0,
              views: video.play_count || 0,
              originalUrl: videoUrl, // This will be mapped to video_url in supabaseService
              supabaseUrl: supabaseUrl, // This will be mapped to download_url in supabaseService
              coverUrl: video.cover || video.origin_cover || video.ai_dynamic_cover || '', // Mapped to thumbnail_url
              searchQuery: query, // Used for context, not directly saved unless part of title/caption
              duration: video.duration || 0,
              musicTitle: video.music_info?.title || 'N/A',
              downloadCount: video.download_count || 0 // From API, will be mapped to 'downloads' in DB
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
