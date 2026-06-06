# AI Chat Agent — Design Spec
Date: 2026-06-07

## Overview
Add a small AI chat widget below the scan result card on the SARA scanner page. The widget is hidden until a scan completes, pre-loaded with the scanned item's context, and lets users ask any recycling or eco question. Uses TinyLlama (1.1B) via the HuggingFace Inference API, proxied through a server-side Express route.

---

## Architecture

### Server
- New route: `POST /api/ai-chat` in `routes/scan.js` (or a new `routes/chat.js`)
- Request body: `{ message: string, itemContext: { object, material, category, recyclable, disposalInstructions } }`
- Response: `{ reply: string }`
- Calls HF Inference API: `https://api-inference.huggingface.co/models/TinyLlama/TinyLlama-1.1B-Chat-v1.0`
- Auth: `Authorization: Bearer ${process.env.HF_API_KEY}`
- Timeout: 15 seconds
- Retry: once on 503 (model cold start) after 3 seconds

### Client
- `initAiChat(item)` called at the end of `showResult()` in `scanner.js`
- Chat widget hidden by default (`display: none`), shown when `showResult()` runs
- Switching scan cards (clicking a different item card) resets chat history and re-initialises with new item context
- `clearCards()` hides the chat widget again

---

## Prompt Structure (TinyLlama chat format)

```
<|system|>
You are SARA, a friendly recycling assistant. The user just scanned: {object} made of {material}.
Category: {category}. Recyclable: {yes/no}. Disposal: {disposalInstructions}.
Answer recycling and eco questions helpfully and concisely. Keep replies under 3 sentences.
</s>
<|user|>
{userMessage}
</s>
<|assistant|>
```

Parameters: `max_new_tokens: 200`, `temperature: 0.7`, `do_sample: true`

---

## UI Component

### Structure (inserted after `#result-card` in `index.html`)
```
#ai-chat-card  (hidden by default, class: card)
  .ai-chat-header
    img.nav-logo (logo.png)
    span "Ask SARA"
    span.ai-chat-powered "Powered by HuggingFace"
  #chat-messages  (scrollable, max-height: 260px)
    [assistant bubble — greeting pre-loaded with item context]
  .ai-chat-input-row
    input#chat-input (text, placeholder: "Ask about recycling…")
    button#chat-send "Send"
```

### Bubble styles
- Assistant bubbles: left-aligned, background `var(--sage-50)` or similar neutral
- User bubbles: right-aligned, background `var(--leaf)`, text white
- Loading state: three animated dots in an assistant bubble while awaiting reply
- SARA logo (`/logo.png`) displayed in the header, same circular style as navbar

### Initial greeting (injected by `initAiChat`)
> "I've analysed your **{object}** — it's made of **{material}** and is **{recyclable/not recyclable}**. Ask me anything about recycling it, disposal options, or eco alternatives!"

---

## Error Handling

| Condition | User-facing message |
|---|---|
| `HF_API_KEY` missing | "AI assistant unavailable. Check your HF_API_KEY." |
| HF 503 (cold start, after retry) | "Model is warming up — try again in a moment." |
| Network timeout (15s) | "Response timed out. Please try again." |
| Empty/garbled model reply | "Couldn't generate a response. Try rephrasing." |
| General server error | "Something went wrong. Please try again." |

---

## Files Changed

| File | Change |
|---|---|
| `public/index.html` | Add `#ai-chat-card` HTML after `#result-card` |
| `public/js/scanner.js` | Add `initAiChat()`, `sendChatMessage()`, bubble rendering, reset logic |
| `public/css/styles.css` | Add `.ai-chat-*` styles (header, bubbles, input row, loading dots) |
| `routes/chat.js` (new file) | Add `POST /api/ai-chat` route |
| `server.js` | Mount `/api/ai-chat` from `routes/chat.js` |
| `.env` | Add `HF_API_KEY=<token>` (user must provide) |

---

## Out of Scope
- Conversation history sent back to server (each message is stateless — system + user turn only)
- Streaming responses
- Auth/rate limiting per user (MVP only)
