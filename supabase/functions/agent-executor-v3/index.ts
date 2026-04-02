/**
 * PHASE 3: SIMPLE AGENT THAT ACTUALLY WORKS
 *
 * No planning loops. No state machines. No complexity.
 * Just: User asks → GPT-4o figures out what tools to use → Execute tools → Done
 *
 * GPT-4o is smart enough to handle this without handholding.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

/**
 * SIMPLE SYSTEM PROMPT - No examples, no complexity
 */
const SYSTEM_PROMPT = `You are a helpful AI assistant for a clinic. Staff use you to manage patients, appointments, treatments, and invoices through voice commands.

Your job: When staff ask you to do something, use the available tools to do it. Don't ask for information that might be in the database - search first.

Key behaviors:
- Patient mentioned? Search the database with create_or_find_patient first
- Treatment mentioned? Look up the price with get_treatment_price before recording it or creating invoices
- "Had treatment yesterday"? Use add_treatment (records past treatments)
- "Coming in tomorrow"? Use book_appointment (schedules future appointments)
- Always use patient_id from search results in subsequent operations
- Always use prices from the catalogue, never guess or assume £0
- Extract dates, times, patient names directly from the user's request
- Complete the full workflow without asking for confirmation

Workflow for "Patient had treatment":
1. Search for patient (create_or_find_patient)
2. Look up treatment price (get_treatment_price)
3. Record treatment with correct price (add_treatment)
4. Create invoice with correct price (create_invoice)
5. Send invoice (send_invoice)

Keep responses conversational and brief (they're spoken aloud - no markdown formatting).`;

/**
 * TOOL DEFINITIONS - Same as before, they work
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'create_or_find_patient',
      description: 'Search database for patient by name, or create new patient if not found. ALWAYS use this first when a patient name is mentioned.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'Patient full name' },
          email: { type: 'string', description: 'Email (only if creating new patient)' },
          contact: { type: 'string', description: 'Phone (only if creating new patient)' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Schedule a future appointment in the calendar',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'number', description: 'Patient ID from create_or_find_patient' },
          patient_name: { type: 'string' },
          treatment_name: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD format' },
          time: { type: 'string', description: 'HH:mm 24-hour format' }
        },
        required: ['patient_id', 'patient_name', 'treatment_name', 'date', 'time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_treatment',
      description: 'Record a treatment that already happened (past tense)',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          treatment_name: { type: 'string' },
          price: { type: 'number', description: 'Treatment price in GBP' },
          payment_status: { type: 'string', enum: ['paid', 'pending', 'partially_paid'] },
          amount_paid: { type: 'number', description: 'Amount paid if partially_paid' }
        },
        required: ['patient_name', 'treatment_name', 'price', 'payment_status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description: 'Generate an invoice for a patient',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          treatment_name: { type: 'string' },
          amount: { type: 'number', description: 'Invoice amount in GBP' },
          discount_percentage: { type: 'number', description: 'Discount % if applicable' },
          discount_amount: { type: 'number', description: 'Fixed discount amount if applicable' }
        },
        required: ['patient_name', 'treatment_name', 'amount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_invoice',
      description: 'Send an invoice to patient via SMS/email',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          invoice_id: { type: 'number', description: 'Specific invoice ID if known' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_expense',
      description: 'Record a business expense',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          category: { type: 'string', enum: ['Rent', 'Products', 'Wages', 'Insurance', 'Marketing', 'Utilities', 'Equipment', 'Other'] },
          description: { type: 'string' }
        },
        required: ['amount', 'category']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_reminder',
      description: 'Send payment reminder for unpaid invoice',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_patient',
      description: 'Update patient contact information',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          email: { type: 'string' },
          contact: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_treatment_price',
      description: 'Look up the price of a treatment from the catalogue. ALWAYS use this before creating invoices or recording treatments.',
      parameters: {
        type: 'object',
        properties: {
          treatment_name: { type: 'string', description: 'Treatment name (e.g., Consultation, Botox, Filler)' }
        },
        required: ['treatment_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_today_summary',
      description: 'Get summary of today\'s appointments, treatments, and revenue',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

/**
 * TOOL EXECUTION - Same implementations that work
 */
