/**
 * ENTERPRISE AGENT API
 *
 * Supports two modes:
 * 1. Planning mode: Parse voice command → Show confirmation dialog → Execute plan
 * 2. Direct mode: Execute immediately (Phase 3 agent-executor-v3)
 */

import { supabase } from '@/config/supabase';

/**
 * Execute a command with the AI agent and stream the response
 *
 * @param {string} input - User's voice command or text input
 * @param {Object} options - Configuration options
 * @param {Function} options.onToken - Callback for streaming tokens (optional)
 * @param {Function} options.onToolUse - Callback when agent uses a tool
 * @param {Function} options.onComplete - Callback when agent finishes
 * @param {Function} options.onError - Callback on error
 * @param {string} options.sessionId - Session ID for conversation memory (future)
 * @returns {Promise<Object>} Final agent response
 */
export async function executeAgentCommand(input, options = {}) {
  const {
    onToken = null,
    onToolUse = null,
    onComplete = null,
    onError = null,
    sessionId = null,
  } = options;

  console.log('[AGENT API] Executing command:', input);

  try {
    // Get current user for user_id
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // Call the agent-executor-v3 edge function (Phase 3: Simple GPT-4o Agent)
    const { data, error } = await supabase.functions.invoke('agent-executor-v3', {
      body: {
        input: input,
        user_id: userId,
      },
    });

    if (error) {
      console.error('[AGENT API] Error:', error);
      if (onError) {
        onError(error);
      }
      throw error;
    }

    console.log('[AGENT API] Response:', data);

    // Handle the response
    if (data.type === 'complete') {
      const result = {
        success: true,
        output: data.output,
        intermediate_steps: data.intermediate_steps || [],
      };

      if (onComplete) {
        onComplete(result);
      }

      return result;
    } else if (data.type === 'error') {
      throw new Error(data.error);
    }

    return {
      success: false,
      output: 'Unexpected response format',
    };

  } catch (error) {
    console.error('[AGENT API] Execution error:', error);

    if (onError) {
      onError(error);
    }

    return {
      success: false,
      error: error.message,
      output: `Failed to execute command: ${error.message}`,
    };
  }
}

/**
 * Execute a command with streaming response via EventSource (for future use)
 * Note: Currently Supabase Functions don't support SSE streaming well,
 * so we're using the invoke method above. This is prepared for future upgrade.
 */
export async function executeAgentCommandStreaming(input, options = {}) {
  const {
    onToken = null,
    onToolUse = null,
    onComplete = null,
    onError = null,
    sessionId = null,
  } = options;

  console.log('[AGENT API] Executing command with streaming:', input);

  // For now, fall back to non-streaming
  // TODO: Implement proper SSE streaming when Supabase supports it better
  return executeAgentCommand(input, options);
}

/**
 * Parse the agent's response to extract structured information
 *
 * @param {Object} agentResponse - Response from agent
 * @returns {Object} Parsed workflow information
 */
export function parseAgentResponse(agentResponse) {
  if (!agentResponse.success) {
    return {
      success: false,
      message: agentResponse.output || agentResponse.error,
      steps: [],
    };
  }

  // Extract tool uses from intermediate steps
  const steps = (agentResponse.intermediate_steps || []).map((step, idx) => {
    if (step.action) {
      return {
        step_number: idx + 1,
        tool: step.action.tool,
        input: step.action.toolInput,
        output: step.observation,
        status: 'completed',
      };
    }
    return null;
  }).filter(Boolean);

  return {
    success: true,
    message: agentResponse.output,
    steps: steps,
    total_steps: steps.length,
  };
}

/**
 * PLANNING MODE: Create execution plan for user confirmation
 *
 * @param {string} input - User's voice command or text input
 * @returns {Promise<Object>} Execution plan with actions array
 */
export async function planAgentCommand(input) {
  console.log('[AGENT API] Planning command:', input);

  try {
    // Get current user for user_id
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[AGENT API] User not authenticated:', userError);
      return {
        success: false,
        error: 'You must be logged in to use voice commands',
        plan: null,
      };
    }

    const userId = user.id;

    console.log('[AGENT API] User authenticated:', userId);

    // Call the agent-planner edge function
    const { data, error } = await supabase.functions.invoke('agent-planner', {
      body: {
        input: input,
        user_id: userId,
      },
    });

    if (error) {
      console.error('[AGENT API] Planning error from edge function:', error);
      return {
        success: false,
        error: error.message || JSON.stringify(error),
        plan: null,
      };
    }

    console.log('[AGENT API] Plan created:', data.plan?.summary);
    console.log('[AGENT API] Full response:', data);

    // Check if response has the expected structure
    if (!data || !data.plan) {
      console.error('[AGENT API] Invalid response structure:', data);
      return {
        success: false,
        error: 'Invalid response from planner',
        plan: null,
      };
    }

    return {
      success: true,
      plan: data.plan,
    };

  } catch (error) {
    console.error('[AGENT API] Planning exception:', error);
    return {
      success: false,
      error: error.message || String(error),
      plan: null,
    };
  }
}

/**
 * Execute a confirmed plan
 *
 * @param {Object} plan - Execution plan from planAgentCommand
 * @returns {Promise<Object>} Execution results
 */
export async function executeConfirmedPlan(plan) {
  console.log('[AGENT API] Executing confirmed plan:', plan.summary);

  try {
    // Get current user for user_id
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // Call the agent-executor-confirmed edge function
    const { data, error } = await supabase.functions.invoke('agent-executor-confirmed', {
      body: {
        plan: plan,
        user_id: userId,
      },
    });

    if (error) {
      console.error('[AGENT API] Execution error:', error);
      throw error;
    }

    console.log('[AGENT API] Execution complete:', data.summary);

    return {
      success: data.success,
      summary: data.summary,
      results: data.results,
      output: data.output,
    };

  } catch (error) {
    console.error('[AGENT API] Execution error:', error);
    return {
      success: false,
      error: error.message,
      output: `Failed to execute plan: ${error.message}`,
    };
  }
}

/**
 * Get agent capabilities (list of available tools)
 * This helps the UI show what the agent can do
 */
export function getAgentCapabilities() {
  return [
    {
      category: 'Patient Management',
      tools: [
        { name: 'Find or Create Patient', description: 'Search for existing patients or create new patient records' },
      ],
    },
    {
      category: 'Appointments',
      tools: [
        { name: 'Book Appointment', description: 'Schedule consultations, treatments, and follow-ups' },
      ],
    },
    {
      category: 'Treatments',
      tools: [
        { name: 'Record Treatment', description: 'Log completed treatments with payment information' },
      ],
    },
    {
      category: 'Billing',
      tools: [
        { name: 'Create Invoice', description: 'Generate invoices with optional discounts' },
        { name: 'Send Invoice', description: 'Send invoices to patients via SMS or email' },
      ],
    },
    {
      category: 'Expenses',
      tools: [
        { name: 'Record Expense', description: 'Log business expenses across multiple categories' },
      ],
    },
    {
      category: 'Insights',
      tools: [
        { name: 'Today\'s Summary', description: 'Get overview of appointments, treatments, and revenue' },
      ],
    },
  ];
}

export default {
  executeAgentCommand,
  executeAgentCommandStreaming,
  planAgentCommand,
  executeConfirmedPlan,
  parseAgentResponse,
  getAgentCapabilities,
};
