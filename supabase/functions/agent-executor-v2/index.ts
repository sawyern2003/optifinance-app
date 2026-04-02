/**
 * PHASE 2: AUTONOMOUS AGENT EXECUTOR
 *
 * Revolutionary AI agent using:
 * - Claude 3.5 Sonnet (superior reasoning for multi-step workflows)
 * - Agentic state machine (planning → execution → verification)
 * - Autonomous tool discovery and chaining
 * - Error recovery and retry logic
 * - No explicit prompting needed - agent reasons about what to do
 *
 * Architecture:
 * 1. PLANNING: Agent analyzes request and creates execution plan
 * 2. EXECUTION: Agent executes tools based on plan
 * 3. VERIFICATION: Agent checks if goal was achieved
 * 4. LOOP: If not complete, replan and continue
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
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!;

/**
 * Agent State Machine
 */
type AgentState = 'planning' | 'executing' | 'verifying' | 'complete' | 'failed';

interface AgentContext {
  state: AgentState;
  userRequest: string;
  userId: string;
  conversationHistory: any[];
  plan: string[];
  executedSteps: any[];
  currentStepIndex: number;
  maxIterations: number;
  iterations: number;
  finalResponse: string;
  error?: string;
}

/**
 * SYSTEM PROMPTS FOR EACH STATE
 */

const PLANNING_PROMPT = `You are an expert clinic management AI. Read the user's request carefully and create an execution plan using their EXACT details.

AVAILABLE TOOLS:
- create_or_find_patient: Search for or create patient records
- book_appointment: Schedule FUTURE appointments (use when patient is coming in)
- add_treatment: Record COMPLETED treatments (use when patient already had treatment)
- create_invoice: Generate invoices for treatments
- send_invoice: Send invoices via SMS/email
- add_expense: Record business expenses
- send_reminder: Send payment reminders
- update_patient: Update patient information
- get_today_summary: Get today's activity summary

WHEN TO USE WHAT:
- "Patient is coming tomorrow" → book_appointment
- "Patient had treatment yesterday" → add_treatment (NOT book_appointment)
- "Invoice for consultation he had" → add_treatment first, then create_invoice

CRITICAL RULES:
1. Extract ALL information from the USER'S ACTUAL REQUEST only
2. Use the exact patient names, dates, and amounts from the request
3. ALWAYS search for patients FIRST before doing anything else
4. Use patient_id from search results in subsequent operations
5. Chain operations logically (find patient → book/treatment → invoice → send)

EXTRACTION RULES:
- Extract patient name exactly as mentioned in request
- Convert date references to YYYY-MM-DD format
- Convert times to HH:mm 24-hour format
- Extract amounts as numbers
- Extract treatment types exactly as stated

OUTPUT FORMAT:
Return ONLY a valid JSON array:
[
  {
    "tool": "function_name",
    "reasoning": "brief explanation",
    "args": {extracted parameters from request}
  }
]

SPECIAL PLACEHOLDERS:
- [FROM_STEP_1] = use result from step 1 (patient_id)
- [TOMORROW] = tomorrow's date
- [YESTERDAY] = yesterday's date
- [TODAY] = today's date

Read the user request and create the plan:`;

const VERIFICATION_PROMPT = `You are verifying if an agent successfully completed the user's request.

USER REQUEST: {request}

STEPS EXECUTED: {steps}

RESULTS: {results}

Analyze if the request was fully completed. Return JSON:
{
  "completed": true/false,
  "missing": ["what's still needed"],
  "nextAction": "what to do next" or null if complete,
  "responseToUser": "conversational summary for user"
}

Be conversational and concise in responseToUser (will be spoken aloud - no markdown).`;

/**
 * TOOL DEFINITIONS - Same as Phase 1
 */