async function executeFunction(functionName: string, args: any, userId: string | null) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  switch (functionName) {
    case 'create_or_find_patient': {
      const { patient_name, email, contact } = args;

      const { data: existingPatients } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${patient_name}%`);

      if (existingPatients && existingPatients.length > 0) {
        return {
          success: true,
          found: true,
          patient: existingPatients[0],
          message: `Found ${existingPatients[0].name}`,
        };
      }

      const { data: newPatient, error } = await supabase
        .from('patients')
        .insert({
          user_id: userId,
          name: patient_name,
          email: email || '',
          contact: contact || '',
          date_added: new Date().toISOString().split('T')[0],
          notes: 'Created by AI agent',
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        found: false,
        patient: newPatient,
        message: `Created patient card for ${patient_name}`,
      };
    }

    case 'book_appointment': {
      const { patient_id, patient_name, treatment_name, date, time } = args;

      const { data: appointment, error } = await supabase
        .from('appointments')
        .insert({
          user_id: userId,
          patient_id,
          patient_name,
          treatment_name,
          date,
          time,
          status: 'scheduled',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        appointment,
        message: `Booked ${patient_name} for ${date} at ${time}`,
      };
    }

    case 'add_treatment': {
      const { patient_name, treatment_name, price, payment_status, amount_paid } = args;
      const paidAmount = payment_status === 'paid' ? price : (amount_paid || 0);

      let patient_id: number | null = null;

      const { data: existingPatients } = await supabase
        .from('patients')
        .select('id, name')
        .eq('user_id', userId)
        .ilike('name', `%${patient_name}%`)
        .limit(1);

      if (existingPatients && existingPatients.length > 0) {
        patient_id = existingPatients[0].id;
      } else {
        const { data: newPatient } = await supabase
          .from('patients')
          .insert({
            user_id: userId,
            name: patient_name,
            email: '',
            contact: '',
            date_added: new Date().toISOString().split('T')[0],
            notes: 'Auto-created from treatment',
          })
          .select('id')
          .single();

        patient_id = newPatient?.id || null;
      }

      const { data: treatment, error } = await supabase
        .from('treatment_entries')
        .insert({
          user_id: userId,
          patient_id,
          patient_name,
          treatment_name,
          price_paid: price,
          payment_status,
          amount_paid: paidAmount,
          date: new Date().toISOString().split('T')[0],
          product_cost: 0,
          profit: paidAmount,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        treatment,
        message: `Recorded ${patient_name}'s ${treatment_name} - £${price}`,
      };
    }

    case 'create_invoice': {
      const { patient_name, treatment_name, amount, discount_percentage, discount_amount } = args;

      let finalAmount = amount;
      if (discount_percentage) {
        finalAmount = amount * (1 - discount_percentage / 100);
      } else if (discount_amount) {
        finalAmount = Math.max(0, amount - discount_amount);
      }

      const { data: patients } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${patient_name}%`)
        .limit(1);

      if (!patients || patients.length === 0) {
        throw new Error(`Patient ${patient_name} not found`);
      }

      const patient = patients[0];
      const invoiceNumber = `INV-${Date.now()}`;

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          user_id: userId,
          invoice_number: invoiceNumber,
          patient_name: patient.name,
          patient_contact: patient.contact || patient.email || '',
          treatment_name,
          treatment_date: new Date().toISOString().split('T')[0],
          amount: finalAmount,
          issue_date: new Date().toISOString().split('T')[0],
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        invoice,
        message: `Created invoice for £${finalAmount.toFixed(2)}`,
      };
    }

    case 'send_invoice': {
      const { patient_name, invoice_id } = args;

      let invoice;

      if (invoice_id) {
        const { data } = await supabase
          .from('invoices')
          .select('*')
          .eq('user_id', userId)
          .eq('id', invoice_id)
          .single();
        invoice = data;
      } else {
        const { data } = await supabase
          .from('invoices')
          .select('*')
          .eq('user_id', userId)
          .ilike('patient_name', `%${patient_name}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        invoice = data;
      }

      if (!invoice) {
        throw new Error(`No invoice found for ${patient_name}`);
      }

      if (!invoice.invoice_pdf_url) {
        await supabase.functions.invoke('generate-invoice-pdf', {
          body: { invoiceId: invoice.id }
        });
      }

      await supabase.functions.invoke('send-invoice', {
        body: {
          invoiceId: invoice.id,
          sendVia: 'both'
        }
      });

      await supabase
        .from('invoices')
        .update({ status: 'sent' })
        .eq('id', invoice.id);

      return {
        success: true,
        invoice,
        message: `Sent invoice to ${invoice.patient_name}`,
      };
    }

    case 'add_expense': {
      const { amount, category, description } = args;

      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
          user_id: userId,
          amount: Math.abs(amount),
          category,
          description: description || `${category} expense`,
          date: new Date().toISOString().split('T')[0],
          notes: description || null,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        expense,
        message: `Logged £${amount} for ${category}`,
      };
    }

    case 'send_reminder': {
      const { patient_name } = args;

      const { data: invoices } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .ilike('patient_name', `%${patient_name}%`)
        .neq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!invoices || invoices.length === 0) {
        throw new Error(`No unpaid invoices for ${patient_name}`);
      }

      await supabase.functions.invoke('send-payment-reminder', {
        body: { invoiceId: invoices[0].id, urgent: false }
      });

      return {
        success: true,
        message: `Sent payment reminder to ${patient_name}`,
      };
    }

    case 'update_patient': {
      const { patient_name, email, contact, notes } = args;

      const { data: patients } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${patient_name}%`)
        .limit(1);

      if (!patients || patients.length === 0) {
        throw new Error(`Patient ${patient_name} not found`);
      }

      const updates: any = {};
      if (email !== undefined) updates.email = email;
      if (contact !== undefined) updates.contact = contact;
      if (notes !== undefined) updates.notes = notes;

      const { data: updated, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', patients[0].id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        patient: updated,
        message: `Updated ${patient_name}'s info`,
      };
    }

    case 'get_treatment_price': {
      const { treatment_name } = args;

      // Search treatment catalogue for price
      const { data: treatments } = await supabase
        .from('treatment_catalog')
        .select('*')
        .eq('user_id', userId)
        .ilike('treatment_name', `%${treatment_name}%`)
        .limit(1);

      if (!treatments || treatments.length === 0) {
        return {
          success: false,
          message: `Treatment "${treatment_name}" not found in catalogue. Please specify the price.`,
        };
      }

      const treatment = treatments[0];

      return {
        success: true,
        treatment: treatment,
        price: treatment.price,
        message: `${treatment.treatment_name} costs £${treatment.price}`,
      };
    }

    case 'get_today_summary': {
      const ukDate = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'short' });
      const [day, month, year] = ukDate.split('/');
      const today = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .order('time', { ascending: true });

      const { data: treatments } = await supabase
        .from('treatment_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .order('created_at', { ascending: false });

      const revenue = treatments?.reduce((sum, t) => sum + (t.amount_paid || 0), 0) || 0;

      let summary = '';
      if (!appointments?.length && !treatments?.length) {
        summary = 'Nothing scheduled today';
      } else {
        if (appointments?.length) {
          summary += `${appointments.length} appointment${appointments.length > 1 ? 's' : ''} today. `;
        }
        if (treatments?.length) {
          summary += `${treatments.length} treatment${treatments.length > 1 ? 's' : ''} completed. `;
        }
        if (revenue > 0) {
          summary += `Revenue: £${revenue}`;
        }
      }

      return {
        success: true,
        summary: { date: today, appointments: appointments || [], treatments: treatments || [], revenue },
        message: summary.trim(),
      };
    }

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

