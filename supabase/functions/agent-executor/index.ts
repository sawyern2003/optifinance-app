/**
 * ENTERPRISE AGENT EXECUTOR - Phase 1
 *
 * Revolutionary AI agent system using:
 * - LangChain for agent orchestration
 * - OpenAI GPT-4o with function calling
 * - Streaming responses via Server-Sent Events
 * - Multi-tool execution with proper error handling
 *
 * This replaces the basic clinic-llm function with an enterprise-grade
 * agent that can think, plan, and execute complex multi-step workflows.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ChatOpenAI } from 'https://esm.sh/langchain@0.1.30/chat_models/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'https://esm.sh/langchain@0.1.30/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from 'https://esm.sh/langchain@0.1.30/prompts';
import { DynamicStructuredTool } from 'https://esm.sh/langchain@0.1.30/tools';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

/**
 * CLINIC OPERATION TOOLS
 * These are the tools the agent can use to interact with the clinic system
 */

// Tool: Create or find patient
const createOrFindPatientTool = new DynamicStructuredTool({
  name: 'create_or_find_patient',
  description: 'Find an existing patient by name or create a new patient record. Use this whenever you need to work with a patient.',
  schema: z.object({
    patient_name: z.string().describe('The full name of the patient'),
    email: z.string().optional().describe('Patient email address'),
    contact: z.string().optional().describe('Patient phone number'),
  }),
  func: async ({ patient_name, email, contact }) => {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // First, try to find existing patient
      const { data: existingPatients } = await supabase
        .from('patients')
        .select('*')
        .ilike('name', `%${patient_name}%`);

      if (existingPatients && existingPatients.length > 0) {
        return JSON.stringify({
          success: true,
          found: true,
          patient: existingPatients[0],
          message: `Found existing patient: ${existingPatients[0].name}`
        });
      }

      // Create new patient
      const { data: newPatient, error } = await supabase
        .from('patients')
        .insert({
          name: patient_name,
          email: email || '',
          contact: contact || '',
          date_added: new Date().toISOString().split('T')[0],
          notes: 'Created by AI agent'
        })
        .select()
        .single();

      if (error) throw error;

      return JSON.stringify({
        success: true,
        found: false,
        patient: newPatient,
        message: `Created new patient: ${patient_name}`
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  },
});

// Tool: Book appointment
const bookAppointmentTool = new DynamicStructuredTool({
  name: 'book_appointment',
  description: 'Book an appointment for a patient. Use this to schedule consultations, treatments, or follow-ups.',
  schema: z.object({
    patient_id: z.number().describe('The patient ID from the patient record'),
    patient_name: z.string().describe('Patient full name'),
    treatment_name: z.string().describe('Type of appointment (e.g., Consultation, Botox, Filler)'),
    date: z.string().describe('Appointment date in YYYY-MM-DD format'),
    time: z.string().describe('Appointment time in HH:mm format (24-hour)'),
  }),
  func: async ({ patient_id, patient_name, treatment_name, date, time }) => {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: appointment, error } = await supabase
        .from('appointments')
        .insert({
          patient_id,
          patient_name,
          treatment_name,
          date,
          time,
          status: 'scheduled',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return JSON.stringify({
        success: true,
        appointment,
        message: `Appointment booked for ${patient_name} on ${date} at ${time}`
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  },
});

// Tool: Add treatment record
const addTreatmentTool = new DynamicStructuredTool({
  name: 'add_treatment',
  description: 'Record a completed treatment. Use this when a patient has received a treatment.',
  schema: z.object({
    patient_id: z.number().optional().describe('Patient ID if known'),
    patient_name: z.string().describe('Patient full name'),
    treatment_name: z.string().describe('Treatment type (e.g., Botox, Filler, Consultation)'),
    price: z.number().describe('Treatment price in GBP'),
    payment_status: z.enum(['paid', 'pending', 'partially_paid']).describe('Payment status'),
    amount_paid: z.number().optional().describe('Amount paid if partially paid'),
    date: z.string().optional().describe('Treatment date (YYYY-MM-DD), defaults to today'),
  }),
  func: async ({ patient_id, patient_name, treatment_name, price, payment_status, amount_paid, date }) => {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const treatmentDate = date || new Date().toISOString().split('T')[0];
      const paidAmount = payment_status === 'paid' ? price : (amount_paid || 0);

      const { data: treatment, error } = await supabase
        .from('treatment_entries')
        .insert({
          patient_id: patient_id || null,
          patient_name,
          treatment_name,
          price_paid: price,
          payment_status,
          amount_paid: paidAmount,
          date: treatmentDate,
          product_cost: 0,
          profit: paidAmount,
        })
        .select()
        .single();

      if (error) throw error;

      return JSON.stringify({
        success: true,
        treatment,
        message: `Treatment recorded: ${treatment_name} for ${patient_name} - £${price} (${payment_status})`
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  },
});

// Tool: Create invoice
const createInvoiceTool = new DynamicStructuredTool({
  name: 'create_invoice',
  description: 'Generate an invoice for a patient. Can apply discounts. Use this when patient needs to be billed.',
  schema: z.object({
    patient_name: z.string().describe('Patient full name'),
    treatment_name: z.string().describe('Treatment or service name'),
    amount: z.number().describe('Invoice amount in GBP'),
    discount_percentage: z.number().optional().describe('Discount percentage (0-100)'),
    discount_amount: z.number().optional().describe('Fixed discount amount in GBP'),
  }),
  func: async ({ patient_name, treatment_name, amount, discount_percentage, discount_amount }) => {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Calculate final amount with discount
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

      const patient = patients?.[0];
      if (!patient) {
        throw new Error(`Patient ${patient_name} not found`);
      }

      // Find recent treatment
      const { data: treatments } = await supabase
        .from('treatment_entries')
        .select('*')
        .eq('patient_name', patient.name)
        .order('date', { ascending: false })
        .limit(1);

      const invoiceNumber = `INV-${Date.now()}`;

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          patient_name: patient.name,
          patient_contact: patient.contact || patient.email || '',
          treatment_name,
          treatment_date: treatments?.[0]?.date || new Date().toISOString().split('T')[0],
          amount: finalAmount,
          issue_date: new Date().toISOString().split('T')[0],
          status: 'draft',
          treatment_entry_id: treatments?.[0]?.id || null,
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

      return JSON.stringify({
        success: true,
        invoice,
        message: `Invoice ${invoiceNumber} created for ${patient_name} - £${finalAmount.toFixed(2)}${discountMsg}`
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  },
});

// Tool: Send invoice
const sendInvoiceTool = new DynamicStructuredTool({
  name: 'send_invoice',
  description: 'Send an invoice to a patient via SMS or email. Use this after creating an invoice.',
  schema: z.object({
    invoice_id: z.number().optional().describe('Specific invoice ID to send'),
    patient_name: z.string().describe('Patient name to find their latest invoice'),
  }),
  func: async ({ invoice_id, patient_name }) => {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      let invoice;

      if (invoice_id) {
        const { data } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoice_id)
          .single();
        invoice = data;
      } else {
        const { data } = await supabase
          .from('invoices')
          .select('*')
          .ilike('patient_name', `%${patient_name}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        invoice = data;
      }

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Call send-invoice function
      const { data: sendResult, error: sendError } = await supabase.functions.invoke('send-invoice', {
        body: { invoiceId: invoice.id }
      });

      if (sendError) throw sendError;

      return JSON.stringify({
        success: true,
        invoice,
        message: `Invoice sent to ${invoice.patient_name} via ${invoice.patient_contact.includes('@') ? 'email' : 'SMS'}`
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  },
});

// Tool: Add expense
const addExpenseTool = new DynamicStructuredTool({
  name: 'add_expense',
  description: 'Record a business expense. Use this when clinic has spent money on products, rent, wages, etc.',
  schema: z.object({
    amount: z.number().describe('Expense amount in GBP'),
    category: z.enum(['Rent', 'Products', 'Wages', 'Insurance', 'Marketing', 'Utilities', 'Equipment', 'Other']).describe('Expense category'),
    description: z.string().optional().describe('Expense description'),
    date: z.string().optional().describe('Expense date (YYYY-MM-DD), defaults to today'),
  }),
  func: async ({ amount, category, description, date }) => {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const expenseDate = date || new Date().toISOString().split('T')[0];

      const { data: expense, error } = await supabase
        .from('expenses')
        .insert({
          amount: Math.abs(amount),
          category,
          description: description || `${category} expense`,
          date: expenseDate,
          notes: description || null,
        })
        .select()
        .single();

      if (error) throw error;

      return JSON.stringify({
        success: true,
        expense,
        message: `Expense recorded: £${amount} for ${category}${description ? ` - ${description}` : ''}`
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  },
});

// Tool: Get today's summary
const getTodaySummaryTool = new DynamicStructuredTool({
  name: 'get_today_summary',
  description: 'Get summary of today\'s activity including appointments, treatments, and revenue. Use this when user asks about today.',
  schema: z.object({}),
  func: async () => {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const today = new Date().toISOString().split('T')[0];

      // Get appointments
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', today);

      // Get treatments
      const { data: treatments } = await supabase
        .from('treatment_entries')
        .select('*')
        .eq('date', today);

      const revenue = treatments?.reduce((sum, t) => sum + (t.amount_paid || 0), 0) || 0;
      const pending = treatments?.filter(t => t.payment_status === 'pending').length || 0;

      return JSON.stringify({
        success: true,
        summary: {
          appointments: appointments?.length || 0,
          treatments: treatments?.length || 0,
          revenue: revenue,
          pending_payments: pending,
        },
        message: `Today: ${appointments?.length || 0} appointments, ${treatments?.length || 0} treatments, £${revenue} revenue, ${pending} pending payments`
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message
      });
    }
  },
});

/**
 * AGENT SYSTEM PROMPT
 */
const AGENT_SYSTEM_PROMPT = `You are an elite AI assistant for OptiFinance, a revolutionary clinic management system. You are not just a voice assistant - you are a proactive, intelligent agent that helps clinic staff manage their entire practice.

## Your Capabilities
You can execute complex multi-step workflows by using your available tools. When a user gives you a command, think through ALL the steps needed and execute them systematically.

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
- "next Monday/Tuesday/etc" = calculate the next occurrence
- Default appointment time: 09:00 unless specified

## Time Interpretation
- "morning" = 09:00
- "afternoon" = 14:00
- "evening" = 17:00

## Proactive Behavior
After completing tasks, look for opportunities to help:
- "I've booked the appointment. Would you like me to send a confirmation SMS?"
- "I notice you have 3 unpaid invoices from last week. Should I send payment reminders?"
- "Your calendar is quite full tomorrow. Would you like me to prepare a summary?"

## Error Handling
If a step fails, explain clearly and suggest alternatives. Never give up - be resourceful.

## Communication Style
- Be concise but complete
- Speak in first person ("I've booked...", "I'll create...")
- Confirm each major action
- Summarize complex workflows at the end

Current date/time: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`;

/**
 * CREATE AGENT EXECUTOR
 */
async function createClinicAgent() {
  // Initialize ChatOpenAI model with streaming
  const model = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.1, // Low temperature for consistent, reliable behavior
    streaming: true,
    openAIApiKey: openaiApiKey,
  });

  // Define all available tools
  const tools = [
    createOrFindPatientTool,
    bookAppointmentTool,
    addTreatmentTool,
    createInvoiceTool,
    sendInvoiceTool,
    addExpenseTool,
    getTodaySummaryTool,
  ];

  // Create prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', AGENT_SYSTEM_PROMPT],
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  // Create agent
  const agent = await createOpenAIFunctionsAgent({
    llm: model,
    tools,
    prompt,
  });

  // Create executor
  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    maxIterations: 15, // Allow complex multi-step workflows
  });

  return executor;
}

/**
 * MAIN REQUEST HANDLER
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { input, session_id } = await req.json();

    if (!input) {
      throw new Error('No input provided');
    }

    console.log('[AGENT] Processing:', input);

    // Create agent executor
    const executor = await createClinicAgent();

    // Set up streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Execute agent with streaming
          const result = await executor.invoke({
            input: input,
          });

          // Stream the response
          const data = {
            type: 'complete',
            output: result.output,
            intermediate_steps: result.intermediateSteps || [],
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          controller.close();

          console.log('[AGENT] Success:', result.output);
        } catch (error) {
          console.error('[AGENT] Error:', error);

          const errorData = {
            type: 'error',
            error: error.message,
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[AGENT] Request error:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
