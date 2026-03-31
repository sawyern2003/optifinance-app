import { api } from '@/api/api';
import { invoicesAPI } from '@/api/invoices';
import { supabase } from '@/config/supabase';

/**
 * Parse voice command as a WORKFLOW (multi-step) - detects when multiple operations are needed
 */
export async function parseVoiceWorkflow(transcript) {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Call clinic-llm to break down the command into a workflow
    const { data, error } = await supabase.functions.invoke('clinic-llm', {
      body: {
        task: 'voice_command',
        transcript,
        prompt: `You are a workflow analyzer for a clinic management system. Analyze voice commands and detect if they require MULTIPLE steps to complete. If they do, return a workflow with all necessary steps. If it's a simple single-action command, return a single-step workflow.

CRITICAL: Analyze the INTENT behind the command. If the user mentions multiple operations or implies a complete workflow, break it down into steps.

Current date: ${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${todayStr})

User said: "${transcript}"

WORKFLOW DETECTION PATTERNS:

1. "Add [patient] to calendar" + mentions invoice/discount/payment → MULTI-STEP:
   - Step 1: ensure_patient_exists (create if needed)
   - Step 2: book_appointment
   - Step 3: create_invoice (if mentioned)
   - Step 4: send_invoice (if mentioned)

2. "I saw [patient] for [treatment]" + mentions invoice → MULTI-STEP:
   - Step 1: ensure_patient_exists
   - Step 2: add_treatment
   - Step 3: create_invoice
   - Step 4: send_invoice

3. Simple commands → SINGLE-STEP:
   - "What's my schedule?" → show_schedule only
   - "Send invoice to John" → send_invoice only
   - "Go to calendar" → navigate only

DATE PARSING RULES:
- "today" → ${todayStr}
- "tomorrow" → ${new Date(today.getTime() + 86400000).toISOString().split('T')[0]}
- "Monday/Tuesday/etc" → calculate next occurrence
- "next week" → add 7 days
- If no date mentioned for appointments → default to ${todayStr}

TIME PARSING:
- "morning" → 09:00
- "afternoon" → 14:00
- "evening" → 17:00
- No time mentioned → 09:00

DISCOUNT EXTRACTION:
- "5% discount" → discount_percentage: 5
- "10% off" → discount_percentage: 10
- "£50 discount" → discount_amount: 50

Return JSON in this exact format:
{
  "is_workflow": boolean (true if multi-step, false if single action),
  "workflow_type": "patient_appointment_invoice" | "treatment_with_invoice" | "single_action",
  "steps": [
    {
      "step_number": 1,
      "action": "ensure_patient_exists" | "book_appointment" | "add_treatment" | "create_invoice" | "send_invoice" | "add_expense" | "navigate" | "answer_question",
      "description": "Human-readable description of this step",
      "data": {
        "patient_name": "string",
        "treatment_name": "string",
        "date": "YYYY-MM-DD",
        "time": "HH:mm",
        "price": number,
        "discount_percentage": number,
        "discount_amount": number,
        "payment_status": "paid" | "pending",
        ... other relevant fields
      }
    }
  ],
  "summary": "Overall description of what will happen (e.g., 'Create patient Nicholas, book appointment, generate and send invoice with 5% discount')",
  "confidence": number (0-1)
}

EXAMPLES:

User: "Add Nicholas Sawyer to the calendar for a consultation today with a 5% discount invoice"
→ {
  "is_workflow": true,
  "workflow_type": "patient_appointment_invoice",
  "steps": [
    {"step_number": 1, "action": "ensure_patient_exists", "description": "Check if Nicholas Sawyer exists, create patient card if needed", "data": {"patient_name": "Nicholas Sawyer"}},
    {"step_number": 2, "action": "book_appointment", "description": "Book consultation appointment for today", "data": {"patient_name": "Nicholas Sawyer", "treatment_name": "Consultation", "date": "${todayStr}", "time": "09:00"}},
    {"step_number": 3, "action": "create_invoice", "description": "Generate invoice with 5% discount", "data": {"patient_name": "Nicholas Sawyer", "treatment_name": "Consultation", "discount_percentage": 5}},
    {"step_number": 4, "action": "send_invoice", "description": "Send invoice to patient", "data": {"patient_name": "Nicholas Sawyer"}}
  ],
  "summary": "Create Nicholas Sawyer's patient card, book consultation for today, generate and send invoice with 5% discount",
  "confidence": 0.95
}

User: "What's my schedule today?"
→ {
  "is_workflow": false,
  "workflow_type": "single_action",
  "steps": [
    {"step_number": 1, "action": "show_schedule", "description": "Show today's schedule", "data": {}}
  ],
  "summary": "Show schedule",
  "confidence": 1.0
}

User: "I saw Sarah for Botox, £300, she paid in cash"
→ {
  "is_workflow": false,
  "workflow_type": "single_action",
  "steps": [
    {"step_number": 1, "action": "add_treatment", "description": "Record treatment for Sarah", "data": {"patient_name": "Sarah", "treatment_name": "Botox", "price": 300, "payment_status": "paid", "amount_paid": 300}}
  ],
  "summary": "Add Botox treatment for Sarah - £300 paid",
  "confidence": 0.95
}`,
      },
    });

    if (error) {
      console.error('Workflow parsing error:', error);
      throw error;
    }

    console.log('[WORKFLOW] Transcript:', transcript);
    console.log('[WORKFLOW] Parsed workflow:', data);

    return data;
  } catch (error) {
    console.error('Workflow parsing error:', error);
    return {
      is_workflow: false,
      workflow_type: 'single_action',
      steps: [{
        step_number: 1,
        action: 'unknown',
        description: 'Failed to understand command',
        data: {}
      }],
      summary: 'Failed to understand command',
      confidence: 0
    };
  }
}

