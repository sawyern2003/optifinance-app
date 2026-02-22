const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const { clinicContext, userMessage } = await req.json();
    if (!userMessage || typeof userMessage !== "string") {
      throw new Error("userMessage is required");
    }

    const systemContent = `You are an expert business consultant specializing in beauty and wellness clinics. You provide strategic advice, financial insights, and operational recommendations based on real clinic data. Use the clinic data provided to support your insights. Be specific with numbers when relevant. If asked about recommendations, provide concrete, implementable strategies. Keep the tone friendly yet professional.`;

    const userContent =
      clinicContext != null
        ? `CLINIC DATA:\n${JSON.stringify(clinicContext, null, 2)}\n\nUSER QUESTION: ${userMessage}`
        : userMessage;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const message =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I couldn't generate a response. Please try again.";

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("openai-consultant error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
