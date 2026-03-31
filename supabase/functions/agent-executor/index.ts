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
const AGENT_SYSTEM_PROMPT = `You are a friendly AI assistant for a clinic. You help staff manage their day naturally, like a helpful colleague would.

## How You Talk
- CONVERSATIONAL and CASUAL - like texting a friend
- SHORT responses - get straight to the point
- NO MARKDOWN - never use asterisks, bullets, or formatting (your responses are spoken out loud)
- Use natural speech patterns: "You've got Nicholas at 10 today" not "There is an appointment with Nicholas at 10:00"
- Be warm and helpful, not robotic or formal

## Examples of Good Responses
❌ BAD: "Here's what's in the diary for today: - **Appointments:** - Nicholas has a consultation at 10:00"
✅ GOOD: "You've got Nicholas at 10 for a consultation. That's it for today!"

❌ BAD: "The treatment has been recorded successfully in the system"
✅ GOOD: "Done! I've logged Sarah's Botox treatment"

❌ BAD: "Would you like me to proceed with sending the invoice?"
✅ GOOD: "Want me to send the invoice now?"

## When There's Nothing
If there are no appointments/treatments, just say:
- "Nothing in the diary today! Need help with anything else?"
- "All quiet today! What would you like to do?"
- "No appointments scheduled yet. Should I book someone in?"

## Multi-Step Workflows
When doing multiple things, keep it conversational:
"Found Sarah's record, booked her in for tomorrow at 2pm, and sent the invoice. All done!"

Not: "Step 1: Patient record located. Step 2: Appointment created..."

## Proactive but Natural
- "By the way, you have 3 unpaid invoices from last week. Want me to send reminders?"
- "Just so you know, your calendar is pretty full tomorrow!"
- "Nicholas is coming in an hour - need me to prepare anything?"

## Important Rules
- NEVER use formatting symbols (*, -, #, etc.)
- Keep responses under 3 sentences when possible
- Talk like a person, not a computer
- Be helpful, not bossy
- Ask questions naturally ("Want me to...?" not "Would you like me to...?")

Current date: ${new Date().toISOString().split('T')[0]}
Current time: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', timeStyle: 'short' })}`;

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
          message: `Found ${existingPatients[0].name}'s record`,
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
        message: `Created new patient card for ${patient_name}`,
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
        message: `Booked ${patient_name} in for ${date} at ${time}`,
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
        message: `Logged ${patient_name}'s ${treatment_name} - £${price} (${payment_status})`,
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
        discountMsg = ` with ${discount_percentage}% off`;
      } else if (discount_amount) {
        discountMsg = ` with £${discount_amount} off`;
      }

      return {
        success: true,
        invoice,
        message: `Created invoice for ${patient_name} - £${finalAmount.toFixed(2)}${discountMsg}`,
      };
    }

    case 'get_today_summary': {
      // Get today's date in UK timezone
      const ukDate = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'short' });
      const [day, month, year] = ukDate.split('/');
      const today = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      console.log('[AGENT] Checking data for date:', today);

      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', today)
        .order('time', { ascending: true });

      const { data: treatments } = await supabase
        .from('treatment_entries')
        .select('*')
        .eq('date', today)
        .order('created_at', { ascending: false });

      const revenue = treatments?.reduce((sum, t) => sum + (t.amount_paid || 0), 0) || 0;
      const pending = treatments?.filter((t) => t.payment_status === 'pending').length || 0;

      // Build conversational summary (no markdown - will be spoken)
      let detailsMsg = '';

      // Check if completely empty day
      const hasAppointments = appointments && appointments.length > 0;
      const hasTreatments = treatments && treatments.length > 0;

      if (!hasAppointments && !hasTreatments) {
        detailsMsg = `Nothing in the diary today! All clear. Revenue is £0 and no pending payments.`;
      } else {
        // Has some activity - describe naturally
        if (hasAppointments) {
          if (appointments.length === 1) {
            const apt = appointments[0];
            detailsMsg += `You've got ${apt.patient_name} at ${apt.time} for ${apt.treatment_name}. `;
          } else {
            detailsMsg += `You have ${appointments.length} appointments today: `;
            appointments.forEach((apt, idx) => {
              if (idx > 0) detailsMsg += ', ';
              detailsMsg += `${apt.patient_name} at ${apt.time}`;
            });
            detailsMsg += '. ';
          }
        } else {
          detailsMsg += `No appointments scheduled today. `;
        }

        if (hasTreatments) {
          if (treatments.length === 1) {
            const tx = treatments[0];
            detailsMsg += `${tx.patient_name}'s ${tx.treatment_name} is done (£${tx.price_paid}, ${tx.payment_status}). `;
          } else {
            detailsMsg += `${treatments.length} treatments completed so far. `;
          }
        } else {
          detailsMsg += `No treatments done yet. `;
        }

        if (revenue > 0) {
          detailsMsg += `Made £${revenue.toFixed(0)} today. `;
        }

        if (pending > 0) {
          detailsMsg += `${pending} payment${pending > 1 ? 's' : ''} still pending.`;
        }
      }

      return {
        success: true,
        summary: {
          date: today,
          appointments: appointments || [],
          treatments: treatments || [],
          revenue,
          pending_payments: pending,
        },
        message: detailsMsg.trim(),
      };
    }

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

/**
 * Load conversation history from database
 */
async function loadConversationHistory(sessionId: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: history, error } = await supabase
    .from('agent_conversations')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(20); // Last 20 messages

  if (error) {
    console.error('[AGENT] Error loading history:', error);
    return [];
  }

  // Convert to OpenAI message format
  const messages: any[] = [];
  for (const msg of history || []) {
    if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    } else if (msg.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        name: msg.tool_name,
        content: msg.content,
      });
    }
  }

  return messages;
}

/**
 * Save message to conversation history
 */
async function saveMessage(sessionId: string, role: string, content: string, toolCalls?: any, toolCallId?: string, toolName?: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  await supabase.from('agent_conversations').insert({
    session_id: sessionId,
    role,
    content,
    tool_calls: toolCalls || null,
    tool_call_id: toolCallId || null,
    tool_name: toolName || null,
  });
}

/**
 * AGENT EXECUTION with OpenAI Function Calling
 */
async function runAgent(userInput: string, sessionId: string) {
  // Load conversation history
  const history = await loadConversationHistory(sessionId);

  // Start with system prompt + history + new user message
  const messages: any[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userInput },
  ];

  // Save user message
  await saveMessage(sessionId, 'user', userInput);

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
      // Save assistant's final response
      await saveMessage(sessionId, 'assistant', message.content);

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
    const { input, session_id } = await req.json();

    if (!input) {
      throw new Error('No input provided');
    }

    // Generate session ID if not provided
    const sessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('[AGENT] Processing:', input, 'Session:', sessionId);

    // Run the agent
    const result = await runAgent(input, sessionId);

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
