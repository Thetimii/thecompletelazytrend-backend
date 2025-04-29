import axios from 'axios';
import dotenv from 'dotenv';
import { saveRecommendation, updateTikTokVideoAnalysis } from './supabaseService.js';

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
    console.log(`Raw response from AI: ${content}`);

    // Don't try to parse as JSON at all, just extract potential queries
    try {
      // Try to extract JSON array using regex first
      const arrayMatch = content.match(/\[\s*"[^"]*"(?:\s*,\s*"[^"]*")*\s*\]/);
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch (e) {
          console.log("Couldn't parse matched array, falling back to manual extraction");
        }
      }

      // Extract anything that looks like a query
      const queryMatches = content.match(/"([^"]*)"/g);
      if (queryMatches && queryMatches.length > 0) {
        return queryMatches.map(q => q.replace(/"/g, ''));
      }

      // If we can't extract queries, split the content by lines and use non-empty lines
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('{') && !line.startsWith('}') && !line.startsWith('[') && !line.startsWith(']'));

      if (lines.length > 0) {
        return lines.slice(0, 5); // Take up to 5 lines
      }

      // Last resort: return a default query
      return [`trending ${businessDescription} tiktok`];
    } catch (parseError) {
      console.error('Error parsing content:', parseError);
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

                Format your response as simple text with clear section headings, not as JSON.`
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

    // Create a structured object from the text content
    strategy = {
      strategySummary: content,
      contentThemes: [],
      videoIdeas: [],
      hashtagStrategy: "",
      postingFrequency: "",
      rawContent: content // Store the raw content as well
    };

    // Try to extract sections from the text
    const strategySummaryMatch = content.match(/Overall strategy summary:?([\s\S]*?)(?:Content themes|$)/i);
    if (strategySummaryMatch && strategySummaryMatch[1]) {
      strategy.strategySummary = strategySummaryMatch[1].trim();
    }

    const contentThemesMatch = content.match(/Content themes:?([\s\S]*?)(?:Specific video ideas|$)/i);
    if (contentThemesMatch && contentThemesMatch[1]) {
      strategy.contentThemes = contentThemesMatch[1]
        .split(/\n/)
        .map(line => line.replace(/^[-*•]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    const videoIdeasMatch = content.match(/Specific video ideas:?([\s\S]*?)(?:Hashtag strategy|$)/i);
    if (videoIdeasMatch && videoIdeasMatch[1]) {
      strategy.videoIdeas = videoIdeasMatch[1]
        .split(/\n/)
        .map(line => line.replace(/^[-*•\d.]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    const hashtagStrategyMatch = content.match(/Hashtag strategy:?([\s\S]*?)(?:Posting frequency|$)/i);
    if (hashtagStrategyMatch && hashtagStrategyMatch[1]) {
      strategy.hashtagStrategy = hashtagStrategyMatch[1].trim();
    }

    const postingFrequencyMatch = content.match(/Posting frequency:?([\s\S]*?)$/i);
    if (postingFrequencyMatch && postingFrequencyMatch[1]) {
      strategy.postingFrequency = postingFrequencyMatch[1].trim();
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
          combinedSummary: JSON.stringify(strategy),
          contentIdeas: JSON.stringify(strategy.videoIdeas || []),
          videoIds: videoIds
        };

        // Save the recommendation
        try {
          const savedRecommendation = await saveRecommendation(recommendationData);
          console.log(`Saved recommendation to database: ${savedRecommendation.id}`);
          strategy.recommendationId = savedRecommendation.id;
        } catch (saveError) {
          console.error(`Error saving recommendation to database: ${saveError.message}`);
          // Continue even if database save fails
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

                Format your response as simple text with clear section headings, not as JSON.`
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

    // Create a structured object from the text content
    const summary = {
      trendSummary: content,
      recreationSteps: [],
      keyElements: [],
      suggestedHashtags: [],
      rawContent: content // Store the raw content as well
    };

    // Try to extract sections from the text
    const trendSummaryMatch = content.match(/Trend Summary:?([\s\S]*?)(?:Step-by-step instructions|Recreation Steps|$)/i);
    if (trendSummaryMatch && trendSummaryMatch[1]) {
      summary.trendSummary = trendSummaryMatch[1].trim();
    }

    const recreationStepsMatch = content.match(/(?:Step-by-step instructions|Recreation Steps):?([\s\S]*?)(?:Key elements|$)/i);
    if (recreationStepsMatch && recreationStepsMatch[1]) {
      summary.recreationSteps = recreationStepsMatch[1]
        .split(/\n/)
        .map(line => line.replace(/^[-*•\d.]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    const keyElementsMatch = content.match(/Key elements:?([\s\S]*?)(?:Suggested hashtags|$)/i);
    if (keyElementsMatch && keyElementsMatch[1]) {
      summary.keyElements = keyElementsMatch[1]
        .split(/\n/)
        .map(line => line.replace(/^[-*•]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    const hashtagsMatch = content.match(/Suggested hashtags:?([\s\S]*?)$/i);
    if (hashtagsMatch && hashtagsMatch[1]) {
      summary.suggestedHashtags = hashtagsMatch[1]
        .split(/[,\n]/)
        .map(tag => tag.trim().replace(/^[^#]/, '#$&').trim())
        .filter(tag => tag.length > 1);
    }

    // Save recommendation to database if userId is provided
    if (userId) {
      try {
        // Extract video IDs from analyzed videos
        const videoIds = videoAnalyses
          .filter(video => video.id || video.dbId)
          .map(video => video.id || video.dbId);

        // Create recommendation data
        const recommendationData = {
          userId: userId,
          combinedSummary: JSON.stringify(summary),
          contentIdeas: JSON.stringify(summary.recreationSteps || []),
          videoIds: videoIds
        };

        // Save the recommendation
        try {
          const savedRecommendation = await saveRecommendation(recommendationData);
          console.log(`Saved trend summary to database: ${savedRecommendation.id}`);
          summary.recommendationId = savedRecommendation.id;

          // Also update each video's summary field
          for (const video of videoAnalyses) {
            const videoId = video.id || video.dbId;
            if (videoId) {
              try {
                // Update the video's summary field with the full text summary
                await updateTikTokVideoAnalysis(videoId, {
                  summary: summary.trendSummary || summary.rawContent,
                  transcript: video.transcript || "",
                  frameAnalysis: video.frameAnalysis || ""
                });
                console.log(`Updated TikTok video with analysis: ${videoId}`);
              } catch (videoError) {
                console.error(`Error updating video analysis: ${videoError.message}`);
              }
            }
          }
        } catch (saveError) {
          console.error(`Error saving trend summary to database: ${saveError.message}`);
          // Continue even if database save fails
        }
      } catch (dbError) {
        console.error(`Error saving trend summary to database: ${dbError.message}`);
        // Continue even if database save fails
      }
    }

    return summary;
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
