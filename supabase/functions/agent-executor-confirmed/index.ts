/**
 * AGENT EXECUTOR CONFIRMED - Execute pre-approved plans
 *
 * send-invoice and generate-invoice-pdf require the clinic user's JWT — not the service role.
 * Pass access_token from the browser; we call those functions via fetch with that token.
 *
 * Supports mode "all" (default) or "single" + step_index + executor_state for live step-by-step UI.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

type ExecutorState = {
  currentPatientId: number | null;
  currentPatientName: string;
  currentPrice: number;
  currentInvoiceId: string | number | null;
  /** UUID of treatment row created in this plan — links invoice in app (Records, PDF). */
  currentTreatmentEntryId: string | null;
  /** YYYY-MM-DD from last add_treatment in this plan — used on invoice.treatment_date. */
  currentTreatmentDate: string | null;
};

function defaultState(): ExecutorState {
  return {
    currentPatientId: null,
    currentPatientName: '',
    currentPrice: 0,
    currentInvoiceId: null,
    currentTreatmentEntryId: null,
    currentTreatmentDate: null,
  };
}

/** Call another Edge Function as the signed-in clinic user (required by send-invoice / generate-invoice-pdf). */
async function invokeAsUser(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<Record<string, unknown>> {
  if (!accessToken?.trim()) {
    throw new Error(`${functionName} requires your session token (access_token). Please sign in again.`);
  }
  if (!supabaseAnonKey) {
    throw new Error('SUPABASE_ANON_KEY is not set on this function.');
  }
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`${functionName} returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const err = typeof data.error === 'string' ? data.error : text.slice(0, 400);
    throw new Error(`${functionName} failed (${res.status}): ${err}`);
  }
  return data;
}

async function resolvePatientId(
  supabase: SupabaseClient,
  user_id: string,
  patient_name: string,
  state: ExecutorState,
): Promise<number | null> {
  if (state.currentPatientId) return state.currentPatientId;
  const { data: rows } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', user_id)
    .ilike('name', `%${patient_name}%`)
    .limit(1);
  return rows?.[0]?.id ?? null;
}

/**
 * Build one string send-invoice can parse (extractEmailAddress / extractPhoneNumber).
 * Patients table uses `phone` for mobile and often `contact` for email — both must be included.
 */
function formatPatientContact(patient: {
  email?: string | null;
  contact?: string | null;
  phone?: string | null;
} | null): string {
  if (!patient) return '';
  const email = String(patient.email || '').trim();
  const contact = String(patient.contact || '').trim();
  const phone = String(patient.phone || '').trim();

  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(t);
  };

  if (email) push(email);
  if (contact) push(contact);
  if (phone) push(phone);

  return parts.join(' · ');
}

function resolveVisitDate(
  param: string | undefined,
  fallback: string,
): string {
  if (!param) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
  if (param === 'today') return new Date().toISOString().split('T')[0];
  if (param === 'yesterday') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return y.toISOString().split('T')[0];
  }
  return fallback;
}

const EXPENSE_CATEGORIES = [
  'Rent',
  'Products',
  'Wages',
  'Insurance',
  'Marketing',
  'Utilities',
  'Equipment',
  'Other',
];

type PlanAction = {
  action: string;
  description?: string;
  params: Record<string, unknown>;
};

type StepResult = {
  success: boolean;
  message?: string;
  error?: string;
  patient?: unknown;
  treatment?: unknown;
  invoice?: unknown;
  appointment?: unknown;
  price?: number;
};

async function runOneAction(
  supabase: SupabaseClient,
  user_id: string,
  accessToken: string | undefined,
  action: PlanAction,
  state: ExecutorState,
): Promise<{ result: StepResult; state: ExecutorState }> {
  const next: ExecutorState = { ...state };

  try {
    let result: StepResult;

    switch (action.action) {
      case 'find_patient': {
        const patient_name = String(action.params.patient_name || '');
        next.currentPatientName = patient_name;

        const { data: existingPatients } = await supabase
          .from('patients')
          .select('*')
          .eq('user_id', user_id)
          .ilike('name', `%${patient_name}%`)
          .limit(1);

        if (existingPatients && existingPatients.length > 0) {
          next.currentPatientId = existingPatients[0].id;
          result = {
            success: true,
            patient: existingPatients[0],
            message: `Found ${patient_name}`,
          };
        } else {
          result = {
            success: true,
            message: `${patient_name} not in database yet — will link when treatment or appointment is saved`,
          };
        }
        break;
      }

      case 'create_patient': {
        const patient_name = String(action.params.patient_name || '');
        const email = String(action.params.email || '');
        const contact = String(action.params.contact || '');
        const phone = String(action.params.phone || '');
        next.currentPatientName = patient_name;

        const { data: newPatient, error } = await supabase
          .from('patients')
          .insert({
            user_id: user_id,
            name: patient_name,
            email: email || '',
            contact: contact || '',
            phone: phone || '',
            date_added: new Date().toISOString().split('T')[0],
            notes: String(action.params.notes || ''),
          })
          .select()
          .single();

        if (error) throw error;

        next.currentPatientId = newPatient.id;
        result = {
          success: true,
          patient: newPatient,
          message: `Created patient ${patient_name}`,
        };
        break;
      }

      case 'get_price': {
        const treatment_name = String(action.params.treatment_name || '');

        const { data: treatments } = await supabase
          .from('treatment_catalog')
          .select('*')
          .eq('user_id', user_id)
          .ilike('treatment_name', `%${treatment_name}%`)
          .limit(1);

        if (treatments && treatments.length > 0) {
          next.currentPrice = treatments[0].price;
          result = {
            success: true,
            price: next.currentPrice,
            message: `${treatment_name} — £${next.currentPrice} from catalogue`,
          };
        } else {
          result = {
            success: true,
            message: `No catalogue match for "${treatment_name}" — invoice amount may be £0 until you edit it`,
          };
        }
        break;
      }

      case 'add_treatment': {
        const patient_name = String(action.params.patient_name || '');
        const treatment_name = String(action.params.treatment_name || '');
        const date = action.params.date as string | undefined;
        const payment_status = String(action.params.payment_status || 'pending');
        const price = next.currentPrice || Number(action.params.price) || 0;
        const paidAmount = payment_status === 'paid' ? price : 0;

        if (!next.currentPatientId) {
          const { data: existingPatients } = await supabase
            .from('patients')
            .select('id')
            .eq('user_id', user_id)
            .ilike('name', `%${patient_name}%`)
            .limit(1);

          if (existingPatients && existingPatients.length > 0) {
            next.currentPatientId = existingPatients[0].id;
          } else {
            const { data: newPatient, error: insErr } = await supabase
              .from('patients')
              .insert({
                user_id: user_id,
                name: patient_name,
                email: '',
                contact: '',
                date_added: new Date().toISOString().split('T')[0],
                notes: 'Auto-created from voice agent',
              })
              .select('id')
              .single();

            if (insErr) throw insErr;
            next.currentPatientId = newPatient?.id ?? null;
          }
        }

        let treatmentDate = new Date().toISOString().split('T')[0];
        if (date) {
          if (date === 'today') {
            treatmentDate = new Date().toISOString().split('T')[0];
          } else if (date === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            treatmentDate = yesterday.toISOString().split('T')[0];
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            treatmentDate = date;
          }
        }

        const { data: treatment, error } = await supabase
          .from('treatment_entries')
          .insert({
            user_id: user_id,
            patient_id: next.currentPatientId,
            patient_name: patient_name,
            treatment_name: treatment_name,
            price_paid: price,
            payment_status: payment_status || 'pending',
            amount_paid: paidAmount,
            date: treatmentDate,
            product_cost: 0,
            profit: paidAmount,
          })
          .select()
          .single();

        if (error) throw error;

        next.currentTreatmentEntryId = String(treatment.id);
        next.currentTreatmentDate = treatmentDate;

        result = {
          success: true,
          treatment: treatment,
          message: `Saved ${treatment_name} on ${patient_name}'s record (${treatmentDate})`,
        };
        break;
      }

      case 'create_invoice': {
        const patient_name = String(action.params.patient_name || '');
        const treatment_name = String(action.params.treatment_name || '');
        const discount_percentage = action.params.discount_percentage as number | undefined;
        const discount_amount = action.params.discount_amount as number | undefined;
        let finalAmount = next.currentPrice || Number(action.params.price) || 0;

        if (discount_percentage) {
          finalAmount = finalAmount * (1 - discount_percentage / 100);
        } else if (discount_amount) {
          finalAmount = finalAmount - discount_amount;
        }

        const { data: patient } = await supabase
          .from('patients')
          .select('id, name, email, contact, phone')
          .eq('user_id', user_id)
          .ilike('name', `%${patient_name}%`)
          .limit(1)
          .maybeSingle();

        const patient_contact = formatPatientContact(patient);

        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const nextInvoiceNumber = `${timestamp}${random}`;

        const paramTreatmentDate = action.params.treatment_date as string | undefined;
        let resolvedFromParam: string | null = null;
        if (paramTreatmentDate) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(paramTreatmentDate)) {
            resolvedFromParam = paramTreatmentDate;
          } else if (paramTreatmentDate === 'today') {
            resolvedFromParam = new Date().toISOString().split('T')[0];
          } else if (paramTreatmentDate === 'yesterday') {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            resolvedFromParam = y.toISOString().split('T')[0];
          }
        }
        const treatmentDateForInvoice =
          resolvedFromParam ||
          next.currentTreatmentDate ||
          new Date().toISOString().split('T')[0];

        const insertRow: Record<string, unknown> = {
          user_id: user_id,
          invoice_number: nextInvoiceNumber,
          patient_name: patient_name,
          patient_contact: patient_contact,
          treatment_name: treatment_name,
          treatment_date: treatmentDateForInvoice,
          amount: finalAmount,
          issue_date: new Date().toISOString().split('T')[0],
          status: 'draft',
        };
        if (next.currentTreatmentEntryId) {
          insertRow.treatment_entry_id = next.currentTreatmentEntryId;
        }

        const { data: invoice, error } = await supabase
          .from('invoices')
          .insert(insertRow)
          .select()
          .single();

        if (error) throw error;

        next.currentInvoiceId = invoice.id;

        const contactHint = patient_contact
          ? ''
          : ' Add phone or email on the patient or invoice to send.';
        const linkHint = next.currentTreatmentEntryId
          ? ' Linked to the treatment record you just saved.'
          : '';
        result = {
          success: true,
          invoice: invoice,
          message: `Created invoice for £${finalAmount.toFixed(2)} (${treatmentDateForInvoice})${linkHint}${contactHint}`,
        };
        break;
      }

      case 'send_invoice': {
        if (!accessToken) {
          throw new Error('Cannot send invoice without your login session (access_token).');
        }

        const patient_name = String(action.params.patient_name || '');

        let invoice: Record<string, unknown> | null = null;
        if (next.currentInvoiceId != null) {
          const { data } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', next.currentInvoiceId)
            .single();
          invoice = data;
        } else {
          const { data } = await supabase
            .from('invoices')
            .select('*')
            .eq('user_id', user_id)
            .ilike('patient_name', `%${patient_name}%`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          invoice = data;
        }

        if (!invoice) {
          throw new Error(`No invoice found for ${patient_name}`);
        }

        let workingInvoice = invoice as Record<string, unknown> & { id: unknown; patient_contact?: unknown };
        const contactStr = String(workingInvoice.patient_contact || '').trim();
        if (!contactStr) {
          const { data: pRow } = await supabase
            .from('patients')
            .select('email, contact, phone')
            .eq('user_id', user_id)
            .ilike('name', `%${patient_name}%`)
            .limit(1)
            .maybeSingle();
          const patched = formatPatientContact(pRow);
          if (patched) {
            await supabase
              .from('invoices')
              .update({ patient_contact: patched })
              .eq('id', workingInvoice.id);
            workingInvoice = { ...workingInvoice, patient_contact: patched };
          }
        }

        if (!String(workingInvoice.patient_contact || '').trim()) {
          result = {
            success: false,
            message:
              `Cannot send: no email or phone on file for ${patient_name}. Add phone or email to the patient in Catalogue (or on the invoice), then tap Send from Invoices.`,
          };
          break;
        }

        if (!workingInvoice.invoice_pdf_url) {
          await invokeAsUser(
            'generate-invoice-pdf',
            { invoiceId: workingInvoice.id },
            accessToken,
          );
        }

        const sendPayload = await invokeAsUser(
          'send-invoice',
          {
            invoiceId: workingInvoice.id,
            sendVia: 'both',
          },
          accessToken,
        );

        const results = sendPayload.results as
          | { sms?: { success?: boolean }; email?: { success?: boolean; note?: string } }
          | undefined;
        const delivered =
          Boolean(results?.sms?.success) || Boolean(results?.email?.success);
        if (!delivered) {
          result = {
            success: false,
            message:
              (typeof sendPayload.error === 'string' && sendPayload.error) ||
              'Send completed but neither SMS nor email reported success. Check Twilio / SendGrid (or Resend) secrets and patient contact.',
          };
          break;
        }

        await supabase.from('invoices').update({ status: 'sent' }).eq('id', workingInvoice.id);

        const via: string[] = [];
        if (results?.sms?.success) via.push('SMS');
        if (results?.email?.success) via.push('email');
        result = {
          success: true,
          invoice: workingInvoice,
          message: `Invoice sent to ${patient_name} (${via.join(' + ') || 'channel'})`,
        };
        break;
      }

      case 'book_appointment': {
        const patient_name = String(action.params.patient_name || '');
        const treatment_name = String(action.params.treatment_name || '');
        const date = action.params.date as string | undefined;
        const time = String(action.params.time || '09:00');

        const pid = await resolvePatientId(supabase, user_id, patient_name, next);
        if (pid) next.currentPatientId = pid;

        let appointmentDate = new Date().toISOString().split('T')[0];
        if (date === 'today') {
          appointmentDate = new Date().toISOString().split('T')[0];
        } else if (date === 'tomorrow') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          appointmentDate = tomorrow.toISOString().split('T')[0];
        } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          appointmentDate = date;
        }

        const { data: appointment, error } = await supabase
          .from('appointments')
          .insert({
            user_id: user_id,
            patient_id: next.currentPatientId,
            patient_name: patient_name,
            treatment_name: treatment_name,
            date: appointmentDate,
            time: time || '09:00',
            status: 'scheduled',
          })
          .select()
          .single();

        if (error) throw error;

        result = {
          success: true,
          appointment: appointment,
          message: `Calendar: ${patient_name} — ${treatment_name} on ${appointmentDate} at ${time}`,
        };
        break;
      }

      case 'add_clinical_note': {
        const patient_name = String(action.params.patient_name || '');
        const raw_narrative = String(
          action.params.narrative || action.params.raw_narrative || '',
        ).trim();
        if (!raw_narrative) {
          result = { success: false, message: 'Clinical note text is missing' };
          break;
        }
        const visit_date = resolveVisitDate(
          action.params.visit_date as string | undefined,
          new Date().toISOString().split('T')[0],
        );
        const { data: pn } = await supabase
          .from('patients')
          .select('id')
          .eq('user_id', user_id)
          .ilike('name', `%${patient_name}%`)
          .limit(1)
          .maybeSingle();
        if (!pn) {
          result = {
            success: false,
            message: `Patient "${patient_name}" not found — add them first or use find_patient/create_patient earlier in the plan`,
          };
          break;
        }
        const summary = String(action.params.clinical_summary || raw_narrative).slice(0, 2000);
        const linkLast = action.params.link_to_last_treatment === true ||
          action.params.link_to_last_treatment === 'true';
        const teid =
          (action.params.treatment_entry_id as string | undefined) ||
          (linkLast ? next.currentTreatmentEntryId : null);

        const noteRow: Record<string, unknown> = {
          user_id,
          patient_id: pn.id,
          visit_date,
          source: 'voice_diary',
          raw_narrative,
          structured: { clinical_summary: summary },
        };
        if (teid) noteRow.treatment_entry_id = teid;

        const { error: cnErr } = await supabase.from('clinical_notes').insert(noteRow).select().single();
        if (cnErr) throw cnErr;

        result = {
          success: true,
          message: `Clinical note added to ${patient_name}'s file (${visit_date})`,
        };
        break;
      }

      case 'add_expense': {
        const amount = Math.abs(Number(action.params.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
          result = { success: false, message: 'Expense amount must be a positive number' };
          break;
        }
        let category = String(action.params.category || 'Other');
        if (!EXPENSE_CATEGORIES.includes(category)) category = 'Other';
        const notes = String(
          action.params.notes || action.params.description || `${category} (voice)`,
        ).slice(0, 2000);
        const date = resolveVisitDate(
          action.params.date as string | undefined,
          new Date().toISOString().split('T')[0],
        );
        const { data: exp, error: exErr } = await supabase
          .from('expenses')
          .insert({
            user_id,
            date,
            category,
            amount,
            notes,
          })
          .select()
          .single();
        if (exErr) throw exErr;
        result = {
          success: true,
          expense: exp,
          message: `Logged expense £${amount.toFixed(2)} — ${category}`,
        };
        break;
      }

      case 'adjust_product_stock': {
        const product_name = String(action.params.product_name || '');
        const delta = Number(action.params.quantity_change ?? action.params.delta);
        if (!product_name) {
          result = { success: false, message: 'product_name is required' };
          break;
        }
        if (!Number.isFinite(delta) || delta === 0) {
          result = { success: false, message: 'quantity_change must be a non-zero number' };
          break;
        }
        const { data: plist, error: pe } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', user_id)
          .ilike('name', `%${product_name}%`)
          .limit(5);
        if (pe) throw pe;
        if (!plist?.length) {
          result = {
            success: false,
            message: `No inventory product matches "${product_name}". Add it in Inventory first.`,
          };
          break;
        }
        const prod = plist[0];
        const cur = Number(prod.current_stock);
        const newStock = cur + delta;
        if (newStock < 0) {
          result = {
            success: false,
            message: `Stock would be negative (${cur} + ${delta}).`,
          };
          break;
        }
        const { error: ue } = await supabase
          .from('products')
          .update({ current_stock: newStock })
          .eq('id', prod.id)
          .eq('user_id', user_id);
        if (ue) throw ue;
        result = {
          success: true,
          message: `${prod.name}: stock ${cur} → ${newStock} (${delta > 0 ? '+' : ''}${delta})`,
        };
        break;
      }

      case 'log_fridge_temperature': {
        const temperature = Number(action.params.temperature);
        if (!Number.isFinite(temperature)) {
          result = { success: false, message: 'temperature must be a number (°C)' };
          break;
        }
        let time_of_day = String(action.params.time_of_day || 'am').toLowerCase();
        if (time_of_day !== 'am' && time_of_day !== 'pm') time_of_day = 'am';
        const notes = action.params.notes != null ? String(action.params.notes).slice(0, 500) : null;
        const { error: fe } = await supabase.from('fridge_temperatures').insert({
          user_id,
          temperature,
          time_of_day,
          notes,
        });
        if (fe) throw fe;
        result = {
          success: true,
          message: `Fridge log: ${temperature}°C (${time_of_day.toUpperCase()})`,
        };
        break;
      }

      case 'register_equipment': {
        const name = String(action.params.name || '');
        if (!name) {
          result = { success: false, message: 'Equipment name is required' };
          break;
        }
        const type = String(action.params.type || 'other');
        const { data: eq, error: eqe } = await supabase
          .from('equipment')
          .insert({
            user_id,
            name,
            type,
            serial_number: action.params.serial_number
              ? String(action.params.serial_number)
              : null,
            manufacturer: action.params.manufacturer
              ? String(action.params.manufacturer)
              : null,
          })
          .select()
          .single();
        if (eqe) throw eqe;
        result = {
          success: true,
          message: `Registered equipment: ${name} (${type})`,
        };
        break;
      }

      case 'update_equipment_service': {
        const name = String(action.params.equipment_name || action.params.name || '');
        if (!name) {
          result = { success: false, message: 'equipment_name is required' };
          break;
        }
        const { data: elist } = await supabase
          .from('equipment')
          .select('*')
          .eq('user_id', user_id)
          .ilike('name', `%${name}%`)
          .limit(3);
        if (!elist?.length) {
          result = {
            success: false,
            message: `No equipment matches "${name}"`,
          };
          break;
        }
        const eq = elist[0];
        const patch: Record<string, unknown> = {};
        if (action.params.last_service_date) {
          patch.last_service_date = String(action.params.last_service_date);
        }
        if (action.params.next_service_date) {
          patch.next_service_date = String(action.params.next_service_date);
        }
        if (Object.keys(patch).length === 0) {
          result = {
            success: false,
            message: 'Provide last_service_date and/or next_service_date (YYYY-MM-DD)',
          };
          break;
        }
        const { error: upe } = await supabase
          .from('equipment')
          .update(patch)
          .eq('id', eq.id)
          .eq('user_id', user_id);
        if (upe) throw upe;
        result = {
          success: true,
          message: `Updated service dates for ${eq.name}`,
        };
        break;
      }

      case 'update_patient': {
        const patient_name = String(action.params.patient_name || '');
        const { data: prows } = await supabase
          .from('patients')
          .select('*')
          .eq('user_id', user_id)
          .ilike('name', `%${patient_name}%`)
          .limit(1);
        if (!prows?.length) {
          result = { success: false, message: `Patient ${patient_name} not found` };
          break;
        }
        const updates: Record<string, string> = {};
        if (action.params.email !== undefined) updates.email = String(action.params.email);
        if (action.params.contact !== undefined) updates.contact = String(action.params.contact);
        if (action.params.phone !== undefined) updates.phone = String(action.params.phone);
        if (action.params.notes !== undefined) updates.notes = String(action.params.notes);
        if (Object.keys(updates).length === 0) {
          result = {
            success: false,
            message: 'Provide at least one of: email, contact, phone, notes',
          };
          break;
        }
        const { error: pue } = await supabase
          .from('patients')
          .update(updates)
          .eq('id', prows[0].id);
        if (pue) throw pue;
        result = {
          success: true,
          message: `Updated ${patient_name}'s details`,
        };
        break;
      }

      case 'update_clinic_profile': {
        const allowed = [
          'clinic_name',
          'bank_name',
          'account_number',
          'sort_code',
          'invoice_from_email',
          'invoice_reply_to_email',
          'invoice_sender_name',
        ] as const;
        const p = action.params as Record<string, unknown>;
        const patch: Record<string, string> = {};
        for (const k of allowed) {
          if (p[k] !== undefined && p[k] !== null) {
            patch[k] = String(p[k]).trim();
          }
        }
        if (Object.keys(patch).length === 0) {
          result = {
            success: false,
            message: 'No allowed profile fields in params (clinic_name, bank_*, invoice_* emails, etc.)',
          };
          break;
        }
        const { error: profE } = await supabase
          .from('profiles')
          .update(patch)
          .eq('id', user_id);
        if (profE) throw profE;
        result = {
          success: true,
          message: `Clinic profile updated (${Object.keys(patch).join(', ')})`,
        };
        break;
      }

      case 'update_tax_settings': {
        const taxKeys = [
          'vat_registered',
          'vat_number',
          'vat_scheme',
          'business_structure',
          'flat_rate_percentage',
          'utr_number',
          'company_number',
        ] as const;
        const patch: Record<string, unknown> = {};
        for (const k of taxKeys) {
          if (action.params[k] !== undefined) {
            const v = action.params[k];
            if (k === 'vat_registered') {
              patch[k] = v === true || v === 'true' || v === '1' || v === 1;
            } else if (k === 'flat_rate_percentage') {
              patch[k] = Number(v);
            } else {
              patch[k] = String(v);
            }
          }
        }
        if (Object.keys(patch).length === 0) {
          result = {
            success: false,
            message: 'No tax fields provided (vat_registered, vat_number, …)',
          };
          break;
        }
        const { data: ts } = await supabase
          .from('tax_settings')
          .select('id')
          .eq('user_id', user_id)
          .limit(1)
          .maybeSingle();
        if (ts?.id) {
          const { error: tse } = await supabase
            .from('tax_settings')
            .update(patch)
            .eq('id', ts.id);
          if (tse) throw tse;
        } else {
          const { error: tsi } = await supabase
            .from('tax_settings')
            .insert({ user_id, ...patch })
            .select()
            .single();
          if (tsi) throw tsi;
        }
        result = { success: true, message: 'Tax settings updated' };
        break;
      }

      case 'add_competitor_price': {
        const treatment_name = String(action.params.treatment_name || '');
        const competitor_name = String(action.params.competitor_name || '');
        const price = Number(action.params.price);
        if (!treatment_name || !competitor_name || !Number.isFinite(price)) {
          result = {
            success: false,
            message: 'treatment_name, competitor_name, and price are required',
          };
          break;
        }
        const { error: cpe } = await supabase.from('competitor_pricing').insert({
          user_id,
          treatment_name,
          competitor_name,
          price,
          notes: action.params.notes ? String(action.params.notes).slice(0, 500) : null,
        });
        if (cpe) throw cpe;
        result = {
          success: true,
          message: `Saved competitor price: ${competitor_name} — ${treatment_name} @ £${price}`,
        };
        break;
      }

      case 'send_payment_reminder': {
        if (!accessToken) {
          throw new Error('send_payment_reminder requires your session (access_token).');
        }
        const patient_name = String(action.params.patient_name || '');
        const { data: invs } = await supabase
          .from('invoices')
          .select('id')
          .eq('user_id', user_id)
          .ilike('patient_name', `%${patient_name}%`)
          .neq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(1);
        if (!invs?.length) {
          result = {
            success: false,
            message: `No unpaid invoice found for ${patient_name}`,
          };
          break;
        }
        await invokeAsUser(
          'send-payment-reminder',
          {
            invoiceId: invs[0].id,
            includeReview:
              Boolean(action.params.include_review) ||
              Boolean(action.params.includeReview),
          },
          accessToken,
        );
        result = {
          success: true,
          message: `Payment reminder SMS sent for ${patient_name} (needs phone on invoice)`,
        };
        break;
      }

      default:
        result = {
          success: false,
          message: `Unknown action: ${action.action}`,
        };
    }

    return { result, state: next };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: { success: false, error: message, message: `Failed: ${message}` },
      state: next,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      plan,
      user_id,
      access_token,
      mode,
      step_index: stepIndex,
      executor_state: executorStateIn,
    } = body as {
      plan: { summary: string; actions: PlanAction[] };
      user_id: string;
      access_token?: string;
      mode?: string;
      step_index?: number;
      executor_state?: ExecutorState;
    };

    if (!plan || !plan.actions) throw new Error('No plan provided');
    if (!user_id) throw new Error('user_id required');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (mode === 'single') {
      const idx = stepIndex ?? 0;
      if (idx < 0 || idx >= plan.actions.length) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid step_index' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const stateBefore = executorStateIn
        ? { ...defaultState(), ...executorStateIn }
        : defaultState();
      const action = plan.actions[idx];
      const { result, state } = await runOneAction(
        supabase,
        user_id,
        access_token,
        action,
        stateBefore,
      );

      return new Response(
        JSON.stringify({
          success: true,
          results: [
            {
              action: action.action,
              description: action.description,
              result,
            },
          ],
          executor_state: state,
          step_index: idx,
          done: idx + 1 >= plan.actions.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('[EXECUTOR] Executing plan:', plan.summary);

    const results: {
      action: string;
      description?: string;
      result: StepResult;
    }[] = [];

    let state = defaultState();

    for (const action of plan.actions) {
      console.log('[EXECUTOR] Action:', action.action, action.params);
      const { result, state: newState } = await runOneAction(
        supabase,
        user_id,
        access_token,
        action,
        state,
      );
      state = newState;
      results.push({
        action: action.action,
        description: action.description,
        result,
      });
    }

    const successCount = results.filter((r) => r.result.success).length;
    const totalCount = results.length;
    const failed = results.filter((r) => !r.result.success);
    const summary =
      failed.length === 0
        ? `All ${totalCount} steps completed. ${plan.summary}`
        : `Completed ${successCount} of ${totalCount} steps. Failed: ${failed.map((f) => f.description || f.action).join('; ')}.`;

    console.log('[EXECUTOR] Complete:', summary);

    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        summary,
        results,
        output: summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('[EXECUTOR] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
