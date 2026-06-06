# AI Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TinyLlama-powered chat widget below the scan result card that appears only after a scan completes and is pre-loaded with the scanned item's context.

**Architecture:** A new Express route `POST /api/ai-chat` proxies messages to HuggingFace's Inference API (TinyLlama 1.1B), injecting the scanned item's material/category/disposal data as a system prompt. The frontend widget is hidden until `showResult()` fires, renders user and assistant bubbles, and resets when a different scan card is selected.

**Tech Stack:** Node.js/Express, HuggingFace Inference API (`TinyLlama/TinyLlama-1.1B-Chat-v1.0`), vanilla JS, CSS custom properties

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `routes/chat.js` | Create | `POST /api/ai-chat` — builds prompt, calls HF, returns reply |
| `server.js` | Modify | Mount chat route at `/api` |
| `public/index.html` | Modify | Add `#ai-chat-card` HTML after `#result-card` |
| `public/css/styles.css` | Modify | Add `.ai-chat-*` styles |
| `public/js/scanner.js` | Modify | `initAiChat()`, `sendChatMessage()`, bubble rendering, reset |
| `.env` | Modify | Add `HF_API_KEY` |

---

## Task 1: Create the server-side chat route

**Files:**
- Create: `routes/chat.js`

- [ ] **Step 1: Create `routes/chat.js`**

```js
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
```

- [ ] **Step 2: Add `HF_API_KEY` to `.env`**

