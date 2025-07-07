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

                Generate 5 simple search queries that I can use to find relevant trending TikTok videos.

                The queries should:
                1. Be simple and broad enough to find trending content.
                2. Be just 1 word if possible, maximum 2 words.
                3. Use general terms that are likely to have trending videos.
                4. Not be too specific or niche.
                5. Not use hashtags in the query itself.

                IMPORTANT: Your response MUST be ONLY a valid JSON array with 5 strings, like this:
                ["query1", "query2", "query3", "query4", "query5"]
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

    // The videoAnalyses are now expected to be rich objects with structured data.
    // We can pass them directly to the AI for a more detailed summary.
    const leanVideoAnalyses = videoAnalyses.map(v => ({
      summary: v.summary,
      hooks: v.hooks,
      ctas: v.ctas,
      content_style: v.content_style,
      success_factors: v.success_factors,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
    }));

    const prompt = `
I have analyzed ${leanVideoAnalyses.length} TikTok videos for a business that is a "${businessDescription}".
Here is the detailed analysis data for each video:
${JSON.stringify(leanVideoAnalyses, null, 2)}

Based on this data, provide a comprehensive trend analysis. Your response MUST be a valid JSON object with the following structure:
{
  "trend_observations": "A one-paragraph summary of the overarching trends, commonalities, and content styles observed across all the videos.",
  "actionable_insights": [
    "A list of specific, actionable insights for the business. For example: 'Use a hook that asks a question in the first 2 seconds.', 'Create tutorials that solve a common customer problem.'"
  ],
  "content_ideas": [
    {
      "idea_title": "Example Video Idea 1",
      "description": "A brief description of a new video concept based on the trends.",
      "hook_suggestion": "Start with this surprising fact...",
      "cta_suggestion": "Ask your audience to share their experiences in the comments."
    },
    {
      "idea_title": "Example Video Idea 2",
      "description": "Another new video concept.",
      "hook_suggestion": "Show a dramatic before-and-after.",
      "cta_suggestion": "Direct users to the link in your bio for a free guide."
    }
  ],
  "hashtag_strategy": [
    "#relevanthashtag1", "#trendinghashtag2", "#nichehashtag3"
  ]
}
`;

    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'openai/gpt-4o', // Using a more powerful model for structured JSON generation
        messages: [
          {
            role: "system",
            content: "You are a TikTok marketing expert. Your job is to analyze video data and provide actionable marketing strategies in a structured JSON format."
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: "json_object" } // Enforce JSON output
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
    console.log("Raw response from OpenRouter:", content);

    try {
      const trendSummary = JSON.parse(content);
      console.log("Successfully parsed trend summary JSON.");

      if (userId) {
        try {
          const videoIds = videoAnalyses.map(v => v.id).filter(id => id);
          const recommendationData = {
            userId: userId,
            combinedSummary: JSON.stringify(trendSummary), // Storing the full JSON object
            contentIdeas: JSON.stringify(trendSummary.content_ideas || []),
            videoIds: videoIds
          };

          const savedRecommendation = await saveRecommendation(recommendationData);
          console.log(`Saved trend summary to database: ${savedRecommendation.id}`);
          trendSummary.recommendationId = savedRecommendation.id;
        } catch (dbError) {
          console.error(`Error saving trend summary to database: ${dbError.message}`);
        }
      }

      return trendSummary;

    } catch (parseError) {
      console.error('Error parsing JSON response from OpenRouter:', parseError);
      throw new Error('Failed to parse trend summary from AI response.');
    }

  } catch (error) {
    console.error('Error summarizing trends:', error);
    if (error.response) {
      console.error('OpenRouter Error Body:', error.response.data);
    }
    throw new Error('Failed to summarize trends');
  }
};

export default {
  generateSearchQueries,
  reconstructVideos,
  summarizeTrends
};
