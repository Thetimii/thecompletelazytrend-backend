// This file contains the updated saveRecommendation function
// to be added to the supabaseService.js file

export const saveRecommendation = async (recommendationData) => {
  try {
    // First check if the user exists
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', recommendationData.userId)
      .single();

    if (userError || !userData) {
      console.log(`User with ID ${recommendationData.userId} not found, creating a temporary user record`);
      
      // Create a temporary user if not found
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: recommendationData.userId,
          email: `temp_${recommendationData.userId}@example.com`,
          created_at: new Date().toISOString()
        })
        .select();
        
      if (createError) {
        throw new Error(`Error creating temporary user: ${createError.message}`);
      }
    }

    // Now insert the recommendation
    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        user_id: recommendationData.userId,
        combined_summary: recommendationData.combinedSummary,
        content_ideas: recommendationData.contentIdeas,
        video_ids: recommendationData.videoIds
      })
      .select();

    if (error) {
      throw new Error(`Error saving recommendation: ${error.message}`);
    }

    return data[0];
  } catch (error) {
    console.error('Error saving recommendation:', error);
    throw new Error('Failed to save recommendation');
  }
};
