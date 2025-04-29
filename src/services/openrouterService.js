import axios from 'axios';
import dotenv from 'dotenv';
import { saveRecommendation } from './supabaseService.js';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Generate search queries for TikTok based on business description
 * @param {string} businessDescription - Description of the business
 * @returns {Promise<string[]>} - Array of search queries
 */
export const generateSearchQueries = async (businessDescription) => {
  try {
    console.log(`Generating search queries for business: ${businessDescription}`);

    // Make the API call to OpenRouter using the Gemma model
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: "google/gemma-3-27b-it:free", // Using the requested Gemma model
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Generate 1 specific trending TikTok search queries for a ${businessDescription} business. These should be queries that would return viral or trending content dont be broad be very specific and use the most up to date trends. 1 or max two words. Return ONLY the search queries as a JSON array of strings, nothing else.`
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

    console.log('OpenRouter response:', response.data);

    // Extract the generated queries from the response
    const content = response.data.choices[0].message.content;
    console.log('Raw content from model:', content);

    // Parse the JSON array from the content
    try {
      // First, try direct JSON parsing
      return JSON.parse(content);
    } catch (error) {
      console.log('Error parsing JSON, trying alternative methods');

      // If parsing fails, try to extract array using regex
      // This pattern looks for anything that looks like a JSON array
      const match = content.match(/\[\s*(['"].*?['"](\s*,\s*['"].*?['"])*)\s*\]/s);
      if (match) {
        console.log('Found array using regex:', match[0]);
        try {
          return JSON.parse(match[0]);
        } catch (regexError) {
          console.log('Error parsing regex match:', regexError);
        }
      }

      // Try another approach - look for quoted strings that might be queries
      const stringMatches = content.match(/["']([^"']+)["']/g);
      if (stringMatches && stringMatches.length > 0) {
        console.log('Found quoted strings:', stringMatches);
        // Clean up the strings and return them
        const cleanedStrings = stringMatches
          .map(str => str.replace(/^["']|["']$/g, '').trim())
          .filter(str => str.length > 0);

        console.log('Cleaned strings:', cleanedStrings);
        return cleanedStrings.slice(0, 5); // Ensure we return at most 5 queries
      }

      // If all else fails, split by newlines and clean up
      console.log('Falling back to line-by-line parsing');
      const lines = content.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^["'\d\.\s-]*|["'\s]*$/g, '').trim())
        .filter(line => !line.startsWith('```') && !line.endsWith('```') && line.length > 0);

      console.log('Parsed lines:', lines);
      return lines.slice(0, 5); // Ensure we return at most 5 queries
    }
  } catch (error) {
    console.error('Error generating search queries:', error);

    // If there's a response error, log it for debugging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }

    // No fallback data - throw the error to be handled by the caller
    throw new Error('Failed to generate search queries. Please check your API key and try again.');
  }
};

/**
 * Reconstruct and summarize TikTok marketing strategies
 * @param {Object[]} analyzedVideos - Array of analyzed video data
 * @param {string} businessDescription - Description of the business
 * @param {string} userId - User ID to associate recommendation with
 * @returns {Promise<Object>} - Reconstructed marketing strategy
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

                Return the response as a structured JSON object with these sections.`
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
      strategy = JSON.parse(content);
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      // If parsing fails, return the raw content
      strategy = { rawStrategy: content };
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
            JSON.stringify(strategy.videoIdeas) : '',
          videoIds: videoIds
        };

        const savedRecommendation = await saveRecommendation(recommendationData);
        console.log(`Saved recommendation to database: ${savedRecommendation.id}`);
        strategy.recommendationId = savedRecommendation.id;
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
      const summary = JSON.parse(content);

      // Save recommendation to database if userId is provided
      if (userId) {
        try {
          // Extract video IDs from analyzed videos
          const videoIds = videoAnalyses
            .filter(video => video.id)
            .map(video => video.id);

          // Format the summary for the database
          // Make sure all required fields are present
          const formattedSummary = {
            trendSummary: summary.trendSummary || summary.rawSummary || "No trend summary available",
            recreationSteps: summary.recreationSteps || [],
            keyElements: summary.keyElements || [],
            suggestedHashtags: summary.suggestedHashtags || []
          };

          // Create recommendation data
          const recommendationData = {
            userId: userId,
            combinedSummary: JSON.stringify(formattedSummary),
            contentIdeas: JSON.stringify(formattedSummary.recreationSteps),
            videoIds: videoIds
          };

          console.log('Saving recommendation to database:', recommendationData);

          const savedRecommendation = await saveRecommendation(recommendationData);
          console.log(`Saved trend summary to database: ${savedRecommendation.id}`);
          summary.recommendationId = savedRecommendation.id;
        } catch (dbError) {
          console.error(`Error saving trend summary to database: ${dbError.message}`);
          // Continue even if database save fails
        }
      }

      return summary;
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      // If parsing fails, return the raw content
      return { rawSummary: content };
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
