/**
 * Unified clinic LLM: voice diary, Quick Add treatments, bank statement expenses, pricing analysis.
 * Secret: OPENAI_API_KEY
 *
 * Deploy: supabase functions deploy clinic-llm --no-verify-jwt --project-ref YOUR_REF
 */

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
} {
  if (!data || typeof data !== "object") {
    return {
      treatments: [],
      payment_updates: [],
      invoices: [],
      patients: [],
    };
  }
  const o = data as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    treatments: arr(o.treatments) as Record<string, unknown>[],
    payment_updates: arr(o.payment_updates) as Record<string, unknown>[],
    invoices: arr(o.invoices) as Record<string, unknown>[],
    patients: arr(o.patients) as Record<string, unknown>[],
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

Rules:
- Use only information supported by the entry; do not invent patients or amounts.
- Match treatment_name to AVAILABLE TREATMENTS when possible (minor wording differences OK).
- If nothing for a section, use an empty array [].

Respond with ONLY a single JSON object (no markdown), exactly in this shape:
{"treatments":[],"payment_updates":[],"invoices":[],"patients":[]}
Each object in "invoices" must include: patient_name, treatment_name, amount, date, send_after_create (boolean), send_via ("email"|"sms"|"both"), patient_contact (string or null).`;
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
    const send_after_create =
      truthy(i.send_after_create) || truthy(i.send_invoice);

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

  return new Response(
    JSON.stringify({
      treatments,
      payment_updates,
      invoices,
      patients,
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
      default:
        throw new Error(
          `Unknown task "${task}". Use: voice_diary | quickadd_treatments | bank_expenses | pricing_insights`,
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
