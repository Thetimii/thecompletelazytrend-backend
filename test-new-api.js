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
    
    const searchParams = {
      take: '2',
      sorting: 'rise',
      search: 'motocross',
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
    console.log('Response headers:', response.headers);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.data && response.data.data.stats) {
      console.log('Number of videos found:', response.data.data.stats.length);
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
