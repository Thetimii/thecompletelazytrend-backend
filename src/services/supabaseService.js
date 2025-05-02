import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Bucket name for storing videos
const BUCKET_NAME = 'tiktok-videos';

/**
 * Initialize Supabase storage bucket if it doesn't exist
 */
export const initializeStorage = async () => {
  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets.some(bucket => bucket.name === BUCKET_NAME);

    // Create bucket if it doesn't exist
    if (!bucketExists) {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true, // Make bucket public so videos can be accessed without authentication
        fileSizeLimit: 50000000 // 50MB limit
      });

      if (error) {
        throw new Error(`Error creating bucket: ${error.message}`);
      }

      console.log('Created Supabase storage bucket:', BUCKET_NAME);
    }
  } catch (error) {
    console.error('Error initializing Supabase storage:', error);
    throw new Error('Failed to initialize Supabase storage');
  }
};

/**
 * Upload video buffer to Supabase storage
 * @param {Buffer} videoBuffer - Video data as buffer
 * @param {string} fileName - Name to save the file as
 * @returns {Promise<string>} - Public URL of the uploaded video
 */
export const uploadVideoToSupabase = async (videoBuffer, fileName) => {
  try {
    // Ensure bucket exists
    await initializeStorage();

    // Upload file from buffer
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(`videos/${fileName}`, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true // Overwrite if file exists
      });

    if (error) {
      throw new Error(`Error uploading video: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`videos/${fileName}`);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error uploading to Supabase:', error);
    throw new Error('Failed to upload video to Supabase');
  }
};

/**
 * Save TikTok video metadata to the database
 * @param {Object} videoData - Video metadata
 * @param {string} trendQueryId - Trend query ID
 * @returns {Promise<Object>} - Saved video data
 */
export const saveTikTokVideo = async (videoData, trendQueryId) => {
  try {
    console.log(`Saving TikTok video with trend_query_id: ${trendQueryId}`);

    // Check if trend_query_id is required but not provided
    if (!trendQueryId) {
      console.error('trend_query_id is required but not provided');
      // Create a default trend query if needed
      try {
        console.log('Creating a default trend query');
        const defaultQuery = await saveTrendQuery({
          query: videoData.searchQuery || 'default query',
          // Try to use userId from videoData if available
          userId: videoData.userId
        });

        if (defaultQuery && defaultQuery.id) {
          trendQueryId = defaultQuery.id;
          console.log(`Created default trend query with ID: ${trendQueryId}`);
        } else {
          console.error('Failed to create default trend query');
          throw new Error('Failed to create default trend query');
        }
      } catch (queryError) {
        console.error('Error creating default trend query:', queryError);
        throw new Error('Cannot save video without trend_query_id');
      }
    }

    // Prepare the video data for insertion
    // Check the actual column names in the database
    const insertData = {
      video_url: videoData.video_url || videoData.originalUrl || `https://www.tiktok.com/@${videoData.author || 'unknown'}/video/unknown`,
      caption: videoData.caption || videoData.description || '',
      views: videoData.views || 0,
      likes: videoData.likes || 0,
      downloads: 0,
      hashtags: extractHashtags(videoData.caption || videoData.description || ''),
      created_at: new Date().toISOString(),
      // Always include trend_query_id as it's required
      trend_query_id: trendQueryId
    };

    // Add download_url field
    if (videoData.download_url || videoData.supabaseUrl) {
      insertData.download_url = videoData.download_url || videoData.supabaseUrl;
    }

    // Log the fields for debugging
    console.log(`Video URL: ${insertData.video_url}`);
    console.log(`Video Storage URL: ${insertData.download_url || 'none'}`);

    // Check if the thumbnail URL exists
    if (videoData.thumbnail_url) {
      insertData.thumbnail_url = videoData.thumbnail_url;
    } else if (videoData.coverUrl) {
      insertData.thumbnail_url = videoData.coverUrl;
    }

    console.log('Inserting video data:', insertData);

    const { data, error } = await supabase
      .from('tiktok_videos')
      .insert(insertData)
      .select();

    if (error) {
      throw new Error(`Error saving TikTok video: ${error.message}`);
    }

    return data[0];
  } catch (error) {
    console.error('Error saving TikTok video:', error);
    throw new Error('Failed to save TikTok video');
  }
};

