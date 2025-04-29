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
            video: videoUrl
          },
          {
            text: "Please analyze this video and describe what's happening in it in detail. Focus on the food items shown, cooking techniques, and presentation."
          }
        ]
      }
    ]
  },
  parameters: {
    result_format: "message",
    stream: true,
    incremental_output: true
  }
};

async function testStreamingApi() {
  try {
    console.log('Making streaming API call to DashScope...');

    const response = await axios.post(
      'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dashscopeApiKey}`,
          'Accept': 'text/event-stream'
        },
        responseType: 'stream',
        timeout: 180000 // 3 minutes timeout
      }
    );

    console.log('Stream started, receiving chunks:');

    let fullResponse = '';

    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      console.log('Raw chunk received:', chunkStr);

      // Process each line in the chunk
      const lines = chunkStr.split('\n');
      for (const line of lines) {
        if (line.trim() === '') continue;

        console.log('Processing line:', line);

        if (line.startsWith('data:')) {
          try {
            const jsonStr = line.slice(5);
            console.log('Extracted JSON string:', jsonStr);

            const data = JSON.parse(jsonStr);
            console.log('Parsed data:', JSON.stringify(data, null, 2));

            if (data.output && data.output.choices && data.output.choices[0].message.content) {
              const content = data.output.choices[0].message.content;
              console.log('Content:', JSON.stringify(content, null, 2));

              if (content.length > 0 && content[0].text) {
                const text = content[0].text;
                console.log('Text content:', text);
                process.stdout.write(text);
                fullResponse += text;
              }
            }
          } catch (e) {
            console.log('Error parsing JSON:', e.message);
            console.log('Raw line:', line);

            // Try to extract any text content directly
            const match = line.match(/"text"\s*:\s*"([^"]+)"/);
            if (match && match[1]) {
              console.log('Extracted text using regex:', match[1]);
              process.stdout.write(match[1]);
              fullResponse += match[1];
            }
          }
        } else {
          console.log('Line does not start with "data:"');
        }
      }
    });

    response.data.on('end', () => {
      console.log('\n\nStream ended.');
      console.log('Full response length:', fullResponse.length);

      if (fullResponse.length > 0) {
        console.log('Response preview:', fullResponse.substring(0, 100) + '...');

        // Save the full response to a file
        fs.writeFileSync('dashscope_response.txt', fullResponse);
        console.log('Full response saved to dashscope_response.txt');
      } else {
        console.log('No response content was received.');

        // Save a debug log
        const debugLog = 'No response content was received from the DashScope API.';
        fs.writeFileSync('dashscope_debug.log', debugLog);
        console.log('Debug log saved to dashscope_debug.log');
      }
    });

    response.data.on('error', (err) => {
      console.error('Stream error:', err);
    });
  } catch (error) {
    console.error('Error calling API:', error.message);

    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testStreamingApi();
