import { supabase } from '@/config/supabase';

/**
 * Subscription API for managing user subscriptions
 */
export class SubscriptionsAPI {
  /**
   * Check if the current user is exempt from subscription (free access account)
   */
  async isExempt() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from('subscription_exemptions')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    return !!data;
  }

  /**
   * Get current user's subscription status (or a synthetic "active" for exempt users)
   */
  async getSubscription() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const exempt = await this.isExempt();
    if (exempt) {
      return { status: 'active', plan_id: 'Free access', user_id: user.id };
    }

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
   * Check if user has active subscription (or is exempt)
   */
  async hasActiveSubscription() {
    try {
      if (await this.isExempt()) return true;
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