/**
 * Extract hashtags from video caption
 * @param {string} caption - Video caption
 * @returns {string[]} - Array of hashtags
 */
const extractHashtags = (caption) => {
  if (!caption) return [];

  const hashtagRegex = /#[\w]+/g;
  const matches = caption.match(hashtagRegex);

  return matches || [];
};

/**
 * Save trend query to the database
 * @param {Object} queryData - Query data
 * @returns {Promise<Object>} - Saved query data
 */
export const saveTrendQuery = async (queryData) => {
  try {
    let userId = null;

    // Check if userId exists in the users table
    if (queryData.userId) {
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', queryData.userId)
          .maybeSingle();

        if (!userError && userData && userData.id) {
          console.log(`Found user with ID ${userData.id} for auth_id ${queryData.userId}`);
          userId = userData.id;
        } else {
          console.log(`User with auth_id ${queryData.userId} not found in users table.`);
          // Try to find any user to use as a fallback
          const { data: anyUser, error: anyUserError } = await supabase
            .from('users')
            .select('id')
            .limit(1)
            .single();

          if (!anyUserError && anyUser && anyUser.id) {
            console.log(`Using fallback user ID ${anyUser.id} for trend query`);
            userId = anyUser.id;
          } else {
            console.error('No users found in the database. Cannot create trend query without a user_id.');
            // Create a temporary user if needed
            try {
              console.log('Creating a temporary user for trend query');
              const { data: tempUser, error: tempUserError } = await supabase
                .from('users')
                .insert({
                  email: `temp_${Date.now()}@example.com`,
                  auth_id: `temp_${Date.now()}`,
                  onboarding_completed: false,
                  created_at: new Date().toISOString()
                })
                .select();

              if (!tempUserError && tempUser && tempUser[0] && tempUser[0].id) {
                console.log(`Created temporary user with ID ${tempUser[0].id}`);
                userId = tempUser[0].id;
              } else {
                console.error('Failed to create temporary user:', tempUserError);
                throw new Error('Cannot create trend query without a user_id');
              }
            } catch (tempUserError) {
              console.error('Error creating temporary user:', tempUserError);
              throw new Error('Cannot create trend query without a user_id');
            }
          }
        }
      } catch (userCheckError) {
        console.error(`Error checking user existence: ${userCheckError.message}`);
        throw new Error('Error checking user existence');
      }
    } else {
      // No userId provided, try to find any user
      try {
        const { data: anyUser, error: anyUserError } = await supabase
          .from('users')
          .select('id')
          .limit(1)
          .single();

        if (!anyUserError && anyUser && anyUser.id) {
          console.log(`No userId provided. Using fallback user ID ${anyUser.id} for trend query`);
          userId = anyUser.id;
        } else {
          console.error('No users found in the database and no userId provided.');
          // Create a temporary user
          try {
            console.log('Creating a temporary user for trend query');
            const { data: tempUser, error: tempUserError } = await supabase
              .from('users')
              .insert({
                email: `temp_${Date.now()}@example.com`,
                auth_id: `temp_${Date.now()}`,
                onboarding_completed: false,
                created_at: new Date().toISOString()
              })
              .select();

            if (!tempUserError && tempUser && tempUser[0] && tempUser[0].id) {
              console.log(`Created temporary user with ID ${tempUser[0].id}`);
              userId = tempUser[0].id;
            } else {
              console.error('Failed to create temporary user:', tempUserError);
              throw new Error('Cannot create trend query without a user_id');
            }
          } catch (tempUserError) {
            console.error('Error creating temporary user:', tempUserError);
            throw new Error('Cannot create trend query without a user_id');
          }
        }
      } catch (anyUserError) {
        console.error('Error finding any user:', anyUserError);
        throw new Error('Cannot create trend query without a user_id');
      }
    }

    // Insert the trend query
    const insertData = {
      query: queryData.query,
      user_id: userId // Always include user_id as it's required
    };

    console.log('Inserting trend query data:', insertData);

    const { data, error } = await supabase
      .from('trend_queries')
      .insert(insertData)
      .select();

    if (error) {
      throw new Error(`Error saving trend query: ${error.message}`);
    }

    return data[0];
  } catch (error) {
    console.error('Error saving trend query:', error);
    throw new Error('Failed to save trend query');
  }
};