const tools = [
  {
    name: 'create_or_find_patient',
    description: 'Search for existing patient or create new one. Returns patient_id, email, phone.',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string', description: 'Patient full name' },
        email: { type: 'string', description: 'Email (optional, only if creating new)' },
        contact: { type: 'string', description: 'Phone (optional, only if creating new)' }
      },
      required: ['patient_name']
    }
  },
  {
    name: 'book_appointment',
    description: 'Book appointment in calendar',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'number' },
        patient_name: { type: 'string' },
        treatment_name: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:mm in 24-hour format' }
      },
      required: ['patient_id', 'patient_name', 'treatment_name', 'date', 'time']
    }
  },
  {
    name: 'add_treatment',
    description: 'Record completed treatment',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string' },
        treatment_name: { type: 'string' },
        price: { type: 'number' },
        payment_status: { type: 'string', enum: ['paid', 'pending', 'partially_paid'] },
        amount_paid: { type: 'number', description: 'Amount paid if partially paid' }
      },
      required: ['patient_name', 'treatment_name', 'price', 'payment_status']
    }
  },
  {
    name: 'create_invoice',
    description: 'Generate invoice',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string' },
        treatment_name: { type: 'string' },
        amount: { type: 'number' },
        discount_percentage: { type: 'number' },
        discount_amount: { type: 'number' }
      },
      required: ['patient_name', 'treatment_name', 'amount']
    }
  },
  {
    name: 'send_invoice',
    description: 'Send invoice via SMS/email',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string' },
        invoice_id: { type: 'number' }
      },
      required: ['patient_name']
    }
  },
  {
    name: 'add_expense',
    description: 'Record business expense',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        category: { type: 'string', enum: ['Rent', 'Products', 'Wages', 'Insurance', 'Marketing', 'Utilities', 'Equipment', 'Other'] },
        description: { type: 'string' }
      },
      required: ['amount', 'category']
    }
  },
  {
    name: 'send_reminder',
    description: 'Send payment reminder',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string' }
      },
      required: ['patient_name']
    }
  },
  {
    name: 'update_patient',
    description: 'Update patient information',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string' },
        email: { type: 'string' },
        contact: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['patient_name']
    }
  },
  {
    name: 'get_today_summary',
    description: 'Get today\'s appointments, treatments, and revenue',
    input_schema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * TOOL EXECUTION - Reuse Phase 1 implementations
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
          message: `Found ${existingPatients[0].name}'s record`,
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
        message: `Created new patient card for ${patient_name}`,
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
            notes: 'Auto-created from treatment entry',
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
        message: `Logged ${patient_name}'s ${treatment_name} - £${price} (${payment_status})`,
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
        const { error: pdfError } = await supabase.functions.invoke('generate-invoice-pdf', {
          body: { invoiceId: invoice.id }
        });

        if (pdfError) {
          throw new Error(`Failed to generate PDF: ${pdfError.message}`);
        }
      }

      const { error: sendError } = await supabase.functions.invoke('send-invoice', {
        body: {
          invoiceId: invoice.id,
          sendVia: 'both'
        }
      });

      if (sendError) {
        throw new Error(`Failed to send invoice: ${sendError.message}`);
      }

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
        message: `Logged £${amount} expense for ${category}`,
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

      const invoice = invoices[0];

      await supabase.functions.invoke('send-payment-reminder', {
        body: { invoiceId: invoice.id, urgent: false }
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

      const patient = patients[0];

      const updates: any = {};
      if (email !== undefined) updates.email = email;
      if (contact !== undefined) updates.contact = contact;
      if (notes !== undefined) updates.notes = notes;

      const { data: updated, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', patient.id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        patient: updated,
        message: `Updated ${patient_name}'s info`,
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

      return {
        success: true,
        summary: {
          date: today,
          appointments: appointments || [],
          treatments: treatments || [],
          revenue,
        },
        message: `Today: ${appointments?.length || 0} appointments, ${treatments?.length || 0} treatments, £${revenue} revenue`,
      };
    }

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

/**
 * Call Claude 3.5 Sonnet API
 */
async function callClaude(messages: any[], systemPrompt: string, useTools: boolean = false): Promise<any> {
  const body: any = {
    model: 'claude-3-haiku-20240307',  // Using Haiku (only model available with current API key)
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages,
  };

  if (useTools) {
    body.tools = tools;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  return await response.json();
}

/**
 * AGENTIC STATE MACHINE
 */

// 1. PLANNING STATE
async function planningState(context: AgentContext): Promise<AgentContext> {
  console.log('[AGENT] STATE: Planning');

  const messages = [
    {
      role: 'user',
      content: PLANNING_PROMPT + `\n\n====================\nUSER REQUEST TO ANALYZE:\n"${context.userRequest}"\n====================\n\nCreate a plan using the EXACT patient names, dates, and amounts from the user request above.`
    }
  ];

  const response = await callClaude(messages, 'You are a planning expert. Read the user request carefully and extract all information from it.', false);

  const planText = response.content[0].text;

  // Extract JSON plan
  const jsonMatch = planText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    context.state = 'failed';
    context.error = 'Failed to create execution plan';
    return context;
  }

  const plan = JSON.parse(jsonMatch[0]);
  context.plan = plan;
  context.state = 'executing';
  context.currentStepIndex = 0;

  console.log('[AGENT] Plan created:', plan.length, 'steps');

  return context;
}

// 2. EXECUTION STATE
async function executionState(context: AgentContext): Promise<AgentContext> {
  console.log('[AGENT] STATE: Executing all steps');

  // Execute ALL steps in the plan before moving to verification
  while (context.currentStepIndex < context.plan.length) {
    const step = context.plan[context.currentStepIndex];

    console.log(`[AGENT] Executing step ${context.currentStepIndex + 1}/${context.plan.length}: ${step.tool}`);

    try {
      // Resolve dynamic args (like [FROM_STEP_1], [TOMORROW])
      const resolvedArgs = resolveArgs(step.args, context);

      console.log('[AGENT] Args:', JSON.stringify(resolvedArgs));

      const result = await executeFunction(step.tool, resolvedArgs, context.userId);

      context.executedSteps.push({
        step: context.currentStepIndex + 1,
        tool: step.tool,
        args: resolvedArgs,
        result: result,
        success: true
      });

      console.log('[AGENT] Step succeeded:', result.message);

    } catch (error: any) {
      console.error('[AGENT] Step failed:', error.message);

      context.executedSteps.push({
        step: context.currentStepIndex + 1,
        tool: step.tool,
        error: error.message,
        success: false
      });
    }

    context.currentStepIndex++;
  }

  // All steps executed, move to verification
  context.state = 'verifying';
  return context;
}

// 3. VERIFICATION STATE
async function verificationState(context: AgentContext): Promise<AgentContext> {
  console.log('[AGENT] STATE: Verifying completion');

  // Simple verification: if all steps executed successfully, we're done
  const allSuccessful = context.executedSteps.every(step => step.success);
  const hasFailures = context.executedSteps.some(step => !step.success);

  if (allSuccessful && context.executedSteps.length > 0) {
    // All steps succeeded - we're done
    const successMessages = context.executedSteps.map(s => s.result?.message).filter(Boolean);
    context.state = 'complete';
    context.finalResponse = `Done! ${successMessages.join('. ')}`;
    return context;
  }

  if (hasFailures && context.iterations >= context.maxIterations) {
    // Had failures and out of iterations
    context.state = 'complete';
    const failures = context.executedSteps.filter(s => !s.success);
    context.finalResponse = `I completed some steps but had issues with: ${failures.map(f => f.tool).join(', ')}. ${failures[0]?.error || ''}`;
    return context;
  }

  // If we have failures and iterations left, try verification with Claude
  const messages = [
    {
      role: 'user',
      content: VERIFICATION_PROMPT
        .replace('{request}', context.userRequest)
        .replace('{steps}', JSON.stringify(context.plan, null, 2))
        .replace('{results}', JSON.stringify(context.executedSteps, null, 2))
    }
  ];

  const response = await callClaude(messages, 'You are a verification expert.', false);
  const verificationText = response.content[0].text;

  // Extract JSON
  const jsonMatch = verificationText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    context.state = 'complete';
    context.finalResponse = 'Done!';
    return context;
  }

  const verification = JSON.parse(jsonMatch[0]);

  if (verification.completed) {
    context.state = 'complete';
    context.finalResponse = verification.responseToUser;
  } else {
    // Need more steps - replan
    context.userRequest = verification.nextAction;
    context.state = 'planning';
    context.iterations++;

    if (context.iterations >= context.maxIterations) {
      context.state = 'complete';
      context.finalResponse = verification.responseToUser + ' (Some steps may be pending)';
    }
  }

  return context;
}

// Helper: Resolve dynamic arguments
function resolveArgs(args: any, context: AgentContext): any {
  const resolved: any = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      // Resolve [FROM_STEP_X]
      const stepMatch = (value as string).match(/\[FROM_STEP_(\d+)\]/);
      if (stepMatch) {
        const stepIndex = parseInt(stepMatch[1]) - 1;
        if (context.executedSteps[stepIndex]?.result?.patient) {
          resolved[key] = context.executedSteps[stepIndex].result.patient.id;
        } else {
          resolved[key] = value; // Keep original if can't resolve
        }
        continue;
      }

      // Resolve [TOMORROW]
      if ((value as string).includes('[TOMORROW]')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        resolved[key] = tomorrow.toISOString().split('T')[0];
        continue;
      }

      // Resolve [TODAY]
      if ((value as string).includes('[TODAY]')) {
        resolved[key] = new Date().toISOString().split('T')[0];
        continue;
      }

      // Resolve [YESTERDAY]
      if ((value as string).includes('[YESTERDAY]')) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        resolved[key] = yesterday.toISOString().split('T')[0];
        continue;
      }
    }

    resolved[key] = value;
  }

  return resolved;
}

