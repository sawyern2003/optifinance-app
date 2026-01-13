import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/config/supabase";
import { useToast } from "@/components/ui/use-toast";


function CheckoutForm({ priceId, planName, planPrice }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Automatically redirect to Stripe Checkout
    const createCheckout = async () => {
      setLoading(true);
      try {
        // Create checkout session via Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: { priceId }
        });

        if (error) throw error;

        // Redirect to Stripe Checkout
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL returned');
        }
      } catch (error) {
        console.error('Checkout error:', error);
        toast({
          title: "Checkout failed",
          description: error.message || "Failed to start checkout process",
          variant: "destructive"
        });
        setLoading(false);
      }
    };

    createCheckout();
  }, [priceId, toast]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium text-gray-900">{planName}</p>
              <p className="text-sm text-gray-500">Monthly subscription</p>
            </div>
            <p className="text-lg font-semibold text-gray-900">{planPrice}</p>
          </div>
        </div>
      </div>

      <div className="text-center">
        {loading ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-4 text-[#1a2845]" />
            <p className="text-sm text-gray-600">Redirecting to secure checkout...</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">Preparing checkout...</p>
        )}
      </div>
    </div>
  );
}

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const priceId = searchParams.get('priceId');
  const planName = searchParams.get('planName') || 'Monthly Plan';
  const planPrice = searchParams.get('planPrice') || '£29/month';

  if (!priceId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Checkout</CardTitle>
            <CardDescription>No pricing plan selected</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/Pricing')} className="w-full">
              Return to Pricing
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] p-6">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/Pricing')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Pricing
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-light tracking-tight text-[#1a2845]">
              Complete Your Subscription
            </CardTitle>
            <CardDescription>
              You'll be redirected to Stripe to complete your payment securely
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CheckoutForm priceId={priceId} planName={planName} planPrice={planPrice} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