/**
 * Parse voice command (without executing) - for confirmation dialogs
 * This is for backward compatibility and simple single-action commands
 */
export async function parseVoiceCommand(transcript) {
  try {
    // Use workflow parser and convert to single command format
    const workflow = await parseVoiceWorkflow(transcript);

    // If it's a multi-step workflow, return it as-is (marked as workflow)
    if (workflow.is_workflow && workflow.steps.length > 1) {
      return {
        action: 'workflow',
        workflow: workflow,
        message: workflow.summary,
        confidence: workflow.confidence
      };
    }

    // If single step, return as regular command
    const firstStep = workflow.steps[0];
    return {
      action: firstStep.action,
      ...firstStep.data,
      message: firstStep.description,
      confidence: workflow.confidence
    };

  } catch (error) {
    console.error('Voice command parsing error:', error);
    return {
      action: 'unknown',
      message: 'Failed to understand command',
      confidence: 0
    };
  }
}

/**
 * Parse and execute voice commands using GPT-4
 */
export async function parseAndExecuteVoiceCommand(transcript, context = {}) {
  try {
    // Call clinic-llm edge function directly with voice command parsing task
    const { data, error } = await supabase.functions.invoke('clinic-llm', {
      body: {
        task: 'voice_command',
        transcript,
        prompt: `You are a command parser for a clinic management system. Your job is to extract structured data from voice commands and return the appropriate action type.

CRITICAL RULES:
1. If the user wants to ADD/CREATE/SAVE data → use action type (add_treatment, add_expense, book_appointment, etc.) NOT answer_question
2. If the user wants to SEND something → use action type (send_invoice, send_reminder) NOT answer_question
3. ONLY use "answer_question" if they are asking a QUESTION without wanting to create/modify data
4. DO NOT say "I will do X" - just return the structured action
5. Extract ALL parameters from the user's speech

Current date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

User said: "${transcript}"

COMMANDS YOU MUST DETECT:

1. Add treatment: "Add [treatment] for [patient name] [price] [payment status]"
   → action: "add_treatment", extract: patient_name, treatment_name, price, payment_status

2. Book appointment: "Add [patient] to calendar" / "Book [patient] for [treatment]"
   → action: "book_appointment", extract: patient_name, treatment_name, date, time

3. Add expense: "I spent [amount] on [category]"
   → action: "add_expense", extract: expense_amount, expense_category, expense_description

4. Send invoice: "Send invoice to [patient name]" / "Generate invoice for [patient]"
   → action: "send_invoice", extract: patient_name

5. Send reminder: "Send payment reminder to [patient name]"
   → action: "send_reminder", extract: patient_name

6. Send review request: "Send review request to [patient name]"
   → action: "send_review_request", extract: patient_name

7. Mark as paid: "Mark invoice [number] as paid"
   → action: "mark_paid", extract: invoice_number or patient_name

8. Show schedule: "What's my schedule" / "Show me appointments"
   → action: "show_schedule"

9. Show patient: "Show me [patient name]"
   → action: "show_patient", extract: patient_name

10. Navigate: "Go to [page]" / "Open [page]"
    → action: "navigate", extract: page

ONLY use "answer_question" for actual questions:
- "What's the date?" → action: "answer_question"
- "Hello" / "How are you?" → action: "answer_question"
- "What can you do?" → action: "answer_question"

Return JSON ONLY in this exact format:
{
  "action": "add_treatment" | "add_expense" | "send_invoice" | "send_reminder" | "send_review_request" | "mark_paid" | "book_appointment" | "show_schedule" | "show_patient" | "navigate" | "answer_question" | "unknown",
  "patient_name": "string (if applicable)",
  "treatment_name": "string (for treatments/appointments, e.g. 'consultation', 'botox', 'filler')",
  "price": number (for add_treatment),
  "payment_status": "paid" | "pending" | "partially_paid",
  "amount_paid": number (optional),
  "expense_amount": number (for add_expense),
  "expense_category": "Rent" | "Products" | "Wages" | "Insurance" | "Marketing" | "Utilities" | "Equipment" | "Other" (for add_expense),
  "expense_description": "string (optional, for add_expense)",
  "expense_date": "YYYY-MM-DD (optional, defaults to today)",
  "invoice_number": "string (for mark_paid)",
  "date": "YYYY-MM-DD" (for appointments, defaults to today)",
  "time": "HH:mm" (for appointments)",
  "page": "string (for navigate: calendar, patients, records, settings)",
  "answer": "string (ONLY for answer_question - your friendly response)",
  "message": "string (short confirmation like 'Adding treatment for John' or 'Booking appointment')",
  "confidence": number (0-1)
}

EXAMPLES:
User: "Add Nicholas Sawyer to the calendar and create his patient card, generate invoice with 5% discount"
→ {"action": "book_appointment", "patient_name": "Nicholas Sawyer", "treatment_name": "consultation", "date": "${new Date().toISOString().split('T')[0]}", "message": "Booking appointment for Nicholas Sawyer", "confidence": 0.9}

User: "I saw Sarah for Botox today, £300, she paid"
→ {"action": "add_treatment", "patient_name": "Sarah", "treatment_name": "Botox", "price": 300, "payment_status": "paid", "message": "Adding treatment for Sarah", "confidence": 0.95}

User: "What time is it?"
→ {"action": "answer_question", "answer": "The current time is [time]", "message": "The current time is [time]", "confidence": 1.0}`,
      },
    });

    if (error) {
      console.error('clinic-llm error:', error);
      throw error;
    }

    // The response should be the parsed command object
    const parsed = data;
    console.log('[VOICE] Transcript:', transcript);
    console.log('[VOICE] Parsed command:', parsed);

    // If low confidence or unknown action, return error
    if (parsed.action === 'unknown' || (parsed.confidence && parsed.confidence < 0.6)) {
      return {
        success: false,
        message: parsed.message || "I didn't quite catch that. Could you try rephrasing?"
      };
    }

    // Execute the parsed command
    const result = await executeVoiceCommand(parsed, context);
    console.log('[VOICE] Execution result:', result);
    return result;

  } catch (error) {
    console.error('Voice command error:', error);
    return {
      success: false,
      message: error.message || "Something went wrong. Please try again."
    };
  }
}

