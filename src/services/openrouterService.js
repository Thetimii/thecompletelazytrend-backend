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
        model: 'deepseek/deepseek-chat-v3-0324:free', // Changed model
        messages: [
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: `I need to find trending TikTok videos related to a ${businessDescription} business.

                Generate 5 specific search queries that I can use to find relevant trending TikTok videos.

                The queries should:
                1. Be specific enough to find relevant content.
                2. Target trending topics or hashtags.
                3. Be diverse to cover different aspects of the business.
                4. Be 1-2 words maximum per query.
                5. Use the most up-to-date trends.
                6. Be very specific, not broad.
                7. Not use hashtags in the query itself.

                IMPORTANT: Your response MUST be ONLY a valid JSON array of 5 strings, like this:
                ["query 1", "query 2", "query 3", "query 4", "query 5"]
                Do not include any other text, explanations, or markdown formatting like \`\`\`json or \`\`\` around the array.`
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
    console.log('Raw OpenRouter Response for Queries:', JSON.stringify(content));

    // Parse the JSON array from the content
    try {
      console.log('Attempting to parse raw content from OpenRouter as JSON:', content);

      // Try to extract JSON array using regex - more robust for potential leading/trailing text
      const arrayMatch = content.match(/\\[\\s*\\"[^\\"]*\\"(?:\\s*,\\s*\\"[^\\"]*\\")*\\s*\\]/);
      if (arrayMatch && arrayMatch[0]) {
        console.log('Found JSON array using regex:', arrayMatch[0]);
        try {
            const parsedQueries = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsedQueries) && parsedQueries.length === 5) {
                console.log('Regex parsing yielded 5 queries:', parsedQueries);
                return parsedQueries;
            } else if (Array.isArray(parsedQueries) && parsedQueries.length > 0) {
                console.warn(`Regex parsing yielded ${parsedQueries.length} queries, but 5 were expected. Will attempt other parsing methods.`);
            }
        } catch (e) {
            console.warn('Regex matched content, but JSON.parse failed:', e.message);
        }
      }

      // If regex fails or yields < 5, try parsing the entire content directly
      try {
        const queries = JSON.parse(content);
        if (Array.isArray(queries) && queries.length === 5) {
          console.log('Parsed entire content as JSON successfully (5 queries):', queries);
          return queries;
        } else if (Array.isArray(queries) && queries.length > 0) {
            console.warn(`Direct JSON parsing yielded ${queries.length} queries, but 5 were expected. Will attempt manual extraction.`);
        }
      } catch (directParseError) {
        // Only log if arrayMatch also failed or didn't produce 5, to avoid redundant logs if regex worked partially
        if (!(arrayMatch && arrayMatch[0])) {
            console.warn('Direct parsing of entire content as JSON failed:', directParseError.message);
        }
      }

      // If JSON parsing fails to yield 5, attempt to extract queries manually
      console.log('JSON parsing did not yield 5 queries. Attempting to extract queries manually.');
      
      let queryMatches = content.match(/"([^"]+)"/g);
      if (queryMatches && queryMatches.length > 0) {
        const extractedQueries = queryMatches.map(q => q.replace(/"/g, '').trim()).filter(q => q.length > 0);
        if (extractedQueries.length >= 5) {
          console.log('Extracted 5 queries manually (from quoted strings):', extractedQueries.slice(0, 5));
          return extractedQueries.slice(0, 5);
        } else if (extractedQueries.length > 0) {
            console.warn(`Manual extraction (quoted strings) yielded ${extractedQueries.length} queries, expected 5. Will try line splitting.`);
        }
      }

      const lines = content.split('\\n')
        .map(line => line.replace(/^[-*•\\d.]\\s*/, '').trim()) // Remove list markers
        .filter(line => line.length > 0 && !line.toLowerCase().includes('json') && !line.startsWith('[') && !line.endsWith(']'));

      if (lines.length >= 5) {
        console.log('Extracted 5 queries by splitting lines and cleaning:', lines.slice(0, 5));
        return lines.slice(0, 5);
      } else if (lines.length > 0) {
          console.warn(`Line splitting yielded ${lines.length} queries, expected 5. Falling back to default.`);
      }

      // Last resort: return a default query
      console.warn('All parsing attempts failed to yield 5 queries. Using default query for:', businessDescription);
      return [`trending ${businessDescription} tiktok`];
    } catch (error) {
      console.error('Error parsing JSON response from OpenRouter:', error);
      // Last resort: return a default query
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

    // Create a leaner version of analyzedVideos to reduce memory footprint
    const leanAnalyzedVideos = analyzedVideos.map(video => {
      return {
        searchQuery: video.searchQuery,
        url: video.url || video.id || video.dbId,
        title: video.title,
        description: video.description 
      };
    });

    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: "text",
                text: `I have analyzed ${leanAnalyzedVideos.length} TikTok videos for a ${businessDescription} business. Here is the summarized analysis data: ${JSON.stringify(leanAnalyzedVideos)}.

Based on this data, create a comprehensive TikTok marketing strategy. The output MUST be structured with the following clear section headings followed by content. Do not use JSON, provide plain text output.

Section Headings to Use:
1.  **Observations from Analyzed Videos:** (Summarize what was seen in the provided video data - commonalities, surprising elements, etc.)
2.  **Key Trend Takeaways:** (The core insights and key points derived from the analyzed videos.)
3.  **Sample TikTok Script:** (A detailed, step-by-step script for one TikTok video, from beginning to end, tailored to the ${businessDescription} business. Include visual cues, voiceover/text overlay suggestions, and calls to action.)
4.  **Technical Specifications for Sample Script:** (Include: Video Length, Music suggestion, Fonts/Text Styles, Pacing/Editing Style, Overall Vibe.)
5.  **General Content Themes:** (Broader content themes that work well based on the analysis.)
6.  **Hashtag Strategy:** (Recommended hashtags.)
7.  **Posting Frequency:** (Suggestions on how often to post.)

Ensure each section is clearly delineated by its heading.`
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

    const content = response.data.choices[0].message.content;

    // Initialize strategy object with new fields
    strategy = {
      observations: "",
      keyTakeaways: "",
      sampleScript: "",
      technicalSpecifications: "",
      contentThemes: [], // Keep as array for multiple themes
      hashtagStrategy: "",
      postingFrequency: "",
      rawContent: content // Store the raw content as well
    };

    // Try to extract sections from the text using the new headings
    const observationsMatch = content.match(/Observations from Analyzed Videos:?([\s\S]*?)(?:Key Trend Takeaways:?|$)/i);
    if (observationsMatch && observationsMatch[1]) {
      strategy.observations = observationsMatch[1].trim();
    }

    const keyTakeawaysMatch = content.match(/Key Trend Takeaways:?([\s\S]*?)(?:Sample TikTok Script:?|$)/i);
    if (keyTakeawaysMatch && keyTakeawaysMatch[1]) {
      strategy.keyTakeaways = keyTakeawaysMatch[1].trim();
    }

    const sampleScriptMatch = content.match(/Sample TikTok Script:?([\s\S]*?)(?:Technical Specifications for Sample Script:?|$)/i);
    if (sampleScriptMatch && sampleScriptMatch[1]) {
      strategy.sampleScript = sampleScriptMatch[1].trim();
    }

    const techSpecsMatch = content.match(/Technical Specifications for Sample Script:?([\s\S]*?)(?:General Content Themes:?|$)/i);
    if (techSpecsMatch && techSpecsMatch[1]) {
      strategy.technicalSpecifications = techSpecsMatch[1].trim();
    }

    const contentThemesMatch = content.match(/General Content Themes:?([\s\S]*?)(?:Hashtag Strategy:?|$)/i);
    if (contentThemesMatch && contentThemesMatch[1]) {
      strategy.contentThemes = contentThemesMatch[1]
        .split(/\n/)
        .map(line => line.replace(/^[-*•\d.]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    const hashtagStrategyMatch = content.match(/Hashtag Strategy:?([\s\S]*?)(?:Posting Frequency:?|$)/i);
    if (hashtagStrategyMatch && hashtagStrategyMatch[1]) {
      strategy.hashtagStrategy = hashtagStrategyMatch[1].trim();
    }

    const postingFrequencyMatch = content.match(/Posting Frequency:?([\s\S]*?)$/i);
    if (postingFrequencyMatch && postingFrequencyMatch[1]) {
      strategy.postingFrequency = postingFrequencyMatch[1].trim();
    }

    // Fallback for overall strategy if specific sections aren't parsed well
    if (!strategy.observations && !strategy.keyTakeaways && !strategy.sampleScript) {
        strategy.observations = content; // Put all content in observations if parsing fails
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

    // Create a leaner version of videoAnalyses to reduce memory footprint
    const leanVideoAnalyses = videoAnalyses.map(video => {
      // Transferring search query, URL/ID, title, and description (as "what happened")
      return {
        searchQuery: video.searchQuery,
        url: video.url || video.id || video.dbId,
        title: video.title,
        description: video.description 
      };
    });

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
                text: `I have analyzed ${leanVideoAnalyses.length} TikTok videos for a ${businessDescription} business. Here is the summarized analysis data: ${JSON.stringify(leanVideoAnalyses)}.

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
