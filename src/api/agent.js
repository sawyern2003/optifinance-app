/**
 * ENTERPRISE AGENT API
 *
 * Handles communication with the LangChain-powered agent executor.
 * Supports streaming responses via Server-Sent Events.
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
    // Call the agent-executor edge function
    const { data, error } = await supabase.functions.invoke('agent-executor', {
      body: {
        input: input,
        session_id: sessionId,
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
  parseAgentResponse,
  getAgentCapabilities,
};