/**
 * Execute a workflow (multi-step command) with progress tracking
 */
export async function executeWorkflow(workflow, onProgress = null) {
  console.log('[WORKFLOW] Executing workflow:', workflow);

  const results = [];
  let overallSuccess = true;

  for (const step of workflow.steps) {
    console.log(`[WORKFLOW] Step ${step.step_number}: ${step.description}`);

    // Notify progress
    if (onProgress) {
      onProgress({
        step: step.step_number,
        total: workflow.steps.length,
        description: step.description,
        status: 'in_progress'
      });
    }

    try {
      let result;

      switch (step.action) {
        case 'ensure_patient_exists':
          result = await ensurePatientExists(step.data);
          break;

        case 'book_appointment':
          result = await bookAppointmentCommand(step.data);
          break;

        case 'add_treatment':
          result = await addTreatmentCommand(step.data);
          break;

        case 'create_invoice':
          result = await createInvoiceCommand(step.data);
          break;

        case 'send_invoice':
          result = await sendInvoiceCommand(step.data);
          break;

        case 'add_expense':
          result = await addExpenseCommand(step.data);
          break;

        case 'navigate':
          result = await navigateCommand(step.data);
          break;

        case 'answer_question':
          result = {
            success: true,
            message: step.data.answer || step.description
          };
          break;

        default:
          result = {
            success: false,
            message: `Unknown step action: ${step.action}`
          };
      }

      results.push({
        step: step.step_number,
        action: step.action,
        description: step.description,
        success: result.success,
        message: result.message,
        data: result.data
      });

      if (!result.success) {
        overallSuccess = false;
        console.warn(`[WORKFLOW] Step ${step.step_number} failed:`, result.message);
        // Continue with remaining steps even if one fails
      }

      // Notify progress
      if (onProgress) {
        onProgress({
          step: step.step_number,
          total: workflow.steps.length,
          description: step.description,
          status: result.success ? 'completed' : 'failed',
          message: result.message
        });
      }

      // Small delay between steps for better UX
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.error(`[WORKFLOW] Step ${step.step_number} error:`, error);
      results.push({
        step: step.step_number,
        action: step.action,
        description: step.description,
        success: false,
        message: error.message,
        data: null
      });
      overallSuccess = false;
    }
  }

  // Build summary message
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  let summaryMessage;
  if (overallSuccess) {
    summaryMessage = `Successfully completed all ${totalCount} steps: ${workflow.summary}`;
  } else {
    summaryMessage = `Completed ${successCount}/${totalCount} steps. Some operations failed.`;
  }

  return {
    success: overallSuccess,
    message: summaryMessage,
    workflow_results: results,
    steps_completed: successCount,
    total_steps: totalCount
  };
}

