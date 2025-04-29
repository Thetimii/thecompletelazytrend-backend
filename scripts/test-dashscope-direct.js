import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

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
          { 
            image: "https://dashscope-intl-dha.oss-ap-southeast-1.aliyuncs.com/test/general/animals.jpeg"
          },
          { 
            text: "What's in this image?" 
          }
        ]
      }
    ]
  },
  parameters: {
    result_format: "message"
  }
};

async function testApi() {
  try {
    console.log('Making API call to DashScope with a test image...');
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
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
    
    // Save the response to a file
    fs.writeFileSync('dashscope_test_response.json', JSON.stringify(response.data, null, 2));
    console.log('Response saved to dashscope_test_response.json');
    
    // Now try with our video
    console.log('\nNow trying with our video...');
    
    const videoRequestBody = {
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
              { 
                video: videoUrl
              },
              { 
                text: "Please analyze this video and describe what's happening in it in detail." 
              }
            ]
          }
        ]
      },
      parameters: {
        result_format: "message"
      }
    };
    
    console.log('Video request body:', JSON.stringify(videoRequestBody, null, 2));
    
    const videoResponse = await axios.post(
      'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      videoRequestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dashscopeApiKey}`
        },
        timeout: 180000 // 3 minutes timeout
      }
    );
    
    console.log('Video response received:');
    console.log(JSON.stringify(videoResponse.data, null, 2));
    
    // Save the video response to a file
    fs.writeFileSync('dashscope_video_response.json', JSON.stringify(videoResponse.data, null, 2));
    console.log('Video response saved to dashscope_video_response.json');
  } catch (error) {
    console.error('Error calling API:', error.message);
    
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Response status:', error.response.status);
      
      // Save the error response to a file
      fs.writeFileSync('dashscope_error.json', JSON.stringify(error.response.data, null, 2));
      console.log('Error response saved to dashscope_error.json');
    }
  }
}

testApi();
