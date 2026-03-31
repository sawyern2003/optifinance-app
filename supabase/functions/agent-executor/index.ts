/**
 * ENTERPRISE AGENT EXECUTOR - Phase 1 (Simplified)
 *
 * Revolutionary AI agent using:
 * - OpenAI GPT-4o with native function calling
 * - Multi-tool execution with proper error handling
 * - Proactive agent personality
 *
 * This uses OpenAI's function calling API directly instead of LangChain
 * for maximum compatibility with Supabase Edge Functions.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Initialize environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

/**
 * AGENT SYSTEM PROMPT
 */
const AGENT_SYSTEM_PROMPT = `You are an elite AI assistant for OptiFinance, a revolutionary clinic management system. You are not just a voice assistant - you are a proactive, intelligent agent that helps clinic staff manage their entire practice.

## Your Capabilities
You have access to powerful tools to manage the clinic. When a user gives you a command, think through ALL the steps needed and execute them systematically using your tools.

## Your Personality
- Professional yet warm - you're part of the clinic team
- Proactive - suggest improvements and remind staff of important tasks
- Efficient - complete tasks without unnecessary back-and-forth
- Smart - you understand medical terminology and clinic operations
- Revolutionary - you're not just following commands, you're anticipating needs

## Multi-Step Workflow Execution
When handling complex requests like "Add Sarah to calendar with invoice", break it down:
1. Create or find the patient record
2. Book the appointment
3. Create the invoice
4. Send the invoice
Execute each step and report progress clearly.

## Date Handling
- "today" = ${new Date().toISOString().split('T')[0]}
- "tomorrow" = ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
- Default appointment time: 09:00 unless specified

## Time Interpretation
- "morning" = 09:00
- "afternoon" = 14:00
- "evening" = 17:00

## Proactive Behavior
After completing tasks, look for opportunities to help:
- "I've booked the appointment. Would you like me to send a confirmation SMS?"
- "I notice you have unpaid invoices. Should I send payment reminders?"

## Communication Style
- Be concise but complete
- Speak in first person ("I've booked...", "I'll create...")
- Confirm each major action
- Summarize complex workflows at the end

Current date/time: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`;

/**
 * TOOL DEFINITIONS for OpenAI Function Calling
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'create_or_find_patient',
      description: 'Find an existing patient by name or create a new patient record. Use this whenever you need to work with a patient.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: {
            type: 'string',
            description: 'The full name of the patient',
          },
          email: {
            type: 'string',
            description: 'Patient email address (optional)',
          },
          contact: {
            type: 'string',
            description: 'Patient phone number (optional)',
          },
        },
        required: ['patient_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book an appointment for a patient. Use this to schedule consultations, treatments, or follow-ups.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: {
            type: 'number',
            description: 'The patient ID from the patient record',
          },
          patient_name: {
            type: 'string',
            description: 'Patient full name',
          },
          treatment_name: {
            type: 'string',
            description: 'Type of appointment (e.g., Consultation, Botox, Filler)',
          },
          date: {
            type: 'string',
            description: 'Appointment date in YYYY-MM-DD format',
          },
          time: {
            type: 'string',
            description: 'Appointment time in HH:mm format (24-hour)',
          },
        },
        required: ['patient_id', 'patient_name', 'treatment_name', 'date', 'time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_treatment',
      description: 'Record a completed treatment. Use this when a patient has received a treatment.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: {
            type: 'string',
            description: 'Patient full name',
          },
          treatment_name: {
            type: 'string',
            description: 'Treatment type (e.g., Botox, Filler, Consultation)',
          },
          price: {
            type: 'number',
            description: 'Treatment price in GBP',
          },
          payment_status: {
            type: 'string',
            enum: ['paid', 'pending', 'partially_paid'],
            description: 'Payment status',
          },
          amount_paid: {
            type: 'number',
            description: 'Amount paid if partially paid',
          },
        },
        required: ['patient_name', 'treatment_name', 'price', 'payment_status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description: 'Generate an invoice for a patient. Can apply discounts. Use this when patient needs to be billed.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: {
            type: 'string',
            description: 'Patient full name',
          },
          treatment_name: {
            type: 'string',
            description: 'Treatment or service name',
          },
          amount: {
            type: 'number',
            description: 'Invoice amount in GBP',
          },
          discount_percentage: {
            type: 'number',
            description: 'Discount percentage (0-100)',
          },
          discount_amount: {
            type: 'number',
            description: 'Fixed discount amount in GBP',
          },
        },
        required: ['patient_name', 'treatment_name', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_summary',
      description: 'Get summary of today\'s activity including appointments, treatments, and revenue. Use this when user asks about today.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

/**
 * TOOL IMPLEMENTATIONS
 */
