import { supabase } from '@/config/supabase';

/**
 * Subscription API for managing user subscriptions
 */
export class SubscriptionsAPI {
  /**
   * Get current user's subscription status
   */
  async getSubscription() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  }

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription() {
    try {
      const subscription = await this.getSubscription();
      return subscription?.status === 'active' || subscription?.status === 'trialing';
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  }

  /**
   * Create Stripe checkout session
   * This calls a Supabase Edge Function
   */
  async createCheckoutSession(priceId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { priceId }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Create billing portal session
   */
  async createBillingPortalSession() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // This will be implemented via Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
      body: { userId: user.id }
    });

    if (error) throw error;
    return data;
  }
}

export const subscriptionsAPI = new SubscriptionsAPI();
