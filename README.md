# The Complete Lazy Trend - Backend

Backend server for The Complete Lazy Trend application, which analyzes TikTok videos to create marketing strategies.

## Features

- Generate search queries for TikTok using OpenRouter API
- Scrape TikTok videos using RapidAPI
- Upload videos directly to Supabase Storage (no local storage)
- Analyze videos using Qwen's multimodal capabilities
- Reconstruct and summarize marketing strategies using OpenRouter API

## Tech Stack

- Node.js
- Express.js
- Axios for API requests
- Supabase for cloud storage
- OpenRouter API for AI text generation
- Qwen API for video analysis
- RapidAPI for TikTok scraping

## Project Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── generateQueries.js     # OpenRouter API Call (Generate Search Queries)
│   │   ├── scrapeTiktoks.js       # RapidAPI Call (Scrape TikToks)
│   │   ├── analyzeVideos.js       # Qwen API Call (Analyze Videos)
│   │   └── reconstructVideos.js   # OpenRouter API Call (Summarize/Reconstruct)
│   ├── services/
│   │   ├── openrouterService.js   # OpenRouter Logic
│   │   ├── rapidApiService.js     # TikTok Scraper Logic
│   │   ├── qwenService.js         # Qwen Logic
│   │   └── supabaseService.js     # Supabase Upload Logic
│   ├── utils/
│   │   └── errorHandler.js        # Error handling utilities
│   └── app.js                     # Express Server Main Entry
├── .env                           # API Keys, Supabase credentials
├── package.json                   # Project dependencies
└── README.md
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your API keys:
   ```
   cp .env.example .env
   ```
4. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

| Endpoint                  | Method | Description                                       |
| ------------------------- | ------ | ------------------------------------------------- |
| `/api/generate-queries`   | POST   | Generate search queries from business description |
| `/api/scrape-tiktoks`     | POST   | Scrape TikTok videos from search queries          |
| `/api/analyze-videos`     | POST   | Analyze uploaded videos using Qwen                |
| `/api/reconstruct-videos` | POST   | Summarize and reconstruct video strategies        |

## Deployment

This backend is designed to be deployed on Render.com:

- Type: Web Service
- Build Command: `npm install`
- Start Command: `npm start`

## Security Notes

- No videos are ever saved locally - all content is streamed directly to Supabase Storage
- API keys are stored in environment variables
- Service uses Supabase's service role key for authenticated uploads

# thecompletelazytrend-backend