/**
 * Execute a parsed voice command (single action or workflow)
 */
export async function executeVoiceCommand(command, context = {}) {
  console.log('[VOICE] executeVoiceCommand called with:', command);

  try {
    // If this is a workflow command, execute the workflow
    if (command.action === 'workflow' && command.workflow) {
      return await executeWorkflow(command.workflow, context.onProgress);
    }

    // Otherwise, execute single action
    switch (command.action) {
      case 'add_treatment':
        return await addTreatmentCommand(command);

      case 'add_expense':
        return await addExpenseCommand(command);

      case 'send_invoice':
        return await sendInvoiceCommand(command);

      case 'send_reminder':
        return await sendReminderCommand(command);

      case 'send_review_request':
        return await sendReviewRequestCommand(command);

      case 'mark_paid':
        return await markPaidCommand(command);

      case 'book_appointment':
        return await bookAppointmentCommand(command);

      case 'show_schedule':
        return await showScheduleCommand(command);

      case 'answer_question':
        return {
          success: true,
          message: command.answer || command.message || "I'm here to help!",
        };

      case 'show_patient':
        return await showPatientCommand(command);

      case 'navigate':
        return await navigateCommand(command);

      default:
        return {
          success: false,
          message: command.message || "I couldn't understand that command."
        };
    }
  } catch (error) {
    console.error('Command execution error:', error);
    return {
      success: false,
      message: error.message || "Failed to execute command"
    };
  }
}

