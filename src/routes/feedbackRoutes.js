import express from 'express';
import { sendEmail } from '../services/emailService.js';

const router = express.Router();

/**
 * @route POST /api/feedback
 * @desc Send feedback email
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { subject, message, userEmail, userName } = req.body;

    if (!subject || !message || !userEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the recipient email from environment variables
    const recipientEmail = process.env.FEEDBACK_EMAIL || process.env.EMAIL_FROM || 'support@lazy-trends.com';

    // Prepare email data
    const emailData = {
      to: recipientEmail,
      from: process.env.EMAIL_FROM || 'noreply@lazy-trends.com',
      subject: `LazyTrend Feedback: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">New Feedback from LazyTrend User</h2>
          <p><strong>From:</strong> ${userName || 'User'} (${userEmail})</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <div style="margin-top: 20px; padding: 15px; background-color: #f9fafb; border-left: 4px solid #4f46e5; border-radius: 4px;">
            <p style="white-space: pre-line;">${message}</p>
          </div>
        </div>
      `,
    };

    // Send the email
    await sendEmail(emailData);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending feedback:', error);
    return res.status(500).json({ error: 'Failed to send feedback' });
  }
});

export default router;
