'use strict';

const guidelines = require('../data/recycling-guidelines.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(status) {
  return status === 503 || status === 429 || status === 500;
}

function isNetworkError(err) {
  return err.name === 'TimeoutError' ||
    err.cause?.code === 'ENOTFOUND' ||
    err.cause?.code === 'ECONNRESET';
}

const PROMPT =
  'Analyze this image of trash/waste. ' +
  'First, identify the specific object (e.g. "PET plastic bottle", "aluminum can", "cardboard box"). ' +
  'Then identify the primary material type from this list: plastic, metal, glass, paper, organic, ewaste, hazardous, mixed. ' +
  'Return ONLY a JSON object (no markdown, no code fences) with these fields: ' +
  'object (string – the specific item), ' +
  'material (string – one of the listed types), ' +
  'category (string – short descriptive category), ' +
  'recyclable (boolean), ' +
  'disposalInstructions (string – one sentence).';

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini(model, imageBase64, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY not set'), { fatal: true });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: PROMPT },
          ],
        }],
        generationConfig: { temperature: 0.1, topK: 1, topP: 1 },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Gemini ${model} error ${resp.status}: ${text}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Groq (free) ───────────────────────────────────────────────────────────────
async function callGroq(imageBase64, mimeType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw Object.assign(new Error('GROQ_API_KEY not set'), { fatal: true });

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: PROMPT },
        ],
      }],
      temperature: 0.1,
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Groq error ${resp.status}: ${text}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
}

// ── Parse raw JSON text from any model ───────────────────────────────────────
function parseAndEnrich(rawText) {
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const result = JSON.parse(cleaned);

  const raw = (result.material || '').toLowerCase();
  const materialKey =
    raw.includes('plastic')  ? 'plastic'  :
    raw.includes('metal')    ? 'metal'    :
    raw.includes('glass')    ? 'glass'    :
    raw.includes('paper') || raw.includes('cardboard') ? 'paper'    :
    raw.includes('organic') || raw.includes('food')    ? 'organic'  :
    raw.includes('ewaste') || raw.includes('e-waste') || raw.includes('electronic') ? 'ewaste' :
    raw.includes('hazard')   ? 'hazardous' :
    raw.replace(/[^a-z]/g, '');

  const guide = guidelines[materialKey] || guidelines['mixed'];

  return {
    object:   result.object || result.material || 'Unknown item',
    material: guide.name    || result.material,
    category: result.category || guide.name,
    recyclable: typeof result.recyclable === 'boolean' ? result.recyclable : guide.recyclable,
    guidelines: guide.guidelines,
    icon:     guide.icon,
    disposalInstructions: result.disposalInstructions || guide.guidelines[0],
  };
}

// ── Fallback chain: gemini-2.5-flash → gemini-1.5-flash → gpt-4o-mini ────────
const PROVIDERS = [
  { name: 'gemini-2.5-flash', call: (b64, mime) => callGemini('gemini-2.5-flash', b64, mime) },
  { name: 'gemini-1.5-flash', call: (b64, mime) => callGemini('gemini-1.5-flash', b64, mime) },
  { name: 'groq-llama-vision', call: (b64, mime) => callGroq(b64, mime) },
];

async function analyzeTrashImage(imageBase64, mimeType = 'image/jpeg') {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  let lastErr;

  for (const provider of PROVIDERS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawText = await provider.call(imageBase64, mimeType);
        return parseAndEnrich(rawText);
      } catch (err) {
        lastErr = err;

        if (err.fatal) throw err; // missing API key — don't retry

        const retry = isNetworkError(err) || (err.status && isTransient(err.status));
        if (retry && attempt === 0) {
          await sleep(1200);
          continue;
        }
        break; // move to next provider
      }
    }
  }

  throw lastErr || new Error('All AI providers failed');
}

module.exports = { analyzeTrashImage };
