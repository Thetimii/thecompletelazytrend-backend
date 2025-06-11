import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TIKTOK_TRENDING_API_URL = 'https://tiktok-most-trending-and-viral-content.p.rapidapi.com/video';
const RAPIDAPI_HOST = 'tiktok-most-trending-and-viral-content.p.rapidapi.com';

async function testNewAPI() {
  try {
    console.log('Testing new TikTok API...');
    console.log('API URL:', TIKTOK_TRENDING_API_URL);
    console.log('API Key:', RAPIDAPI_KEY ? 'Present' : 'Missing');
    
    // Test different search terms to see what works
    const testTerms = [
      'motocross',
      'motocross gear', 
      'bike',
      'motorcycle',
      'mx'
    ];
    
    for (const searchTerm of testTerms) {
      console.log(`\n=== Testing: "${searchTerm}" ===`);
      
      const searchParams = {
        take: '1',  // Only 1 video
        sorting: 'rise',
        search: searchTerm,
        days: '7',
        order: 'desc'
      };
      
      console.log('Search parameters:', searchParams);
      
      const response = await axios.get(TIKTOK_TRENDING_API_URL, {
        params: searchParams,
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST
        }
      });
      
      console.log('Response status:', response.status);
      
      if (response.data && response.data.data && response.data.data.stats) {
        console.log('Number of videos found:', response.data.data.stats.length);
        if (response.data.data.stats.length > 0) {
          console.log('Video title:', response.data.data.stats[0].videoTitle);
        }
      } else {
        console.log('No stats array found');
      }
    }
    
  } catch (error) {
    console.error('Error testing API:', error.message);
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error data:', error.response.data);
    }
  }
}

testNewAPI();
