import axios from 'axios';
import dotenv from 'dotenv';
import { uploadVideoToSupabase, saveTikTokVideo, saveTrendQuery } from './supabaseService.js';

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// Using the TikTok Feed Search API endpoint from RapidAPI
const TIKTOK_SEARCH_API_URL = 'https://tiktok-download-video1.p.rapidapi.com/feedSearch';
// Using the TikTok Download Video API endpoint from RapidAPI
const TIKTOK_DOWNLOAD_API_URL = 'https://tiktok-download-video1.p.rapidapi.com/getVideo';

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

    // Process each search query
    for (const query of searchQueries) {
      console.log(`Processing query: ${query}`);

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
          // Continue even if database save fails
          console.log('Continuing without saving trend query to database');
        }
      } else {
        console.log('No userId provided, skipping trend query database save');
      }

      try {
        // Search for TikTok videos using the Feed Search API
        console.log(`Searching TikTok for: ${query}`);
        const searchResponse = await axios.get(TIKTOK_SEARCH_API_URL, {
          params: {
            keywords: query,
            count: (videosPerQuery * 2).toString(), // Request more videos than needed to ensure we get enough valid ones
            cursor: '0',
            region: 'US',
            publish_time: '0',
            sort_type: '0'
          },
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'tiktok-download-video1.p.rapidapi.com'
          }
        });

        console.log('Search API response:', JSON.stringify(searchResponse.data, null, 2));

        if (!searchResponse.data || !searchResponse.data.data || !searchResponse.data.data.videos) {
          console.warn(`No search results for query: ${query}`);
          console.warn('Response structure:', Object.keys(searchResponse.data || {}));
          continue;
        }

        const videos = searchResponse.data.data.videos;
        console.log(`Found ${videos.length} videos for query: ${query}`);

        // Process each video from search results
        for (let i = 0; i < Math.min(videos.length, videosPerQuery); i++) {
          const video = videos[i];

          console.log(`Video ${i} data:`, JSON.stringify(video, null, 2));

          if (!video || !video.video_id) {
            console.warn(`Invalid video data at index ${i}`);
            continue;
          }

          try {
            // Get the video URL
            const videoUrl = `https://www.tiktok.com/@${video.author.unique_id}/video/${video.video_id}`;
            console.log(`Processing video: ${videoUrl}`);

            // Call the TikTok Download Video API to get the actual video file
            const downloadResponse = await axios.get(TIKTOK_DOWNLOAD_API_URL, {
              params: {
                url: videoUrl
              },
              headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'tiktok-download-video1.p.rapidapi.com'
              }
            });

            if (!downloadResponse.data || !downloadResponse.data.data) {
              console.warn(`No download data for video: ${videoUrl}`);
              continue;
            }

            const downloadData = downloadResponse.data.data;
            const videoDownloadUrl = downloadData.play || downloadData.hdplay;

            if (!videoDownloadUrl) {
              console.warn(`No video download URL for: ${videoUrl}`);
              continue;
            }

            // Log the download data to see what fields are available
            console.log('Download data fields:', Object.keys(downloadData));
            console.log('Download data origin_cover:', downloadData.origin_cover);
            console.log('Download data title:', downloadData.title);

            // Download the video
            console.log(`Downloading video from: ${videoDownloadUrl}`);
            let supabaseUrl = null;
            let videoId = null;

            try {
              const videoResponse = await axios({
                method: 'GET',
                url: videoDownloadUrl,
                responseType: 'arraybuffer'
              });

              // Generate a unique filename that includes the trend query ID
              // This will make it easier to match videos to trend queries later
              videoId = `video-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

              // Include the trend query ID in the filename if available
              const fileName = trendQueryId
                ? `tq-${trendQueryId}-${videoId}.mp4`
                : `${videoId}.mp4`;

              console.log(`Generated filename with trend query ID: ${fileName}`);

              // Upload to Supabase
              console.log(`Uploading video to Supabase with filename: ${fileName}`);
              supabaseUrl = await uploadVideoToSupabase(videoResponse.data, fileName);

              if (!supabaseUrl) {
                console.warn(`Failed to upload video to Supabase: ${videoUrl}`);
                continue;
              }

              console.log(`Successfully uploaded video to Supabase: ${supabaseUrl}`);
            } catch (downloadError) {
              console.error(`Error downloading or uploading video: ${downloadError.message}`);
              // Continue with the next video if download fails
              continue;
            }

            // Create video data object
            const processedVideo = {
              id: videoId || `video-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              author: video.author.unique_id || 'TikTok User',
              title: downloadData.title || video.title || query,
              description: downloadData.title || video.title || query,
              likes: video.digg_count || 0,
              comments: video.comment_count || 0,
              shares: video.share_count || 0,
              views: video.play_count || 0,
              originalUrl: videoUrl,
              supabaseUrl: supabaseUrl,
              coverUrl: downloadData.origin_cover || downloadData.cover || video.cover || '',
              searchQuery: query
            };

            // Try to save video metadata to database
            try {
              // Prepare video metadata
              const videoMetadata = {
                userId,
                title: processedVideo.title,
                author: processedVideo.author,
                likes: processedVideo.likes,
                comments: processedVideo.comments,
                shares: processedVideo.shares,
                views: processedVideo.views,
                video_url: videoUrl || `https://www.tiktok.com/@${processedVideo.author}/video/unknown`,  // Ensure video_url is never null
                download_url: supabaseUrl,
                thumbnail_url: processedVideo.coverUrl, // Use the correct field name for the database
                caption: processedVideo.description // Save the caption properly
              };

              // Log the video metadata for debugging
              console.log(`Video metadata prepared:`, JSON.stringify({
                ...videoMetadata,
                video_url: videoMetadata.video_url,
                download_url: videoMetadata.download_url
              }, null, 2));

              // Add trend_query_id if it exists
              if (trendQueryId) {
                videoMetadata.trend_query_id = trendQueryId;
                console.log(`Added trend_query_id to video metadata: ${trendQueryId}`);
              }

              // Try to save to database
              try {
                const savedVideo = await saveTikTokVideo(videoMetadata, trendQueryId);
                console.log(`Saved TikTok video to database: ${savedVideo.id}`);
                processedVideo.dbId = savedVideo.id;
              } catch (dbError) {
                console.error(`Error saving TikTok video to database: ${dbError.message}`);
                console.log('Continuing without saving video to database');
              }
            } catch (error) {
              console.error('Error preparing video metadata:', error);
            }

            // Add video data to results
            allVideos.push(processedVideo);
            console.log(`Successfully processed video: ${processedVideo.id}`);
          } catch (videoError) {
            console.error(`Error processing video ${video.video_id}:`, videoError);
            // Continue with the next video
          }
        }
      } catch (searchError) {
        console.error(`Error searching for query "${query}":`, searchError);
        // Continue with the next query
      }
    }

    console.log(`Total videos processed: ${allVideos.length}`);
    return allVideos;
  } catch (error) {
    console.error('Error scraping TikTok videos:', error);
    throw new Error('Failed to scrape TikTok videos');
  }
};

export default {
  scrapeTikTokVideos
};
