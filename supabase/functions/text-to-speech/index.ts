import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { text, voiceId, modelId, voiceSettings } = await req.json();

    if (!text) {
      throw new Error("Text is required");
    }

    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!elevenlabsApiKey) {
      throw new Error("ELEVENLABS_API_KEY not configured");
    }

    // Default to Rachel (professional female voice)
    const selectedVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM";
    const selectedModelId = modelId || "eleven_turbo_v2"; // Fast, low-latency model

    // Default voice settings for natural, professional sound
    const defaultSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
    };

    console.log(`Generating speech for text (${text.length} chars) with voice ${selectedVoiceId}`);

    // Call ElevenLabs TTS API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenlabsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: selectedModelId,
          voice_settings: voiceSettings || defaultSettings,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Stream audio back to client
    const audioBuffer = await response.arrayBuffer();

    console.log(`✅ Generated ${audioBuffer.byteLength} bytes of audio`);

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
      status: 200,
    });
  } catch (error) {
    console.error("Text-to-speech error:", error);
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
