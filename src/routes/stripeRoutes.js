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
      // Check if success URL already has query parameters
      const hasQueryParams = successUrl.includes('?');
      const successUrlWithSessionId = `${successUrl}${hasQueryParams ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;

      // Create the checkout session with minimal parameters and a 7-day free trial
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        subscription_data: {
          trial_period_days: 7, // Add a 7-day free trial
        },
        success_url: successUrlWithSessionId,
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
    console.log(`Processing webhook event: ${event.type}`, JSON.stringify(event.data.object, null, 2));

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);
        console.log('Session details:', JSON.stringify({
          client_reference_id: session.client_reference_id,
          customer: session.customer,
          metadata: session.metadata,
          subscription: session.subscription
        }, null, 2));

        // Get the user ID from the session metadata or client_reference_id
        const userId = session.metadata?.userId || session.client_reference_id;
        console.log('Extracted userId:', userId);

        if (userId) {
          try {
            // Get subscription details to check trial status
            console.log('Retrieving subscription details for:', session.subscription);
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            const isInTrial = subscription.status === 'trialing';
            console.log('Subscription status:', subscription.status, 'Is in trial:', isInTrial);

            // First try to find user by auth_id
            console.log('Trying to find user by auth_id:', userId);
            let { data: existingUser, error: userError } = await supabase
              .from('users')
              .select('*')
              .eq('auth_id', userId)
              .single();

            // If not found by auth_id, try by id
            if (userError) {
              console.log('User not found by auth_id, trying by id');
              const { data: userById, error: idError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

              if (idError) {
                console.error('Error finding user by id:', idError);
                console.log('Will try one more approach - listing all users');

                // Last resort - list all users and log them
                const { data: allUsers } = await supabase
                  .from('users')
                  .select('id, auth_id, email')
                  .limit(10);

                console.log('Available users:', JSON.stringify(allUsers, null, 2));
                console.log('Will try to update anyway');
              } else {
                existingUser = userById;
                console.log('Found user by id:', existingUser.email);
              }
            } else {
              console.log('Found user by auth_id:', existingUser.email);
            }

            // Determine which field to use for the update
            const updateField = existingUser ? (existingUser.auth_id ? 'auth_id' : 'id') : 'auth_id';
            console.log(`Will update user using ${updateField} field with value:`, userId);

            // Update user profile to mark payment as completed and onboarding as completed
            console.log('Updating user profile with payment information');
            const updateData = {
              payment_completed: true,
              payment_date: new Date().toISOString(),
              payment_id: session.id,
              subscription_id: session.subscription,
              subscription_status: isInTrial ? 'trialing' : 'active',
              trial_end_date: isInTrial ? new Date(subscription.trial_end * 1000).toISOString() : null,
              onboarding_completed: true
            };
            console.log('Update data:', JSON.stringify(updateData, null, 2));

            // Try to update by auth_id first
            let { data, error } = await supabase
              .from('users')
              .update(updateData)
              .eq('auth_id', userId)
              .select();

            // If that fails, try by id
            if (error || (data && data.length === 0)) {
              console.log('Update by auth_id failed, trying by id');
              const { data: dataById, error: errorById } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', userId)
                .select();

              if (errorById) {
                console.error('Error updating by id:', errorById);
                error = errorById;
              } else {
                data = dataById;
                console.log('Update by id succeeded');
              }
            }

            if (error) {
              console.error('Error updating user profile:', error);
            } else {
              console.log('User profile updated successfully:', data);
              console.log(`User ${userId} payment completed and onboarding marked as complete. Trial status: ${isInTrial ? 'In trial' : 'Active'}`);
            }
          } catch (subscriptionError) {
            console.error('Error processing subscription:', subscriptionError);
          }
        } else {
          console.error('No userId found in session metadata or client_reference_id');
        }
        break;

      case 'customer.subscription.updated':
        const subscription = event.data.object;
        const customerId = subscription.customer;
        console.log('Subscription updated:', subscription.id);
        console.log('Subscription details:', JSON.stringify({
          customer: customerId,
          status: subscription.status,
          trial_end: subscription.trial_end
        }, null, 2));

        try {
          // Get the customer to find the user ID
          console.log('Retrieving customer:', customerId);
          const customer = await stripe.customers.retrieve(customerId);
          console.log('Customer metadata:', customer.metadata);
          const userIdFromCustomer = customer.metadata?.userId;
          console.log('Extracted userId from customer:', userIdFromCustomer);

          if (userIdFromCustomer) {
            // Check if trial status changed
            const isTrialEnd = subscription.status === 'active' &&
                              subscription.trial_end &&
                              subscription.trial_end < Math.floor(Date.now() / 1000);
            console.log('Is trial ending:', isTrialEnd);

            // First try to find user by auth_id
            console.log('Trying to find user by auth_id:', userIdFromCustomer);
            let { data: existingUser, error: userError } = await supabase
              .from('users')
              .select('*')
              .eq('auth_id', userIdFromCustomer)
              .single();

            // If not found by auth_id, try by id
            if (userError) {
              console.log('User not found by auth_id, trying by id');
              const { data: userById, error: idError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userIdFromCustomer)
                .single();

              if (idError) {
                console.error('Error finding user by id:', idError);
                console.log('Will try to update anyway');
              } else {
                existingUser = userById;
                console.log('Found user by id:', existingUser.email);
              }
            } else {
              console.log('Found user by auth_id:', existingUser.email);
            }

            // Determine which field to use for the update
            const updateField = existingUser ? (existingUser.auth_id ? 'auth_id' : 'id') : 'auth_id';
            console.log(`Will update user using ${updateField} field with value:`, userIdFromCustomer);

            // Update subscription status
            console.log('Updating user subscription status');
            const updateData = {
              subscription_status: subscription.status,
              trial_end_date: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
              // If trial ended and subscription is now active, update the payment date
              payment_date: isTrialEnd ? new Date().toISOString() : undefined
            };
            console.log('Update data:', JSON.stringify(updateData, null, 2));

            // Try to update by auth_id first
            let { data, error } = await supabase
              .from('users')
              .update(updateData)
              .eq('auth_id', userIdFromCustomer)
              .select();

            // If that fails, try by id
            if (error || (data && data.length === 0)) {
              console.log('Update by auth_id failed, trying by id');
              const { data: dataById, error: errorById } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', userIdFromCustomer)
                .select();

              if (errorById) {
                console.error('Error updating by id:', errorById);
                error = errorById;
              } else {
                data = dataById;
                console.log('Update by id succeeded');
              }
            }

            if (error) {
              console.error('Error updating subscription status:', error);
            } else {
              console.log('User subscription updated successfully:', data);
              console.log(`User ${userIdFromCustomer} subscription status updated to ${subscription.status}`);
            }
          } else {
            console.error('No userId found in customer metadata');
          }
        } catch (customerError) {
          console.error('Error processing customer:', customerError);
        }
        break;

      case 'customer.subscription.deleted':
        const cancelledSubscription = event.data.object;
        const cancelledCustomerId = cancelledSubscription.customer;
        console.log('Subscription deleted:', cancelledSubscription.id);
        console.log('Subscription details:', JSON.stringify({
          customer: cancelledCustomerId,
          status: cancelledSubscription.status
        }, null, 2));

        try {
          // Get the customer to find the user ID
          console.log('Retrieving customer:', cancelledCustomerId);
          const cancelledCustomer = await stripe.customers.retrieve(cancelledCustomerId);
          console.log('Customer metadata:', cancelledCustomer.metadata);
          const cancelledUserId = cancelledCustomer.metadata?.userId;
          console.log('Extracted userId from customer:', cancelledUserId);

          if (cancelledUserId) {
            // First try to find user by auth_id
            console.log('Trying to find user by auth_id:', cancelledUserId);
            let { data: existingUser, error: userError } = await supabase
              .from('users')
              .select('*')
              .eq('auth_id', cancelledUserId)
              .single();

            // If not found by auth_id, try by id
            if (userError) {
              console.log('User not found by auth_id, trying by id');
              const { data: userById, error: idError } = await supabase
                .from('users')
                .select('*')
                .eq('id', cancelledUserId)
                .single();

              if (idError) {
                console.error('Error finding user by id:', idError);
                console.log('Will try to update anyway');
              } else {
                existingUser = userById;
                console.log('Found user by id:', existingUser.email);
              }
            } else {
              console.log('Found user by auth_id:', existingUser.email);
            }

            // Determine which field to use for the update
            const updateField = existingUser ? (existingUser.auth_id ? 'auth_id' : 'id') : 'auth_id';
            console.log(`Will update user using ${updateField} field with value:`, cancelledUserId);

            // Update subscription status
            console.log('Updating user subscription status to cancelled');
            const updateData = {
              subscription_status: 'cancelled'
            };
            console.log('Update data:', JSON.stringify(updateData, null, 2));

            // Try to update by auth_id first
            let { data, error } = await supabase
              .from('users')
              .update(updateData)
              .eq('auth_id', cancelledUserId)
              .select();

            // If that fails, try by id
            if (error || (data && data.length === 0)) {
              console.log('Update by auth_id failed, trying by id');
              const { data: dataById, error: errorById } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', cancelledUserId)
                .select();

              if (errorById) {
                console.error('Error updating by id:', errorById);
                error = errorById;
              } else {
                data = dataById;
                console.log('Update by id succeeded');
              }
            }

            if (error) {
              console.error('Error updating subscription status to cancelled:', error);
            } else {
              console.log('User subscription cancelled successfully:', data);
              console.log(`User ${cancelledUserId} subscription cancelled`);
            }
          } else {
            console.error('No userId found in customer metadata');
          }
        } catch (customerError) {
          console.error('Error processing customer:', customerError);
        }
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.error(`Error processing webhook event: ${error.message}`);
    console.error('Error stack:', error.stack);
    // Log the event that caused the error
    try {
      console.error('Event that caused error:', JSON.stringify(event, null, 2));
    } catch (jsonError) {
      console.error('Could not stringify event:', jsonError);
    }
  }

  // Always return a 200 response to acknowledge receipt of the event
  // This is important for Stripe to know we received the webhook
  console.log('Webhook processing completed, returning 200 response');
  res.json({ received: true });
});

export default router;
