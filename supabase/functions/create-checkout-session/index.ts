import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripeFetch(path: string, body: Record<string, string>, secret: string) {
  const form = new URLSearchParams(body).toString();
  // Stripe expects Basic auth: secret key as username, empty password
  const auth = btoa(`${secret}:`);
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { priceId } = await req.json();

    if (!priceId) {
      throw new Error("Price ID is required");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";

    // Get or create Stripe customer
    const { data: subscription } = await supabaseClient
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      const customerRes = await stripeFetch(
        "customers",
        {
          email: user.email ?? "",
          "metadata[supabase_user_id]": user.id,
        },
        stripeSecret
      );
      if (!customerRes.ok) {
        const errText = await customerRes.text();
        let errMsg = errText;
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error?.message) errMsg = errJson.error.message;
        } catch (_) {}
        throw new Error(`Stripe customer: ${errMsg}`);
      }
      const customer = await customerRes.json();
      customerId = customer.id;

      await supabaseClient.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
      });
    }

    // Create Checkout session via Stripe API
    const sessionRes = await stripeFetch(
      "checkout/sessions",
      {
        customer: customerId,
        "mode": "subscription",
        "payment_method_types[0]": "card",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        "success_url": `${siteUrl}/Billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        "cancel_url": `${siteUrl}/SubscriptionPricing?canceled=true`,
        "metadata[user_id]": user.id,
      },
      stripeSecret
    );

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.error?.message) errMsg = errJson.error.message;
      } catch (_) {}
      throw new Error(`Stripe checkout: ${errMsg}`);
    }

    const session = await sessionRes.json();
    const url = session.url ?? null;

    if (!url) {
      throw new Error("No checkout URL returned from Stripe");
    }

    return new Response(
      JSON.stringify({ url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
