/**
 * AGENT EXECUTOR CONFIRMED - Execute pre-approved plans
 *
 * Takes a plan from agent-planner that user has confirmed.
 * Executes each action in sequence.
 * Returns detailed results for each step.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { plan, user_id } = await req.json();

    if (!plan || !plan.actions) throw new Error('No plan provided');
    if (!user_id) throw new Error('user_id required');

    console.log('[EXECUTOR] Executing plan:', plan.summary);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const results = [];
    let currentPatientId: number | null = null;
    let currentPatientName = '';
    let currentPrice = 0;

    // Execute each action in sequence
    for (const action of plan.actions) {
      console.log('[EXECUTOR] Action:', action.action, action.params);

      try {
        let result;

        switch (action.action) {
          case 'find_patient': {
            const { patient_name } = action.params;
            currentPatientName = patient_name;

            const { data: existingPatients } = await supabase
              .from('patients')
              .select('*')
              .eq('user_id', user_id)
              .ilike('name', `%${patient_name}%`)
              .limit(1);

            if (existingPatients && existingPatients.length > 0) {
              currentPatientId = existingPatients[0].id;
              result = {
                success: true,
                patient: existingPatients[0],
                message: `Found ${patient_name}`,
              };
            } else {
              result = {
                success: false,
                message: `${patient_name} not found - will create when adding treatment`,
              };
            }
            break;
          }

          case 'create_patient': {
            const { patient_name, email, contact } = action.params;
            currentPatientName = patient_name;

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

            currentPatientId = newPatient.id;
            result = {
              success: true,
              patient: newPatient,
              message: `Created patient ${patient_name}`,
            };
            break;
          }

          case 'get_price': {
            const { treatment_name } = action.params;

            const { data: treatments } = await supabase
              .from('treatment_catalog')
              .select('*')
              .eq('user_id', user_id)
              .ilike('treatment_name', `%${treatment_name}%`)
              .limit(1);

            if (treatments && treatments.length > 0) {
              currentPrice = treatments[0].price;
              result = {
                success: true,
                treatment: treatments[0],
                price: currentPrice,
                message: `${treatment_name} costs £${currentPrice}`,
              };
            } else {
              result = {
                success: false,
                message: `${treatment_name} not found in catalogue`,
              };
            }
            break;
          }

          case 'add_treatment': {
            const { patient_name, treatment_name, date, payment_status } = action.params;
            const price = currentPrice || action.params.price || 0;
            const paidAmount = payment_status === 'paid' ? price : 0;

            // Create patient if not exists
            if (!currentPatientId) {
              const { data: existingPatients } = await supabase
                .from('patients')
                .select('id')
                .eq('user_id', user_id)
                .ilike('name', `%${patient_name}%`)
                .limit(1);

              if (existingPatients && existingPatients.length > 0) {
                currentPatientId = existingPatients[0].id;
              } else {
                const { data: newPatient } = await supabase
                  .from('patients')
                  .insert({
                    user_id: user_id,
                    name: patient_name,
                    email: '',
                    contact: '',
                    date_added: new Date().toISOString().split('T')[0],
                    notes: 'Auto-created from treatment',
                  })
                  .select('id')
                  .single();

                currentPatientId = newPatient?.id || null;
              }
            }

            // Parse date
            let treatmentDate = new Date().toISOString().split('T')[0];
            if (date) {
              if (date === 'today') {
                treatmentDate = new Date().toISOString().split('T')[0];
              } else if (date === 'yesterday') {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                treatmentDate = yesterday.toISOString().split('T')[0];
              } else if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                treatmentDate = date;
              }
            }

            const { data: treatment, error } = await supabase
              .from('treatment_entries')
              .insert({
                user_id: user_id,
                patient_id: currentPatientId,
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
              message: `Added ${treatment_name} to ${patient_name}'s card`,
            };
            break;
          }

          case 'create_invoice': {
            const { patient_name, treatment_name, discount_percentage, discount_amount } = action.params;
            let finalAmount = currentPrice || action.params.price || 0;

            // Apply discount
            if (discount_percentage) {
              finalAmount = finalAmount * (1 - discount_percentage / 100);
            } else if (discount_amount) {
              finalAmount = finalAmount - discount_amount;
            }

            // Get patient contact info
            const { data: patient } = await supabase
              .from('patients')
              .select('*')
              .eq('user_id', user_id)
              .ilike('name', `%${patient_name}%`)
              .limit(1)
              .single();

            // Get latest invoice number
            const { data: latestInvoice } = await supabase
              .from('invoices')
              .select('invoice_number')
              .eq('user_id', user_id)
              .order('invoice_number', { ascending: false })
              .limit(1)
              .single();

            const nextInvoiceNumber = latestInvoice
              ? parseInt(latestInvoice.invoice_number) + 1
              : 1;

            const { data: invoice, error } = await supabase
              .from('invoices')
              .insert({
                user_id: user_id,
                invoice_number: nextInvoiceNumber.toString(),
                patient_name: patient_name,
                patient_contact: patient?.contact || patient?.email || '',
                treatment_name: treatment_name,
                treatment_date: new Date().toISOString().split('T')[0],
                amount: finalAmount,
                issue_date: new Date().toISOString().split('T')[0],
                status: 'draft',
              })
              .select()
              .single();

            if (error) throw error;

            result = {
              success: true,
              invoice: invoice,
              message: `Created invoice for £${finalAmount.toFixed(2)}`,
            };
            break;
          }

          case 'send_invoice': {
            const { patient_name } = action.params;

            // Find most recent invoice for this patient
            const { data: invoice } = await supabase
              .from('invoices')
              .select('*')
              .eq('user_id', user_id)
              .ilike('patient_name', `%${patient_name}%`)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (!invoice) {
              throw new Error(`No invoice found for ${patient_name}`);
            }

            // Generate PDF if needed
            if (!invoice.invoice_pdf_url) {
              await supabase.functions.invoke('generate-invoice-pdf', {
                body: { invoiceId: invoice.id }
              });
            }

            // Send via SMS and email
            await supabase.functions.invoke('send-invoice', {
              body: {
                invoiceId: invoice.id,
                sendVia: 'both'
              }
            });

            // Update status
            await supabase
              .from('invoices')
              .update({ status: 'sent' })
              .eq('id', invoice.id);

            result = {
              success: true,
              invoice: invoice,
              message: `Sent invoice to ${patient_name}`,
            };
            break;
          }

          case 'book_appointment': {
            const { patient_name, treatment_name, date, time } = action.params;

            // Parse date
            let appointmentDate = new Date().toISOString().split('T')[0];
            if (date === 'today') {
              appointmentDate = new Date().toISOString().split('T')[0];
            } else if (date === 'tomorrow') {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              appointmentDate = tomorrow.toISOString().split('T')[0];
            } else if (date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
              appointmentDate = date;
            }

            const { data: appointment, error } = await supabase
              .from('appointments')
              .insert({
                user_id: user_id,
                patient_id: currentPatientId,
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
              message: `Booked ${patient_name} for ${treatment_name} on ${appointmentDate}`,
            };
            break;
          }

          default:
            result = {
              success: false,
              message: `Unknown action: ${action.action}`,
            };
        }

        results.push({
          action: action.action,
          description: action.description,
          result: result,
        });

      } catch (error: any) {
        console.error('[EXECUTOR] Error:', error);
        results.push({
          action: action.action,
          description: action.description,
          result: {
            success: false,
            error: error.message,
            message: `Failed: ${error.message}`,
          },
        });
      }
    }

    // Build final message
    const successCount = results.filter(r => r.result.success).length;
    const totalCount = results.length;

    const summary = `Completed ${successCount} of ${totalCount} actions. ${plan.summary}`;

    console.log('[EXECUTOR] Complete:', summary);

    return new Response(
      JSON.stringify({
        success: successCount === totalCount,
        summary: summary,
        results: results,
        output: summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[EXECUTOR] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
