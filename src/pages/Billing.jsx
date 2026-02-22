import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, Calendar, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { subscriptionsAPI } from "@/api/subscriptions";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { supabase } from "@/config/supabase";

const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;

export default function Billing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const justPaid = searchParams.get("success") === "true";
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If we landed here after Stripe checkout, sync subscription from Stripe first (backup if webhook failed)
      if (sessionId && justPaid) {
        try {
          await supabase.functions.invoke("sync-checkout-session", {
            body: { session_id: sessionId },
          });
        } catch (_) {
          // Non-blocking: webhook may have already updated; we'll load and retry below
        }
      }
      if (!cancelled) loadSubscriptionWithRetry();
    })();
    return () => { cancelled = true; };
  }, []);

  const loadSubscription = async () => {
    const sub = await subscriptionsAPI.getSubscription();
    return sub;
  };

  const loadSubscriptionWithRetry = async (isRetry = false) => {
    setLoading(true);
    let lastError = null;
    for (let attempt = 0; attempt <= (justPaid ? MAX_RETRIES : 0); attempt++) {
      try {
        const sub = await loadSubscription();
        setSubscription(sub);
        setLoading(false);
        return;
      } catch (error) {
        lastError = error;
        if (error?.code === "PGRST116") {
          setSubscription(null);
        }
        if (attempt < (justPaid ? MAX_RETRIES : 0)) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    setLoading(false);
    setSubscription(null);
    if (lastError && lastError.code !== "PGRST116") {
      toast({
        title: "Error",
        description: "Failed to load subscription information",
        variant: "destructive"
      });
    }
  };

  const handleRetry = () => {
    loadSubscriptionWithRetry(true);
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
        body: {}
      });

      if (error) throw error;

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (error) {
      console.error('Billing portal error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to open billing portal",
        variant: "destructive"
      });
      setPortalLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { variant: "default", icon: CheckCircle, label: "Active" },
      trialing: { variant: "default", icon: CheckCircle, label: "Trial" },
      canceled: { variant: "secondary", icon: XCircle, label: "Canceled" },
      past_due: { variant: "destructive", icon: AlertCircle, label: "Past Due" },
      incomplete: { variant: "secondary", icon: AlertCircle, label: "Incomplete" },
      unpaid: { variant: "destructive", icon: XCircle, label: "Unpaid" },
    };

    const config = statusConfig[status] || { variant: "secondary", icon: AlertCircle, label: status };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-[#1a2845]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Billing & Subscription</h1>
          <p className="text-sm text-gray-500 font-light">Manage your subscription and billing information</p>
        </div>

        {!subscription ? (
          <Card>
            <CardHeader>
              <CardTitle>No Active Subscription</CardTitle>
              <CardDescription>
                {justPaid
                  ? "Your payment is being processed. If you just completed checkout, it may take a few seconds."
                  : "Subscribe to start using OptiFinance"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={handleRetry} variant="outline" disabled={loading}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Button onClick={() => navigate('/Pricing')} className="bg-[#1a2845] hover:bg-[#0f1829] text-white">
                View Pricing Plans
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5" />
                      Subscription Status
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Current subscription plan and billing information
                    </CardDescription>
                  </div>
                  {getStatusBadge(subscription.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Plan</p>
                    <p className="text-base font-light text-gray-900">{subscription.plan_id || 'Monthly Plan'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Status</p>
                    <p className="text-base font-light text-gray-900 capitalize">{subscription.status}</p>
                  </div>
                  {subscription.current_period_start && (
                    <div>
                      <p className="text-sm text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Current Period Start
                      </p>
                      <p className="text-base font-light text-gray-900">
                        {format(new Date(subscription.current_period_start), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  )}
                  {subscription.current_period_end && (
                    <div>
                      <p className="text-sm text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {subscription.cancel_at_period_end ? 'Cancels On' : 'Renews On'}
                      </p>
                      <p className="text-base font-light text-gray-900">
                        {format(new Date(subscription.current_period_end), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                    variant="outline"
                    className="w-full md:w-auto"
                  >
                    {portalLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Manage Billing in Stripe'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
