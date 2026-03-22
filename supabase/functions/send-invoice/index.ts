import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** URL-safe slug from clinic name (used in you@mail.yourdomain.com) */
function baseSlug(name: string): string {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  return s || "clinic";
}

/** First email in a string (handles "Jane jane@x.com" or extra whitespace). */
function extractEmailAddress(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/,
  );
  return m ? m[0].trim().toLowerCase() : null;
}

/** SendGrid/local-part safe (RFC-ish); avoids "Invalid from email address" from bad slug chars */
function sanitizeEmailLocalPart(local: string): string {
  let t = String(local || "")
    .toLowerCase()
    .replace(/[^a-z0-9._+-]/g, "-");
  t = t.replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  const out = (t || "clinic").slice(0, 64);
  return out || "clinic";
}

/**
 * One platform domain (e.g. mail.optimedix.ai) verified once in SendGrid.
 * Each clinic gets a stable address: {slug}-{userIdShort}@domain
 */
async function ensurePlatformInvoiceFrom(
  supabaseClient: ReturnType<typeof createClient>,
  userId: string,
  profile: { invoice_send_slug?: string | null },
  clinicName: string,
  domain: string,
): Promise<string> {
  const rawSlug = String(profile.invoice_send_slug || "").trim();
  let slug: string;
  if (!rawSlug) {
    const idPart = userId.replace(/-/g, "").slice(0, 10);
    slug = sanitizeEmailLocalPart(`${baseSlug(clinicName)}-${idPart}`);
    const { error } = await supabaseClient
      .from("profiles")
      .update({ invoice_send_slug: slug })
      .eq("id", userId);
    if (error) {
      throw new Error(`Could not assign your send address: ${error.message}`);
    }
  } else {
    slug = sanitizeEmailLocalPart(rawSlug.toLowerCase());
  }
  return `${slug}@${domain}`;
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invoiceId, sendVia } = await req.json(); // sendVia: 'sms', 'email', or 'both'

    if (!invoiceId || !sendVia) {
      throw new Error("Invoice ID and send method are required");
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
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Get user profile (clinic + bank details + per-clinic email identity)
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select(
        "clinic_name, bank_name, account_number, sort_code, invoice_from_email, invoice_reply_to_email, invoice_sender_name, invoice_send_slug",
      )
      .eq("id", user.id)
      .single();

    const clinicName = profile?.clinic_name || "Our Clinic";
    const bankName = profile?.bank_name?.trim() || "";
    const sortCode = profile?.sort_code?.trim() || "";
    const accountNumber = profile?.account_number?.trim() || "";
    const bankLines: string[] = [];
    if (bankName) bankLines.push(`Bank: ${bankName}`);
    if (sortCode) bankLines.push(`Sort code: ${sortCode}`);
    if (accountNumber) bankLines.push(`Account: ${accountNumber}`);
    const bankDetailsText = bankLines.length > 0 ? bankLines.join(". ") : "See invoice for payment details.";

    /** One contact field: "both" must not run Twilio with an email (Twilio fails → email never runs). */
    const patientContactStr = String(invoice.patient_contact || "").trim();
    const extractedRoutingEmail = extractEmailAddress(patientContactStr);
    const contactIsEmail = extractedRoutingEmail !== null;
    const contactIsPhone =
      patientContactStr.length > 0 && extractedRoutingEmail === null;

    let doSms = false;
    let doEmail = false;
    if (sendVia === "email") {
      if (contactIsEmail) doEmail = true;
      else if (contactIsPhone) doSms = true;
    } else if (sendVia === "sms") {
      if (contactIsPhone) doSms = true;
      else if (contactIsEmail) doEmail = true;
    } else if (sendVia === "both") {
      if (contactIsEmail) doEmail = true;
      else if (contactIsPhone) doSms = true;
    }

    if (!doSms && !doEmail) {
      throw new Error(
        patientContactStr.length === 0
          ? "Patient contact is missing on the invoice."
          : "Could not send: add an email address for email, or a phone number (no @) for SMS.",
      );
    }

    const invoiceSendDomain = Deno.env.get("INVOICE_SEND_DOMAIN")?.trim().toLowerCase() || "";

    let clinicFromForEmail = "";
    if (doEmail) {
      if (invoiceSendDomain) {
        clinicFromForEmail = await ensurePlatformInvoiceFrom(
          supabaseClient,
          user.id,
          profile as { invoice_send_slug?: string | null },
          clinicName,
          invoiceSendDomain,
        );
      } else {
        clinicFromForEmail = (profile as { invoice_from_email?: string })
          ?.invoice_from_email?.trim() || "";
        if (!clinicFromForEmail) {
          throw new Error(
            "Add INVOICE_SEND_DOMAIN (e.g. mail.optimedix.ai) to Supabase Edge secrets for automatic clinic addresses, or set a custom Clinic send-from email in Settings.",
          );
        }
      }
    }

    const results: any = {};

    // Send via SMS (Twilio)
    if (doSms) {
      const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        throw new Error("Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in Supabase Edge Function secrets.");
      }

      const patientName = invoice.patient_name || "there";
      const treatmentName = invoice.treatment_name || "your treatment";
      const amountStr = `£${Number(invoice.amount).toFixed(2)}`;
      let smsMessage = `Hi ${patientName}, thank you for visiting ${clinicName}, for ${treatmentName}. Amount due: ${amountStr}. ${bankDetailsText}. Please find an invoice attached. We hope to see you again soon.`;
      if (invoice.invoice_pdf_url) {
        smsMessage += ` ${invoice.invoice_pdf_url}`;
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const formData = new URLSearchParams();
      formData.append("To", patientContactStr);
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

    // Send via Email: SendGrid (Twilio SendGrid) if SENDGRID_API_KEY, else Resend if RESEND_API_KEY
    if (doEmail) {
      const patientEmail = extractEmailAddress(patientContactStr);

      if (!patientEmail) {
        throw new Error(
          "Patient email address not found. Use Edit on the invoice to add the patient's email.",
        );
      }

      const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
      const resendApiKey = Deno.env.get("RESEND_API_KEY");

      /** Split "Name" <email> for APIs that need separate fields (SendGrid) */
      const parseFromParts = (header: string): { email: string; name?: string } => {
        const angle = header.match(/<([^>]+)>/);
        if (angle) {
          const email = angle[1].trim();
          const namePart = header
            .replace(/<[^>]+>/, "")
            .replace(/^[\s"']+|[\s"']+$/g, "")
            .trim();
          return namePart ? { email, name: namePart } : { email };
        }
        return { email: header.trim() };
      };

      const clinicFrom = clinicFromForEmail;

      const senderFromProfile = (profile as { invoice_sender_name?: string })
        ?.invoice_sender_name?.trim() || "";
      const fallbackName = (clinicName || "Clinic").replace(/["<>]/g, "").trim() || "Clinic";
      const senderDisplay = (senderFromProfile || fallbackName).replace(/["<>]/g, "").trim();
      /** From: "Dr Name" <clinic@domain> — clinic email required; domain must be verified in SendGrid/Resend */
      const fromHeader = `"${senderDisplay}" <${clinicFrom}>`;
      const replyTo =
        (profile as { invoice_reply_to_email?: string })?.invoice_reply_to_email?.trim() ||
        user.email ||
        undefined;

      const esc = (s: string) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const patientName = esc(invoice.patient_name || "there");
      const treatmentName = esc(invoice.treatment_name || "your treatment");
      const amountStr = `£${Number(invoice.amount).toFixed(2)}`;
      const clinicNameSafe = esc(clinicName);
      const senderDisplaySafe = esc(senderDisplay);
      const clinicFromSafe = esc(clinicFrom);
      const footerContactSafe = esc((replyTo || clinicFrom).trim());
      const invNumSafe = esc(String(invoice.invoice_number));
      const bankHtml =
        bankLines.length > 0
          ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#444;"><strong>Bank details</strong><br/>${bankLines.join("<br/>")}</p>`
          : "";
      // Re-fetch row so PDF URL exists right after generate-invoice-pdf on the client
      const { data: invFresh } = await supabaseClient
        .from("invoices")
        .select("invoice_pdf_url")
        .eq("id", invoiceId)
        .eq("user_id", user.id)
        .maybeSingle();
      const pdfUrl =
        (invFresh?.invoice_pdf_url as string) || invoice.invoice_pdf_url || "";
      const pdfUrlSafe = pdfUrl.replace(/"/g, "%22");
      const viewLink = pdfUrlSafe
        ? `<a href="${pdfUrlSafe}" style="display:inline-block;margin-top:20px;background:#1a1a1a;color:#fff!important;padding:12px 22px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View invoice</a>`
        : "";
      const emailHtml = `
<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:28px 24px;">
<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#18181b;">Hi ${patientName},</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:#3f3f46;">You received a new invoice from <strong>${clinicNameSafe}</strong>.</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#52525b;">Thank you for visiting for <strong>${treatmentName}</strong>. Amount due: <strong>${amountStr}</strong>.</p>
<div style="margin:16px 0;padding:14px 16px;background:#fafafa;border-radius:8px;border:1px solid #f4f4f5;">
<p style="margin:0;font-size:13px;color:#52525b;"><strong>Invoice number</strong> ${invNumSafe}</p>
<p style="margin:8px 0 0;font-size:13px;color:#52525b;"><strong>Amount</strong> ${amountStr}</p>
</div>
${bankHtml}
<p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:#52525b;">Please find your invoice attached. We hope to see you again soon.</p>
${viewLink}
<p style="margin:28px 0 0;font-size:14px;line-height:1.5;color:#18181b;">Best regards,<br/><strong>${senderDisplaySafe}</strong><br/><span style="color:#71717a;font-size:13px;">${clinicNameSafe}</span></p>
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;">Questions? Reply to this email or contact <a href="mailto:${footerContactSafe}" style="color:#52525b;">${footerContactSafe}</a>.</p>
</div>
</body></html>
      `.trim();

      const attachments: { filename: string; content: string }[] = [];
      if (pdfUrl) {
        try {
          const pdfRes = await fetch(pdfUrl);
          if (pdfRes.ok) {
            const pdfBuf = await pdfRes.arrayBuffer();
            const bytes = new Uint8Array(pdfBuf);
            let binary = "";
            const chunk = 8192;
            for (let i = 0; i < bytes.length; i += chunk) {
              const slice = bytes.subarray(i, i + chunk);
              binary += String.fromCharCode.apply(null, Array.from(slice));
            }
            attachments.push({
              filename: `Invoice-${String(invoice.invoice_number).replace(/\//g, "-")}.pdf`,
              content: btoa(binary),
            });
          }
        } catch (_) {
          // Continue without attachment if fetch fails
        }
      }

      const subject = `New invoice from ${clinicName}`;

      if (sendgridApiKey) {
        // Optional: one verified Single Sender in SendGrid (Settings → Sender Authentication).
        // Without this, SendGrid requires Domain Authentication on INVOICE_SEND_DOMAIN so every
        // local-part@domain is allowed; otherwise you get "Invalid from email address".
        const sendgridVerifiedFrom = Deno.env.get("SENDGRID_VERIFIED_FROM_EMAIL")?.trim() || "";
        const fromEmailForSg =
          sendgridVerifiedFrom.includes("@") ? sendgridVerifiedFrom : clinicFrom;
        const fromHeaderForSg = `"${senderDisplay}" <${fromEmailForSg}>`;
        const fromParts = parseFromParts(fromHeaderForSg);
        const sgBody: Record<string, unknown> = {
          personalizations: [{ to: [{ email: patientEmail }] }],
          from: fromParts.name
            ? { email: fromParts.email, name: fromParts.name }
            : { email: fromParts.email },
          subject,
          content: [{ type: "text/html", value: emailHtml }],
        };
        if (replyTo) {
          sgBody.reply_to = { email: replyTo };
        }
        if (attachments.length > 0) {
          sgBody.attachments = attachments.map((a) => ({
            content: a.content,
            filename: a.filename,
            type: "application/pdf",
            disposition: "attachment",
          }));
        }

        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sgBody),
        });
        if (!sgRes.ok) {
          const errText = await sgRes.text();
          let hint = "";
          try {
            const j = JSON.parse(errText) as { errors?: { message?: string }[] };
            const m = j?.errors?.[0]?.message || "";
            if (/invalid from|from email/i.test(m)) {
              hint =
                " Verify the From address in SendGrid: authenticate domain " +
                (invoiceSendDomain ? `"${invoiceSendDomain}" (Domain Authentication)` : "for your From domain") +
                ", or set Edge secret SENDGRID_VERIFIED_FROM_EMAIL to a verified Single Sender email " +
                `(tried "${fromEmailForSg}").`;
            }
          } catch {
            /* ignore */
          }
          throw new Error(`SendGrid error: ${errText}${hint}`);
        }
        results.email = { success: true, provider: "sendgrid" };
      } else if (resendApiKey) {
        const payload: Record<string, unknown> = {
          from: fromHeader,
          to: patientEmail,
          subject,
          html: emailHtml,
        };
        if (replyTo) payload.reply_to = replyTo;
        if (attachments.length > 0) payload.attachments = attachments;

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!resendRes.ok) {
          const errText = await resendRes.text();
          throw new Error(`Resend error: ${errText}`);
        }
        results.email = { success: true, provider: "resend" };
      } else {
        throw new Error(
          "Email is not configured: add SENDGRID_API_KEY or RESEND_API_KEY to Supabase Edge Function secrets, plus INVOICE_SEND_DOMAIN (or clinic send-from email in Settings) and optionally SENDGRID_VERIFIED_FROM_EMAIL for SendGrid.",
        );
      }
    }

    const delivered =
      Boolean(results.sms?.success) || Boolean(results.email?.success);
    if (delivered) {
      await supabaseClient
        .from("invoices")
        .update({ status: "sent" })
        .eq("id", invoiceId);
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