/**
 * Ensure patient exists - create if needed (used in workflows)
 */
async function ensurePatientExists(data) {
  const { patient_name } = data;

  if (!patient_name) {
    return {
      success: false,
      message: "No patient name provided"
    };
  }

  try {
    // Check if patient already exists
    const patients = await api.entities.Patient.list();
    const existingPatient = patients.find(p =>
      p.name.toLowerCase().includes(patient_name.toLowerCase()) ||
      patient_name.toLowerCase().includes(p.name.toLowerCase())
    );

    if (existingPatient) {
      console.log('[WORKFLOW] Patient already exists:', existingPatient);
      return {
        success: true,
        message: `Patient ${existingPatient.name} already exists`,
        data: existingPatient
      };
    }

    // Create new patient
    console.log('[WORKFLOW] Creating new patient:', patient_name);
    const newPatient = await api.entities.Patient.create({
      name: patient_name,
      email: '',
      contact: '',
      notes: 'Created via voice command',
      date_added: new Date().toISOString().split('T')[0]
    });

    return {
      success: true,
      message: `Created patient card for ${patient_name}`,
      data: newPatient
    };
  } catch (error) {
    console.error('[WORKFLOW] Error ensuring patient exists:', error);
    return {
      success: false,
      message: `Failed to create patient: ${error.message}`
    };
  }
}

/**
 * Create invoice (without sending) - used in workflows
 */
async function createInvoiceCommand(data) {
  const { patient_name, treatment_name, price, discount_percentage, discount_amount } = data;

  try {
    // Find patient
    const patients = await api.entities.Patient.list();
    const patient = patients.find(p =>
      p.name.toLowerCase().includes(patient_name.toLowerCase())
    );

    if (!patient) {
      return {
        success: false,
        message: `Patient ${patient_name} not found`
      };
    }

    // Find recent treatment for this patient
    const treatments = await api.entities.TreatmentEntry.list('-date');
    const recentTreatment = treatments.find(t =>
      t.patient_name === patient.name &&
      (t.payment_status === 'pending' || t.payment_status === 'partially_paid')
    );

    // Calculate amount with discount
    let finalAmount = price || recentTreatment?.price_paid || 0;
    if (discount_percentage) {
      finalAmount = finalAmount * (1 - discount_percentage / 100);
    } else if (discount_amount) {
      finalAmount = Math.max(0, finalAmount - discount_amount);
    }

    // Check if invoice already exists
    const invoices = await api.entities.Invoice.list();
    let invoice = recentTreatment && invoices.find(inv => inv.treatment_entry_id === recentTreatment.id);

    if (invoice) {
      return {
        success: true,
        message: `Invoice already exists for ${patient_name}`,
        data: invoice
      };
    }

    // Generate new invoice
    const invoiceNumber = `INV-${Date.now()}`;
    invoice = await api.entities.Invoice.create({
      invoice_number: invoiceNumber,
      treatment_entry_id: recentTreatment?.id || null,
      patient_name: patient.name,
      patient_contact: patient.contact || patient.email || '',
      treatment_name: treatment_name || recentTreatment?.treatment_name || 'Consultation',
      treatment_date: recentTreatment?.date || new Date().toISOString().split('T')[0],
      amount: finalAmount,
      issue_date: new Date().toISOString().split('T')[0],
      status: 'draft'
    });

    // Generate PDF
    await invoicesAPI.generateInvoicePDF(invoice.id);

    let discountMsg = '';
    if (discount_percentage) {
      discountMsg = ` with ${discount_percentage}% discount`;
    } else if (discount_amount) {
      discountMsg = ` with £${discount_amount} discount`;
    }

    return {
      success: true,
      message: `Invoice created for ${patient_name} - £${finalAmount.toFixed(2)}${discountMsg}`,
      data: invoice
    };
  } catch (error) {
    console.error('[WORKFLOW] Error creating invoice:', error);
    return {
      success: false,
      message: `Failed to create invoice: ${error.message}`
    };
  }
}

