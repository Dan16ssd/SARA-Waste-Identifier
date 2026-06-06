'use strict';

const express = require('express');
const router  = express.Router();

const HF_MODEL = 'TinyLlama/TinyLlama-1.1B-Chat-v1.0';
const HF_URL   = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
const TIMEOUT_MS = 15000;

function buildPrompt(message, ctx) {
  const recyclable = ctx.recyclable === true ? 'yes' : ctx.recyclable === false ? 'no' : 'unknown';
  const system =
    `You are SARA, a friendly recycling assistant. ` +
    `The user just scanned: ${ctx.object || 'an item'} made of ${ctx.material || 'unknown material'}. ` +
    `Category: ${ctx.category || 'unknown'}. Recyclable: ${recyclable}. ` +
    `Disposal: ${ctx.disposalInstructions || 'no specific instructions'}. ` +
    `Answer recycling and eco questions helpfully and concisely. Keep replies under 3 sentences.`;

  return `<|system|>\n${system}\n</s>\n<|user|>\n${message}\n</s>\n<|assistant|>\n`;
}

async function callHF(prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens:   200,
          temperature:      0.7,
          do_sample:        true,
          return_full_text: false,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    return { status: resp.status, data: await resp.json() };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
}

router.post('/ai-chat', async (req, res) => {
  const { message, itemContext = {} } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI assistant unavailable. Check your HF_API_KEY.' });
  }

  const prompt = buildPrompt(message.trim(), itemContext);

  try {
    let { status, data } = await callHF(prompt, apiKey);

    // One retry on cold-start 503
    if (status === 503) {
      await new Promise(r => setTimeout(r, 3000));
      ({ status, data } = await callHF(prompt, apiKey));
    }

    if (status === 503) {
      return res.status(503).json({ error: 'Model is warming up — try again in a moment.' });
    }
    if (status !== 200) {
      return res.status(502).json({ error: 'Something went wrong. Please try again.' });
    }

    const reply = Array.isArray(data) && data[0] && data[0].generated_text
      ? data[0].generated_text.trim()
      : null;

    if (!reply) {
      return res.status(502).json({ error: "Couldn't generate a response. Try rephrasing." });
    }

    return res.json({ reply });
  } catch (err) {
    if (err.message === 'timeout') {
      return res.status(504).json({ error: 'Response timed out. Please try again.' });
    }
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
