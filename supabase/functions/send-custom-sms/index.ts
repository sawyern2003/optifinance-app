import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function looksLikePhone(contact: string): boolean {
  return extractPhoneNumber(contact) !== null;
}

function extractPhoneNumber(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/(?:\+|00)?\d[\d\s\-()]{7,}\d/);
  if (!m) return null;
  let phone = m[0].trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  return phone;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...corsHeaders } });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      patientName,
      patientContact,
      messageBody,
      relatedInvoiceId,
      metadata,
    } = await req.json();

    if (!patientName || !patientContact || !messageBody) {
      throw new Error("patientName, patientContact and messageBody are required");
    }

    if (!looksLikePhone(patientContact)) {
      throw new Error("patientContact must be a phone number for SMS");
    }

    const bodyText = String(messageBody).trim();
    if (!bodyText) {
      throw new Error("messageBody cannot be empty");
    }

    if (bodyText.length > 1200) {
      throw new Error("messageBody too long (max 1200 chars)");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error(
        "Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.",
      );
    }

    const phoneForSms = extractPhoneNumber(patientContact);
    if (!phoneForSms) throw new Error("No valid phone number found in patientContact");

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const formData = new URLSearchParams();
    formData.append("To", phoneForSms);
    formData.append("From", twilioPhoneNumber);
    formData.append("Body", bodyText);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const twilioJson = await twilioResponse.json().catch(() => ({} as Record<string, unknown>));
    if (!twilioResponse.ok) {
      const errorText = typeof twilioJson?.message === "string"
        ? twilioJson.message
        : JSON.stringify(twilioJson);
      throw new Error(`Twilio error: ${errorText}`);
    }

    // Optional log: if table exists, write message record.
    const logPayload = {
      patient_name: String(patientName),
      patient_contact: phoneForSms,
      channel: "sms",
      direction: "outbound",
      status: "sent",
      message_body: bodyText,
      related_invoice_id: relatedInvoiceId || null,
      provider_message_sid: twilioJson?.sid ?? null,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    };

    const { error: logError } = await supabaseClient.from("communication_messages").insert(logPayload);
    if (logError) {
      // Keep send successful even when optional log table is missing/not migrated.
      console.warn("communication_messages insert skipped:", logError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sid: twilioJson?.sid ?? null,
        status: twilioJson?.status ?? "sent",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
