import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // No auth required - public booking confirmations
    // We use service role key below to access data

    const { appointmentId, clinicUserId } = await req.json();

    if (!appointmentId || !clinicUserId) {
      throw new Error("appointmentId and clinicUserId required");
    }

    // Use service role key to bypass RLS and access all data
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get appointment details
    const { data: appointment, error: aptError } = await supabaseClient
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .eq("user_id", clinicUserId)
      .single();

    if (aptError || !appointment) {
      throw new Error("Appointment not found");
    }

    // Get clinic profile
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("clinic_name, invoice_from_email, invoice_sender_name, invoice_send_slug")
      .eq("id", clinicUserId)
      .single();

    const clinicName = profile?.clinic_name || "The Clinic";
    const senderName = profile?.invoice_sender_name || clinicName;

    // Format date/time
    const appointmentDate = new Date(appointment.date + "T" + appointment.time);
    const formattedDate = appointmentDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const results: any = {};

    // Send SMS if patient has phone
    if (appointment.patient_phone) {
      const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

      if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
        const smsMessage = `Hi ${appointment.patient_name}, your appointment at ${clinicName} is confirmed for ${formattedDate} at ${appointment.time} for ${appointment.treatment_name}. See you then!`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
        const formData = new URLSearchParams();
        formData.append("To", appointment.patient_phone);
        formData.append("From", twilioPhoneNumber);
        formData.append("Body", smsMessage);

        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        if (twilioResponse.ok) {
          results.sms = { success: true };
        }
      }
    }

    // Send Email if patient has email
    if (appointment.patient_email) {
      const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const invoiceSendDomain = Deno.env.get("INVOICE_SEND_DOMAIN") || "";

      // Use same email format as invoices
      let fromEmail = profile?.invoice_from_email;
      if (!fromEmail && invoiceSendDomain && profile?.invoice_send_slug) {
        fromEmail = `${profile.invoice_send_slug}@${invoiceSendDomain}`;
      }
      if (!fromEmail) {
        fromEmail = "noreply@yourdomain.com"; // Fallback
      }

      const fromHeader = `"${senderName}" <${fromEmail}>`;

      const emailHtml = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 16px;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:28px 24px;">
    <h2 style="margin:0 0 20px;font-size:22px;font-weight:600;color:#1a2845;">Appointment Confirmed</h2>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3f3f46;">
      Dear ${appointment.patient_name},
    </p>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#3f3f46;">
      Your appointment at <strong>${clinicName}</strong> has been confirmed.
    </p>

    <div style="background:#fef9f0;border-left:4px solid #d4a740;padding:16px;margin:20px 0;border-radius:6px;">
      <p style="margin:0 0 8px;font-size:14px;color:#71717a;"><strong>Treatment:</strong></p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1a2845;">${appointment.treatment_name}</p>

      <p style="margin:0 0 8px;font-size:14px;color:#71717a;"><strong>Date:</strong></p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1a2845;">${formattedDate}</p>

      <p style="margin:0 0 8px;font-size:14px;color:#71717a;"><strong>Time:</strong></p>
      <p style="margin:0;font-size:16px;font-weight:600;color:#1a2845;">${appointment.time}</p>
    </div>

    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#52525b;">
      If you need to reschedule or cancel, please contact us as soon as possible.
    </p>

    <p style="margin:28px 0 0;font-size:14px;line-height:1.5;color:#18181b;">
      Best regards,<br/>
      <strong>${senderName}</strong><br/>
      <span style="color:#71717a;font-size:13px;">${clinicName}</span>
    </p>

    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;">
      This is an automated confirmation email from ${clinicName}.
    </p>
  </div>
</body>
</html>
      `.trim();

      const subject = `Appointment Confirmed - ${clinicName}`;

      if (sendgridApiKey) {
        const sgBody = {
          personalizations: [{ to: [{ email: appointment.patient_email }] }],
          from: { email: fromEmail, name: senderName },
          subject,
          content: [{ type: "text/html", value: emailHtml }],
        };

        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sgBody),
        });

        if (sgRes.ok) {
          results.email = { success: true, provider: "sendgrid" };
        }
      } else if (resendApiKey) {
        const payload = {
          from: fromHeader,
          to: appointment.patient_email,
          subject,
          html: emailHtml,
        };

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (resendRes.ok) {
          results.email = { success: true, provider: "resend" };
        }
      }
    }

    // Mark confirmation as sent
    if (results.email?.success || results.sms?.success) {
      await supabaseClient
        .from("appointments")
        .update({ confirmation_sent: true })
        .eq("id", appointmentId);
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Booking confirmation error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