/**
 * MAIN AGENT LOOP
 */
async function runAgentLoop(userInput: string, userId: string, sessionId: string): Promise<string> {
  let context: AgentContext = {
    state: 'planning',
    userRequest: userInput,
    userId: userId,
    conversationHistory: [],
    plan: [],
    executedSteps: [],
    currentStepIndex: 0,
    maxIterations: 5,  // Increased for complex workflows
    iterations: 0,
    finalResponse: '',
  };

  let loopCount = 0;
  const maxLoops = 20;

  while (context.state !== 'complete' && context.state !== 'failed' && loopCount < maxLoops) {
    loopCount++;
    console.log(`[AGENT LOOP ${loopCount}] State: ${context.state}, Iteration: ${context.iterations}`);

    switch (context.state) {
      case 'planning':
        context = await planningState(context);
        console.log(`[AGENT LOOP ${loopCount}] Planned ${context.plan.length} steps`);
        break;
      case 'executing':
        context = await executionState(context);
        console.log(`[AGENT LOOP ${loopCount}] Executed step ${context.currentStepIndex}/${context.plan.length}`);
        break;
      case 'verifying':
        context = await verificationState(context);
        console.log(`[AGENT LOOP ${loopCount}] Verification result: ${context.state}`);
        break;
    }
  }

  if (context.state === 'failed') {
    return `Sorry, I ran into an issue: ${context.error}`;
  }

  if (loopCount >= maxLoops) {
    return `I made progress but reached my iteration limit. ${context.finalResponse}`;
  }

  return context.finalResponse || 'Done!';
}

/**
 * HTTP REQUEST HANDLER
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { input, session_id, user_id } = await req.json();

    if (!input) {
      throw new Error('No input provided');
    }

    if (!user_id) {
      throw new Error('user_id is required');
    }

    const sessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('[AGENT V2] Processing:', input, 'Session:', sessionId, 'User:', user_id);

    const result = await runAgentLoop(input, user_id, sessionId);

    console.log('[AGENT V2] Success:', result);

    return new Response(
      JSON.stringify({
        type: 'complete',
        output: result,
        success: true,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[AGENT V2] Error:', error);

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