/**
 * Add a treatment via voice command
 */
async function addTreatmentCommand(command) {
  const { patient_name, treatment_name, price, payment_status, amount_paid } = command;

  // Find or create patient
  let patient = null;
  if (patient_name) {
    const patients = await api.entities.Patient.list();
    patient = patients.find(p =>
      p.name.toLowerCase().includes(patient_name.toLowerCase()) ||
      patient_name.toLowerCase().includes(p.name.toLowerCase())
    );
  }

  // Find treatment in catalog
  let catalogTreatment = null;
  if (treatment_name) {
    const catalog = await api.entities.TreatmentCatalog.list();
    catalogTreatment = catalog.find(t =>
      t.treatment_name.toLowerCase().includes(treatment_name.toLowerCase()) ||
      treatment_name.toLowerCase().includes(t.treatment_name.toLowerCase())
    );
  }

  // Create treatment entry
  const treatmentData = {
    date: new Date().toISOString().split('T')[0],
    patient_id: patient?.id || null,
    patient_name: patient?.name || patient_name || 'Walk-in',
    treatment_id: catalogTreatment?.id || null,
    treatment_name: catalogTreatment?.treatment_name || treatment_name || 'Treatment',
    price_paid: price || catalogTreatment?.default_price || 0,
    payment_status: payment_status || 'pending',
    amount_paid: amount_paid || (payment_status === 'paid' ? price : 0),
    product_cost: catalogTreatment?.typical_product_cost || 0,
    profit: (amount_paid || (payment_status === 'paid' ? price : 0)) - (catalogTreatment?.typical_product_cost || 0)
  };

  console.log('[VOICE] Creating treatment with data:', treatmentData);

  try {
    const treatment = await api.entities.TreatmentEntry.create(treatmentData);
    console.log('[VOICE] Treatment created successfully:', treatment);

    return {
      success: true,
      message: `Treatment added for ${treatmentData.patient_name}: ${treatmentData.treatment_name} £${price}`,
      data: treatment
    };
  } catch (error) {
    console.error('[VOICE] Failed to create treatment:', error);
    return {
      success: false,
      message: `Failed to add treatment: ${error.message}`
    };
  }
}

/**
 * Add an expense via voice command
 */
async function addExpenseCommand(command) {
  const { expense_amount, expense_category, expense_description, expense_date } = command;

  // Validate amount
  if (!expense_amount || expense_amount <= 0) {
    return {
      success: false,
      message: "Please specify a valid expense amount"
    };
  }

  // Validate category (must match one of the predefined categories)
  const validCategories = ['Rent', 'Products', 'Wages', 'Insurance', 'Marketing', 'Utilities', 'Equipment', 'Other'];
  const category = expense_category && validCategories.includes(expense_category)
    ? expense_category
    : 'Other';

  // Create expense entry
  const expenseData = {
    date: expense_date || new Date().toISOString().split('T')[0],
    category: category,
    amount: Math.abs(expense_amount), // Ensure positive
    description: expense_description || `${category} expense`,
    notes: expense_description || null
  };

  console.log('[VOICE] Creating expense with data:', expenseData);

  try {
    const expense = await api.entities.Expense.create(expenseData);
    console.log('[VOICE] Expense created successfully:', expense);

    return {
      success: true,
      message: `Expense logged: £${expense_amount} for ${category}${expense_description ? ` - ${expense_description}` : ''}`,
      data: expense
    };
  } catch (error) {
    console.error('[VOICE] Error creating expense:', error);
    return {
      success: false,
      message: `Failed to log expense: ${error.message}`
    };
  }
}

