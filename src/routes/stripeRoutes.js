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
    console.log('Stripe secret key last 4 chars:', process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.slice(-4) : 'not set');
    console.log('Price ID from request:', priceId);
    console.log('Price ID from env:', process.env.STRIPE_PRICE_ID);

    // Always use the new price ID regardless of what's in the request or environment
    const finalPriceId = 'price_1RKJ9LG4vQYDStWYwbdkHlvJ';

    if (!finalPriceId) {
      console.log('Price ID is missing from both request and environment');
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

      console.log('Creating checkout session with price ID:', finalPriceId);

      // Create the checkout session with minimal parameters and a 7-day free trial
      const sessionParams = {
        payment_method_types: ['card'],
        line_items: [
          {
            price: finalPriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        subscription_data: {
          trial_period_days: 7, // Add a 7-day free trial
        },
        success_url: successUrlWithSessionId,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        metadata: {
          userId
        }
      };

      // Only add customer_email if it's provided
      if (email) {
        sessionParams.customer_email = email;
      }

      console.log('Session parameters:', JSON.stringify(sessionParams, null, 2));

      // Create the checkout session
      const session = await stripe.checkout.sessions.create(sessionParams);

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

      // For development/testing, provide a fallback URL if Stripe is not properly configured
      if (process.env.NODE_ENV === 'development') {
        console.log('Development environment detected, returning mock URL');
        return res.status(200).json({ url: 'https://example.com/mock-checkout' });
      }

      return res.status(500).json({
        message: 'Failed to create checkout session',
        error: sessionError.message,
        details: sessionError.stack
      });
    }
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      message: error.message || 'Failed to create checkout session',
      details: error.stack
    });
  }
});

/**
 * @route GET /api/webhook-test
 * @desc Test endpoint to verify webhook URL
 * @access Public
 */