/**
 * SIMPLE AGENT LOOP - No planning, no verification, just do it
 */
async function runAgent(userInput: string, userId: string): Promise<string> {
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userInput }
  ];

  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const result = await response.json();
    const message = result.choices[0].message;

    messages.push(message);

    // If GPT-4o wants to use tools, execute them
    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log(`[AGENT] Executing ${message.tool_calls.length} tools`);

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[AGENT] ${functionName}:`, functionArgs);

        try {
          const result = await executeFunction(functionName, functionArgs, userId);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify(result),
          });

          console.log(`[AGENT] ✓ ${result.message}`);
        } catch (error: any) {
          console.error(`[AGENT] ✗ ${functionName}:`, error.message);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify({ success: false, error: error.message }),
          });
        }
      }

      continue; // Get next response from GPT-4o
    }

    // GPT-4o finished - return its response
    if (message.content) {
      return message.content;
    }

    break;
  }

  throw new Error('Agent exceeded maximum iterations');
}

/**
 * HTTP HANDLER
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { input, user_id } = await req.json();

    if (!input) throw new Error('No input provided');
    if (!user_id) throw new Error('user_id is required');

    console.log('[AGENT V3] Request:', input);

    const output = await runAgent(input, user_id);

    console.log('[AGENT V3] Response:', output);

    return new Response(
      JSON.stringify({ type: 'complete', output, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[AGENT V3] Error:', error);

    return new Response(
      JSON.stringify({ type: 'error', error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
