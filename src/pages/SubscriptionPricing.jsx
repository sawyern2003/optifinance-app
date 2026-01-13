import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { subscriptionsAPI } from "@/api/subscriptions";

export default function SubscriptionPricing() {
  const navigate = useNavigate();
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const hasActive = await subscriptionsAPI.hasActiveSubscription();
      setHasSubscription(hasActive);
    } catch (error) {
      console.error('Error checking subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = (priceId, planName, planPrice) => {
    navigate(`/Checkout?priceId=${priceId}&planName=${encodeURIComponent(planName)}&planPrice=${encodeURIComponent(planPrice)}`);
  };

  // These price IDs should be configured in Stripe Dashboard
  // For now, using placeholder values - user needs to replace with actual Stripe Price IDs
  const plans = [
    {
      id: 'monthly',
      name: 'Monthly Plan',
      price: '£29',
      priceId: import.meta.env.VITE_STRIPE_PRICE_ID_MONTHLY || 'price_monthly', // Replace with actual Stripe Price ID
      description: 'Perfect for getting started',
      features: [
        'Full access to all features',
        'Unlimited treatments & patients',
        'Invoice management',
        'Reports & analytics',
        'AI-powered insights',
        'Email support'
      ]
    },
    {
      id: 'annual',
      name: 'Annual Plan',
      price: '£290',
      priceId: import.meta.env.VITE_STRIPE_PRICE_ID_ANNUAL || 'price_annual', // Replace with actual Stripe Price ID
      description: 'Save 17% with annual billing',
      badge: 'Best Value',
      priceLabel: '/ year',
      billingNote: 'Billed annually',
      savingsNote: 'Save £58 (2 months free)',
      features: [
        'Everything in Monthly',
        '17% savings',
        'Priority support',
        'Early access to new features',
        'Annual business review'
      ]
    }
  ];

  if (loading) {
    return (
      <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-[#1a2845] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Choose Your Plan</h1>
          <p className="text-sm text-gray-500 font-light">Select the subscription plan that works best for your clinic</p>
        </div>

        {hasSubscription && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-800">
              You already have an active subscription. <Button variant="link" onClick={() => navigate('/Billing')} className="p-0 h-auto font-semibold">Manage billing</Button>
            </p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <Card key={plan.id} className={`relative ${plan.badge ? 'border-2 border-[#1a2845]' : ''}`}>
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-[#1a2845] text-white">{plan.badge}</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-xl font-light tracking-tight text-[#1a2845]">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-light text-[#1a2845]">{plan.price}</span>
                  <span className="text-gray-500 font-light">{plan.priceLabel || '/month'}</span>
                  {plan.id === 'annual' && (
                    <>
                      <p className="text-xs text-gray-500 mt-1">{plan.billingNote}</p>
                      <p className="text-xs text-gray-600 mt-0.5 font-medium">{plan.savingsNote}</p>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-[#1a2845] flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 font-light">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSubscribe(plan.priceId, plan.name, plan.price)}
                  disabled={hasSubscription}
                  className="w-full bg-[#1a2845] hover:bg-[#0f1829] text-white h-11 font-light tracking-wide uppercase text-sm"
                >
                  {hasSubscription ? 'Current Plan' : `Subscribe to ${plan.name}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-gray-500">
          <p>All plans include a 14-day free trial. Cancel anytime.</p>
          <p className="mt-2">Questions? Contact support for help choosing the right plan.</p>
        </div>
      </div>
    </div>
  );
}
