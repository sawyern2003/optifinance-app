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
        prompt: `You are a helpful AI assistant for a clinic management system. You understand natural conversation and can answer questions or execute commands.

Current date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

User said: "${transcript}"

COMMANDS YOU CAN EXECUTE:

1. Add treatment: "Add [treatment] for [patient name] [price] [payment status]"
2. Add expense: "I spent [amount] on [category]" / "Log expense [amount] for [category]"
3. Send invoice: "Send invoice to [patient name]"
4. Send reminder: "Send payment reminder to [patient name]"
5. Mark as paid: "Mark invoice [number] as paid"
6. Book appointment: "Book [patient name] for [treatment] [date/time]"
7. Show schedule: "What's my schedule" / "Show me appointments"
8. Show patient: "Show me [patient name]" / "Find [patient name]"
9. Navigate: "Go to [page]" / "Open [page]" (pages: calendar, patients, records, settings)
10. Send review request: "Send review request to [patient name]"

QUESTIONS YOU CAN ANSWER:

- Date/time: "What's the date", "What day is it", "What time is it"
- General: "Hello", "How are you", "What can you do"

Return JSON in this format:
{
  "action": "add_treatment" | "add_expense" | "send_invoice" | "send_reminder" | "send_review_request" | "mark_paid" | "book_appointment" | "show_schedule" | "show_patient" | "navigate" | "answer_question" | "unknown",
  "patient_name": "string (if applicable)",
  "treatment_name": "string (for treatments/appointments)",
  "price": number (for add_treatment),
  "payment_status": "paid" | "pending" | "partially_paid",
  "amount_paid": number (optional),
  "expense_amount": number (for add_expense),
  "expense_category": "Rent" | "Products" | "Wages" | "Insurance" | "Marketing" | "Utilities" | "Equipment" | "Other" (for add_expense),
  "expense_description": "string (optional, for add_expense)",
  "expense_date": "YYYY-MM-DD (optional, defaults to today)",
  "invoice_number": "string (for mark_paid)",
  "date": "YYYY-MM-DD" (for appointments)",
  "time": "HH:mm" (for appointments)",
  "page": "string (for navigate: calendar, patients, records, settings)",
  "answer": "string (for answer_question - your friendly response)",
  "message": "string (confirmation message to speak back to user)",
  "confidence": number (0-1)
}

Be conversational and helpful. If someone asks "What's the date", use action "answer_question" with answer containing today's date.
Always include a friendly "message" field that will be spoken back to the user.`,
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
        prompt: `You are a helpful AI assistant for a clinic management system. You understand natural conversation and can answer questions or execute commands.

Current date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

User said: "${transcript}"

COMMANDS YOU CAN EXECUTE:

1. Add treatment: "Add [treatment] for [patient name] [price] [payment status]"
2. Add expense: "I spent [amount] on [category]" / "Log expense [amount] for [category]"
3. Send invoice: "Send invoice to [patient name]"
4. Send reminder: "Send payment reminder to [patient name]"
5. Mark as paid: "Mark invoice [number] as paid"
6. Book appointment: "Book [patient name] for [treatment] [date/time]"
7. Show schedule: "What's my schedule" / "Show me appointments"
8. Show patient: "Show me [patient name]" / "Find [patient name]"
9. Navigate: "Go to [page]" / "Open [page]" (pages: calendar, patients, records, settings)
10. Send review request: "Send review request to [patient name]"

QUESTIONS YOU CAN ANSWER:

- Date/time: "What's the date", "What day is it", "What time is it"
- General: "Hello", "How are you", "What can you do"

Return JSON in this format:
{
  "action": "add_treatment" | "add_expense" | "send_invoice" | "send_reminder" | "send_review_request" | "mark_paid" | "book_appointment" | "show_schedule" | "show_patient" | "navigate" | "answer_question" | "unknown",
  "patient_name": "string (if applicable)",
  "treatment_name": "string (for treatments/appointments)",
  "price": number (for add_treatment),
  "payment_status": "paid" | "pending" | "partially_paid",
  "amount_paid": number (optional),
  "expense_amount": number (for add_expense),
  "expense_category": "Rent" | "Products" | "Wages" | "Insurance" | "Marketing" | "Utilities" | "Equipment" | "Other" (for add_expense),
  "expense_description": "string (optional, for add_expense)",
  "expense_date": "YYYY-MM-DD (optional, defaults to today)",
  "invoice_number": "string (for mark_paid)",
  "date": "YYYY-MM-DD" (for appointments)",
  "time": "HH:mm" (for appointments)",
  "page": "string (for navigate: calendar, patients, records, settings)",
  "answer": "string (for answer_question - your friendly response)",
  "message": "string (confirmation message to speak back to user)",
  "confidence": number (0-1)
}

Be conversational and helpful. If someone asks "What's the date", use action "answer_question" with answer containing today's date.
Always include a friendly "message" field that will be spoken back to the user.`,
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
