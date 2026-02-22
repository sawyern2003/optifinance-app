import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function stripeGet(path: string, secret: string) {
  const auth = btoa(`${secret}:`);
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "GET",
    headers: { "Authorization": `Basic ${auth}` },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = body?.session_id;
    if (!sessionId || typeof sessionId !== "string") {
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Retrieve session and expand subscription so we get period dates in one call
    const sessionRes = await stripeGet(
      `checkout/sessions/${sessionId}?expand[]=subscription`,
      stripeSecret
    );
    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      return new Response(JSON.stringify({ error: `Stripe session: ${errText}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await sessionRes.json();
    const userId = session.metadata?.user_id;
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: "Session does not belong to this user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = session.customer;
    const sub = session.subscription;
    if (!customerId || !sub) {
      return new Response(JSON.stringify({ error: "No subscription on session" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // sub may be expanded (object) or just id (string)
    const subscriptionId = typeof sub === "string" ? sub : sub.id;
    const status = typeof sub === "object" ? sub.status : "active";
    const current_period_start = typeof sub === "object" && sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null;
    const current_period_end = typeof sub === "object" && sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
    const cancel_at_period_end = typeof sub === "object" ? !!sub.cancel_at_period_end : false;
    const plan_id = typeof sub === "object" && sub.items?.data?.[0]?.price?.id
      ? sub.items.data[0].price.id
      : null;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: upsertError } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: status || "active",
          plan_id: plan_id,
          current_period_start: current_period_start,
          current_period_end: current_period_end,
          cancel_at_period_end: cancel_at_period_end,
        },
        { onConflict: "stripe_customer_id" }
      );

    if (upsertError) {
      console.error("sync-checkout-session upsert error:", upsertError);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-checkout-session error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
