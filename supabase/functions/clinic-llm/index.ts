/**
 * Unified clinic LLM: voice diary, Quick Add treatments, CSV import (patients / treatment rows),
 * bank statement expenses, pricing analysis.
 * Secret: OPENAI_API_KEY
 *
 * Deploy: supabase functions deploy clinic-llm --no-verify-jwt --project-ref YOUR_REF
 */

const CSV_IMPORT_MAX_CHARS = 120_000;

function stripBomAndClampCsv(text: string): string {
  let s = text.replace(/^\uFEFF/, "").trim();
  if (s.length > CSV_IMPORT_MAX_CHARS) {
    s = s.slice(0, CSV_IMPORT_MAX_CHARS);
  }
  return s;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "gpt-4o-mini";

/** Base64 for image uploads (avoid heavy deps on Edge). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function parseModelJson(content: string): unknown {
  let s = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence) s = fence[1].trim();
  return JSON.parse(s);
}

async function openaiChatJson(params: {
  apiKey: string;
  system: string;
  userContent: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<unknown> {
  const {
    apiKey,
    system,
    userContent,
    maxTokens = 4096,
    temperature = 0.2,
  } = params;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const completion = await response.json();
  const raw = completion?.choices?.[0]?.message?.content?.trim() || "{}";
  return parseModelJson(raw);
}

async function openaiChatText(params: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const { apiKey, system, user, maxTokens = 2500, temperature = 0.4 } =
    params;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const completion = await response.json();
  return (
    completion?.choices?.[0]?.message?.content?.trim() ||
    "No analysis could be generated."
  );
}

async function openaiUploadFile(
  apiKey: string,
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), filename);
  form.append("purpose", "assistants");
  const res = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OpenAI file upload failed: ${await res.text()}`);
  }
  const j = await res.json();
  return j.id as string;
}

async function openaiDeleteFile(apiKey: string, fileId: string): Promise<void> {
  await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// --- Voice diary (same contract as former voice-diary-parse) ---

type CatalogRow = {
  treatment_name: string;
  default_price: number | null;
  duration_minutes: number | null;
};

type PendingRow = {
  patient_name: string;
  treatment_name: string;
  price_paid: number;
  date: string;
};

function normalizeVoiceDiaryParsed(data: unknown): {
  treatments: Record<string, unknown>[];
  payment_updates: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  patients: Record<string, unknown>[];
  catalog_treatments: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  clinical_notes: Record<string, unknown>[];
} {
  if (!data || typeof data !== "object") {
    return {
      treatments: [],
      payment_updates: [],
      invoices: [],
      patients: [],
      catalog_treatments: [],
      expenses: [],
      clinical_notes: [],
    };
  }
  const o = data as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    treatments: arr(o.treatments) as Record<string, unknown>[],
    payment_updates: arr(o.payment_updates) as Record<string, unknown>[],
    invoices: arr(o.invoices) as Record<string, unknown>[],
    patients: arr(o.patients) as Record<string, unknown>[],
    catalog_treatments: arr(o.catalog_treatments) as Record<string, unknown>[],
    expenses: arr(o.expenses) as Record<string, unknown>[],
    clinical_notes: arr(o.clinical_notes) as Record<string, unknown>[],
  };
}

function buildVoiceDiaryPrompt(ctx: {
  transcript: string;
  todayDate: string;
  yesterdayDate: string;
  treatmentsCatalog: CatalogRow[];
  practitionerNames: string[];
  patientNames: string[];
  recentPending: PendingRow[];
}): string {
  const catalogStr = (ctx.treatmentsCatalog || [])
    .map(
      (t) =>
        `${t.treatment_name} (£${t.default_price ?? 0}, ${t.duration_minutes ?? "N/A"} min)`,
    )
    .join(", ");

  const pendingStr =
    ctx.recentPending && ctx.recentPending.length > 0
      ? ctx.recentPending
          .map(
            (r) =>
              `${r.patient_name} - ${r.treatment_name} - £${r.price_paid} (${r.date})`,
          )
          .join(", ")
      : "None";

  const transcriptJson = JSON.stringify(ctx.transcript);

  return `You are an assistant helping a beauty or wellness clinic parse a voice diary entry.

TODAY'S DATE: ${ctx.todayDate}
YESTERDAY'S DATE: ${ctx.yesterdayDate}

AVAILABLE TREATMENTS (match names closely; use default price if user omits amount): ${catalogStr || "None listed"}

AVAILABLE PRACTITIONERS: ${(ctx.practitionerNames || []).join(", ") || "None"}

KNOWN PATIENTS: ${(ctx.patientNames || []).join(", ") || "None"}

RECENT PENDING TREATMENTS (for payment / invoice matching): ${pendingStr}

USER VOICE DIARY ENTRY (verbatim JSON string): ${transcriptJson}

Extract ALL relevant information:

1) NEW TREATMENTS — visits described; use ISO dates (YYYY-MM-DD). "today" = ${ctx.todayDate}, "yesterday" = ${ctx.yesterdayDate}.
   Fields per item: date, patient_name, treatment_name, price_paid (number), payment_status ("paid"|"pending"|"partially_paid"), amount_paid (number; 0 if pending), practitioner_name (string or null), duration_minutes (number or null), notes (string or null).

2) PAYMENT UPDATES — money received against existing work; phrases like paid, settled, cleared.
   Fields: patient_name, treatment_name (string or null), amount_paid (number), date_hint (string or null, e.g. "yesterday").

3) INVOICES — create an invoice for a pending treatment, and optionally SEND it (email / SMS / both).
   - Set send_after_create to TRUE when the speaker asks to send, email, text, SMS, WhatsApp, or "fire off" the invoice (e.g. "please send an invoice to Jane", "email Bob his invoice", "text her the invoice").
   - Set send_after_create to FALSE when they only want the invoice created/raised without sending (e.g. "create an invoice for Sam" with no send/dispatch wording).
   Fields per item:
   - patient_name, treatment_name, amount (number), date (YYYY-MM-DD of the treatment)
   - send_after_create (boolean)
   - send_via: "email" if they specify email/mail OR if they only say "send the invoice" without mentioning text/SMS; "sms" for text/SMS only; "both" ONLY if they explicitly ask for both email and text
   - patient_contact (string or null): ONLY if the entry gives an explicit email or phone for delivery (e.g. "send to jane@x.com"); otherwise null (the app will use the patient record)

4) NEW PATIENTS — people not clearly in KNOWN PATIENTS with contact info if given.
   Fields: name, contact (string or null), phone (string or null).

5) CATALOG TREATMENTS — user asks to add a treatment/service to the catalogue.
   Fields: treatment_name, category (string or null), default_price (number or null), typical_product_cost (number or null), default_duration_minutes (number or null).

6) EXPENSES — user logs a business expense.
   Fields: date (YYYY-MM-DD), category (string), amount (number), notes (string or null).

7) CLINICAL NOTES — clinical documentation for a patient visit (procedures, units, outcomes, follow-up). Extract when the speaker describes what was done clinically, how the patient responded, complications, or next steps — even if no billing/treatment row is mentioned.
   Fields per item:
   - patient_name (string, required)
   - visit_date (YYYY-MM-DD; default today if unclear)
   - treatment_name (string or null) — e.g. "Botox" if mentioned; helps link to a visit
   - raw_narrative (string) — short faithful summary of what they said (can be one sentence)
   - procedure_summary (string or null) — e.g. "Botox, 3 areas, 50 units"
   - areas (string or null) — anatomical or treatment areas if stated
   - units (number or null) — e.g. units of toxin if stated
   - complications (string or null) — e.g. "none", "mild bruising"
   - patient_feedback (string or null) — e.g. "happy", "satisfied"
   - next_steps (string or null) — follow-up, review date, aftercare
   - clinical_summary (string) — one clean line for the patient file (required)

Rules:
- Use only information supported by the entry; do not invent patients or amounts.
- Match treatment_name to AVAILABLE TREATMENTS when possible (minor wording differences OK).
- If nothing for a section, use an empty array [].

Respond with ONLY a single JSON object (no markdown), exactly in this shape:
{"treatments":[],"payment_updates":[],"invoices":[],"patients":[],"catalog_treatments":[],"expenses":[],"clinical_notes":[]}
Each object in "invoices" must include: patient_name, treatment_name, amount, date, send_after_create (boolean), send_via ("email"|"sms"|"both"), patient_contact (string or null).
Each object in "clinical_notes" must include: patient_name, visit_date, raw_narrative, clinical_summary (and optional fields as above).`;
}

async function handleVoiceDiary(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const transcript = typeof body.transcript === "string"
    ? body.transcript.trim()
    : "";
  if (!transcript) throw new Error("transcript is required");

  const todayDate = (body.todayDate as string) ||
    new Date().toISOString().slice(0, 10);
  const yesterdayFromToday = (() => {
    const d = new Date(todayDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const ctx = {
    transcript,
    todayDate,
    yesterdayDate: (body.yesterdayDate as string) || yesterdayFromToday,
    treatmentsCatalog: Array.isArray(body.treatmentsCatalog)
      ? body.treatmentsCatalog as CatalogRow[]
      : [],
    practitionerNames: Array.isArray(body.practitionerNames)
      ? body.practitionerNames as string[]
      : [],
    patientNames: Array.isArray(body.patientNames)
      ? body.patientNames as string[]
      : [],
    recentPending: Array.isArray(body.recentPending)
      ? body.recentPending as PendingRow[]
      : [],
  };

  const parsed = await openaiChatJson({
    apiKey,
    system:
      "You extract structured clinic data from diary text. Output valid JSON only, no prose.",
    userContent: buildVoiceDiaryPrompt(ctx),
    maxTokens: 4096,
    temperature: 0.2,
  });

  const normalized = normalizeVoiceDiaryParsed(parsed);

  const treatments = normalized.treatments.map((t) => ({
    date: String(t.date ?? ctx.todayDate),
    patient_name: String(t.patient_name ?? ""),
    treatment_name: String(t.treatment_name ?? ""),
    price_paid: Number(t.price_paid ?? 0),
    payment_status: String(t.payment_status ?? "pending"),
    amount_paid: Number(t.amount_paid ?? 0),
    practitioner_name: t.practitioner_name != null
      ? String(t.practitioner_name)
      : null,
    duration_minutes:
      t.duration_minutes != null && t.duration_minutes !== ""
        ? Number(t.duration_minutes)
        : null,
    notes: t.notes != null && String(t.notes).length ? String(t.notes) : null,
  }));

  const transcriptLower = transcript.toLowerCase();
  const suppressSend =
    /\b(don't|do not|dont)\s+send\b/.test(transcriptLower) ||
    /\bwithout\s+sending\b/.test(transcriptLower);
  const boostSend =
    !suppressSend &&
    (/\b(send|email|text|sms)\b[^.]{0,100}\b(invoice|invoices|bill)\b/.test(
      transcriptLower,
    ) ||
      /\b(invoice|invoices|bill)\b[^.]{0,100}\b(send|email|text)\b/.test(
        transcriptLower,
      ) ||
      /\bplease\s+send\s+(an?\s+)?(invoice|bill)\b/.test(transcriptLower));

  const payment_updates = normalized.payment_updates.map((u) => ({
    patient_name: String(u.patient_name ?? ""),
    treatment_name:
      u.treatment_name != null && String(u.treatment_name).length
        ? String(u.treatment_name)
        : null,
    amount_paid: Number(u.amount_paid ?? 0),
    date_hint:
      u.date_hint != null && String(u.date_hint).length
        ? String(u.date_hint)
        : null,
  }));

  const invoices = normalized.invoices.map((i) => {
    const sendViaRaw = String(i.send_via ?? "").toLowerCase().trim();
    let send_via: "email" | "sms" | "both" = "email";
    if (sendViaRaw === "sms") send_via = "sms";
    else if (sendViaRaw === "both") send_via = "both";

    const truthy = (v: unknown) =>
      v === true || v === "true" || v === "yes" || v === 1;
    let send_after_create =
      truthy(i.send_after_create) || truthy(i.send_invoice);
    if (boostSend) send_after_create = true;

    const patient_contact =
      i.patient_contact != null && String(i.patient_contact).trim().length > 0
        ? String(i.patient_contact).trim()
        : null;

    return {
      patient_name: String(i.patient_name ?? ""),
      treatment_name: String(i.treatment_name ?? ""),
      amount: Number(i.amount ?? 0),
      date: String(i.date ?? ctx.todayDate),
      send_after_create,
      send_via,
      patient_contact,
    };
  });

  const patients = normalized.patients.map((p) => ({
    name: String(p.name ?? ""),
    contact:
      p.contact != null && String(p.contact).length
        ? String(p.contact)
        : null,
    phone:
      p.phone != null && String(p.phone).length ? String(p.phone) : null,
  }));

  const catalog_treatments = normalized.catalog_treatments.map((t) => ({
    treatment_name: String(t.treatment_name ?? ""),
    category:
      t.category != null && String(t.category).trim().length
        ? String(t.category).trim()
        : null,
    default_price:
      t.default_price != null && t.default_price !== ""
        ? Number(t.default_price)
        : null,
    typical_product_cost:
      t.typical_product_cost != null && t.typical_product_cost !== ""
        ? Number(t.typical_product_cost)
        : null,
    default_duration_minutes:
      t.default_duration_minutes != null && t.default_duration_minutes !== ""
        ? Number(t.default_duration_minutes)
        : null,
  }));

  const expenses = normalized.expenses.map((e) => ({
    date: String(e.date ?? ctx.todayDate),
    category: String(e.category ?? "Other"),
    amount: Math.abs(Number(e.amount ?? 0)),
    notes:
      e.notes != null && String(e.notes).trim().length
        ? String(e.notes).trim()
        : null,
  }));

  const clinical_notes = normalized.clinical_notes.map((c) => ({
    patient_name: String(c.patient_name ?? ""),
    visit_date: String(c.visit_date ?? ctx.todayDate),
    treatment_name:
      c.treatment_name != null && String(c.treatment_name).trim().length
        ? String(c.treatment_name).trim()
        : null,
    raw_narrative: String(c.raw_narrative ?? "").trim() ||
      String(c.clinical_summary ?? "").trim(),
    procedure_summary:
      c.procedure_summary != null && String(c.procedure_summary).trim().length
        ? String(c.procedure_summary).trim()
        : null,
    areas:
      c.areas != null && String(c.areas).trim().length
        ? String(c.areas).trim()
        : null,
    units:
      c.units != null && c.units !== "" && Number.isFinite(Number(c.units))
        ? Number(c.units)
        : null,
    complications:
      c.complications != null && String(c.complications).trim().length
        ? String(c.complications).trim()
        : null,
    patient_feedback:
      c.patient_feedback != null && String(c.patient_feedback).trim().length
        ? String(c.patient_feedback).trim()
        : null,
    next_steps:
      c.next_steps != null && String(c.next_steps).trim().length
        ? String(c.next_steps).trim()
        : null,
    clinical_summary: String(c.clinical_summary ?? "").trim() ||
      String(c.raw_narrative ?? "").trim(),
  }));

  return new Response(
    JSON.stringify({
      treatments,
      payment_updates,
      invoices,
      patients,
      catalog_treatments,
      expenses,
      clinical_notes,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

const POPULATE_FROM_TEXT_MAX_CHARS = 80_000;

function buildPopulateFromTextPrompt(ctx: {
  userNotes: string;
  todayDate: string;
  yesterdayDate: string;
  treatmentsCatalog: CatalogRow[];
  practitionerNames: string[];
  patientNames: string[];
  recentPending: PendingRow[];
}): string {
  const catalogStr = (ctx.treatmentsCatalog || [])
    .map(
      (t) =>
        `${t.treatment_name} (£${t.default_price ?? 0}, ${t.duration_minutes ?? "N/A"} min)`,
    )
    .join(", ");

  const pendingStr =
    ctx.recentPending && ctx.recentPending.length > 0
      ? ctx.recentPending
          .map(
            (r) =>
              `${r.patient_name} - ${r.treatment_name} - £${r.price_paid} (${r.date})`,
          )
          .join(", ")
      : "None";

  const notesJson = JSON.stringify(ctx.userNotes);

  return `You extract structured data from free text a clinic owner typed or pasted: patient lists, treatment/service menus, historical visits, expenses, or clinical narrative.

TODAY'S DATE: ${ctx.todayDate}
YESTERDAY'S DATE: ${ctx.yesterdayDate}

AVAILABLE TREATMENTS (match names when possible; use default price when amount omitted): ${
    catalogStr || "None listed"
  }

AVAILABLE PRACTITIONERS: ${(ctx.practitionerNames || []).join(", ") || "None"}

KNOWN PATIENTS: ${(ctx.patientNames || []).join(", ") || "None"}

RECENT PENDING TREATMENTS (for payment matching): ${pendingStr}

USER NOTES (JSON string): ${notesJson}

Extract ALL applicable structured data (same JSON schema as a voice diary):

1) TREATMENTS / VISITS — dated services. For historical visit lists default payment_status to "paid" unless the text indicates unpaid/pending.
   Fields: date, patient_name, treatment_name, price_paid, payment_status, amount_paid, practitioner_name (or null), duration_minutes (or null), notes (or null).

2) PAYMENT UPDATES — money received against pending work.

3) INVOICES — only when the user explicitly asks to invoice or send a bill (for pasted migration data, usually leave this empty).

4) NEW PATIENTS — names with any contact given (phone, email, address, notes, F&F % if stated).

5) CATALOG TREATMENTS — services to add to the price list.

6) EXPENSES — business costs if mentioned.

7) CLINICAL NOTES — clinical detail per patient visit when described.

Rules: Do not invent people or amounts not supported by the text. Match treatment names to AVAILABLE TREATMENTS when reasonable.

Respond with ONLY a single JSON object (no markdown), exactly in this shape:
{"treatments":[],"payment_updates":[],"invoices":[],"patients":[],"catalog_treatments":[],"expenses":[],"clinical_notes":[]}
Each object in "invoices" must include: patient_name, treatment_name, amount, date, send_after_create (boolean), send_via ("email"|"sms"|"both"), patient_contact (string or null).
Each object in "clinical_notes" must include: patient_name, visit_date, raw_narrative, clinical_summary (and optional fields as above).`;
}

async function handlePopulateFromText(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  let userNotes = typeof body.message === "string"
    ? body.message.trim()
    : typeof body.userNotes === "string"
    ? body.userNotes.trim()
    : "";
  if (!userNotes) throw new Error("message is required");
  userNotes = userNotes.replace(/^\uFEFF/, "");
  if (userNotes.length > POPULATE_FROM_TEXT_MAX_CHARS) {
    userNotes = userNotes.slice(0, POPULATE_FROM_TEXT_MAX_CHARS);
  }

  const todayDate = (body.todayDate as string) ||
    new Date().toISOString().slice(0, 10);
  const yesterdayFromToday = (() => {
    const d = new Date(todayDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const ctx = {
    userNotes,
    todayDate,
    yesterdayDate: (body.yesterdayDate as string) || yesterdayFromToday,
    treatmentsCatalog: Array.isArray(body.treatmentsCatalog)
      ? body.treatmentsCatalog as CatalogRow[]
      : [],
    practitionerNames: Array.isArray(body.practitionerNames)
      ? body.practitionerNames as string[]
      : [],
    patientNames: Array.isArray(body.patientNames)
      ? body.patientNames as string[]
      : [],
    recentPending: Array.isArray(body.recentPending)
      ? body.recentPending as PendingRow[]
      : [],
  };

  const parsed = await openaiChatJson({
    apiKey,
    system:
      "You extract structured clinic data from typed notes or pasted exports. Output valid JSON only, no prose.",
    userContent: buildPopulateFromTextPrompt(ctx),
    maxTokens: 8192,
    temperature: 0.2,
  });

  const normalized = normalizeVoiceDiaryParsed(parsed);

  const treatments = normalized.treatments.map((t) => ({
    date: String(t.date ?? ctx.todayDate),
    patient_name: String(t.patient_name ?? ""),
    treatment_name: String(t.treatment_name ?? ""),
    price_paid: Number(t.price_paid ?? 0),
    payment_status: String(t.payment_status ?? "pending"),
    amount_paid: Number(t.amount_paid ?? 0),
    practitioner_name: t.practitioner_name != null
      ? String(t.practitioner_name)
      : null,
    duration_minutes:
      t.duration_minutes != null && t.duration_minutes !== ""
        ? Number(t.duration_minutes)
        : null,
    notes: t.notes != null && String(t.notes).length ? String(t.notes) : null,
  }));

  const payment_updates = normalized.payment_updates.map((u) => ({
    patient_name: String(u.patient_name ?? ""),
    treatment_name:
      u.treatment_name != null && String(u.treatment_name).length
        ? String(u.treatment_name)
        : null,
    amount_paid: Number(u.amount_paid ?? 0),
    date_hint:
      u.date_hint != null && String(u.date_hint).length
        ? String(u.date_hint)
        : null,
  }));

  const invoices = normalized.invoices.map((i) => {
    const sendViaRaw = String(i.send_via ?? "").toLowerCase().trim();
    let send_via: "email" | "sms" | "both" = "email";
    if (sendViaRaw === "sms") send_via = "sms";
    else if (sendViaRaw === "both") send_via = "both";

    const patient_contact =
      i.patient_contact != null && String(i.patient_contact).trim().length > 0
        ? String(i.patient_contact).trim()
        : null;

    return {
      patient_name: String(i.patient_name ?? ""),
      treatment_name: String(i.treatment_name ?? ""),
      amount: Number(i.amount ?? 0),
      date: String(i.date ?? ctx.todayDate),
      send_after_create: false,
      send_via,
      patient_contact,
    };
  });

  const patients = normalized.patients.map((p) => {
    const row = p as Record<string, unknown>;
    const ff = row.friends_family_discount_percent;
    return {
      name: String(row.name ?? "").trim(),
      contact:
        row.contact != null && String(row.contact).trim().length
          ? String(row.contact).trim()
          : null,
      phone:
        row.phone != null && String(row.phone).trim().length
          ? String(row.phone).trim()
          : null,
      email:
        row.email != null && String(row.email).trim().length
          ? String(row.email).trim()
          : null,
      address:
        row.address != null && String(row.address).trim().length
          ? String(row.address).trim()
          : null,
      notes:
        row.notes != null && String(row.notes).trim().length
          ? String(row.notes).trim()
          : null,
      friends_family_discount_percent:
        ff != null && ff !== "" && Number.isFinite(Number(ff))
          ? Number(ff)
          : null,
    };
  }).filter((p) => p.name.length > 0);

  const catalog_treatments = normalized.catalog_treatments.map((t) => ({
    treatment_name: String(t.treatment_name ?? ""),
    category:
      t.category != null && String(t.category).trim().length
        ? String(t.category).trim()
        : null,
    default_price:
      t.default_price != null && t.default_price !== ""
        ? Number(t.default_price)
        : null,
    typical_product_cost:
      t.typical_product_cost != null && t.typical_product_cost !== ""
        ? Number(t.typical_product_cost)
        : null,
    default_duration_minutes:
      t.default_duration_minutes != null && t.default_duration_minutes !== ""
        ? Number(t.default_duration_minutes)
        : null,
  }));

  const expenses = normalized.expenses.map((e) => ({
    date: String(e.date ?? ctx.todayDate),
    category: String(e.category ?? "Other"),
    amount: Math.abs(Number(e.amount ?? 0)),
    notes:
      e.notes != null && String(e.notes).trim().length
        ? String(e.notes).trim()
        : null,
  }));

  const clinical_notes = normalized.clinical_notes.map((c) => ({
    patient_name: String(c.patient_name ?? ""),
    visit_date: String(c.visit_date ?? ctx.todayDate),
    treatment_name:
      c.treatment_name != null && String(c.treatment_name).trim().length
        ? String(c.treatment_name).trim()
        : null,
    raw_narrative: String(c.raw_narrative ?? "").trim() ||
      String(c.clinical_summary ?? "").trim(),
    procedure_summary:
      c.procedure_summary != null && String(c.procedure_summary).trim().length
        ? String(c.procedure_summary).trim()
        : null,
    areas:
      c.areas != null && String(c.areas).trim().length
        ? String(c.areas).trim()
        : null,
    units:
      c.units != null && c.units !== "" && Number.isFinite(Number(c.units))
        ? Number(c.units)
        : null,
    complications:
      c.complications != null && String(c.complications).trim().length
        ? String(c.complications).trim()
        : null,
    patient_feedback:
      c.patient_feedback != null && String(c.patient_feedback).trim().length
        ? String(c.patient_feedback).trim()
        : null,
    next_steps:
      c.next_steps != null && String(c.next_steps).trim().length
        ? String(c.next_steps).trim()
        : null,
    clinical_summary: String(c.clinical_summary ?? "").trim() ||
      String(c.raw_narrative ?? "").trim(),
  }));

  return new Response(
    JSON.stringify({
      treatments,
      payment_updates,
      invoices,
      patients,
      catalog_treatments,
      expenses,
      clinical_notes,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// --- Quick Add: natural language treatments ---

async function handleQuickaddTreatments(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const userInput = typeof body.userInput === "string"
    ? body.userInput.trim()
    : "";
  if (!userInput) throw new Error("userInput is required");

  const todayDate = (body.todayDate as string) ||
    new Date().toISOString().slice(0, 10);
  const catalog = Array.isArray(body.treatmentsCatalog)
    ? body.treatmentsCatalog as CatalogRow[]
    : [];
  const practitioners = Array.isArray(body.practitionerNames)
    ? body.practitionerNames as string[]
    : [];
  const patients = Array.isArray(body.patientNames)
    ? body.patientNames as string[]
    : [];

  const catalogStr = catalog
    .map(
      (t) =>
        `${t.treatment_name} (£${t.default_price ?? 0}, ${t.duration_minutes ?? "N/A"} min)`,
    )
    .join(", ");

  const userContent =
    `You are an assistant helping a beauty clinic log treatment entries. Parse the natural language input and extract treatment rows.

AVAILABLE TREATMENTS: ${catalogStr || "None"}
AVAILABLE PRACTITIONERS: ${practitioners.join(", ") || "None"}
KNOWN PATIENTS: ${patients.join(", ") || "None"}
TODAY (default date): ${todayDate}

USER INPUT (JSON string): ${JSON.stringify(userInput)}

For each treatment: date (YYYY-MM-DD, default today), patient_name (string or null), treatment_name (match catalogue), price_paid (number), payment_status ("paid"|"pending"|"partially_paid"), amount_paid (number), practitioner_name (string or null), duration_minutes (number or null), notes (string or null).

Return ONLY JSON: {"treatments":[]}`;

  const parsed = (await openaiChatJson({
    apiKey,
    system:
      "You extract treatment rows for a clinic. Output valid JSON only with key treatments (array).",
    userContent,
    maxTokens: 4096,
    temperature: 0.2,
  })) as Record<string, unknown>;

  const raw = Array.isArray(parsed.treatments) ? parsed.treatments : [];
  const treatments = raw.map((t) => {
    const row = t as Record<string, unknown>;
    return {
      date: String(row.date ?? todayDate),
      patient_name: row.patient_name != null && String(row.patient_name).length
        ? String(row.patient_name)
        : null,
      treatment_name: String(row.treatment_name ?? ""),
      price_paid: Number(row.price_paid ?? 0),
      payment_status: String(row.payment_status ?? "paid"),
      amount_paid: Number(row.amount_paid ?? row.price_paid ?? 0),
      practitioner_name:
        row.practitioner_name != null &&
          String(row.practitioner_name).length
          ? String(row.practitioner_name)
          : null,
      duration_minutes:
        row.duration_minutes != null && row.duration_minutes !== ""
          ? Number(row.duration_minutes)
          : null,
      notes:
        row.notes != null && String(row.notes).length
          ? String(row.notes)
          : null,
    };
  });

  return new Response(JSON.stringify({ treatments }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- CSV import: patients ---

async function handleCsvImportPatients(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const csvText = stripBomAndClampCsv(
    typeof body.csvText === "string" ? body.csvText : "",
  );
  if (!csvText) throw new Error("csvText is required");

  const userContent =
    `You map a clinic spreadsheet CSV into patient records. Headers may be arbitrary; infer columns.

CSV:
---
${csvText}
---

Rules:
- One object per data row (skip empty rows and obvious totals/headers repeated as data).
- name is required per row; skip rows without a usable person name.
- friends_family_discount_percent: number 0–100 or null if absent/unknown.
- Do not invent rows not present in the CSV.

Return ONLY JSON: {"patients":[{"name","contact","phone","email","address","notes","friends_family_discount_percent"}]}`;

  const parsed = (await openaiChatJson({
    apiKey,
    system:
      "You convert clinic CSV rows to JSON only. Output valid JSON with key patients (array).",
    userContent,
    maxTokens: 8192,
    temperature: 0.1,
  })) as Record<string, unknown>;

  const raw = Array.isArray(parsed.patients) ? parsed.patients : [];
  const patients = raw.map((p) => {
    const row = p as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const ff = row.friends_family_discount_percent;
    return {
      name,
      contact:
        row.contact != null && String(row.contact).trim().length
          ? String(row.contact).trim()
          : null,
      phone:
        row.phone != null && String(row.phone).trim().length
          ? String(row.phone).trim()
          : null,
      email:
        row.email != null && String(row.email).trim().length
          ? String(row.email).trim()
          : null,
      address:
        row.address != null && String(row.address).trim().length
          ? String(row.address).trim()
          : null,
      notes:
        row.notes != null && String(row.notes).trim().length
          ? String(row.notes).trim()
          : null,
      friends_family_discount_percent:
        ff != null && ff !== "" && !Number.isNaN(Number(ff))
          ? Number(ff)
          : null,
    };
  }).filter((p) => p.name.length > 0);

  return new Response(JSON.stringify({ patients }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- CSV import: treatment history (+ new catalogue types) ---

async function handleCsvImportTreatmentEntries(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const csvText = stripBomAndClampCsv(
    typeof body.csvText === "string" ? body.csvText : "",
  );
  if (!csvText) throw new Error("csvText is required");

  const todayDate = (body.todayDate as string) ||
    new Date().toISOString().slice(0, 10);
  const catalog = Array.isArray(body.treatmentsCatalog)
    ? body.treatmentsCatalog as CatalogRow[]
    : [];
  const catalogStr = catalog
    .map(
      (t) =>
        `${t.treatment_name} (£${t.default_price ?? 0}, ${t.duration_minutes ?? "N/A"} min)`,
    )
    .join("; ");

  const practitioners = Array.isArray(body.practitionerNames)
    ? body.practitionerNames as string[]
    : [];
  const patients = Array.isArray(body.patientNames)
    ? body.patientNames as string[]
    : [];

  const userContent =
    `You map a clinic treatment history CSV into structured rows. Column names may vary; infer date, patient, treatment, price, payment, practitioner, duration, notes.

AVAILABLE TREATMENTS (match names when possible; minor spelling OK): ${
      catalogStr || "None"
    }
KNOWN PATIENTS: ${patients.join(", ") || "None"}
KNOWN PRACTITIONERS: ${practitioners.join(", ") || "None"}
TODAY (fallback date): ${todayDate}

CSV:
---
${csvText}
---

For each billing/treatment row output an object in "treatments" with:
- date (YYYY-MM-DD; infer year sensibly if missing)
- patient_name (string or null)
- treatment_name (string)
- price_paid (number)
- payment_status: "paid" | "pending" | "partially_paid"
- amount_paid (number; for partially_paid less than price_paid; else match price or 0 if pending)
- practitioner_name (string or null)
- duration_minutes (number or null)
- notes (string or null)

Put NEW service types not in AVAILABLE TREATMENTS into "catalog_treatments" (dedupe by name): treatment_name, category (or null), default_price (from row if known else null), typical_product_cost (null unless stated), default_duration_minutes (or null).

Skip header-only rows, subtotals, and blank lines. Do not invent patients or amounts not supported by the CSV.

Return ONLY JSON: {"treatments":[],"catalog_treatments":[]}`;

  const parsed = (await openaiChatJson({
    apiKey,
    system:
      "You convert clinic treatment CSVs to JSON only. Output keys treatments and catalog_treatments (arrays).",
    userContent,
    maxTokens: 8192,
    temperature: 0.1,
  })) as Record<string, unknown>;

  const rawT = Array.isArray(parsed.treatments) ? parsed.treatments : [];
  const treatments = rawT.map((t) => {
    const row = t as Record<string, unknown>;
    return {
      date: String(row.date ?? todayDate),
      patient_name: row.patient_name != null && String(row.patient_name).length
        ? String(row.patient_name).trim()
        : null,
      treatment_name: String(row.treatment_name ?? "").trim(),
      price_paid: Number(row.price_paid ?? 0),
      payment_status: String(row.payment_status ?? "paid"),
      amount_paid: Number(row.amount_paid ?? row.price_paid ?? 0),
      practitioner_name:
        row.practitioner_name != null &&
          String(row.practitioner_name).trim().length
          ? String(row.practitioner_name).trim()
          : null,
      duration_minutes:
        row.duration_minutes != null && row.duration_minutes !== ""
          ? Number(row.duration_minutes)
          : null,
      notes:
        row.notes != null && String(row.notes).trim().length
          ? String(row.notes).trim()
          : null,
    };
  }).filter((t) => t.treatment_name.length > 0);

  const rawC = Array.isArray(parsed.catalog_treatments)
    ? parsed.catalog_treatments
    : [];
  const catalog_treatments = rawC.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      treatment_name: String(row.treatment_name ?? "").trim(),
      category:
        row.category != null && String(row.category).trim().length
          ? String(row.category).trim()
          : null,
      default_price:
        row.default_price != null && row.default_price !== ""
          ? Number(row.default_price)
          : null,
      typical_product_cost:
        row.typical_product_cost != null && row.typical_product_cost !== ""
          ? Number(row.typical_product_cost)
          : null,
      default_duration_minutes:
        row.default_duration_minutes != null &&
          row.default_duration_minutes !== ""
          ? Number(row.default_duration_minutes)
          : null,
    };
  }).filter((c) => c.treatment_name.length > 0);

  return new Response(
    JSON.stringify({ treatments, catalog_treatments }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// --- Bank statement → expenses ---

const EXPENSE_CATEGORIES = [
  "Rent",
  "Products",
  "Wages",
  "Insurance",
  "Marketing",
  "Utilities",
  "Equipment",
  "Other",
] as const;

async function handleBankExpenses(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl.trim() : "";
  if (!fileUrl) throw new Error("fileUrl is required");

  const todayDate = (body.todayDate as string) ||
    new Date().toISOString().slice(0, 10);
  const currentYear = (body.currentYear as string) ||
    todayDate.slice(0, 4);

  const fetchRes = await fetch(fileUrl);
  if (!fetchRes.ok) {
    throw new Error(`Could not download statement file (${fetchRes.status})`);
  }
  const buf = new Uint8Array(await fetchRes.arrayBuffer());
  if (buf.length === 0) throw new Error("Empty file");

  const mime = (fetchRes.headers.get("content-type") || "").split(";")[0]
    .trim()
    .toLowerCase();
  const pdfMagic =
    buf.length >= 4 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46;
  const isPdf =
    mime === "application/pdf" ||
    pdfMagic ||
    (mime === "application/octet-stream" &&
      fileUrl.toLowerCase().includes(".pdf")) ||
    fileUrl.toLowerCase().split("?")[0].endsWith(".pdf");

  const expenseInstructions =
    `TODAY'S DATE: ${todayDate}
CURRENT YEAR FOR INTERPRETATION: ${currentYear}

Extract ALL outgoing expenses (debits) from this bank statement. Ignore incoming credits.

For each expense return: date (YYYY-MM-DD), description (merchant), amount (positive number, no currency symbol), category — one of: ${EXPENSE_CATEGORIES.join(", ")}.

Date rules: accept dd/mm/yyyy etc. If year is two digits, use ${currentYear} era appropriately.

Return ONLY JSON: {"expenses":[{"date","description","amount","category"}]}`;

  let fileId: string | null = null;

  try {
    let userContent: unknown;

    if (isPdf) {
      fileId = await openaiUploadFile(
        apiKey,
        buf,
        "statement.pdf",
        "application/pdf",
      );
      userContent = [
        { type: "file", file: { file_id: fileId } },
        { type: "text", text: expenseInstructions },
      ];
    } else if (mime.startsWith("image/")) {
      const b64 = uint8ToBase64(buf);
      userContent = [
        { type: "text", text: expenseInstructions },
        {
          type: "image_url",
          image_url: { url: `data:${mime};base64,${b64}` },
        },
      ];
    } else {
      throw new Error(
        "Unsupported file type. Upload a PDF or image (PNG, JPEG, WebP) of your statement.",
      );
    }

    const modelForFile = fileId ? "gpt-4o" : MODEL;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelForFile,
        messages: [
          {
            role: "system",
            content:
              "You extract expense rows from bank statements. Output valid JSON only with key expenses (array).",
          },
          {
            role: "user",
            content: userContent as Record<string, unknown>[],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
    }

    const completion = await response.json();
    const rawContent =
      completion?.choices?.[0]?.message?.content?.trim() || "{}";
    let parsed: unknown;
    try {
      parsed = parseModelJson(rawContent);
    } catch {
      throw new Error("Model returned invalid JSON for expenses");
    }

    const o = parsed as Record<string, unknown>;
    const rawExp = Array.isArray(o.expenses) ? o.expenses : [];
    const expenses = rawExp.map((e) => {
      const row = e as Record<string, unknown>;
      let category = String(row.category ?? "Other");
      if (!EXPENSE_CATEGORIES.includes(category as typeof EXPENSE_CATEGORIES[number])) {
        category = "Other";
      }
      return {
        date: String(row.date ?? todayDate),
        description: String(row.description ?? ""),
        amount: Math.abs(Number(row.amount ?? 0)),
        category,
      };
    });

    return new Response(JSON.stringify({ expenses }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (fileId) {
      try {
        await openaiDeleteFile(apiKey, fileId);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}

// --- Pricing insights (plain text) ---

async function handlePricingInsights(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("prompt is required");

  const insights = await openaiChatText({
    apiKey,
    system:
      "You are a pricing strategy consultant for aesthetic and wellness clinics. Give specific, actionable recommendations. Use clear numbered sections and bullet points. Plain text only (no JSON, no markdown code fences).",
    user: prompt,
    maxTokens: 2800,
    temperature: 0.4,
  });

  return new Response(JSON.stringify({ insights }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Voice command parsing ---

async function handleVoiceCommand(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";

  if (!prompt || !transcript) {
    throw new Error("prompt and transcript are required");
  }

  // Parse the voice command using GPT
  const parsed = await openaiChatJson({
    apiKey,
    system: "You are a voice command parser for clinic management software. Always return valid JSON only.",
    userContent: `${prompt}\n\nTranscript: "${transcript}"`,
    maxTokens: 500,
    temperature: 0.2,
  });

  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Voice conversation (conversational AI) ---

async function handleVoiceConversation(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  if (!userMessage) throw new Error("userMessage is required");

  const currentContext = body.currentContext as Record<string, unknown> | null;
  const conversationHistory = Array.isArray(body.conversationHistory)
    ? body.conversationHistory as Array<{ role: string; content: string }>
    : [];
  const patientNames = Array.isArray(body.patientNames) ? body.patientNames as string[] : [];
  const treatmentNames = Array.isArray(body.treatmentNames) ? body.treatmentNames as string[] : [];
  const todayDate = (body.todayDate as string) || new Date().toISOString().slice(0, 10);

  // Build conversation history string
  const historyStr = conversationHistory.length > 0
    ? conversationHistory.map(m => `${m.role === 'user' ? 'Doctor' : 'AI'}: ${m.content}`).join('\n')
    : 'No previous conversation';

  // Build context string
  const contextStr = currentContext
    ? JSON.stringify(currentContext)
    : 'No current context';

  // Extract app stats from context if available
  const stats = (currentContext as any)?.stats || {};
  const recentTreatments = (currentContext as any)?.recentTreatments || [];

  const systemPrompt = `You are a conversational AI assistant for a beauty and wellness clinic management system.

Your role is to help doctors manage their practice through natural conversation. You should:
- Respond like a friendly, professional human assistant
- ANSWER QUESTIONS USING THE REAL DATA PROVIDED BELOW
- Generate relevant action options the doctor can click
- Remember context from the conversation
- Be concise but helpful

IMPORTANT: When asked about revenue, treatments, or stats, USE THE ACTUAL DATA BELOW to give specific numbers and facts.

CURRENT APP DATA:
- Total Patients: ${stats.totalPatients || 0}
- Total Treatments: ${stats.totalTreatments || 0}
- This Week's Treatments: ${stats.thisWeekTreatments || 0}
- This Week's Revenue: £${(stats.thisWeekRevenue || 0).toFixed(2)}
- Pending Payments: ${stats.pendingPayments || 0} invoices (£${(stats.pendingAmount || 0).toFixed(2)} total)

Recent Treatments:
${recentTreatments.length > 0
  ? recentTreatments.map((t: any) => `- ${t.date}: ${t.patient} - ${t.treatment} (£${t.amount}, ${t.status})`).join('\n')
  : 'No recent treatments'}

Available patients: ${patientNames.join(', ') || 'None'}
Available treatments: ${treatmentNames.join(', ') || 'None'}
Today's date: ${todayDate}

Recent conversation:
${historyStr}

Full context: ${contextStr}`;

  const userContent = `Doctor said: "${userMessage}"

Analyze what the doctor wants and respond naturally. Then generate 2-4 relevant action options they can take.

Return JSON in this format:
{
  "response": "Your friendly conversational response to the doctor",
  "actionOptions": [
    {
      "label": "Short action label (e.g. 'Create Invoice')",
      "action": "action_type (e.g. 'create_invoice')",
      "data": {
        "any_relevant_data": "extracted from conversation"
      }
    }
  ],
  "context": {
    "lastMentionedPatient": "patient name if mentioned",
    "lastMentionedTreatment": "treatment if mentioned",
    "pendingAction": "what action is pending if any"
  }
}

Action types you can use:
- create_treatment: Create a new treatment entry
- create_invoice: Generate an invoice
- mark_paid: Mark an invoice as paid
- book_appointment: Schedule an appointment
- add_clinical_note: Add clinical documentation
- show_patient: View patient details
- show_schedule: View calendar
- send_invoice: Send an invoice to a patient
- send_reminder: Send payment reminder
- log_fridge_temp: Log fridge temperature reading
- check_stock: Check inventory stock levels
- add_product: Add product to inventory
- log_product_usage: Record product usage/deduction
- check_expiry: View expiring products
- check_equipment: View equipment maintenance status
- navigate: Navigate to a specific page

Example 1:
Doctor: "Sarah had Botox today for £300, she paid cash"
Response: {
  "response": "Perfect! I've got that Sarah had Botox today for £300, paid in cash. Would you like me to create a treatment entry and/or generate an invoice?",
  "actionOptions": [
    {"label": "Create Treatment Entry", "action": "create_treatment", "data": {"patient": "Sarah", "treatment": "Botox", "price": 300, "status": "paid"}},
    {"label": "Create Invoice", "action": "create_invoice", "data": {"patient": "Sarah", "treatment": "Botox", "amount": 300}},
    {"label": "Add Clinical Note", "action": "add_clinical_note", "data": {"patient": "Sarah", "treatment": "Botox"}}
  ],
  "context": {"lastMentionedPatient": "Sarah", "lastMentionedTreatment": "Botox", "pendingAction": "create_treatment"}
}

Example 2:
Doctor: "What's my revenue this week?"
Response: {
  "response": "This week you've made £450.00 from 3 treatments. You also have 2 pending payments totaling £280.00. Your total potential revenue is £730.00.",
  "actionOptions": [
    {"label": "View Dashboard", "action": "navigate", "data": {"page": "dashboard"}},
    {"label": "View Pending Invoices", "action": "navigate", "data": {"page": "records"}},
    {"label": "Send Payment Reminders", "action": "send_reminders", "data": {}}
  ],
  "context": {"pendingAction": "reviewed_revenue"}
}

Example 3:
Doctor: "Send invoice to John"
Response: {
  "response": "I can send John's invoice. Let me check for his most recent unpaid treatment. Would you like me to find it and send the invoice?",
  "actionOptions": [
    {"label": "Find & Send Invoice", "action": "send_invoice", "data": {"patient": "John"}},
    {"label": "Create New Invoice", "action": "create_invoice", "data": {"patient": "John"}},
    {"label": "View John's History", "action": "show_patient", "data": {"patient": "John"}}
  ],
  "context": {"lastMentionedPatient": "John", "pendingAction": "send_invoice"}
}

Example 4:
Doctor: "Log fridge temperature 5 degrees"
Response: {
  "response": "Perfect! I'll log the fridge temperature as 5°C. Is this the morning or afternoon reading?",
  "actionOptions": [
    {"label": "Log as AM Reading", "action": "log_fridge_temp", "data": {"temperature": 5, "time_of_day": "am"}},
    {"label": "Log as PM Reading", "action": "log_fridge_temp", "data": {"temperature": 5, "time_of_day": "pm"}},
    {"label": "View Temperature Log", "action": "navigate", "data": {"page": "regulatory"}}
  ],
  "context": {"pendingAction": "log_temperature"}
}

Example 5:
Doctor: "How much Juvederm do we have left?"
Response: {
  "response": "Let me check your Juvederm inventory levels for you.",
  "actionOptions": [
    {"label": "Check Juvederm Stock", "action": "check_stock", "data": {"product": "Juvederm"}},
    {"label": "View All Inventory", "action": "navigate", "data": {"page": "inventory"}},
    {"label": "Check Expiring Items", "action": "check_expiry", "data": {}}
  ],
  "context": {"pendingAction": "check_inventory"}
}

Example 6:
Doctor: "Add 10 vials of Botox to inventory"
Response: {
  "response": "I'll add 10 vials of Botox to your inventory. Should I also record the cost and supplier?",
  "actionOptions": [
    {"label": "Add to Inventory", "action": "add_product", "data": {"name": "Botox", "quantity": 10, "unit": "vials"}},
    {"label": "Add with Details", "action": "navigate", "data": {"page": "inventory"}},
    {"label": "View Current Stock", "action": "check_stock", "data": {"product": "Botox"}}
  ],
  "context": {"pendingAction": "add_inventory"}
}

Example 7:
Doctor: "What's expiring this month?"
Response: {
  "response": "I'll check which products are expiring within the next 30 days.",
  "actionOptions": [
    {"label": "Show Expiring Products", "action": "check_expiry", "data": {}},
    {"label": "View Inventory", "action": "navigate", "data": {"page": "inventory"}},
    {"label": "Check Low Stock", "action": "check_stock", "data": {}}
  ],
  "context": {"pendingAction": "check_expiry"}
}

Example 8:
Doctor: "Check laser machine maintenance"
Response: {
  "response": "I'll check the maintenance status of your laser equipment.",
  "actionOptions": [
    {"label": "View Equipment Status", "action": "check_equipment", "data": {"type": "laser"}},
    {"label": "View All Equipment", "action": "navigate", "data": {"page": "regulatory"}},
    {"label": "Log Service Record", "action": "navigate", "data": {"page": "regulatory", "tab": "equipment"}}
  ],
  "context": {"pendingAction": "check_equipment"}
}

Now respond to: "${userMessage}"`;

  const parsed = await openaiChatJson({
    apiKey,
    system: systemPrompt,
    userContent,
    maxTokens: 800,
    temperature: 0.7,
  });

  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const body = (await req.json()) as Record<string, unknown>;
    const task = typeof body.task === "string" ? body.task : "";

    switch (task) {
      case "voice_diary":
        return await handleVoiceDiary(apiKey, body);
      case "quickadd_treatments":
        return await handleQuickaddTreatments(apiKey, body);
      case "bank_expenses":
        return await handleBankExpenses(apiKey, body);
      case "pricing_insights":
        return await handlePricingInsights(apiKey, body);
      case "voice_command":
        return await handleVoiceCommand(apiKey, body);
      case "voice_conversation":
        return await handleVoiceConversation(apiKey, body);
      case "csv_import_patients":
        return await handleCsvImportPatients(apiKey, body);
      case "csv_import_treatment_entries":
        return await handleCsvImportTreatmentEntries(apiKey, body);
      case "populate_from_text":
        return await handlePopulateFromText(apiKey, body);
      default:
        throw new Error(
          `Unknown task "${task}". Use: voice_diary | populate_from_text | quickadd_treatments | csv_import_patients | csv_import_treatment_entries | bank_expenses | pricing_insights | voice_command | voice_conversation`,
        );
    }
  } catch (error) {
    console.error("clinic-llm error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