/**
 * Update TikTok video with analysis data
 * @param {string} videoId - Video ID
 * @param {Object} analysisData - Analysis data
 * @returns {Promise<Object>} - Updated video data
 */
export const updateTikTokVideoAnalysis = async (videoId, analysisData) => {
  try {
    console.log(`Updating TikTok video analysis for video ID: ${videoId}`);

    // Ensure frame_analysis is properly formatted as JSON
    let frameAnalysis = analysisData.frameAnalysis;
    if (typeof frameAnalysis === 'object') {
      frameAnalysis = JSON.stringify(frameAnalysis);
    }

    // Make sure summary is a string
    const summary = typeof analysisData.summary === 'string'
      ? analysisData.summary
      : (analysisData.summary ? JSON.stringify(analysisData.summary) : '');

    // Make sure transcript is a string
    const transcript = typeof analysisData.transcript === 'string'
      ? analysisData.transcript
      : (analysisData.transcript ? JSON.stringify(analysisData.transcript) : '');

    const { data, error } = await supabase
      .from('tiktok_videos')
      .update({
        summary: summary,
        transcript: transcript,
        frame_analysis: frameAnalysis,
        last_analyzed_at: new Date().toISOString()
      })
      .eq('id', videoId)
      .select();

    if (error) {
      throw new Error(`Error updating TikTok video analysis: ${error.message}`);
    }

    console.log(`Successfully updated TikTok video analysis for video ID: ${videoId}`);
    return data[0];
  } catch (error) {
    console.error('Error updating TikTok video analysis:', error);
    throw new Error('Failed to update TikTok video analysis');
  }
};

/**
 * Save recommendation to the database
 * @param {Object} recommendationData - Recommendation data
 * @returns {Promise<Object>} - Saved recommendation data
 */
export const saveRecommendation = async (recommendationData) => {
  try {
    console.log('Saving recommendation data to database');

    // Ensure data is properly formatted as JSON strings
    let combinedSummary = recommendationData.combinedSummary;
    let contentIdeas = recommendationData.contentIdeas;

    // If combinedSummary is an object, stringify it
    if (typeof combinedSummary === 'object') {
      combinedSummary = JSON.stringify(combinedSummary);
    }

    // If contentIdeas is an object, stringify it
    if (typeof contentIdeas === 'object') {
      contentIdeas = JSON.stringify(contentIdeas);
    }

    // Make sure videoIds is an array
    const videoIds = Array.isArray(recommendationData.videoIds)
      ? recommendationData.videoIds
      : (recommendationData.videoIds ? [recommendationData.videoIds] : []);

    // Create the insert data object
    const insertData = {
      combined_summary: combinedSummary,
      content_ideas: contentIdeas,
      video_ids: videoIds
    };

    // We must include a user_id as it's a NOT NULL column
    // The userId we receive is actually the auth_id, so we need to look up the actual user_id
    if (recommendationData.userId) {
      try {
        console.log(`Looking up user with auth_id: ${recommendationData.userId}`);
        const userProfile = await getUserProfile(recommendationData.userId);

        if (userProfile && userProfile.id) {
          // Use the actual user.id, not the auth_id
          insertData.user_id = userProfile.id;
          console.log(`Found user with id: ${userProfile.id} for auth_id: ${recommendationData.userId}`);
        } else {
          console.error(`No user found for auth_id: ${recommendationData.userId}. Cannot save recommendation without a valid user.`);
          throw new Error(`No user found for auth_id: ${recommendationData.userId}`);
        }
      } catch (userError) {
        console.error(`Error looking up user: ${userError.message}`);
        throw new Error(`Error looking up user: ${userError.message}`);
      }
    } else {
      // No userId provided, this is an error
      console.error('No userId provided for recommendation. Cannot save recommendation without a valid user.');
      throw new Error('No userId provided for recommendation');
    }

    const { data, error } = await supabase
      .from('recommendations')
      .insert(insertData)
      .select();

    if (error) {
      throw new Error(`Error saving recommendation: ${error.message}`);
    }

    console.log(`Successfully saved recommendation with ID: ${data[0].id}`);
    return data[0];
  } catch (error) {
    console.error('Error saving recommendation:', error);
    throw new Error('Failed to save recommendation');
  }
};

