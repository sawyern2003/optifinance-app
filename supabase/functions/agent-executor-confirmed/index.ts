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
};

function defaultState(): ExecutorState {
  return {
    currentPatientId: null,
    currentPatientName: '',
    currentPrice: 0,
    currentInvoiceId: null,
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

/** Build a single contact string send-invoice can parse (email and/or phone). */
function formatPatientContact(patient: {
  email?: string | null;
  contact?: string | null;
} | null): string {
  if (!patient) return '';
  const email = String(patient.email || '').trim();
  const contact = String(patient.contact || '').trim();
  if (email && contact) return `${email} · ${contact}`;
  return email || contact;
}

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
        next.currentPatientName = patient_name;

        const { data: newPatient, error } = await supabase
          .from('patients')
          .insert({
            user_id: user_id,
            name: patient_name,
            email: email || '',
            contact: contact || '',
            date_added: new Date().toISOString().split('T')[0],
            notes: '',
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
          .select('*')
          .eq('user_id', user_id)
          .ilike('name', `%${patient_name}%`)
          .limit(1)
          .maybeSingle();

        const patient_contact = formatPatientContact(patient);

        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const nextInvoiceNumber = `${timestamp}${random}`;

        const { data: invoice, error } = await supabase
          .from('invoices')
          .insert({
            user_id: user_id,
            invoice_number: nextInvoiceNumber,
            patient_name: patient_name,
            patient_contact: patient_contact,
            treatment_name: treatment_name,
            treatment_date: new Date().toISOString().split('T')[0],
            amount: finalAmount,
            issue_date: new Date().toISOString().split('T')[0],
            status: 'draft',
          })
          .select()
          .single();

        if (error) throw error;

        next.currentInvoiceId = invoice.id;

        const contactHint = patient_contact
          ? ''
          : ' Add phone or email on the patient or invoice to send.';
        result = {
          success: true,
          invoice: invoice,
          message: `Created invoice for £${finalAmount.toFixed(2)}${contactHint}`,
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

        if (!invoice.invoice_pdf_url) {
          await invokeAsUser('generate-invoice-pdf', { invoiceId: invoice.id }, accessToken);
        }

        await invokeAsUser(
          'send-invoice',
          {
            invoiceId: invoice.id,
            sendVia: 'both',
          },
          accessToken,
        );

        await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoice.id);

        result = {
          success: true,
          invoice: invoice,
          message: `Invoice sent to ${patient_name} (SMS and/or email, depending on contact details)`,
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
