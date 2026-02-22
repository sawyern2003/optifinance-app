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
    const { invoiceId, includeReview } = await req.json();

    if (!invoiceId) {
      throw new Error("Invoice ID is required");
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

    // Get user profile (clinic name and bank details)
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("clinic_name, bank_name, account_number, sort_code")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error("Profile not found");
    }

    const clinicName = profile.clinic_name || "Our Clinic";
    const bankDetails = profile.account_number && profile.sort_code
      ? `${profile.bank_name || ""} ${profile.sort_code} ${profile.account_number}`.trim()
      : null;

    // Build SMS message
    let message = `Thank you for visiting ${clinicName} today. `;
    message += `Please send £${invoice.amount.toFixed(2)} `;
    
    if (bankDetails) {
      message += `to ${bankDetails}.`;
    } else {
      message += `(payment details in invoice).`;
    }

    if (includeReview) {
      message += ` We'd love your feedback!`;
    }

    // Get patient phone number
    const patientPhone = invoice.patient_contact;
    if (!patientPhone) {
      throw new Error("Patient phone number not found");
    }

    // Send SMS via Twilio
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error("Twilio credentials not configured");
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append("To", patientPhone);
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
      throw new Error(`Twilio error: ${errorText}`);
    }

    // Record reminder in database
    await supabaseClient.from("payment_reminders").insert({
      invoice_id: invoiceId,
      patient_phone: patientPhone,
      reminder_type: "initial",
      message_sent: message,
    });

    // Update invoice status to 'sent'
    await supabaseClient
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", invoiceId);

    return new Response(
      JSON.stringify({ success: true, message: "Payment reminder sent" }),
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