/**
 * Get TikTok videos by trend query ID
 * @param {string} trendQueryId - Trend query ID
 * @returns {Promise<Array>} - Array of videos
 */
export const getTikTokVideosByTrendQueryId = async (trendQueryId) => {
  try {
    const { data, error } = await supabase
      .from('tiktok_videos')
      .select('*')
      .eq('trend_query_id', trendQueryId);

    if (error) {
      throw new Error(`Error getting TikTok videos: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting TikTok videos:', error);
    throw new Error('Failed to get TikTok videos');
  }
};

/**
 * Get trend queries by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of trend queries
 */
export const getTrendQueriesByUserId = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('trend_queries')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Error getting trend queries: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting trend queries:', error);
    throw new Error('Failed to get trend queries');
  }
};

/**
 * Get recommendations by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of recommendations
 */
export const getRecommendationsByUserId = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('recommendations')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Error getting recommendations: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting recommendations:', error);
    throw new Error('Failed to get recommendations');
  }
};

/**
 * Get user profile by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - User profile
 */
export const getUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Error getting user profile: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw new Error('Failed to get user profile');
  }
};

/**
 * Get recent trend queries and their associated videos
 * @param {number} limit - Maximum number of trend queries to retrieve
 * @returns {Promise<Array>} - Array of trend queries with their videos
 */
export const getRecentTrendQueriesWithVideos = async (limit = 10) => {
  try {
    // Get the most recent trend queries
    const { data: trendQueries, error: trendQueryError } = await supabase
      .from('trend_queries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (trendQueryError) {
      throw new Error(`Error getting trend queries: ${trendQueryError.message}`);
    }

    console.log(`Found ${trendQueries.length} recent trend queries`);

    // Get videos associated with these trend queries
    const trendQueryIds = trendQueries.map(q => q.id);

    const { data: dbVideos, error: dbVideoError } = await supabase
      .from('tiktok_videos')
      .select('*')
      .in('trend_query_id', trendQueryIds);

    if (dbVideoError) {
      throw new Error(`Error getting videos for trend queries: ${dbVideoError.message}`);
    }

    console.log(`Found ${dbVideos.length} videos associated with these trend queries`);

    // Group videos by trend query
    const trendQueriesWithVideos = trendQueries.map(query => {
      const associatedVideos = dbVideos.filter(video => video.trend_query_id === query.id);
      return {
        ...query,
        videos: associatedVideos
      };
    });

    return trendQueriesWithVideos;
  } catch (error) {
    console.error('Error getting trend queries with videos:', error);
    throw new Error('Failed to get trend queries with videos');
  }
};

/**
 * Get videos from storage bucket that match database records
 * @param {Array} dbVideos - Array of video records from the database
 * @returns {Promise<Array>} - Array of video objects with storage URLs
 */
export const getVideosFromStorageBucket = async (dbVideos = []) => {
  try {
    // List all files in the videos folder of the storage bucket
    const { data: files, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list('videos');

    if (error) {
      throw new Error(`Error listing files in storage bucket: ${error.message}`);
    }

    console.log(`Found ${files.length} files in storage bucket`);

    // If no dbVideos provided, get all videos that need analysis
    if (dbVideos.length === 0) {
      const { data: allDbVideos, dbError } = await supabase
        .from('tiktok_videos')
        .select('*')
        .or('summary.is.null,last_analyzed_at.lt.' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (dbError) {
        throw new Error(`Error getting videos from database: ${dbError.message}`);
      }

      dbVideos = allDbVideos;
    }

    console.log(`Processing ${dbVideos.length} videos from database`);

    // Create video objects with storage URLs
    const videoObjects = [];

    for (const file of files) {
      if (file.name.endsWith('.mp4')) {
        // Get the public URL for the file
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(`videos/${file.name}`);

        const storageUrl = publicUrlData.publicUrl;

        // Log the file name for debugging
        console.log(`Checking file: ${file.name}`);

        // Find the corresponding database record if it exists
        // This is more complex because the URLs might not match exactly
        let dbVideo = null;

        for (const v of dbVideos) {
          // Log the database record for debugging
          console.log(`Checking against DB record: ${v.id}`);
          console.log(`  download_url: ${v.download_url || 'none'}`);
          console.log(`  video_url: ${v.video_url || 'none'}`);

          // Try different matching strategies
          if ((v.download_url && v.download_url.includes(file.name)) ||
              (v.video_url && v.video_url.includes(file.name))) {
            dbVideo = v;
            console.log(`  MATCH FOUND by filename!`);
            break;
          }

          // Extract filename from download_url if it exists
          if (v.download_url) {
            const urlParts = v.download_url.split('/');
            const urlFilename = urlParts[urlParts.length - 1];
            if (urlFilename === file.name) {
              dbVideo = v;
              console.log(`  MATCH FOUND by extracted filename!`);
              break;
            }
          }
        }

        if (dbVideo) {
          videoObjects.push({
            id: dbVideo.id,
            fileName: file.name,
            storageUrl: storageUrl,
            dbRecord: dbVideo,
            trend_query_id: dbVideo.trend_query_id
          });
          console.log(`Added video object for file: ${file.name}, DB ID: ${dbVideo.id}`);
        } else {
          console.log(`No matching database record found for file: ${file.name}`);
        }
      }
    }

    console.log(`Created ${videoObjects.length} video objects with storage URLs that match database records`);
    return videoObjects;
  } catch (error) {
    console.error('Error getting videos from storage bucket:', error);
    throw new Error('Failed to get videos from storage bucket');
  }
};

/**
 * Delete videos from storage bucket
 * @param {Array} fileNames - Array of file names to delete
 * @returns {Promise<Object>} - Result of the deletion operation
 */
export const deleteVideosFromStorageBucket = async (fileNames) => {
  try {
    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      console.log('No files to delete');
      return { deletedCount: 0 };
    }

    console.log(`Attempting to delete ${fileNames.length} files from storage bucket`);

    // Add 'videos/' prefix to each filename if not already present
    const filePaths = fileNames.map(fileName =>
      fileName.startsWith('videos/') ? fileName : `videos/${fileName}`
    );

    // Delete files from storage bucket
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(filePaths);

    if (error) {
      throw new Error(`Error deleting files from storage bucket: ${error.message}`);
    }

    console.log(`Successfully deleted ${data?.length || 0} files from storage bucket`);
    return { deletedCount: data?.length || 0, deletedFiles: data };
  } catch (error) {
    console.error('Error deleting files from storage bucket:', error);
    throw new Error('Failed to delete files from storage bucket');
  }
};

export default {
  supabase,
  initializeStorage,
  uploadVideoToSupabase,
  saveTikTokVideo,
  saveTrendQuery,
  updateTikTokVideoAnalysis,
  saveRecommendation,
  getTikTokVideosByTrendQueryId,
  getTrendQueriesByUserId,
  getRecommendationsByUserId,
  getUserProfile,
  getVideosFromStorageBucket,
  getRecentTrendQueriesWithVideos,
  deleteVideosFromStorageBucket
};
