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
    const createCheckout = async () => {
      setLoading(true);

      // 401 usually means not logged in or session expired – check first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Checkout failed",
          description: "Please sign in first, then try checkout again.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('create-checkout-session', {
            body: { priceId }
          });

          if (error) {
            // Prefer error message from Edge Function response body
            const message = (data && typeof data.error === 'string') ? data.error : error.message;
            if (message && message.includes('Failed to send a request to the Edge Function') && attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 800));
              continue;
            }
            throw new Error(message || 'Checkout request failed');
          }

          if (data && data.url) {
            window.location.href = data.url;
            return;
          }
          throw new Error('No checkout URL returned');
        } catch (err) {
          const isEdgeUnreachable = err.message && err.message.includes('Failed to send a request to the Edge Function');
          if (isEdgeUnreachable && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          console.error('Checkout error:', err);
          const is401 = err.message?.includes('401') || String(err.message).toLowerCase().includes('unauthorized');
          const description = is401
            ? "Session expired or not signed in. Please sign in again and try checkout."
            : isEdgeUnreachable
              ? "Cannot reach the checkout service. Ensure the Supabase Edge Function 'create-checkout-session' is deployed and that STRIPE_SECRET_KEY and SITE_URL are set in Supabase (see DEPLOYMENT.md)."
              : (err.message || "Failed to start checkout process");
          toast({
            title: "Checkout failed",
            description,
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
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
