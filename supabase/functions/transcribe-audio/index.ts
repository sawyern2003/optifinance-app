/**
 * OpenAI Whisper transcription — better accuracy than browser SpeechRecognition for names/numbers.
 * Body: { audioBase64: string, mimeType?: string, nameHint?: string }
 * Secret: OPENAI_API_KEY
 *
 * Deploy: supabase functions deploy transcribe-audio --no-verify-jwt --project-ref YOUR_REF
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

    const body = (await req.json()) as {
      audioBase64?: string;
      mimeType?: string;
      nameHint?: string;
    };

    const b64 = typeof body.audioBase64 === "string" ? body.audioBase64.trim() : "";
    if (!b64) throw new Error("audioBase64 is required");

    const mime = body.mimeType && body.mimeType.length > 0
      ? body.mimeType
      : "audio/webm";

    const bytes = base64ToBytes(b64);
    if (bytes.length < 100) {
      throw new Error("Recording too short — try speaking a little longer.");
    }
    if (bytes.length > 24 * 1024 * 1024) {
      throw new Error("Recording too large (max ~24MB).");
    }

    const ext = mime.includes("mp4") || mime.includes("m4a")
      ? "m4a"
      : mime.includes("wav")
      ? "wav"
      : "webm";

    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: mime }),
      `clip.${ext}`,
    );
    form.append("model", "whisper-1");
    form.append("language", "en");

    const hint = typeof body.nameHint === "string" ? body.nameHint.trim() : "";
    if (hint.length > 0) {
      form.append("prompt", hint.slice(0, 220));
    }

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Transcription failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as { text?: string };
    const text = (data.text || "").trim();

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("transcribe-audio error:", error);
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
