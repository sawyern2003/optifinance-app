import { api } from '@/api/api';
import { invoicesAPI } from '@/api/invoices';

/**
 * Parse and execute voice commands using GPT-4
 */
export async function parseAndExecuteVoiceCommand(transcript, context = {}) {
  try {
    // Use the clinic-llm edge function to parse voice commands
    const { data, error } = await api.integrations.Core.InvokeLLM({
      prompt: `You are a voice command parser for clinic management software.

Parse this voice command and return a JSON object with the action to perform:
"${transcript}"

Available commands:
1. Add treatment: "Add [treatment] for [patient name] [price] [payment status]"
   Example: "Add Botox for Sarah Thompson £300 paid in cash"

2. Send invoice: "Send invoice to [patient name]" or "Send invoice for [patient name]'s last treatment"
   Example: "Send invoice to Sarah Thompson"

3. Send reminder: "Send payment reminder to [patient name]" or "Send reminder to [patient name]"
   Example: "Send payment reminder to Sarah Thompson"

4. Mark as paid: "Mark invoice [number] as paid" or "Mark [patient name]'s invoice as paid"
   Example: "Mark invoice 1234 as paid"

5. Book appointment: "Book [patient name] for [treatment] [date/time]"
   Example: "Book Sarah for Botox tomorrow at 2pm"

6. Show schedule: "What's my schedule today" or "Show me appointments for tomorrow"
   Example: "What's my schedule today"

Return ONLY valid JSON in this exact format:
{
  "action": "add_treatment" | "send_invoice" | "send_reminder" | "mark_paid" | "book_appointment" | "show_schedule" | "unknown",
  "patient_name": "string (if applicable)",
  "treatment_name": "string (for add_treatment, book_appointment)",
  "price": number (for add_treatment),
  "payment_status": "paid" | "pending" | "partially_paid" (for add_treatment),
  "amount_paid": number (optional, for add_treatment),
  "invoice_number": "string (for mark_paid)",
  "date": "YYYY-MM-DD" (for book_appointment),
  "time": "HH:mm" (for book_appointment),
  "confidence": number (0-1, how confident you are in the parse)
}

If you can't confidently parse the command, return {"action": "unknown", "confidence": 0, "message": "I didn't understand that command"}`,
    });

    if (error) throw error;

    // Try to parse the response
    let parsed;
    try {
      // Extract JSON from response if it's wrapped in markdown or text
      const jsonMatch = data.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('Failed to parse LLM response:', data);
      return {
        success: false,
        message: "I couldn't understand that command. Please try again."
      };
    }

    // If low confidence or unknown action, return error
    if (parsed.action === 'unknown' || (parsed.confidence && parsed.confidence < 0.6)) {
      return {
        success: false,
        message: parsed.message || "I didn't quite catch that. Could you try rephrasing?"
      };
    }

    // Execute the parsed command
    const result = await executeVoiceCommand(parsed, context);
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
async function executeVoiceCommand(command, context) {
  try {
    switch (command.action) {
      case 'add_treatment':
        return await addTreatmentCommand(command);

      case 'send_invoice':
        return await sendInvoiceCommand(command);

      case 'send_reminder':
        return await sendReminderCommand(command);

      case 'mark_paid':
        return await markPaidCommand(command);

      case 'book_appointment':
        return await bookAppointmentCommand(command);

      case 'show_schedule':
        return await showScheduleCommand(command);

      default:
        return {
          success: false,
          message: "I couldn't understand that command."
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

  const treatment = await api.entities.TreatmentEntry.create(treatmentData);

  return {
    success: true,
    message: `Treatment added for ${treatmentData.patient_name}: ${treatmentData.treatment_name} £${price}`,
    data: treatment
  };
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
