import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const splitAddressLines = (value?: string | null) =>
  String(value || "")
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);

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
      .select("clinic_name, business_address, bank_name, account_number, sort_code, logo_url")
      .eq("id", user.id)
      .single();

    const clinicName = profile?.clinic_name || "Our Clinic";
    const clinicAddress = profile?.business_address?.trim() || "";
    const bankName = profile?.bank_name?.trim() || null;
    const sortCode = profile?.sort_code?.trim() || null;
    const accountNumber = profile?.account_number?.trim() || null;
    const hasBankDetails = bankName || sortCode || accountNumber;
    const logoUrl = (profile as { logo_url?: string })?.logo_url;

    const invoiceDate = new Date(invoice.issue_date).toLocaleDateString("en-GB");
    const treatmentDate = invoice.treatment_date
      ? new Date(invoice.treatment_date).toLocaleDateString("en-GB")
      : "";
    const amountStr = `£${Number(invoice.amount).toFixed(2)}`;
    const dueDate = new Date(invoice.issue_date);
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toLocaleDateString("en-GB");

    // Fetch patient address from patient catalogue via treatment entry
    let patientAddress = "";
    if (invoice.treatment_entry_id) {
      const { data: treatmentEntry } = await supabaseClient
        .from("treatment_entries")
        .select("patient_id")
        .eq("id", invoice.treatment_entry_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (treatmentEntry?.patient_id) {
        const { data: patient } = await supabaseClient
          .from("patients")
          .select("address")
          .eq("id", treatmentEntry.patient_id)
          .eq("user_id", user.id)
          .maybeSingle();
        patientAddress = patient?.address?.trim() || "";
      }
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 32;
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let y = pageHeight - margin;
    const brand = rgb(0.10, 0.14, 0.28);
    const textColor = rgb(0.17, 0.19, 0.24);
    const muted = rgb(0.45, 0.48, 0.55);
    const line = rgb(0.88, 0.90, 0.94);
    const softBlue = rgb(0.90, 0.95, 1.0);

    const step = (amount: number) => {
      y -= amount;
    };

    // Top section
    let logoDrawnHeight = 0;
    if (logoUrl && logoUrl.startsWith("http")) {
      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const logoBuf = new Uint8Array(await logoRes.arrayBuffer());
          const contentType = (logoRes.headers.get("content-type") || "").toLowerCase();
          const isPng = contentType.includes("png") || (logoBuf[0] === 0x89 && logoBuf[1] === 0x50);
          const image = isPng ? await pdfDoc.embedPng(logoBuf) : await pdfDoc.embedJpg(logoBuf);
          const maxH = 44;
          const scale = Math.min(maxH / image.height, 180 / image.width);
          const w = image.width * scale;
          const h = image.height * scale;
          page.drawImage(image, { x: margin, y: y - h, width: w, height: h });
          logoDrawnHeight = h;
        }
      } catch (_) {
        // no-op if logo fails
      }
    }

    const headerLeftTop = y;
    const businessNameY = logoDrawnHeight > 0 ? y - logoDrawnHeight - 8 : y - 2;
    page.drawText(clinicName.toUpperCase(), { x: margin, y: businessNameY, font: fontBold, size: 14, color: brand });
    let clinicAddressY = businessNameY - 16;
    for (const lineItem of splitAddressLines(clinicAddress).slice(0, 4)) {
      page.drawText(lineItem, { x: margin, y: clinicAddressY, font, size: 10.5, color: textColor });
      clinicAddressY -= 13;
    }

    const rightColX = pageWidth - margin - 150;
    page.drawText(`Invoice #${invoice.invoice_number}`, {
      x: rightColX,
      y: headerLeftTop - 4,
      font: fontBold,
      size: 13,
      color: brand,
    });
    page.drawText(`Issue Date: ${invoiceDate}`, {
      x: rightColX,
      y: headerLeftTop - 26,
      font,
      size: 11,
      color: textColor,
    });
    page.drawText(`Due Date: ${dueDateStr}`, {
      x: rightColX,
      y: headerLeftTop - 42,
      font,
      size: 11,
      color: textColor,
    });

    y = Math.min(clinicAddressY + 10, headerLeftTop - 42);
    step(20);
    page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, color: line, thickness: 1 });
    step(22);

    // Customer info block
    page.drawText("Customer Info:", { x: margin, y, font: fontBold, size: 11, color: muted });
    step(18);
    page.drawText(invoice.patient_name || "-", { x: margin, y, font: fontBold, size: 12, color: textColor });
    step(16);
    if (invoice.patient_contact) {
      page.drawText(invoice.patient_contact, { x: margin, y, font, size: 11, color: textColor });
      step(16);
    }
    for (const lineItem of splitAddressLines(patientAddress).slice(0, 3)) {
      page.drawText(lineItem, { x: margin, y, font, size: 10.5, color: textColor });
      step(14);
    }
    if (invoice.practitioner_name) {
      page.drawText(`Practitioner: ${invoice.practitioner_name}`, { x: margin, y, font, size: 11, color: textColor });
      step(16);
    }
    step(10);

    const inv = invoice as Record<string, unknown>;
    const ffApplied =
      inv.friends_family_discount_applied === true ||
      inv.friends_family_discount_applied === "true";
    const ffPct =
      inv.friends_family_discount_percent != null &&
      inv.friends_family_discount_percent !== ""
        ? Number(inv.friends_family_discount_percent)
        : null;
    const ffStd =
      inv.friends_family_standard_price != null &&
      inv.friends_family_standard_price !== ""
        ? Number(inv.friends_family_standard_price)
        : null;
    const invAmount = Number(invoice.amount);

    // Service table header
    const rowH = 34;
    page.drawRectangle({ x: margin, y: y - rowH + 10, width: contentWidth, height: rowH, color: softBlue });
    page.drawText("Product or Service", { x: margin + 8, y: y - 8, font: fontBold, size: 11, color: brand });
    page.drawText("Date", { x: margin + 320, y: y - 8, font: fontBold, size: 11, color: brand });
    page.drawText("Line Total", { x: margin + contentWidth - 74, y: y - 8, font: fontBold, size: 11, color: brand });
    step(42);

    // Service row (with friends & family breakdown under the line item when applicable)
    page.drawText(invoice.treatment_name || "Treatment", { x: margin + 8, y, font: fontBold, size: 12, color: textColor });
    page.drawText(treatmentDate || "-", { x: margin + 320, y, font, size: 11, color: textColor });
    page.drawText(amountStr, { x: margin + contentWidth - 58, y, font: fontBold, size: 12, color: textColor });
    step(16);

    if (ffApplied) {
      if (Number.isFinite(ffStd) && ffStd > invAmount + 0.005) {
        page.drawText(`  Standard list price: £${ffStd.toFixed(2)}`, {
          x: margin + 8,
          y,
          font,
          size: 9.5,
          color: muted,
        });
        step(13);
        const disc = Math.max(0, ffStd - invAmount);
        const pctLabel =
          Number.isFinite(ffPct) && ffPct > 0 ? ` (${ffPct}% off)` : "";
        page.drawText(`  Friends & family discount${pctLabel}: -£${disc.toFixed(2)}`, {
          x: margin + 8,
          y,
          font,
          size: 9.5,
          color: muted,
        });
        step(13);
      } else if (Number.isFinite(ffPct) && ffPct > 0) {
        page.drawText(
          `  Friends & family rate (${ffPct}% off standard list)`,
          { x: margin + 8, y, font, size: 9.5, color: muted },
        );
        step(13);
      } else {
        page.drawText("  Friends & family pricing applied", {
          x: margin + 8,
          y,
          font,
          size: 9.5,
          color: muted,
        });
        step(13);
      }
      page.drawText(`  Amount charged: ${amountStr}`, {
        x: margin + 8,
        y,
        font: fontBold,
        size: 10,
        color: textColor,
      });
      step(14);
    } else {
      step(6);
    }

    page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, color: line, thickness: 1 });
    step(16);

    // Totals block (right aligned)
    const totalsXLabel = margin + contentWidth - 210;
    const totalsXValue = margin + contentWidth - 20;
    page.drawText("Subtotal", { x: totalsXLabel, y, font: fontBold, size: 11, color: textColor });
    page.drawText(amountStr, { x: totalsXValue - 34, y, font: fontBold, size: 11, color: textColor });
    step(18);
    page.drawText("Invoice Total", { x: totalsXLabel, y, font: fontBold, size: 11, color: textColor });
    page.drawText(amountStr, { x: totalsXValue - 34, y, font: fontBold, size: 11, color: textColor });
    step(26);

    // Bank details box
    if (hasBankDetails) {
      const boxY = y - 70;
      page.drawRectangle({
        x: margin,
        y: boxY,
        width: contentWidth,
        height: 86,
        color: rgb(0.97, 0.98, 1),
      });
      page.drawText("Bank Details", { x: margin + 10, y: boxY + 66, font: fontBold, size: 11, color: brand });
      page.drawText(`Business Name: ${clinicName}`, { x: margin + 10, y: boxY + 48, font, size: 11, color: textColor });
      if (bankName) page.drawText(`Bank Name: ${bankName}`, { x: margin + 10, y: boxY + 32, font, size: 11, color: textColor });
      if (accountNumber) page.drawText(`Account Number: ${accountNumber}`, { x: margin + 10, y: boxY + 16, font, size: 11, color: textColor });
      if (sortCode) page.drawText(`Sort Code: ${sortCode}`, { x: margin + 290, y: boxY + 16, font, size: 11, color: textColor });
      y = boxY - 18;
    }

    // Optional notes
    if (invoice.notes) {
      page.drawText("Notes", { x: margin, y, font: fontBold, size: 11, color: muted });
      step(16);
      const notesLines = (invoice.notes as string).split("\n").slice(0, 4);
      for (const lineItem of notesLines) {
        page.drawText(lineItem.substring(0, 95), { x: margin, y, font, size: 10.5, color: textColor });
        step(14);
      }
      step(8);
    }

    // Footer
    const footerY = 40;
    page.drawLine({ start: { x: margin, y: footerY + 18 }, end: { x: margin + contentWidth, y: footerY + 18 }, color: line, thickness: 1 });
    page.drawText("Thank you for your business.", { x: margin, y: footerY, font, size: 10.5, color: muted });

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
