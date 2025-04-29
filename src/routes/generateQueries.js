import express from 'express';
import { generateSearchQueries } from '../services/openrouterService.js';
import { getUserProfile, saveTrendQuery } from '../services/supabaseService.js';

const router = express.Router();

/**
 * @route POST /api/generate-queries
 * @desc Generate search queries for TikTok based on business description
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    let { businessDescription, userId } = req.body;

    // If userId is provided but no businessDescription, try to get it from the user profile
    if (userId && !businessDescription) {
      try {
        console.log(`Attempting to get business description for user: ${userId}`);
        const userProfile = await getUserProfile(userId);

        if (userProfile && userProfile.business_description) {
          businessDescription = userProfile.business_description;
          console.log(`Found business description from user profile: ${businessDescription}`);
        }
      } catch (profileError) {
        console.error('Error fetching user profile:', profileError);
        // Continue with the request even if profile fetch fails
      }
    }

    if (!businessDescription) {
      return res.status(400).json({ message: 'Business description is required' });
    }

    const searchQueries = await generateSearchQueries(businessDescription);

    // Save the generated queries to the database if userId is provided
    const savedQueries = [];
    if (userId) {
      try {
        console.log(`Saving ${searchQueries.length} queries for user ${userId}`);

        // Save each query to the database
        for (const query of searchQueries) {
          try {
            const savedQuery = await saveTrendQuery({
              userId,
              query
            });

            if (savedQuery) {
              console.log(`Saved query: ${query} with ID: ${savedQuery.id}`);
              savedQueries.push(savedQuery);
            }
          } catch (saveError) {
            console.error(`Error saving query "${query}":`, saveError);
            // Continue with the next query even if this one fails
          }
        }

        console.log(`Successfully saved ${savedQueries.length} out of ${searchQueries.length} queries`);
      } catch (error) {
        console.error('Error saving queries to database:', error);
        // Continue even if saving to database fails
      }
    }

    res.json({
      success: true,
      data: {
        businessDescription,
        userId,
        searchQueries,
        savedQueries: savedQueries.length
      }
    });
  } catch (error) {
    console.error('Error in generate queries route:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate search queries'
    });
  }
});

export default router;
