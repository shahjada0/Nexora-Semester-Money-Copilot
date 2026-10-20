/**
 * The only place the app talks to an LLM. Swap the model or provider with env vars:
 *   LLM_PROVIDER    — gemini | groq. Default: gemini if GEMINI_API_KEY is set, else groq if GROQ_API_KEY is set.
 *   GEMINI_API_KEY  — Google Gemini API (default provider; Gemma 4, default gemma-4-26b-a4b-it via GEMINI_MODEL).
 *   GROQ_API_KEY    — alternative provider (default openai/gpt-oss-120b via GROQ_MODEL).
 *   No key means no LLM: every caller falls back to the rule-based path, through the same gate.
 */
import Groq from 'groq-sdk';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export type LLMErrorKind = 'rate_limit' | 'timeout' | 'api' | 'no_key';

export class LLMError extends Error {
  constructor(public kind: LLMErrorKind, message: string, public retryAfterSec?: number) {
    super(message);
  }
}

export interface LLMProvider {
  name: string;
  model: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Running token usage (process-wide), for eval reporting and tuning. */
export const llmUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };

class GroqProvider implements LLMProvider {
  name = 'groq';
  private client: Groq;
  constructor(apiKey: string, public model: string) {
    // We do our own retry/backoff so the UI can report rate limits clearly.
    this.client = new Groq({ apiKey, maxRetries: 0, timeout: 25_000 });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await this.client.chat.completions.create({
          model: this.model,
          messages: req.messages as any,
          tools: req.tools as any,
          tool_choice: req.tools?.length ? 'auto' : undefined,
          temperature: req.temperature ?? 0,
          max_tokens: req.maxTokens ?? 1500,
          // gpt-oss models reason before answering; low effort keeps each turn small and fast (free-tier TPM).
          ...(this.model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
        } as any);
        const msg = res.choices[0]?.message;
        if (res.usage) {
          llmUsage.calls++;
          llmUsage.promptTokens += res.usage.prompt_tokens ?? 0;
          llmUsage.completionTokens += res.usage.completion_tokens ?? 0;
        }
        return {
          content: msg?.content ?? null,
          toolCalls: (msg?.tool_calls ?? []).map((t) => ({ id: t.id, type: 'function', function: { name: t.function.name, arguments: t.function.arguments ?? '{}' } })),
        };
      } catch (err: unknown) {
        const e = err as { status?: number; headers?: Record<string, string> | Headers; message?: string; name?: string };
        const status = e.status;
        if (status === 429) {
          // Daily quota (TPD/RPD): retrying in seconds is pointless — fall back at once.
          if (/per day|\(TPD\)|\(RPD\)/i.test(e.message ?? '')) {
            const m = (e.message ?? '').match(/try again in ([0-9hms.]+)/i);
            throw new LLMError('rate_limit', `The free AI quota for today is used up${m ? ` (more in about ${m[1].replace(/\.\d+s$/, 's')})` : ''}.`);
          }
          const h = e.headers as Record<string, string> | undefined;
          const retryAfter = Number((h && (typeof (h as unknown as Headers).get === 'function' ? (h as unknown as Headers).get('retry-after') : h['retry-after'])) ?? NaN);
          if (attempt < maxAttempts) {
            // Exponential backoff with jitter, honouring Retry-After when short.
            const wait = Number.isFinite(retryAfter) && retryAfter <= 8 ? retryAfter * 1000 : 800 * 2 ** (attempt - 1) + Math.random() * 300;
            await sleep(wait);
            continue;
          }
          throw new LLMError('rate_limit', 'The AI service is rate-limited right now.', Number.isFinite(retryAfter) ? retryAfter : undefined);
        }
        if (e.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(e.message ?? '')) {
          if (attempt < 2) continue;
          throw new LLMError('timeout', 'The AI service timed out.');
        }
        if (status && status >= 500 && attempt < 2) {
          await sleep(500);
          continue;
        }
        throw new LLMError('api', `AI service error${status ? ` (HTTP ${status})` : ''}: ${(e.message ?? 'unknown').slice(0, 200)}`);
      }
    }
  }
}

const override = globalThis as unknown as { __llmOverride?: LLMProvider | null };

/** Tests and the eval suite plug in a scripted "compromised" model here. */
export function setLLMOverride(p: LLMProvider | null | undefined): void {
  override.__llmOverride = p;
}

export const DEFAULT_FAST_MODEL = 'openai/gpt-oss-20b';
export const DEFAULT_GEMINI_MODEL = 'gemma-4-26b-a4b-it';
export const DEFAULT_GEMINI_FAST_MODEL = 'gemma-4-26b-a4b-it';

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
};

/**
 * Google Gemini API (Gemma 4 models) with native function calling, via plain fetch.
 * Thought parts are dropped from the reply; thought signatures are echoed back with the
 * function calls on the next turn, as the API requires.
 */
