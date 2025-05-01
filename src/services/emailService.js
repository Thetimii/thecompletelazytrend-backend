import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create a transporter using environment variables
const createTransporter = () => {
  // Check if we have Brevo (Sendinblue) credentials
  if (process.env.BREVO_API_KEY) {
    console.log('Using Brevo for email sending');
    return nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      auth: {
        user: process.env.BREVO_USER || process.env.EMAIL_FROM,
        pass: process.env.BREVO_API_KEY
      }
    });
  }
  
  // Check if we have generic SMTP credentials
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log('Using generic SMTP for email sending');
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  
  // Fallback to a mock transporter for development
  console.log('Using mock email transporter (emails will not be sent)');
  return {
    sendMail: (mailOptions) => {
      console.log('MOCK EMAIL SENT:', mailOptions);
      return Promise.resolve({ messageId: 'mock-message-id' });
    }
  };
};

/**
 * Send an email
 * @param {Object} emailData - Email data
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.from - Sender email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - Email HTML content
 * @param {string} [emailData.text] - Email plain text content
 * @returns {Promise<Object>} - Email sending result
 */
export const sendEmail = async (emailData) => {
  try {
    const { to, from, subject, html, text } = emailData;
    
    if (!to || !subject || (!html && !text)) {
      throw new Error('Missing required email fields');
    }
    
    const transporter = createTransporter();
    
    const mailOptions = {
      from: from || process.env.EMAIL_FROM || 'noreply@lazy-trends.com',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML tags for plain text version
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export default {
  sendEmail
};
