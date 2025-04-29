import express from 'express';

const router = express.Router();

/**
 * @route GET /api/test
 * @desc Test route to check if the API is working
 * @access Public
 */
router.get('/', (req, res) => {
  console.log('GET /api/test called');
  console.log('Headers:', req.headers);

  res.json({
    success: true,
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/test
 * @desc Test route to check if POST requests are working
 * @access Public
 */
router.post('/', (req, res) => {
  try {
    // Log the request for debugging
    console.log('POST /api/test received:');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);

    const { data } = req.body || {};

    // Set CORS headers again just to be sure
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    res.json({
      success: true,
      message: 'POST request received',
      receivedData: data || 'No data provided',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in POST /api/test:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing request',
      error: error.message
    });
  }
});

export default router;