/**
 * Send invoice via voice command
 */
async function sendInvoiceCommand(command) {
  const { patient_name } = command;

  // Find patient
  const patients = await api.entities.Patient.list();
  const patient = patients.find(p =>
    p.name.toLowerCase().includes(patient_name.toLowerCase())
  );

  if (!patient) {
    return {
      success: false,
      message: `I couldn't find a patient named ${patient_name}`
    };
  }

  // Find recent unpaid treatments for this patient
  const treatments = await api.entities.TreatmentEntry.list('-date');
  const recentTreatment = treatments.find(t =>
    t.patient_name === patient.name &&
    (t.payment_status === 'pending' || t.payment_status === 'partially_paid')
  );

  if (!recentTreatment) {
    return {
      success: false,
      message: `No unpaid treatments found for ${patient_name}`
    };
  }

  // Check if invoice already exists
  const invoices = await api.entities.Invoice.list();
  let invoice = invoices.find(inv => inv.treatment_entry_id === recentTreatment.id);

  // Generate invoice if it doesn't exist
  if (!invoice) {
    const invoiceNumber = `INV-${Date.now()}`;
    invoice = await api.entities.Invoice.create({
      invoice_number: invoiceNumber,
      treatment_entry_id: recentTreatment.id,
      patient_name: patient.name,
      patient_contact: patient.contact || patient.email || '',
      treatment_name: recentTreatment.treatment_name,
      treatment_date: recentTreatment.date,
      amount: recentTreatment.price_paid,
      issue_date: new Date().toISOString().split('T')[0],
      status: recentTreatment.payment_status === 'paid' ? 'paid' : 'draft'
    });
  }

  // Generate PDF if needed
  if (!invoice.invoice_pdf_url) {
    await invoicesAPI.generateInvoicePDF(invoice.id);
  }

  // Send invoice
  const sendMethod = patient.email ? 'email' : 'sms';
  await invoicesAPI.sendInvoice(invoice.id, sendMethod);

  return {
    success: true,
    message: `Invoice sent to ${patient_name} via ${sendMethod}`,
    data: invoice
  };
}

/**
 * Send payment reminder via voice command
 */
async function sendReminderCommand(command) {
  const { patient_name } = command;

  // Find invoices for patient
  const invoices = await api.entities.Invoice.list();
  const patientInvoice = invoices.find(inv =>
    inv.patient_name.toLowerCase().includes(patient_name.toLowerCase()) &&
    inv.status !== 'paid'
  );

  if (!patientInvoice) {
    return {
      success: false,
      message: `No unpaid invoices found for ${patient_name}`
    };
  }

  // Send reminder
  await invoicesAPI.sendPaymentReminder(patientInvoice.id, false);

  return {
    success: true,
    message: `Payment reminder sent to ${patient_name}`
  };
}

/**
 * Send review request via voice command
 */