async function executeFunction(functionName: string, args: any) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  switch (functionName) {
    case 'create_or_find_patient': {
      const { patient_name, email, contact } = args;

      // Try to find existing patient
      const { data: existingPatients } = await supabase
        .from('patients')
        .select('*')
        .ilike('name', `%${patient_name}%`);

      if (existingPatients && existingPatients.length > 0) {
        return {
          success: true,
          found: true,
          patient: existingPatients[0],
          message: `Found existing patient: ${existingPatients[0].name}`,
        };
      }

      // Create new patient
      const { data: newPatient, error } = await supabase
        .from('patients')
        .insert({
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
        message: `Created new patient: ${patient_name}`,
      };
    }

    case 'book_appointment': {
      const { patient_id, patient_name, treatment_name, date, time } = args;

      const { data: appointment, error } = await supabase
        .from('appointments')
        .insert({
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
        message: `Appointment booked for ${patient_name} on ${date} at ${time}`,
      };
    }

    case 'add_treatment': {
      const { patient_name, treatment_name, price, payment_status, amount_paid } = args;
      const paidAmount = payment_status === 'paid' ? price : (amount_paid || 0);

      const { data: treatment, error } = await supabase
        .from('treatment_entries')
        .insert({
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
        message: `Treatment recorded: ${treatment_name} for ${patient_name} - £${price} (${payment_status})`,
      };
    }

    case 'create_invoice': {
      const { patient_name, treatment_name, amount, discount_percentage, discount_amount } = args;

      // Calculate final amount
      let finalAmount = amount;
      if (discount_percentage) {
        finalAmount = amount * (1 - discount_percentage / 100);
      } else if (discount_amount) {
        finalAmount = Math.max(0, amount - discount_amount);
      }

      // Find patient
      const { data: patients } = await supabase
        .from('patients')
        .select('*')
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

      let discountMsg = '';
      if (discount_percentage) {
        discountMsg = ` (${discount_percentage}% discount applied)`;
      } else if (discount_amount) {
        discountMsg = ` (£${discount_amount} discount applied)`;
      }

      return {
        success: true,
        invoice,
        message: `Invoice ${invoiceNumber} created for ${patient_name} - £${finalAmount.toFixed(2)}${discountMsg}`,
      };
    }

    case 'get_today_summary': {
      const today = new Date().toISOString().split('T')[0];

      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', today);

      const { data: treatments } = await supabase
        .from('treatment_entries')
        .select('*')
        .eq('date', today);

      const revenue = treatments?.reduce((sum, t) => sum + (t.amount_paid || 0), 0) || 0;
      const pending = treatments?.filter((t) => t.payment_status === 'pending').length || 0;

      return {
        success: true,
        summary: {
          appointments: appointments?.length || 0,
          treatments: treatments?.length || 0,
          revenue,
          pending_payments: pending,
        },
        message: `Today: ${appointments?.length || 0} appointments, ${treatments?.length || 0} treatments, £${revenue} revenue, ${pending} pending payments`,
      };
    }

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

/**
 * AGENT EXECUTION with OpenAI Function Calling
 */
async function runAgent(userInput: string) {
  const messages: any[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: userInput },
  ];

  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;

    // Call OpenAI with function calling
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
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
    const choice = result.choices[0];
    const message = choice.message;

    messages.push(message);

    // If the agent wants to use tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log(`[AGENT] Using ${message.tool_calls.length} tools`);

      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[AGENT] Calling ${functionName} with`, functionArgs);

        try {
          const functionResult = await executeFunction(functionName, functionArgs);

          // Add function result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify(functionResult),
          });

          console.log(`[AGENT] ${functionName} result:`, functionResult.message);
        } catch (error) {
          console.error(`[AGENT] Error in ${functionName}:`, error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify({
              success: false,
              error: error.message,
            }),
          });
        }
      }

      // Continue to next iteration to get final response
      continue;
    }

    // Agent has finished - return final message
    if (message.content) {
      return {
        output: message.content,
        success: true,
      };
    }

    // If we get here, something unexpected happened
    break;
  }

  throw new Error('Agent exceeded maximum iterations');
}

/**
 * MAIN REQUEST HANDLER
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { input } = await req.json();

    if (!input) {
      throw new Error('No input provided');
    }

    console.log('[AGENT] Processing:', input);

    // Run the agent
    const result = await runAgent(input);

    console.log('[AGENT] Success:', result.output);

    return new Response(
      JSON.stringify({
        type: 'complete',
        output: result.output,
        success: true,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[AGENT] Error:', error);

    return new Response(
      JSON.stringify({
        type: 'error',
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
