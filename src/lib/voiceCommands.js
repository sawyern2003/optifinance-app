import { api } from '@/api/api';
import { invoicesAPI } from '@/api/invoices';
import { supabase } from '@/config/supabase';

/**
 * Parse voice command (without executing) - for confirmation dialogs
 */
export async function parseVoiceCommand(transcript) {
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

    return parsed;
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
 * Execute a parsed voice command
 */
export async function executeVoiceCommand(command, context = {}) {
  console.log('[VOICE] executeVoiceCommand called with:', command);

  try {
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
