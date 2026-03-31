
'use strict';

const guidelines = require('../data/recycling-guidelines.json');

/**
 * Classify trash via Gemini Vision and enrich with recycling guidelines.
 * Falls back gracefully if the API is unavailable.
 *
 * @param {string} imageBase64 - Base64-encoded image data (no data-URL prefix)
 * @param {string} mimeType    - MIME type, e.g. "image/jpeg"
 * @returns {Promise<{object: string, material: string, category: string, recyclable: boolean, guidelines: string[], icon: string, disposalInstructions: string}>}
 */
async function analyzeTrashImage(imageBase64, mimeType = 'image/jpeg') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const prompt =
    'Analyze this image of trash/waste. ' +
    'First, identify the specific object (e.g. "PET plastic bottle", "aluminum can", "cardboard box"). ' +
    'Then identify the primary material type from this list: plastic, metal, glass, paper, organic, ewaste, hazardous, mixed. ' +
    'Return ONLY a JSON object (no markdown, no code fences) with these fields: ' +
    'object (string – the specific item), ' +
    'material (string – one of the listed types), ' +
    'category (string – short descriptive category), ' +
    'recyclable (boolean), ' +
    'disposalInstructions (string – one sentence).';

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, topK: 1, topP: 1 },
  };

  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  let geminiResult;
  try {
    geminiResult = JSON.parse(cleaned);
  } catch {
    throw new Error(`Could not parse Gemini response as JSON: ${rawText}`);
  }

  // Normalise material key to match guidelines keys
  const raw = (geminiResult.material || '').toLowerCase();
  const materialKey =
    raw.includes('plastic')  ? 'plastic'  :
    raw.includes('metal')    ? 'metal'    :
    raw.includes('glass')    ? 'glass'    :
    raw.includes('paper') || raw.includes('cardboard') ? 'paper' :
    raw.includes('organic') || raw.includes('food')    ? 'organic' :
    raw.includes('ewaste') || raw.includes('e-waste') || raw.includes('electronic') ? 'ewaste' :
    raw.includes('hazard')   ? 'hazardous' :
    raw.replace(/[^a-z]/g, '');
  const guide = guidelines[materialKey] || guidelines['mixed'];

  return {
    object: geminiResult.object || geminiResult.material || 'Unknown item',
    material: guide.name || geminiResult.material,
    category: geminiResult.category || guide.name,
    recyclable: typeof geminiResult.recyclable === 'boolean' ? geminiResult.recyclable : guide.recyclable,
    guidelines: guide.guidelines,
    icon: guide.icon,
    disposalInstructions: geminiResult.disposalInstructions || guide.guidelines[0],
  };
}

module.exports = { analyzeTrashImage };