router.get('/webhook-test', (req, res) => {
  console.log('Webhook test endpoint called');
  res.json({
    success: true,
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

/**
 * @route GET /api/stripe-test
 * @desc Test endpoint to verify Stripe configuration
 * @access Public
 */
router.get('/stripe-test', (req, res) => {
  console.log('Stripe test endpoint called');

  // Check if Stripe is properly initialized
  if (!stripe) {
    return res.status(500).json({
      success: false,
      message: 'Stripe is not properly initialized',
      stripeAvailable: false
    });
  }

  // Check if we have a valid Stripe secret key
  const stripeKeyLastFour = process.env.STRIPE_SECRET_KEY
    ? `...${process.env.STRIPE_SECRET_KEY.slice(-4)}`
    : 'not set';

  // Check if we have a valid price ID
  const priceId = process.env.STRIPE_PRICE_ID || 'not set';

  res.json({
    success: true,
    message: 'Stripe configuration test',
    timestamp: new Date().toISOString(),
    stripeAvailable: true,
    stripeKeyLastFour,
    priceId,
    stripeObject: typeof stripe,
    mockStripe: typeof stripe.checkout.sessions.create === 'function' &&
                stripe.checkout.sessions.create.toString().includes('mock'),
    environment: process.env.NODE_ENV
  });
});

/**
 * @route POST /api/create-portal-session
 * @desc Create a Stripe Customer Portal session
 * @access Public
 */
router.post('/create-portal-session', async (req, res) => {
  try {
    console.log('Create portal session request received:', req.body);

    const { returnUrl, userId } = req.body;

    if (!returnUrl) {
      return res.status(400).json({ message: 'Return URL is required' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'User ID is required' });
    }

    // First try to find user by auth_id
    console.log('Trying to find user by auth_id:', userId);
    let { data: user, error: userError } = await supabase
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
        console.error('Error finding user:', idError);
        return res.status(404).json({ message: 'User not found' });
      }

      user = userById;
      console.log('Found user by id:', user.email);
    } else {
      console.log('Found user by auth_id:', user.email);
    }

    // Get the customer ID from the checkout session
    let customerId = user.stripe_customer_id;

    // If no customer ID is stored, try to get it from the subscription
    if (!customerId && user.subscription_id) {
      try {
        console.log('No customer ID found, retrieving from subscription:', user.subscription_id);
        const subscription = await stripe.subscriptions.retrieve(user.subscription_id);
        customerId = subscription.customer;

        // Update the user record with the customer ID
        if (customerId) {
          console.log('Updating user with customer ID:', customerId);
          await supabase
            .from('users')
            .update({ stripe_customer_id: customerId })
            .eq('id', user.id);
        }
      } catch (subError) {
        console.error('Error retrieving subscription:', subError);
      }
    }

    // If still no customer ID, try to get it from the payment method
    if (!customerId && user.payment_id) {
      try {
        console.log('No customer ID found, retrieving from payment:', user.payment_id);
        const session = await stripe.checkout.sessions.retrieve(user.payment_id);
        customerId = session.customer;

        // Update the user record with the customer ID
        if (customerId) {
          console.log('Updating user with customer ID:', customerId);
          await supabase
            .from('users')
            .update({ stripe_customer_id: customerId })
            .eq('id', user.id);
        }
      } catch (payError) {
        console.error('Error retrieving payment session:', payError);
      }
    }

    if (!customerId) {
      return res.status(400).json({
        message: 'No customer ID found for this user. Please contact support.'
      });
    }

    console.log('Creating portal session for customer:', customerId);

    // Create a customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log('Portal session created:', session.id);

    // Return the URL for redirection
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({
      message: error.message || 'Failed to create portal session'
    });
  }
});

/**
 * @route POST /api/webhook
 * @desc Handle Stripe webhook events
 * @access Public
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('Webhook endpoint called with method:', req.method);
  console.log('Webhook headers:', req.headers);
  console.log('Webhook body type:', typeof req.body);
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
              stripe_customer_id: session.customer, // Store the customer ID for future lookups
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
          // Check if trial status changed
          const isTrialEnd = subscription.status === 'active' &&
                            subscription.trial_end &&
                            subscription.trial_end < Math.floor(Date.now() / 1000);
          console.log('Is trial ending:', isTrialEnd);

          // Check if subscription is being canceled
          const isCanceled = subscription.cancel_at_period_end === true;
          console.log('Is subscription being canceled:', isCanceled);

          // First try to find user by subscription_id
          console.log('Trying to find user by subscription_id:', subscription.id);
          let { data: existingUser, error: subError } = await supabase
            .from('users')
            .select('*')
            .eq('subscription_id', subscription.id)
            .single();

          // If not found by subscription_id, try by customer_id
          if (subError) {
            console.log('User not found by subscription_id, trying by customer_id:', customerId);

            // Check if we have a stripe_customer_id column
            const { data: userByCustomer, error: customerError } = await supabase
              .from('users')
              .select('*')
              .eq('stripe_customer_id', customerId)
              .single();

            if (customerError) {
              console.log('User not found by customer_id, trying to find by email');

              // Try to get customer details to find email
              try {
                const customer = await stripe.customers.retrieve(customerId);
                console.log('Customer email:', customer.email);

                if (customer.email) {
                  const { data: userByEmail, error: emailError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', customer.email)
                    .single();

                  if (emailError) {
                    console.error('Error finding user by email:', emailError);
                  } else {
                    existingUser = userByEmail;
                    console.log('Found user by email:', existingUser.email);

                    // Update the user with the stripe_customer_id for future lookups
                    const { error: updateCustomerIdError } = await supabase
                      .from('users')
                      .update({
                        stripe_customer_id: customerId,
                        subscription_id: subscription.id
                      })
                      .eq('id', existingUser.id);

                    if (updateCustomerIdError) {
                      console.error('Error updating user with customer ID:', updateCustomerIdError);
                    } else {
                      console.log('Updated user with customer ID and subscription ID');
                    }
                  }
                }
              } catch (stripeError) {
                console.error('Error retrieving customer from Stripe:', stripeError);
              }
            } else {
              existingUser = userByCustomer;
              console.log('Found user by customer_id:', existingUser.email);

              // Update subscription_id if it's missing
              if (!existingUser.subscription_id) {
                const { error: updateSubIdError } = await supabase
                  .from('users')
                  .update({ subscription_id: subscription.id })
                  .eq('id', existingUser.id);

                if (updateSubIdError) {
                  console.error('Error updating subscription ID:', updateSubIdError);
                } else {
                  console.log('Updated user with subscription ID');
                }
              }
            }
          } else {
            console.log('Found user by subscription_id:', existingUser.email);

            // Update customer_id if it's missing
            if (!existingUser.stripe_customer_id) {
              const { error: updateCustomerIdError } = await supabase
                .from('users')
                .update({ stripe_customer_id: customerId })
                .eq('id', existingUser.id);

              if (updateCustomerIdError) {
                console.error('Error updating customer ID:', updateCustomerIdError);
              } else {
                console.log('Updated user with customer ID');
              }
            }
          }

          if (existingUser) {
            // Update subscription status
            console.log('Updating user subscription status for user:', existingUser.id);
            const updateData = {
              subscription_status: subscription.status,
              trial_end_date: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
              // If trial ended and subscription is now active, update the payment date
              payment_date: isTrialEnd ? new Date().toISOString() : undefined
            };

            // If subscription is being canceled, update the cancel_at field
            if (isCanceled) {
              updateData.subscription_status = 'cancelled';
              updateData.cancel_at = subscription.cancel_at
                ? new Date(subscription.cancel_at * 1000).toISOString()
                : (subscription.trial_end
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : null);
            }

            console.log('Update data:', JSON.stringify(updateData, null, 2));

            const { data, error } = await supabase
              .from('users')
              .update(updateData)
              .eq('id', existingUser.id)
              .select();

            if (error) {
              console.error('Error updating subscription status:', error);
            } else {
              console.log('User subscription updated successfully:', data);
              console.log(`User ${existingUser.id} subscription status updated to ${updateData.subscription_status}`);
            }
          } else {
            console.error('Could not find user associated with this subscription');

            // List all users to help with debugging
            const { data: allUsers } = await supabase
              .from('users')
              .select('id, auth_id, email, subscription_id, stripe_customer_id')
              .limit(10);

            console.log('Available users:', JSON.stringify(allUsers, null, 2));
          }
        } catch (error) {
          console.error('Error processing subscription update:', error);
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
          // First try to find user by subscription_id
          console.log('Trying to find user by subscription_id:', cancelledSubscription.id);
          let { data: userBySubscription, error: subscriptionError } = await supabase
            .from('users')
            .select('*')
            .eq('subscription_id', cancelledSubscription.id)
            .single();

          if (subscriptionError) {
            console.log('User not found by subscription_id, trying by customer_id');
            // Try by customer_id
            const { data: userByCustomer, error: customerError } = await supabase
              .from('users')
              .select('*')
              .eq('stripe_customer_id', cancelledCustomerId)
              .single();

            if (customerError) {
              console.log('User not found by customer_id, trying to find by email');

              // Try to get customer details to find email
              try {
                const customer = await stripe.customers.retrieve(cancelledCustomerId);
                console.log('Customer email:', customer.email);

                if (customer.email) {
                  const { data: userByEmail, error: emailError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', customer.email)
                    .single();

                  if (emailError) {
                    console.error('Error finding user by email:', emailError);
                  } else {
                    userBySubscription = userByEmail;
                    console.log('Found user by email:', userBySubscription.email);
                  }
                }
              } catch (stripeError) {
                console.error('Error retrieving customer from Stripe:', stripeError);
              }
            } else {
              userBySubscription = userByCustomer;
              console.log('Found user by customer_id:', userBySubscription.email);
            }
          } else {
            console.log('Found user by subscription_id:', userBySubscription.email);
          }

          if (userBySubscription) {
            // Update subscription status
            console.log('Updating user subscription status to cancelled');
            const updateData = {
              subscription_status: 'cancelled',
              // Set access end date to current period end if available
              cancel_at: cancelledSubscription.current_period_end
                ? new Date(cancelledSubscription.current_period_end * 1000).toISOString()
                : new Date().toISOString()
            };
            console.log('Update data:', JSON.stringify(updateData, null, 2));

            const { data, error } = await supabase
              .from('users')
              .update(updateData)
              .eq('id', userBySubscription.id)
              .select();

            if (error) {
              console.error('Error updating subscription status to cancelled:', error);
            } else {
              console.log('User subscription cancelled successfully:', data);
              console.log(`User ${userBySubscription.id} subscription cancelled`);
            }
          } else {
            console.error('Could not find user associated with the cancelled subscription');

            // List all users to help with debugging
            const { data: allUsers } = await supabase
              .from('users')
              .select('id, auth_id, email, subscription_id, stripe_customer_id')
              .limit(10);

            console.log('Available users:', JSON.stringify(allUsers, null, 2));
          }
        } catch (error) {
          console.error('Error processing subscription cancellation:', error);
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
