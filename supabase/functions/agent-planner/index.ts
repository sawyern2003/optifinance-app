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

The app can ONLY run these steps (nothing else exists yet):
- find_patient, create_patient, get_price (catalogue lookup — always before priced treatments)
- add_treatment (writes the clinical / revenue record — THIS is what updates the patient chart & Records)
- create_invoice, send_invoice
- book_appointment (calendar — use when they ask for calendar, appointment, slot, "add to diary", or a specific time for a scheduled visit)

Return JSON:
{
  "summary": "Brief summary of what will happen",
  "actions": [
    {
      "action": "find_patient" | "create_patient" | "get_price" | "add_treatment" | "create_invoice" | "send_invoice" | "book_appointment",
      "description": "Plain English for the staff member",
      "params": { ... }
    }
  ],
  "needsPriceCheck": true/false,
  "warnings": ["optional heads-ups, e.g. missing phone for SMS"]
}

RULES FOR "INVOICE FOR A TREATMENT THEY HAD" / "UPDATE EVERYTHING" / "ALL RECORDS":
1) You MUST include the full chain so data stays linked in the app:
   find_patient → get_price (if treatment has a catalogue price) → add_treatment → create_invoice → send_invoice
2) add_treatment is what updates clinical/revenue records. Skipping it means Records and patient history are NOT updated.
3) create_invoice should use the SAME patient_name and treatment_name as add_treatment. Pass treatment_date as YYYY-MM-DD matching the visit date (same as add_treatment date).
4) If they mention a time (e.g. 5pm) for a visit that already happened today, put the correct date on add_treatment (today / yesterday / explicit YYYY-MM-DD). Optionally add book_appointment ONLY if they explicitly want it on the calendar (otherwise a past visit is usually add_treatment only).
5) If they say "calendar", "schedule", "book", "add to diary" for a future slot, include book_appointment with date, time as HH:mm (17:00 for 5pm).

Extract: patient names, treatment names, dates YYYY-MM-DD, times HH:mm, amounts, discounts.

Example — invoice + all records:
User: "Invoice Nicholas for consultation he had today with 5% discount"
{
  "summary": "Update Nicholas's records: log consultation, invoice with discount, send",
  "actions": [
    {"action": "find_patient", "description": "Locate Nicholas", "params": {"patient_name": "Nicholas"}},
    {"action": "get_price", "description": "Catalogue price for Consultation", "params": {"treatment_name": "Consultation"}},
    {"action": "add_treatment", "description": "Save consultation on Nicholas's chart (today)", "params": {"patient_name": "Nicholas", "treatment_name": "Consultation", "date": "today", "payment_status": "pending"}},
    {"action": "create_invoice", "description": "Create invoice (5% off), linked to that treatment", "params": {"patient_name": "Nicholas", "treatment_name": "Consultation", "discount_percentage": 5, "treatment_date": "2026-04-02"}},
    {"action": "send_invoice", "description": "Send invoice to Nicholas", "params": {"patient_name": "Nicholas"}}
  ],
  "needsPriceCheck": true,
  "warnings": []
}

For create_invoice.params.treatment_date, use the SAME calendar date as the visit in add_treatment (YYYY-MM-DD). If add_treatment uses "today" or "yesterday", convert to a real YYYY-MM-DD in the JSON.

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
