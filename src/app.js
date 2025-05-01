import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

// Import routes
import generateQueriesRouter from './routes/generateQueries.js';
import scrapeTiktoksRouter from './routes/scrapeTiktoks.js';
import analyzeVideosRouter from './routes/analyzeVideos.js';
import analyzeVideoStreamingRouter from './routes/analyzeVideoStreaming.js';
import reconstructVideosRouter from './routes/reconstructVideos.js';
import completeWorkflowRouter from './routes/completeWorkflow.js';
import summarizeTrendsRouter from './routes/summarizeTrends.js';
import deleteVideosRouter from './routes/deleteVideos.js';
import testRouter from './routes/test.js';
import stripeRoutes from './routes/stripeRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// CORS middleware configuration
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5173',
  'https://thecompletelazytrend.onrender.com',
  'https://www.lazy-trends.com',
  'https://lazy-trends.com',
  process.env.FRONTEND_URL // Allow frontend URL from environment variable
].filter(Boolean); // Remove any undefined/null values

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Log the origin for debugging
    console.log('Request origin:', origin);

    // In production, we want to be more strict about allowed origins
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      // For now, allow all origins to help with debugging
      callback(null, true);
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Add additional CORS headers for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Log the origin for debugging
  console.log('Additional CORS middleware - Request origin:', origin);

  // Set CORS headers for all origins for now
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});
// Special handling for Stripe webhook route to get the raw body
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhook') {
    next();
  } else {
    express.json({ limit: '50mb' })(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files from public directory

// Routes
app.use('/api/test', testRouter);
app.use('/api/generate-queries', generateQueriesRouter);
app.use('/api/scrape-tiktoks', scrapeTiktoksRouter);
app.use('/api/analyze-videos', analyzeVideosRouter);
app.use('/api/analyze-video-streaming', analyzeVideoStreamingRouter);
app.use('/api/reconstruct-videos', reconstructVideosRouter);
app.use('/api/complete-workflow', completeWorkflowRouter);
app.use('/api/summarize-trends', summarizeTrendsRouter);
app.use('/api/delete-videos', deleteVideosRouter);
app.use('/api', stripeRoutes);
app.use('/api/feedback', feedbackRoutes);

// Basic health check route
app.get('/', (_req, res) => {
  res.json({ message: 'The Complete Lazy Trend API is running' });
});

// Simple test endpoint
app.get('/api/hello', (_req, res) => {
  console.log('GET /api/hello called');
  res.json({
    message: 'Hello from the backend!',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Start server
const PORT = process.env.PORT || 5001; // Use port 5001 to avoid conflicts
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