Open `.env` and add (get a free token from https://huggingface.co/settings/tokens):

```
HF_API_KEY=hf_your_token_here
```

---

## Task 2: Mount the chat route in server.js

**Files:**
- Modify: `server.js` (after line 46, before the Socket.io block)

- [ ] **Step 1: Add the mount line**

In `server.js`, after the existing route mounts (after line 46 `app.use('/api/admin', adminModule.router);`), add:

```js
const chatRouter = require('./routes/chat');
app.use('/api', chatRouter);
```

- [ ] **Step 2: Restart server and verify route exists**

```bash
node server.js
```

Then in a new terminal:
```bash
curl -X POST http://localhost:3000/api/ai-chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"hello\",\"itemContext\":{}}"
```

Expected: JSON response (either `{ reply }` or an error about HF_API_KEY if not set yet — both are valid at this stage).

- [ ] **Step 3: Commit**

```bash
git add routes/chat.js server.js .env
git commit -m "feat: add POST /api/ai-chat route with TinyLlama proxy"
```

---

## Task 3: Add CSS for the chat widget

**Files:**
- Modify: `public/css/styles.css` (append at end of file)

- [ ] **Step 1: Append chat widget styles**

Add to the end of `public/css/styles.css`:

```css
/* ── AI Chat Widget ──────────────────────────────────────────────────────── */
#ai-chat-card {
  display: none;
}

#ai-chat-card.visible {
  display: block;
}

.ai-chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.ai-chat-header-logo {
  height: 32px;
  width: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.ai-chat-header-title {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-size: 1.05rem;
  font-weight: 300;
  color: var(--forest);
  flex: 1;
}

.ai-chat-powered {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

#chat-messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--sage-200) transparent;
}

.chat-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 0.875rem;
  line-height: 1.55;
  word-break: break-word;
}

.chat-bubble-assistant {
  align-self: flex-start;
  background: var(--sage-100);
  color: var(--body-text);
  border-bottom-left-radius: 4px;
}

.chat-bubble-user {
  align-self: flex-end;
  background: var(--leaf);
  color: var(--white);
  border-bottom-right-radius: 4px;
}

.chat-bubble-loading {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 12px 16px;
}

.chat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
  animation: chat-bounce 1.2s infinite ease-in-out;
}

.chat-dot:nth-child(2) { animation-delay: 0.2s; }
.chat-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes chat-bounce {
  0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
  40%           { transform: scale(1);   opacity: 1;   }
}

.ai-chat-input-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--sage-200);
}

#chat-input {
  flex: 1;
  padding: 9px 16px;
  border: 1.5px solid var(--sage-200);
  border-radius: 50px;
  font-family: 'Syne', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  background: var(--white);
  color: var(--body-text);
  outline: none;
  transition: border-color 0.18s;
}

#chat-input:focus {
  border-color: var(--leaf);
}

#chat-send {
  padding: 9px 20px;
  background: var(--leaf);
  color: var(--white);
  border: none;
  border-radius: 50px;
  font-family: 'Syne', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s;
  white-space: nowrap;
}

#chat-send:hover:not(:disabled) {
  background: var(--leaf-hover);
}

#chat-send:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: add AI chat widget CSS styles"
```

---

## Task 4: Add the chat widget HTML

**Files:**
- Modify: `public/index.html` (after `#result-card` closing `</div>`, before the scan log card)

- [ ] **Step 1: Insert the chat card HTML**

In `public/index.html`, find the closing `</div>` of `#result-card` (line 110) and the scan log card that follows it. Insert between them:

```html
  <div class="card" id="ai-chat-card">
    <div class="ai-chat-header">
      <img src="/logo.png" alt="SARA" class="ai-chat-header-logo" />
      <span class="ai-chat-header-title">Ask SARA</span>
      <span class="ai-chat-powered">Powered by HuggingFace</span>
    </div>
    <div id="chat-messages"></div>
    <div class="ai-chat-input-row">
      <input type="text" id="chat-input" placeholder="Ask about recycling…" autocomplete="off" />
      <button id="chat-send">Send</button>
    </div>
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: add AI chat widget HTML to scanner page"
```

---

## Task 5: Add client-side chat logic to scanner.js

**Files:**
- Modify: `public/js/scanner.js`

- [ ] **Step 1: Add DOM refs for chat elements**

In `scanner.js`, in the `// ── DOM refs ──` section (around line 102), add these lines after the existing refs:

```js
  const aiChatCard  = document.getElementById('ai-chat-card');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput   = document.getElementById('chat-input');
  const chatSend    = document.getElementById('chat-send');
```

- [ ] **Step 2: Add the chat state variable**

After the `let frozenFrame = null;` line (around line 123), add:

```js
  let currentItemContext = null;
```

- [ ] **Step 3: Add chat helper functions**

Add these functions before the `// ── AR auto-detection loop ──` comment (around line 125):

```js
  // ── AI Chat ───────────────────────────────────────────────────────────────────
  function appendBubble(text, role) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-' + role;
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function showLoadingBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-assistant chat-bubble-loading';
    bubble.innerHTML = '<div class="chat-dot"></div><div class="chat-dot"></div><div class="chat-dot"></div>';
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function initAiChat(item) {
    currentItemContext = {
      object:               item.object    || item.label || 'item',
      material:             item.material  || 'unknown material',
      category:             item.category  || 'unknown',
      recyclable:           item.recyclable,
      disposalInstructions: item.disposalInstructions || '',
    };

    chatMessages.innerHTML = '';
    aiChatCard.classList.add('visible');
    chatInput.value   = '';
    chatSend.disabled = false;

    const recyclableText = item.recyclable === true
      ? 'recyclable'
      : item.recyclable === false
        ? 'not recyclable'
        : 'recyclability unknown';

    appendBubble(
      `I've analysed your ${currentItemContext.object} — it's made of ${currentItemContext.material} and is ${recyclableText}. Ask me anything about recycling it, disposal options, or eco alternatives!`,
      'assistant'
    );
  }

  async function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (!msg || !currentItemContext) return;

    chatInput.value   = '';
    chatSend.disabled = true;
    appendBubble(msg, 'user');

    const loadingBubble = showLoadingBubble();

    try {
      const resp = await fetch('/api/ai-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: msg, itemContext: currentItemContext }),
      });
      const data = await resp.json();
      loadingBubble.remove();
      appendBubble(data.reply || data.error || "Couldn't generate a response. Try rephrasing.", 'assistant');
    } catch {
      loadingBubble.remove();
      appendBubble('Network error. Please try again.', 'assistant');
    } finally {
      chatSend.disabled = false;
      chatInput.focus();
    }
  }

  chatSend.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
```

- [ ] **Step 4: Call `initAiChat` from `showResult`**

In the `showResult` function (around line 493), add one line at the very end of the function, just before the closing `}`:

```js
    initAiChat(item);
```

The end of `showResult` should look like:

```js
    const earnedEl   = document.getElementById('points-earned');
    const earnedText = document.getElementById('points-earned-text');
    if (earnedEl && earnedText) {
      earnedText.textContent = '+10 ReGen Points earned';
      earnedEl.style.display = 'block';
    }

    initAiChat(item);
  }
```

- [ ] **Step 5: Hide chat when cards are cleared**

In the `clearCards` function (around line 394), add one line:

```js
  function clearCards() {
    if (!scanCards) return;
    scanCards.innerHTML = '';
    scanCards.style.display = 'none';
    if (aiChatCard) aiChatCard.classList.remove('visible');
    currentItemContext = null;
  }
```

- [ ] **Step 6: Commit**

```bash
git add public/js/scanner.js
git commit -m "feat: wire AI chat widget into scanner — initAiChat, sendChatMessage, bubble rendering"
```

---

## Task 6: End-to-end smoke test

- [ ] **Step 1: Start the server**

```bash
node server.js
```

Expected output:
```
SARA server running at http://localhost:3000
```

- [ ] **Step 2: Open the scanner page**

Navigate to `http://localhost:3000` in a browser.

Verify: the AI chat card is NOT visible on page load.

- [ ] **Step 3: Upload an image and scan**

Click "Upload Image", select any photo, click "Scan Material".

Verify:
1. Scan result card appears with item data
2. AI chat card appears below it with SARA logo, "Ask SARA" title, and a greeting bubble referencing the scanned item

- [ ] **Step 4: Send a chat message**

Type "How do I recycle this?" and press Enter or click Send.

Verify:
1. User bubble appears immediately on the right
2. Three-dot loading animation appears
3. Loading dots replaced by assistant reply text
4. Send button re-enables after reply arrives

- [ ] **Step 5: Switch scan cards**

If multiple items were detected, click a different item card.

Verify: chat resets with a new greeting referencing the newly selected item.

- [ ] **Step 6: Test cold start / missing key handling**

Temporarily remove `HF_API_KEY` from `.env` and restart. Scan an item and send a message.

Verify: assistant bubble shows "AI assistant unavailable. Check your HF_API_KEY." instead of crashing.

Restore the key and restart the server.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: AI chat agent complete — TinyLlama powered recycling assistant in scanner"
```
