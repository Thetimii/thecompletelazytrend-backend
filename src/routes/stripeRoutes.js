import express from 'express';
import dotenv from 'dotenv';
import supabaseService from '../services/supabaseService.js';

dotenv.config();

const router = express.Router();
const supabase = supabaseService.supabase;

// Try to import Stripe with error handling
let Stripe;
let stripe;
try {
  // Dynamic import for Stripe
  Stripe = (await import('stripe')).default;
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('Stripe imported successfully');
} catch (error) {
  console.error('Error importing Stripe:', error);
  // Create a mock Stripe object for development/testing
  stripe = {
    checkout: {
      sessions: {
        create: () => ({ url: 'https://example.com/mock-checkout' })
      }
    },
    customers: {
      list: () => ({ data: [] }),
      create: (data) => ({ id: 'mock_customer_id', ...data }),
      retrieve: () => ({ metadata: {} })
    },
    webhooks: {
      constructEvent: () => ({ type: 'mock_event', data: { object: {} } })
    }
  };
  console.log('Using mock Stripe object');
}

/**
 * @route POST /api/create-checkout-session
 * @desc Create a Stripe Checkout session
 * @access Public
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    console.log('Create checkout session request received:', req.body);

    const { priceId, userId, email, successUrl, cancelUrl } = req.body;

    console.log('Request parameters:', { priceId, userId, email, successUrl, cancelUrl });
    console.log('Stripe object:', typeof stripe, stripe ? 'available' : 'not available');

    if (!priceId) {
      console.log('Price ID is missing');
      return res.status(400).json({ message: 'Price ID is required' });
    }

    if (!successUrl || !cancelUrl) {
      console.log('Success or cancel URL is missing');
      return res.status(400).json({ message: 'Success and cancel URLs are required' });
    }

    // Simplified approach - create a checkout session directly
    try {
      // Create the checkout session with minimal parameters
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        customer_email: email,
        client_reference_id: userId,
        metadata: {
          userId
        }
      });

      console.log('Checkout session created successfully:', session.id);

      // Return just the URL for redirection
      return res.status(200).json({ url: session.url });
    } catch (sessionError) {
      console.error('Error creating checkout session:', sessionError);

      // If we're using the mock Stripe object, return a mock URL
      if (typeof stripe.checkout.sessions.create === 'function' &&
          stripe.checkout.sessions.create.toString().includes('mock')) {
        console.log('Using mock checkout URL');
        return res.status(200).json({ url: 'https://example.com/mock-checkout' });
      }

      return res.status(500).json({
        message: 'Failed to create checkout session',
        error: sessionError.message
      });
    }
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      message: error.message || 'Failed to create checkout session'
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
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;

        // Get the user ID from the session metadata or client_reference_id
        const userId = session.metadata?.userId || session.client_reference_id;

        if (userId) {
          // Update user profile to mark payment as completed and onboarding as completed
          const { error } = await supabase
            .from('users')
            .update({
              payment_completed: true,
              payment_date: new Date().toISOString(),
              payment_id: session.id,
              subscription_id: session.subscription,
              subscription_status: 'active',
              onboarding_completed: true
            })
            .eq('auth_id', userId);

          if (error) {
            console.error('Error updating user profile:', error);
          } else {
            console.log(`User ${userId} payment completed and onboarding marked as complete`);
          }
        }
        break;

      case 'customer.subscription.updated':
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Get the customer to find the user ID
        const customer = await stripe.customers.retrieve(customerId);
        const userIdFromCustomer = customer.metadata?.userId;

        if (userIdFromCustomer) {
          // Update subscription status
          const { error } = await supabase
            .from('users')
            .update({
              subscription_status: subscription.status
            })
            .eq('auth_id', userIdFromCustomer);

          if (error) {
            console.error('Error updating subscription status:', error);
          } else {
            console.log(`User ${userIdFromCustomer} subscription status updated to ${subscription.status}`);
          }
        }
        break;

      case 'customer.subscription.deleted':
        const cancelledSubscription = event.data.object;
        const cancelledCustomerId = cancelledSubscription.customer;

        // Get the customer to find the user ID
        const cancelledCustomer = await stripe.customers.retrieve(cancelledCustomerId);
        const cancelledUserId = cancelledCustomer.metadata?.userId;

        if (cancelledUserId) {
          // Update subscription status
          const { error } = await supabase
            .from('users')
            .update({
              subscription_status: 'cancelled'
            })
            .eq('auth_id', cancelledUserId);

          if (error) {
            console.error('Error updating subscription status to cancelled:', error);
          } else {
            console.log(`User ${cancelledUserId} subscription cancelled`);
          }
        }
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.error(`Error processing webhook event: ${error.message}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

export default router;
