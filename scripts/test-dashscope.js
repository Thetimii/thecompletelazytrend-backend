import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const videoUrl = 'https://cxtystgaxoeygwbvgqcg.supabase.co/storage/v1/object/public/tiktok-videos/tiktok-videos/c0a6813d-1deb-4864-8e36-6dfed4040cf1-1745770083031.mp4';
const dashscopeApiKey = process.env.DASHSCOPE_API_KEY;

console.log('Using API Key:', dashscopeApiKey);

// Prepare the request to DashScope API
const requestBody = {
  model: 'qwen-vl-max',
  input: {
    messages: [
      {
        role: "system",
        content: [{ text: "You are a helpful assistant that analyzes video content." }]
      },
      {
        role: "user",
        content: [
          { video: videoUrl },
          { text: "Please analyze this video and describe what's happening in it in detail. Focus on the food items shown, cooking techniques, and presentation." }
        ]
      }
    ]
  }
};

async function testApi() {
  try {
    console.log('Making API call to DashScope...');

    const response = await axios.post(
      'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dashscopeApiKey}`
        },
        timeout: 180000 // 3 minutes timeout
      }
    );

    console.log('Response received:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error calling API:', error.message);

    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Response status:', error.response.status);
    }
  }
}

testApi();