class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private calls = new Map<string, { name: string; signature?: string }>();
  constructor(private apiKey: string, public model: string) {}

  private thinkingConfig(): Record<string, unknown> | undefined {
    const level = process.env.GEMINI_THINKING_LEVEL?.trim() ?? (/26b/.test(this.model) ? 'minimal' : '');
    return level ? { thinkingLevel: level } : undefined;
  }

  private toContents(messages: ChatMessage[]) {
    let system = '';
    const contents: { role: 'user' | 'model'; parts: GeminiPart[] }[] = [];
    for (const m of messages) {
      if (m.role === 'system') system += (system ? '\n\n' : '') + m.content;
      else if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.content }] });
      else if (m.role === 'assistant') {
        const parts: GeminiPart[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.tool_calls ?? []) {
          const sig = this.calls.get(tc.id)?.signature;
          parts.push({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}'), id: tc.id }, ...(sig ? { thoughtSignature: sig } : {}) });
        }
        if (parts.length) contents.push({ role: 'model', parts });
      } else if (m.role === 'tool') {
        const name = this.calls.get(m.tool_call_id)?.name ?? 'tool';
        const part: GeminiPart = { functionResponse: { name, id: m.tool_call_id, response: { result: m.content } } };
        const last = contents[contents.length - 1];
        if (last && last.role === 'user' && last.parts.every((p) => p.functionResponse)) last.parts.push(part);
        else contents.push({ role: 'user', parts: [part] });
      }
    }
    return { system, contents };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { system, contents } = this.toContents(req.messages);
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      ...(req.tools?.length
        ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }] }
        : {}),
      generationConfig: { temperature: req.temperature ?? 0, maxOutputTokens: Math.max(req.maxTokens ?? 1500, 1024), ...(this.thinkingConfig() ? { thinkingConfig: this.thinkingConfig() } : {}) },
    };
    for (let attempt = 1; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch {
        clearTimeout(timer);
        if (attempt < 2) continue;
        throw new LLMError('timeout', 'The AI service timed out.');
      }
      clearTimeout(timer);
      const json = (await res.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: GeminiPart[] } }[];
        error?: { message?: string; status?: string; details?: { retryDelay?: string }[] };
      };
      if (res.status === 429) {
        const msg = json.error?.message ?? '';
        if (/per ?day|PerDay/i.test(msg)) throw new LLMError('rate_limit', 'The free AI quota for today is used up.');
        // Per-minute token limit: honour the server's retryDelay when it is short, so the AI still answers.
        const delay = Number((json.error?.details ?? []).map((d) => d.retryDelay).find(Boolean)?.replace(/s$/, '') ?? NaN);
        if (attempt < 3) {
          await sleep(Number.isFinite(delay) && delay <= 20 ? delay * 1000 + 250 : 1000 * 2 ** (attempt - 1) + Math.random() * 300);
          continue;
        }
        throw new LLMError('rate_limit', 'The AI service is rate-limited right now.');
      }
      if (res.status >= 500 && attempt < 2) {
        await sleep(600);
        continue;
      }
      if (!res.ok) throw new LLMError('api', `AI service error (HTTP ${res.status}): ${(json.error?.message ?? 'unknown').slice(0, 200)}`);
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const toolCalls: ToolCall[] = [];
      for (const p of parts) {
        if (!p.functionCall) continue;
        const id = p.functionCall.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
        this.calls.set(id, { name: p.functionCall.name, signature: p.thoughtSignature });
        toolCalls.push({ id, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) } });
      }
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
      return { content: text || null, toolCalls };
    }
  }
}

/**
 * Provider choice: LLM_PROVIDER=gemini|groq, else Gemini when GEMINI_API_KEY is set, else Groq.
 * 'plan' — the agent loop. 'fast' — extraction and scam classification.
 */
export function getLLM(kind: 'plan' | 'fast' = 'plan'): LLMProvider | null {
  if (override.__llmOverride !== undefined) return override.__llmOverride;
  const gemini = process.env.GEMINI_API_KEY?.trim();
  const groq = process.env.GROQ_API_KEY?.trim();
  const choice = process.env.LLM_PROVIDER?.trim() || (gemini ? 'gemini' : groq ? 'groq' : '');
  if (choice === 'gemini' && gemini) {
    const model = kind === 'fast' ? process.env.GEMINI_FAST_MODEL?.trim() || DEFAULT_GEMINI_FAST_MODEL : process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    return new GeminiProvider(gemini, model);
  }
  if (choice === 'groq' && groq) {
    const plan = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
    const model = kind === 'fast' ? process.env.GROQ_FAST_MODEL?.trim() || DEFAULT_FAST_MODEL : plan;
    return new GroqProvider(groq, model);
  }
  return null;
}

export function llmStatus(): { enabled: boolean; provider: string; model: string | null } {
  const llm = getLLM();
  return { enabled: !!llm, provider: llm ? llm.name : 'rule-based fallback', model: llm?.model ?? null };
}

/** Pull the first JSON object out of a model reply (tolerates code fences and chatter). */
export function extractJsonObject(text: string | null): unknown {
  if (!text) throw new Error('empty reply');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(body.slice(start, end + 1));
}
