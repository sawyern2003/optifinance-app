/**
 * Extract competitor pricing from URL using GPT-4
 * Secret: OPENAI_API_KEY
 *
 * Deploy: supabase functions deploy extract-competitor-pricing --no-verify-jwt --project-ref YOUR_REF
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "gpt-4o"; // Using GPT-4o for better extraction accuracy

interface ExtractedPrice {
  treatment_name: string;
  price?: number;
  price_from?: number;
  price_to?: number;
  price_text?: string;
  category?: string;
  notes?: string;
}

interface ExtractionResult {
  success: boolean;
  clinic_name?: string;
  location?: string;
  treatments: ExtractedPrice[];
  error?: string;
  raw_url?: string;
}

async function fetchPageContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OptiFinance/1.0; +https://optifinance.com)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Strip out scripts and styles to reduce token usage
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Limit to first 30000 characters to stay within token limits
    if (cleaned.length > 30000) {
      cleaned = cleaned.substring(0, 30000);
    }

    return cleaned;
  } catch (error) {
    throw new Error(`Error fetching URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function extractPricingWithGPT(html: string, url: string, apiKey: string): Promise<ExtractionResult> {
  const systemPrompt = `You are an expert at extracting pricing information from aesthetic clinic websites.

Extract ALL treatment prices from the provided HTML content. Focus on treatments like:
- Botox / Anti-wrinkle injections
- Dermal fillers (lips, cheeks, etc.)
- Skin treatments (chemical peels, microneedling, etc.)
- Laser treatments
- Body treatments

For each treatment, extract:
1. treatment_name: Clear, standardized name (e.g., "Botox", "Lip Filler", not "Amazing Lip Enhancement")
2. price: Single price if fixed (number only)
3. price_from: Starting price if range (e.g., "From £250")
4. price_to: Ending price if range (e.g., "£250-£400")
5. price_text: Original text if pricing is unclear (e.g., "Contact for pricing", "POA")
6. category: Treatment category (e.g., "Injectables", "Skin", "Laser")
7. notes: Any relevant notes (e.g., "per area", "package of 3", "special offer")

Also extract:
- clinic_name: Name of the clinic
- location: City/area if mentioned

IMPORTANT:
- Only extract actual prices, not random numbers from the page
- Standardize treatment names (use common industry terms)
- If price is "POA", "Contact us", or similar, use price_text field
- Remove currency symbols and "from" text from price numbers
- Be conservative - only extract clear pricing information

Return JSON in this exact format:
{
  "success": true,
  "clinic_name": "Clinic Name Here",
  "location": "London, UK",
  "treatments": [
    {
      "treatment_name": "Botox",
      "price": 250,
      "category": "Injectables",
      "notes": "per area"
    },
    {
      "treatment_name": "Lip Filler",
      "price_from": 350,
      "price_to": 450,
      "category": "Injectables",
      "notes": "0.5ml-1ml"
    },
    {
      "treatment_name": "Laser Hair Removal",
      "price_text": "Contact for pricing",
      "category": "Laser"
    }
  ]
}`;

  const userContent = `URL: ${url}\n\nHTML Content:\n${html}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent extraction
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const completion = await response.json();
    const rawContent = completion?.choices?.[0]?.message?.content?.trim() || "{}";

    const result = JSON.parse(rawContent) as ExtractionResult;
    result.raw_url = url;

    return result;
  } catch (error) {
    console.error("GPT extraction error:", error);
    return {
      success: false,
      treatments: [],
      error: error instanceof Error ? error.message : String(error),
      raw_url: url,
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid URL format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    console.log(`Extracting pricing from: ${url}`);

    // Fetch page content
    const html = await fetchPageContent(url);
    console.log(`Fetched ${html.length} characters of HTML`);

    // Extract pricing with GPT-4
    const result = await extractPricingWithGPT(html, url, apiKey);

    console.log(`Extraction complete. Found ${result.treatments?.length || 0} treatments`);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Extract competitor pricing error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        treatments: [],
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
