/**
 * AGENT PLANNER - Parse voice commands and create execution plans
 *
 * Does NOT execute - only plans what should happen.
 * Returns plan to user for confirmation.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const PLANNING_PROMPT = `You are a clinic AI assistant. Parse the user's voice command and create a detailed execution plan.

Return a JSON object with this structure:
{
  "summary": "Brief summary of what will happen",
  "actions": [
    {
      "action": "find_patient" | "create_patient" | "add_treatment" | "create_invoice" | "send_invoice" | "book_appointment",
      "description": "What this step does",
      "params": {extracted parameters from command}
    }
  ],
  "needsPriceCheck": true/false,
  "warnings": ["any warnings for the user"]
}

Extract ALL information from the user's request:
- Patient names (exact)
- Treatment names (exact)
- Dates (convert to YYYY-MM-DD)
- Times (convert to HH:mm)
- Amounts (extract numbers)
- Discounts (percentage or fixed)

CRITICAL: Look up treatment prices from catalogue before creating invoices or recording treatments.

Example 1:
User: "Invoice Nicholas for consultation he had today with 5% discount"
{
  "summary": "Record consultation for Nicholas, create discounted invoice, and send it",
  "actions": [
    {"action": "find_patient", "description": "Find Nicholas in database", "params": {"patient_name": "Nicholas"}},
    {"action": "get_price", "description": "Look up consultation price", "params": {"treatment_name": "Consultation"}},
    {"action": "add_treatment", "description": "Record consultation on Nicholas's card", "params": {"patient_name": "Nicholas", "treatment_name": "Consultation", "date": "today", "payment_status": "pending"}},
    {"action": "create_invoice", "description": "Create invoice with 5% discount", "params": {"patient_name": "Nicholas", "treatment_name": "Consultation", "discount_percentage": 5}},
    {"action": "send_invoice", "description": "Send invoice to Nicholas", "params": {"patient_name": "Nicholas"}}
  ],
  "needsPriceCheck": true,
  "warnings": []
}

Now parse this command:`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
    if (!openaiApiKey) {
      console.error('[PLANNER] OPENAI_API_KEY is not set');
      return json({
        success: false,
        error:
          'Voice planner is not configured (OpenAI key missing). Add OPENAI_API_KEY to Edge Function secrets in Supabase.',
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[PLANNER] Supabase env missing');
      return json({ success: false, error: 'Server configuration error. Please contact support.' });
    }

    const { input, user_id } = await req.json();

    if (!input) return json({ success: false, error: 'No input provided' });
    if (!user_id) return json({ success: false, error: 'user_id required' });

    console.log('[PLANNER] Parsing:', input);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You create execution plans for clinic voice commands.' },
          { role: 'user', content: PLANNING_PROMPT + `\n\n"${input}"` },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PLANNER] OpenAI error:', response.status, errorText);
      return json({
        success: false,
        error: `OpenAI request failed (${response.status}). Check API key and billing.`,
      });
    }

    const result = await response.json();
    const planText = result.choices?.[0]?.message?.content;
    if (!planText || typeof planText !== 'string') {
      return json({ success: false, error: 'Empty response from language model. Please try again.' });
    }

    let plan: Record<string, unknown>;
    try {
      plan = JSON.parse(planText) as Record<string, unknown>;
    } catch {
      console.error('[PLANNER] JSON parse failed:', planText.slice(0, 500));
      return json({ success: false, error: 'Could not parse planner output. Please try rephrasing your request.' });
    }

    if (!Array.isArray(plan.actions)) {
      plan.actions = [];
    }

    if (plan.needsPriceCheck && (plan.actions as { action?: string; params?: { treatment_name?: string }; result?: unknown; description?: string }[]).length > 0) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const actions = plan.actions as {
        action: string;
        params?: { treatment_name?: string };
        result?: { price?: number };
        description?: string;
      }[];

      for (const action of actions) {
        if (action.action === 'get_price' && action.params?.treatment_name) {
          const { data } = await supabase
            .from('treatment_catalog')
            .select('price')
            .eq('user_id', user_id)
            .ilike('treatment_name', `%${action.params.treatment_name}%`)
            .limit(1)
            .maybeSingle();

          if (data) {
            action.result = { price: data.price };
            action.description = `${action.params.treatment_name} costs £${data.price}`;
          }
        }
      }
    }

    console.log('[PLANNER] Plan:', plan.summary);

    return json({ type: 'plan', plan, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PLANNER] Error:', error);
    return json({ success: false, error: message || 'Planner failed' });
  }
});
