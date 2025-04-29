import axios from 'axios';
import dotenv from 'dotenv';
import { saveRecommendation } from './supabaseService.js';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Generate search queries for TikTok videos
 * @param {string} businessDescription - Description of the business
 * @returns {Promise<Array>} - Array of search queries
 */
export const generateSearchQueries = async (businessDescription) => {
  try {
    console.log(`Generating search queries for: ${businessDescription}`);
    
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'google/gemma-3-1b-it:free',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: `I need to find trending TikTok videos related to a ${businessDescription} business. 
                
                Generate 5 specific search queries that I can use to find relevant trending TikTok videos. 
                
                The queries should:
                1. Be specific enough to find relevant content
                2. Target trending topics or hashtags
                3. Be diverse to cover different aspects of the business
                4. Be formatted as a simple array of strings
                
                Format your response as a JSON array of strings like this:
                ["query 1", "query 2", "query 3", "query 4", "query 5"]`
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://thecompletelazytrend.com',
          'X-Title': 'The Complete Lazy Trend'
        }
      }
    );

    // Extract the generated queries from the response
    const content = response.data.choices[0].message.content;
    
    // Parse the JSON array from the content
    try {
      const queries = JSON.parse(content);
      return queries;
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      
      // If parsing fails, try to extract queries using regex
      const matches = content.match(/\["([^"]+)"(?:,\s*"([^"]+)")*\]/);
      if (matches) {
        try {
          return JSON.parse(matches[0]);
        } catch (e) {
          console.error('Error parsing extracted JSON:', e);
        }
      }
      
      // If all else fails, return a default query
      return [`trending ${businessDescription} tiktok`];
    }
  } catch (error) {
    console.error('Error generating search queries:', error);
    throw new Error('Failed to generate search queries');
  }
};

/**
 * Reconstruct videos into a marketing strategy
 * @param {Object[]} analyzedVideos - Array of analyzed videos
 * @param {string} businessDescription - Description of the business
 * @param {string} userId - User ID to associate recommendation with
 * @returns {Promise<Object>} - Marketing strategy
 */
export const reconstructVideos = async (analyzedVideos, businessDescription, userId = null) => {
  try {
    let strategy;

    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'google/gemma-3-1b-it:free',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: `I have analyzed ${analyzedVideos.length} TikTok videos for a ${businessDescription} business. Here is the analysis data: ${JSON.stringify(analyzedVideos)}.

                Based on this data, create a comprehensive TikTok marketing strategy for this business. Include:
                1. Overall strategy summary
                2. Content themes that work well
                3. Specific video ideas (at least 5)
                4. Hashtag strategy
                5. Posting frequency recommendations

                Format your response as a JSON object with these sections:
                {
                  "strategySummary": "...",
                  "contentThemes": ["Theme 1", "Theme 2", ...],
                  "videoIdeas": ["Idea 1", "Idea 2", ...],
                  "hashtagStrategy": "...",
                  "postingFrequency": "..."
                }`
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://thecompletelazytrend.com',
          'X-Title': 'The Complete Lazy Trend'
        }
      }
    );

    // Extract the generated strategy from the response
    const content = response.data.choices[0].message.content;

    // Parse the JSON object from the content
    try {
      // Try to find a JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        strategy = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON object found in response');
      }
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      // If parsing fails, return the raw content
      strategy = { 
        rawStrategy: content,
        strategySummary: "Could not parse JSON response",
        contentThemes: [],
        videoIdeas: [],
        hashtagStrategy: "",
        postingFrequency: ""
      };
    }

    // Save recommendation to database if userId is provided
    if (userId) {
      try {
        // Extract video IDs from analyzed videos
        const videoIds = analyzedVideos
          .filter(video => video.dbId)
          .map(video => video.dbId);

        // Create recommendation data
        const recommendationData = {
          userId: userId,
          combinedSummary: typeof strategy === 'object' ? JSON.stringify(strategy) : strategy,
          contentIdeas: typeof strategy === 'object' && strategy.videoIdeas ?
            JSON.stringify(strategy.videoIdeas) : '[]',
          videoIds: videoIds
        };

        // Only save if userId exists in the users table
        if (userId) {
          try {
            const savedRecommendation = await saveRecommendation(recommendationData);
            console.log(`Saved recommendation to database: ${savedRecommendation.id}`);
            strategy.recommendationId = savedRecommendation.id;
          } catch (saveError) {
            console.error(`Error saving recommendation to database: ${saveError.message}`);
            // Continue even if database save fails
          }
        }
      } catch (dbError) {
        console.error(`Error saving recommendation to database: ${dbError.message}`);
        // Continue even if database save fails
      }
    }

    return strategy;
  } catch (error) {
    console.error('Error reconstructing videos:', error);
    throw new Error('Failed to reconstruct marketing strategy');
  }
};

/**
 * Summarize trends from analyzed videos and provide recreation instructions
 * @param {Object[]} videoAnalyses - Array of video analyses
 * @param {string} businessDescription - Description of the business
 * @param {string} userId - User ID to associate recommendation with
 * @returns {Promise<Object>} - Trend summary and recreation instructions
 */
export const summarizeTrends = async (videoAnalyses, businessDescription, userId = null) => {
  try {
    console.log(`Summarizing trends for ${videoAnalyses.length} videos...`);
    
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'google/gemma-3-1b-it:free',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: `I have analyzed ${videoAnalyses.length} TikTok videos for a ${businessDescription} business. Here is the analysis data: ${JSON.stringify(videoAnalyses)}.

                Based on this data, provide:
                1. A clear summary of what's trending in these videos (common themes, styles, hooks)
                2. Step-by-step instructions on how to recreate this trend for the ${businessDescription} business
                3. Key elements that make these videos successful
                4. Suggested hashtags to use

                Format your response as a JSON object with these sections:
                {
                  "trendSummary": "...",
                  "recreationSteps": ["Step 1...", "Step 2...", ...],
                  "keyElements": ["Element 1...", "Element 2...", ...],
                  "suggestedHashtags": ["#tag1", "#tag2", ...]
                }`
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://thecompletelazytrend.com',
          'X-Title': 'The Complete Lazy Trend'
        }
      }
    );

    // Extract the generated summary from the response
    const content = response.data.choices[0].message.content;

    // Parse the JSON object from the content
    try {
      // Try to find a JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const summary = JSON.parse(jsonMatch[0]);
        
        // Save recommendation to database if userId is provided
        if (userId) {
          try {
            // Extract video IDs from analyzed videos
            const videoIds = videoAnalyses
              .filter(video => video.id)
              .map(video => video.id);

            // Create recommendation data
            const recommendationData = {
              userId: userId,
              combinedSummary: JSON.stringify(summary),
              contentIdeas: JSON.stringify(summary.recreationSteps || []),
              videoIds: videoIds
            };

            const savedRecommendation = await saveRecommendation(recommendationData);
            console.log(`Saved trend summary to database: ${savedRecommendation.id}`);
            summary.recommendationId = savedRecommendation.id;
          } catch (dbError) {
            console.error(`Error saving trend summary to database: ${dbError.message}`);
            // Continue even if database save fails
          }
        }

        return summary;
      } else {
        throw new Error('No JSON object found in response');
      }
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      // If parsing fails, return the raw content
      return { 
        rawSummary: content,
        trendSummary: "Could not parse JSON response",
        recreationSteps: [],
        keyElements: [],
        suggestedHashtags: []
      };
    }
  } catch (error) {
    console.error('Error summarizing trends:', error);
    throw new Error('Failed to summarize trends');
  }
};

export default {
  generateSearchQueries,
  reconstructVideos,
  summarizeTrends
};
