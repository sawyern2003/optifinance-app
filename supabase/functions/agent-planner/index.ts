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

const PLANNING_PROMPT = `You are a clinic AI assistant. Build an ordered execution plan from the user's command.

AVAILABLE ACTIONS (use exact strings):
- find_patient: { patient_name }
- create_patient: { patient_name, email?, contact?, phone?, notes? }
- get_price: { treatment_name } — catalogue price; set needsPriceCheck true when used
- add_treatment: { patient_name, treatment_name, date (today|yesterday|YYYY-MM-DD), payment_status? }
- create_invoice: { patient_name, treatment_name, treatment_date (YYYY-MM-DD or today|yesterday), discount_percentage?, discount_amount?, price? }
- send_invoice: { patient_name }
- book_appointment: { patient_name, treatment_name, date, time (HH:mm, e.g. 17:00 for 5pm) }
- add_clinical_note: { patient_name, raw_narrative or narrative, visit_date?, clinical_summary?, link_to_last_treatment?: true if same flow as just-added treatment }
- add_expense: { amount, category (Rent|Products|Wages|Insurance|Marketing|Utilities|Equipment|Other), notes?, date? }
- adjust_product_stock: { product_name, quantity_change } — positive = restock, negative = used/consumed
- log_fridge_temperature: { temperature (number °C), time_of_day (am|pm), notes? }
- register_equipment: { name, type? (laser|ultrasound|autoclave|fridge|other), serial_number?, manufacturer? }
- update_equipment_service: { equipment_name, last_service_date?, next_service_date? } (YYYY-MM-DD)
- update_patient: { patient_name, email?, contact?, phone?, notes? } — at least one field to change
- update_clinic_profile: { clinic_name?, bank_name?, account_number?, sort_code?, invoice_from_email?, invoice_reply_to_email?, invoice_sender_name? }
- update_tax_settings: { vat_registered?, vat_number?, vat_scheme?, business_structure?, flat_rate_percentage?, utr_number?, company_number? }
- add_competitor_price: { treatment_name, competitor_name, price, notes? }
- send_payment_reminder: { patient_name, include_review?: boolean }

Return JSON:
{
  "summary": "Brief summary",
  "actions": [ { "action": "...", "description": "...", "params": { } } ],
  "needsPriceCheck": true/false,
  "warnings": []
}

FULL CLINICAL + BILLING ("update everything", "all records", invoice after a visit):
find_patient → get_price (if priced treatment) → add_treatment → add_clinical_note (if they dictated clinical detail OR say "note on file") with link_to_last_treatment: true → create_invoice (same patient/treatment/treatment_date) → send_invoice.
If they only want billing with no narrative, omit add_clinical_note.

INVOICE CHAIN: create_invoice must match add_treatment patient_name, treatment_name, and treatment_date.

CALENDAR: book_appointment when they ask to book, schedule, diary, or a future slot with time.

COMPLIANCE / OPS: log_fridge_temperature, register_equipment, update_equipment_service, adjust_product_stock when they mention fridge check, equipment service, or stock.

SETTINGS: update_clinic_profile / update_tax_settings only when they clearly ask to change clinic details, bank, VAT, etc.

Extract names, dates YYYY-MM-DD, times as HH:mm, amounts, discounts.

Example:
User: "Invoice Nicholas for consultation today, add a note he tolerated it well, send invoice"
→ find_patient → get_price → add_treatment → add_clinical_note (raw_narrative: tolerated well, link_to_last_treatment: true) → create_invoice → send_invoice

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
