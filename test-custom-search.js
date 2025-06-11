// Test script for the new Custom Search functionality with the updated RapidAPI
import { scrapeTikTokVideos } from './src/services/rapidApiService.js';

const testCustomSearch = async () => {
  console.log('🧪 Testing Custom Search with new RapidAPI integration...\n');
  
  const testParams = {
    searchQueries: ['fitness tips', 'business growth'],
    videosPerQuery: 3,
    userId: null, // No user for test
    customParams: {
      sorting: 'rise', // Test rise sorting
      days: 7, // Last week
      videosLocation: 'US' // Filter for US content
    }
  };

  try {
    console.log('🔍 Test Parameters:');
    console.log(`- Search Queries: ${testParams.searchQueries.join(', ')}`);
    console.log(`- Videos per Query: ${testParams.videosPerQuery}`);
    console.log(`- Sorting: ${testParams.customParams.sorting}`);
    console.log(`- Time Period: ${testParams.customParams.days} days`);
    console.log(`- Location Filter: ${testParams.customParams.videosLocation}\n`);
    
    const startTime = Date.now();
    
    const results = await scrapeTikTokVideos(
      testParams.searchQueries,
      testParams.videosPerQuery,
      testParams.userId,
      testParams.customParams
    );

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('✅ Custom Search Test Results:');
    console.log(`- Total Videos Found: ${results.length}`);
    console.log(`- Execution Time: ${duration.toFixed(2)} seconds\n`);

    if (results.length > 0) {
      console.log('📹 Sample Video Data:');
      const sampleVideo = results[0];
      console.log(`- Title: ${sampleVideo.title || sampleVideo.caption || 'N/A'}`);
      console.log(`- Author: ${sampleVideo.author || 'N/A'}`);
      console.log(`- Views: ${sampleVideo.views?.toLocaleString() || 'N/A'}`);
      console.log(`- Likes: ${sampleVideo.likes?.toLocaleString() || 'N/A'}`);
      console.log(`- Search Query: ${sampleVideo.searchQuery || 'N/A'}`);
      console.log(`- Duration: ${sampleVideo.duration || 'N/A'} seconds`);
      console.log(`- Upload Date: ${sampleVideo.uploadedAt || 'N/A'}\n`);
    }

    // Test different parameter combinations
    console.log('🔄 Testing Rate Sorting...');
    const rateResults = await scrapeTikTokVideos(
      ['social media tips'],
      2,
      null,
      {
        sorting: 'rate', // Test rate sorting
        days: 1, // Last day
        videosLocation: '' // Worldwide
      }
    );
    
    console.log(`✅ Rate Sorting Test: Found ${rateResults.length} videos\n`);

    console.log('🌍 Testing Different Countries...');
    const countryResults = await scrapeTikTokVideos(
      ['cooking'],
      2,
      null,
      {
        sorting: 'rise',
        days: 30, // Last month
        videosLocation: 'GB' // UK content
      }
    );
    
    console.log(`✅ Country Filter Test (GB): Found ${countryResults.length} videos\n`);

    console.log('🎉 All Custom Search Tests Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Custom Search Test Failed:', error.message);
    console.error('Error Details:', error);
  }
};

// Run the test
testCustomSearch();
