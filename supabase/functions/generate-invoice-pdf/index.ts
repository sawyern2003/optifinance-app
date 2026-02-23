import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function drawText(
  page: { drawText: (text: string, opts: { x: number; y: number; font: any; size: number }) => void },
  text: string,
  x: number,
  y: number,
  font: any,
  size: number
) {
  page.drawText(text, { x, y, font, size });
}

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...corsHeaders } });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "No authorization header" }, 401);
    }

    let body: { invoiceId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const invoiceId = body?.invoiceId;
    if (!invoiceId) {
      return json({ error: "Invoice ID is required" }, 400);
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
      return json({ error: "User not authenticated" }, 401);
    }

    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("clinic_name, bank_name, account_number, sort_code, logo_url")
      .eq("id", user.id)
      .single();

    const clinicName = profile?.clinic_name || "Our Clinic";
    const bankDetails =
      profile?.account_number && profile?.sort_code
        ? `${profile.bank_name || ""} ${profile.sort_code} ${profile.account_number}`.trim()
        : null;
    const logoUrl = (profile as { logo_url?: string })?.logo_url;

    const invoiceDate = new Date(invoice.issue_date).toLocaleDateString("en-GB");
    const treatmentDate = invoice.treatment_date
      ? new Date(invoice.treatment_date).toLocaleDateString("en-GB")
      : "";
    const amountStr = `£${Number(invoice.amount).toFixed(2)}`;

    // Create real PDF with pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 50;
    const pageWidth = page.getWidth();
    let y = page.getHeight() - margin;
    const lineHeight = 16;
    const smallLine = 12;

    const next = (dy: number = lineHeight) => {
      y -= dy;
      return y;
    };

    // Optional logo (top-left, max height 48pt)
    let headerStartY = y;
    if (logoUrl && logoUrl.startsWith("http")) {
      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const logoBuf = new Uint8Array(await logoRes.arrayBuffer());
          const contentType = (logoRes.headers.get("content-type") || "").toLowerCase();
          const isPng = contentType.includes("png") || (logoBuf[0] === 0x89 && logoBuf[1] === 0x50);
          const image = isPng
            ? await pdfDoc.embedPng(logoBuf)
            : await pdfDoc.embedJpg(logoBuf);
          const maxH = 48;
          const scale = Math.min(maxH / image.height, 200 / image.width);
          const w = image.width * scale;
          const h = image.height * scale;
          page.drawImage(image, { x: margin, y: y - h, width: w, height: h });
          headerStartY = y - h - 8;
        }
      } catch (_) {
        // Skip logo on fetch/embed error
      }
    }
    y = headerStartY;

    // Header: clinic name and INVOICE
    page.drawText(clinicName, { x: margin, y, font: fontBold, size: 22 });
    next(28);
    page.drawText("INVOICE", { x: margin, y, font: fontBold, size: 18 });
    next(24);

    // Details
    drawText(page, `Invoice Number: ${invoice.invoice_number}`, margin, y, font, smallLine);
    next();
    drawText(page, `Issue Date: ${invoiceDate}`, margin, y, font, smallLine);
    next();
    drawText(page, `Patient: ${invoice.patient_name}`, margin, y, font, smallLine);
    next();
    if (invoice.patient_contact) {
      drawText(page, `Contact: ${invoice.patient_contact}`, margin, y, font, smallLine);
      next();
    }
    if (invoice.practitioner_name) {
      drawText(page, `Practitioner: ${invoice.practitioner_name}`, margin, y, font, smallLine);
      next();
    }
    next(12);

    // Table header
    drawText(page, "Description", margin, y, fontBold, smallLine);
    drawText(page, "Date", 320, y, fontBold, smallLine);
    drawText(page, "Amount", 480, y, fontBold, smallLine);
    next(14);
    page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y } });
    next(8);

    // Table row
    drawText(page, invoice.treatment_name || "Treatment", margin, y, font, smallLine);
    drawText(page, treatmentDate, 320, y, font, smallLine);
    drawText(page, amountStr, 480, y, font, smallLine);
    next(20);

    // Total
    drawText(page, "Total", margin, y, fontBold, 14);
    drawText(page, amountStr, 480, y, fontBold, 14);
    next(24);

    if (bankDetails) {
      page.drawText("Bank transfer details:", { x: margin, y, font: fontBold, size: smallLine });
      next();
      page.drawText(bankDetails, { x: margin, y, font, size: smallLine });
      next(20);
    }

    if (invoice.notes) {
      page.drawText("Notes:", { x: margin, y, font: fontBold, size: smallLine });
      next();
      const notesLines = (invoice.notes as string).split("\n").slice(0, 5);
      for (const line of notesLines) {
        page.drawText(line.substring(0, 80), { x: margin, y, font, size: smallLine });
        next();
      }
    }

    // Footer at bottom of page
    const footerY = 50;
    page.drawText("Thank you for your business.", {
      x: margin,
      y: footerY,
      font: font,
      size: smallLine,
    });
    page.drawText(clinicName, {
      x: margin,
      y: footerY - lineHeight,
      font: font,
      size: 11,
    });

    const pdfBytes = await pdfDoc.save();

    // Upload PDF to Storage
    const fileName = `invoices/${invoiceId}-${String(invoice.invoice_number).replace(/\//g, "-")}.pdf`;
    const { error: uploadError } = await supabaseClient.storage
      .from("files")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    const { data: urlData } = supabaseClient.storage
      .from("files")
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;

    await supabaseClient
      .from("invoices")
      .update({ invoice_pdf_url: pdfUrl })
      .eq("id", invoiceId);

    return json({ success: true, pdfUrl }, 200);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      400
    );
  }
});
