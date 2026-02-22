import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invoiceId, sendVia } = await req.json(); // sendVia: 'sms', 'email', or 'both'

    if (!invoiceId || !sendVia) {
      throw new Error("Invoice ID and send method are required");
    }

    // Get the user from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("clinic_name")
      .eq("id", user.id)
      .single();

    const clinicName = profile?.clinic_name || "Our Clinic";

    const results: any = {};

    // Send via SMS
    if (sendVia === "sms" || sendVia === "both") {
      if (!invoice.patient_contact) {
        throw new Error("Patient phone number not found");
      }

      const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        throw new Error("Twilio credentials not configured");
      }

      let smsMessage = `Invoice ${invoice.invoice_number} from ${clinicName}\n`;
      smsMessage += `Amount: £${invoice.amount.toFixed(2)}\n`;
      if (invoice.invoice_pdf_url) {
        smsMessage += `View invoice: ${invoice.invoice_pdf_url}`;
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const formData = new URLSearchParams();
      formData.append("To", invoice.patient_contact);
      formData.append("From", twilioPhoneNumber);
      formData.append("Body", smsMessage);

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
        throw new Error(`Twilio error: ${errorText}`);
      }

      results.sms = { success: true };
    }

    // Send via Email (Resend API - optional: set RESEND_API_KEY and FROM_EMAIL in secrets)
    if (sendVia === "email" || sendVia === "both") {
      const patientEmail = invoice.patient_contact?.includes("@")
        ? invoice.patient_contact
        : null;

      if (!patientEmail) {
        throw new Error("Patient email address not found");
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("FROM_EMAIL") || "invoices@resend.dev"; // Resend onboarding domain

      const emailHtml = `
<p>Dear ${invoice.patient_name},</p>
<p>Please find your invoice below.</p>
<p><strong>Invoice Number:</strong> ${invoice.invoice_number}<br/>
<strong>Amount:</strong> £${Number(invoice.amount).toFixed(2)}<br/>
<strong>Treatment:</strong> ${invoice.treatment_name || "N/A"}</p>
${invoice.invoice_pdf_url ? `<p><a href="${invoice.invoice_pdf_url}">View and download your PDF invoice</a></p>` : ""}
<p>Thank you for your business!</p>
<p>Best regards,<br/>${clinicName}</p>
      `.trim();

      if (resendApiKey) {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: patientEmail,
            subject: `Invoice ${invoice.invoice_number} from ${clinicName}`,
            html: emailHtml,
          }),
        });
        if (!resendRes.ok) {
          const errText = await resendRes.text();
          throw new Error(`Email failed: ${errText}`);
        }
        results.email = { success: true };
      } else {
        results.email = { success: false, note: "Set RESEND_API_KEY (and optional FROM_EMAIL) in Supabase secrets to send email" };
      }
    }

    // Update invoice status
    await supabaseClient
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", invoiceId);

    return new Response(
      JSON.stringify({ success: true, results }),
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
