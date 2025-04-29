import axios from 'axios';
import dotenv from 'dotenv';
import { updateTikTokVideoAnalysis } from './supabaseService.js';

dotenv.config();

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

/**
 * Analyze TikTok videos using Qwen's multimodal capabilities
 * @param {Object[]} videos - Array of video data with Supabase URLs
 * @param {string} businessDescription - Description of the business
 * @returns {Promise<Object[]>} - Array of analyzed video data
 */
export const analyzeVideos = async (videos, businessDescription) => {
  try {
    const analyzedVideos = [];

    for (const video of videos) {
      console.log(`Analyzing video: ${video.id}`);

      try {
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
                    video: video.supabaseUrl,
                    fps: 1, // Lower fps to reduce data size
                    start_time: 0,
                    end_time: 60 // Limit to first 60 seconds
                  },
                  {
                    text: `Analyze this TikTok video for a ${businessDescription} business. Extract the key marketing elements, content style, hooks used, and why it might be successful. The video has ${video.likes || 0} likes, ${video.comments || 0} comments, and ${video.views || 0} views. The description is: "${video.description || ''}"`
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

        // Add analysis to video data
        const analyzedVideo = {
          ...video,
          analysis: analysis
        };

        // Update video with analysis in database if video has dbId
        if (video.dbId) {
          try {
            const analysisData = {
              summary: analysis,
              transcript: '', // We don't have transcript extraction yet
              frameAnalysis: {} // We don't have frame analysis yet
            };

            const updatedVideo = await updateTikTokVideoAnalysis(video.dbId, analysisData);
            console.log(`Updated TikTok video with analysis: ${updatedVideo.id}`);
            analyzedVideo.lastAnalyzedAt = updatedVideo.last_analyzed_at;
          } catch (dbError) {
            console.error(`Error updating TikTok video with analysis: ${dbError.message}`);
            // Continue even if database update fails
          }
        }

        analyzedVideos.push(analyzedVideo);

        console.log(`Successfully analyzed video: ${video.id}`);
      } catch (analysisError) {
        console.error(`Error analyzing video ${video.id}:`, analysisError);
        // Add video with error note
        analyzedVideos.push({
          ...video,
          analysis: 'Error analyzing video',
          analysisError: analysisError.message
        });
      }
    }

    return analyzedVideos;
  } catch (error) {
    console.error('Error analyzing videos:', error);
    throw new Error('Failed to analyze videos');
  }
};

/**
 * Analyze a single TikTok video using Qwen's multimodal capabilities with streaming
 * @param {Object} video - Video data with Supabase URL
 * @param {string} businessDescription - Description of the business
 * @param {Function} onChunk - Callback function for each chunk of the response
 * @returns {Promise<Object>} - Analyzed video data
 */
export const analyzeVideoStreaming = async (video, businessDescription, onChunk) => {
  try {
    console.log(`Analyzing video with streaming: ${video.id}`);

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
                video: video.supabaseUrl,
                fps: 1, // Lower fps to reduce data size
                start_time: 0,
                end_time: 60 // Limit to first 60 seconds
              },
              {
                text: `Analyze this TikTok video for a ${businessDescription} business. Extract the key marketing elements, content style, hooks used, and why it might be successful. The video has ${video.likes || 0} likes, ${video.comments || 0} comments, and ${video.views || 0} views. The description is: "${video.description || ''}"`
              }
            ]
          }
        ]
      },
      parameters: {
        result_format: "message",
        stream: true,
        incremental_output: true
      }
    };

    console.log(`Making streaming API call to DashScope for video: ${video.id}`);

    // Set base URL for international API
    axios.defaults.baseURL = 'https://dashscope-intl.aliyuncs.com/api/v1';

    const response = await axios.post(
      '/services/aigc/multimodal-generation/generation',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'X-DashScope-DataInspection': 'enable', // Enable data inspection for debugging
          'Accept': 'text/event-stream'
        },
        responseType: 'stream',
        timeout: 300000 // 5 minutes timeout for longer processing
      }
    );

    console.log(`Stream started for video: ${video.id}`);

    let fullAnalysis = '';

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        const chunkStr = chunk.toString();

        // Process each line in the chunk
        const lines = chunkStr.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5));

              if (data.output && data.output.choices && data.output.choices[0].message.content) {
                const content = data.output.choices[0].message.content;
                if (content.length > 0 && content[0].text) {
                  const text = content[0].text;

                  // Call the onChunk callback with the text
                  if (onChunk && typeof onChunk === 'function') {
                    onChunk(text);
                  }

                  fullAnalysis += text;
                }
              }
            } catch (e) {
              // Skip invalid JSON
              if (line.slice(5).trim() !== '') {
                console.log('Error parsing chunk:', e.message);
              }
            }
          }
        }
      });

      response.data.on('end', async () => {
        console.log(`Stream ended for video: ${video.id}`);

        // Create analyzed video object
        const analyzedVideo = {
          ...video,
          analysis: fullAnalysis
        };

        // Update video with analysis in database if video has dbId
        if (video.dbId) {
          try {
            const analysisData = {
              summary: fullAnalysis,
              transcript: '', // We don't have transcript extraction yet
              frameAnalysis: {} // We don't have frame analysis yet
            };

            const updatedVideo = await updateTikTokVideoAnalysis(video.dbId, analysisData);
            console.log(`Updated TikTok video with analysis: ${updatedVideo.id}`);
            analyzedVideo.lastAnalyzedAt = updatedVideo.last_analyzed_at;
          } catch (dbError) {
            console.error(`Error updating TikTok video with analysis: ${dbError.message}`);
            // Continue even if database update fails
          }
        }

        resolve(analyzedVideo);
      });

      response.data.on('error', (err) => {
        console.error(`Stream error for video ${video.id}:`, err);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error analyzing video ${video.id}:`, error);
    throw error;
  }
};

export default {
  analyzeVideos,
  analyzeVideoStreaming
};
