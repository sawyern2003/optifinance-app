import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Default follow-up intervals in days
const FOLLOWUP_INTERVALS = [7, 14, 30]; // First follow-up after 7 days, second after 14, third after 30
const MAX_FOLLOWUPS = 3;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get service role client for admin access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get all invoices that are 'sent' but not 'paid'
    const { data: invoices, error: invoicesError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .in("status", ["sent", "overdue"])
      .neq("status", "paid");

    if (invoicesError) {
      throw new Error(`Failed to fetch invoices: ${invoicesError.message}`);
    }

    if (!invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No invoices need follow-ups", processed: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error("Twilio credentials not configured");
    }

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const invoice of invoices) {
      try {
        // Get all reminders for this invoice, ordered by sent_at
        const { data: reminders, error: remindersError } = await supabaseAdmin
          .from("payment_reminders")
          .select("*")
          .eq("invoice_id", invoice.id)
          .order("sent_at", { ascending: false });

        if (remindersError) {
          results.errors.push(`Invoice ${invoice.id}: ${remindersError.message}`);
          continue;
        }

        const reminderCount = reminders?.length || 0;
        
        // Skip if we've already sent max follow-ups
        if (reminderCount >= MAX_FOLLOWUPS + 1) { // +1 for initial reminder
          results.skipped++;
          continue;
        }

        // Calculate days since invoice issue date
        const now = new Date();
        const issueDate = new Date(invoice.issue_date);
        const daysSinceIssue = Math.floor(
          (now.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Determine which follow-up we should send (0 = first follow-up, 1 = second, etc.)
        // reminderCount includes the initial reminder, so:
        // reminderCount 1 = initial sent, need first follow-up (index 0)
        // reminderCount 2 = 1 follow-up sent, need second follow-up (index 1)
        const followupIndex = reminderCount - 1;
        
        if (followupIndex >= FOLLOWUP_INTERVALS.length) {
          results.skipped++;
          continue;
        }

        const requiredInterval = FOLLOWUP_INTERVALS[followupIndex];

        // Check if it's time to send this follow-up (based on days since invoice issue)
        if (daysSinceIssue < requiredInterval) {
          results.skipped++;
          continue;
        }

        // Also check that we haven't already sent this follow-up
        // by verifying the last reminder was sent before the current interval threshold
        const lastReminder = reminders?.[0];
        if (lastReminder) {
          const lastReminderDate = new Date(lastReminder.sent_at);
          const daysSinceLastReminder = Math.floor(
            (now.getTime() - lastReminderDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          // If we sent a reminder very recently (within 1 day), skip to avoid duplicates
          if (daysSinceLastReminder < 1) {
            results.skipped++;
            continue;
          }
        }

        // Get user profile for bank details
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("clinic_name, bank_name, account_number, sort_code")
          .eq("id", invoice.user_id)
          .single();

        if (profileError) {
          results.errors.push(`Invoice ${invoice.id}: Profile not found`);
          continue;
        }

        const clinicName = profile.clinic_name || "Our Clinic";
        const bankDetails = profile.account_number && profile.sort_code
          ? `${profile.bank_name || ""} ${profile.sort_code} ${profile.account_number}`.trim()
          : null;

        // Build follow-up message
        let message = `Reminder: Payment due from ${clinicName}. `;
        message += `Invoice ${invoice.invoice_number}: £${invoice.amount.toFixed(2)} `;
        
        if (bankDetails) {
          message += `Please pay to ${bankDetails}.`;
        } else {
          message += `Please make payment.`;
        }

        if (!invoice.patient_contact) {
          results.errors.push(`Invoice ${invoice.id}: No patient contact`);
          continue;
        }

        // Send SMS via Twilio
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
        const formData = new URLSearchParams();
        formData.append("To", invoice.patient_contact);
        formData.append("From", twilioPhoneNumber);
        formData.append("Body", message);

        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        if (!twilioResponse.ok) {
          const errorText = await twilioResponse.text();
          results.errors.push(`Invoice ${invoice.id}: Twilio error - ${errorText}`);
          continue;
        }

        // Record follow-up reminder
        await supabaseAdmin.from("payment_reminders").insert({
          invoice_id: invoice.id,
          patient_phone: invoice.patient_contact,
          reminder_type: "followup",
          message_sent: message,
        });

        // Update invoice status to 'overdue' if it's been more than 14 days
        if (daysSinceLastReminder > 14 && invoice.status !== "overdue") {
          await supabaseAdmin
            .from("invoices")
            .update({ status: "overdue" })
            .eq("id", invoice.id);
        }

        results.sent++;
        results.processed++;
      } catch (error) {
        results.errors.push(`Invoice ${invoice.id}: ${error.message}`);
        results.processed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