async function sendReviewRequestCommand(command) {
  const { patient_name } = command;

  if (!patient_name) {
    return {
      success: false,
      message: "Please specify which patient to send the review request to"
    };
  }

  // Find patient
  const patients = await api.entities.Patient.list();
  const patient = patients.find(p =>
    p.name.toLowerCase().includes(patient_name.toLowerCase())
  );

  if (!patient) {
    return {
      success: false,
      message: `I couldn't find a patient named ${patient_name}`
    };
  }

  try {
    // Send review request via SMS or email
    const reviewMessage = `Hi ${patient.name}, thank you for visiting us! We'd love to hear about your experience. Please leave us a review: [review_link]`;

    // Use the Supabase function to send SMS
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: {
        to: patient.contact || patient.phone,
        message: reviewMessage
      }
    });

    if (error) {
      throw new Error(error.message || 'Failed to send SMS');
    }

    return {
      success: true,
      message: `Review request sent to ${patient_name}`,
      data: { patient: patient.name }
    };
  } catch (error) {
    console.error('Error sending review request:', error);
    return {
      success: false,
      message: `Failed to send review request: ${error.message}`
    };
  }
}

/**
 * Mark invoice as paid via voice command
 */
async function markPaidCommand(command) {
  const { invoice_number, patient_name } = command;

  const invoices = await api.entities.Invoice.list();
  let invoice;

  if (invoice_number) {
    invoice = invoices.find(inv => inv.invoice_number === invoice_number);
  } else if (patient_name) {
    invoice = invoices.find(inv =>
      inv.patient_name.toLowerCase().includes(patient_name.toLowerCase()) &&
      inv.status !== 'paid'
    );
  }

  if (!invoice) {
    return {
      success: false,
      message: `Couldn't find invoice${invoice_number ? ` ${invoice_number}` : ` for ${patient_name}`}`
    };
  }

  // Update invoice and treatment
  await api.entities.Invoice.update(invoice.id, { status: 'paid' });

  if (invoice.treatment_entry_id) {
    const treatment = await api.entities.TreatmentEntry.list();
    const t = treatment.find(tr => tr.id === invoice.treatment_entry_id);
    if (t) {
      await api.entities.TreatmentEntry.update(t.id, {
        payment_status: 'paid',
        amount_paid: t.price_paid
      });
    }
  }

  return {
    success: true,
    message: `Invoice ${invoice.invoice_number} marked as paid`
  };
}

/**
 * Book appointment via voice command
 */
async function bookAppointmentCommand(command) {
  const { patient_name, treatment_name, date, time } = command;

  // Find patient
  const patients = await api.entities.Patient.list();
  const patient = patients.find(p =>
    p.name.toLowerCase().includes(patient_name.toLowerCase())
  );

  // Create appointment
  const appointment = await api.entities.Appointment.create({
    patient_id: patient?.id || null,
    patient_name: patient?.name || patient_name,
    treatment_name: treatment_name || 'Consultation',
    date: date || new Date().toISOString().split('T')[0],
    time: time || '09:00',
    status: 'scheduled'
  });

  return {
    success: true,
    message: `Appointment booked for ${patient_name} on ${date} at ${time}`,
    data: appointment,
    action: 'navigate',
    navigateTo: '/Calendar'
  };
}

/**
 * Show schedule via voice command
 */
async function showScheduleCommand(command) {
  return {
    success: true,
    message: "Opening your schedule",
    action: 'navigate',
    navigateTo: '/Calendar'
  };
}

/**
 * Show patient via voice command
 */
async function showPatientCommand(command) {
  const { patient_name } = command;

  if (!patient_name) {
    return {
      success: false,
      message: "Please specify which patient you'd like to see"
    };
  }

  return {
    success: true,
    message: `Looking up ${patient_name}`,
    action: 'navigate',
    navigateTo: '/Patients'
  };
}

/**
 * Navigate to a page via voice command
 */
async function navigateCommand(command) {
  const { page } = command;

  const pageMap = {
    'calendar': '/Calendar',
    'patients': '/Patients',
    'records': '/Records',
    'settings': '/Settings',
    'dashboard': '/',
    'home': '/',
  };

  const route = pageMap[page?.toLowerCase()];

  if (!route) {
    return {
      success: false,
      message: `I don't know how to open ${page}`
    };
  }

  return {
    success: true,
    message: `Opening ${page}`,
    action: 'navigate',
    navigateTo: route
  };
}
