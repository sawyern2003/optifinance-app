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

const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const { input, user_id } = await req.json();

    if (!input) throw new Error('No input provided');
    if (!user_id) throw new Error('user_id required');

    console.log('[PLANNER] Parsing:', input);

    // Call GPT-4o to create plan
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You create execution plans for clinic voice commands.' },
          { role: 'user', content: PLANNING_PROMPT + `\n\n"${input}"` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${await response.text()}`);
    }

    const result = await response.json();
    const planText = result.choices[0].message.content;
    const plan = JSON.parse(planText);

    // If needs price check, look up prices from catalogue
    if (plan.needsPriceCheck) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      for (const action of plan.actions) {
        if (action.action === 'get_price' && action.params?.treatment_name) {
          const { data } = await supabase
            .from('treatment_catalog')
            .select('price')
            .eq('user_id', user_id)
            .ilike('treatment_name', `%${action.params.treatment_name}%`)
            .limit(1)
            .single();

          if (data) {
            action.result = { price: data.price };
            action.description = `${action.params.treatment_name} costs £${data.price}`;
          }
        }
      }
    }

    console.log('[PLANNER] Plan:', plan.summary);

    return new Response(
      JSON.stringify({ type: 'plan', plan, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[PLANNER] Error:', error);
    return new Response(
      JSON.stringify({ type: 'error', error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
