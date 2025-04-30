import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { supabase } from '../services/supabaseService.js';

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * @route POST /api/create-payment-intent
 * @desc Create a payment intent for Stripe
 * @access Public
 */
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { priceId, userId, email } = req.body;

    if (!priceId) {
      return res.status(400).json({ message: 'Price ID is required' });
    }

    // Get the price from Stripe
    const price = await stripe.prices.retrieve(priceId);

    if (!price) {
      return res.status(404).json({ message: 'Price not found' });
    }

    // Create a customer if one doesn't exist
    let customerId;
    
    if (email) {
      // Check if customer already exists
      const customers = await stripe.customers.list({
        email,
        limit: 1
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        // Create a new customer
        const customer = await stripe.customers.create({
          email,
          metadata: {
            userId
          }
        });
        customerId = customer.id;
      }
    }

    // Create a payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price.unit_amount,
      currency: price.currency,
      customer: customerId,
      metadata: {
        userId,
        priceId,
        productId: price.product
      },
      receipt_email: email,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: price.unit_amount,
      currency: price.currency
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      message: error.message || 'Failed to create payment intent'
    });
  }
});

/**
 * @route POST /api/webhook
 * @desc Handle Stripe webhook events
 * @access Public
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      const userId = paymentIntent.metadata.userId;

      if (userId) {
        try {
          // Update user profile to mark payment as completed and onboarding as completed
          const { error } = await supabase
            .from('users')
            .update({
              payment_completed: true,
              payment_date: new Date().toISOString(),
              payment_id: paymentIntent.id,
              onboarding_completed: true
            })
            .eq('auth_id', userId);

          if (error) {
            console.error('Error updating user profile:', error);
          } else {
            console.log(`User ${userId} payment completed and onboarding marked as complete`);
          }
        } catch (dbError) {
          console.error('Database error:', dbError);
        }
      }
      break;
    
    case 'payment_intent.payment_failed':
      const failedPaymentIntent = event.data.object;
      console.log(`Payment failed for user ${failedPaymentIntent.metadata.userId}`);
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

export default router;
