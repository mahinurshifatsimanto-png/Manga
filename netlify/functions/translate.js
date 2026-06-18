exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ success: false, error: "API key not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: "Invalid request body" }) };
  }

  const { imageData, mimeType } = body;

  if (!imageData || !mimeType) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: "Image data missing" }) };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(mimeType)) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: "Invalid image type" }) };
  }

  const base64Data = imageData.includes(",") ? imageData.split(",")[1] : imageData;

  const geminiPrompt = `You are a professional manga localization specialist with deep expertise in Japanese-to-Bengali translation.

Analyze this manga page image with extreme precision. Your output will be used to overlay Bengali text DIRECTLY onto the original manga image using HTML5 Canvas, replacing the Japanese text inside each bubble.

TRANSLATION STYLE — CRITICAL:
- Use natural, colloquial Bengali as spoken by Bangladeshi/West Bengali teenagers
- Preserve ALL emotional punctuation exactly: "ধুর..." not "ধুর", "হা...?" not "হা?"
- For a sinister/amused supernatural character (like a shinigami/death god): eerie, playful, slightly condescending tone
- For frustrated student characters: teenage voice, self-deprecating, informal তুমি register
- For narration boxes: slightly more formal literary Bengali
- For thought bubbles: vulnerable, honest internal monologue
- Sound effects (GONK, RUSTLE, CLUNK, OW, AAAH): keep in English/Roman — do NOT translate SFX
- Preserve dramatic pauses with "..." exactly as in original
- আপনি only for clearly formal/elder speech. তুমি for peers/younger

BOUNDING BOX PRECISION — CRITICAL:
Coordinates are percentages of the total image dimensions (0.0 to 100.0).
bbox must be accurate enough that text overlaid at those exact coordinates lands INSIDE the speech bubble.
Measure carefully — wrong coordinates break the entire output.

For each text element provide:
- bbox.x: left edge of bubble as % of image width
- bbox.y: top edge of bubble as % of image height  
- bbox.width: bubble width as % of image width
- bbox.height: bubble height as % of image height

BUBBLE SHAPE detection:
- "ellipse": round/oval speech bubble → white ellipse mask before text
- "rect": rectangular narration box → white rect mask before text
- "cloud": thought bubble → white cloud-approximated ellipse mask
- "none": SFX/title with no bubble background → no mask

FONT SIZE: Assuming canvas displayed at 900px wide:
- Tiny bubble (face closeup inset): 10-12px
- Small bubble: 13-14px
- Medium bubble: 15-17px
- Large bubble (full panel width): 18-22px
- Narration box text: 13-15px

Return ONLY valid JSON. Zero markdown. Zero explanation. Zero preamble. This exact structure:

{
  "page_info": {
    "total_elements": 0,
    "genre": "string",
    "mood": "string"
  },
  "elements": [
    {
      "id": 1,
      "type": "speech",
      "reading_order": 1,
      "bbox": {
        "x": 0.0,
        "y": 0.0,
        "width": 0.0,
        "height": 0.0
      },
      "shape": "ellipse",
      "original": "Japanese text",
      "bengali": "বাংলা অনুবাদ",
      "font_size_px": 14,
      "font_weight": "600",
      "text_align": "center",
      "speaker": "character name or unknown"
    }
  ]
}

Process ALL text elements on the page. Miss nothing.`;

  const geminiPayload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType === "image/webp" ? "image/jpeg" : mimeType,
              data: base64Data,
            },
          },
          {
            text: geminiPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192,
    },
  };

  try {
    const fetch = (await import("node-fetch")).default;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
        timeout: 90000,
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ success: false, error: "অনুবাদ সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।" }),
      };
    }

    const geminiData = await geminiRes.json();
    let rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return {
        statusCode: 502,
        body: JSON.stringify({ success: false, error: "Gemini থেকে কোনো উত্তর আসেনি।" }),
      };
    }

    // Strip markdown fences if Gemini wraps response
    rawText = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("JSON parse failed:", rawText.substring(0, 500));
      return {
        statusCode: 502,
        body: JSON.stringify({ success: false, error: "অনুবাদ ফরম্যাটে সমস্যা হয়েছে।" }),
      };
    }

    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      return {
        statusCode: 502,
        body: JSON.stringify({ success: false, error: "অনুবাদ ডেটা অসম্পূর্ণ।" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, data: parsed }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: "অভ্যন্তরীণ সার্ভার সমস্যা।" }),
    };
  }
};
