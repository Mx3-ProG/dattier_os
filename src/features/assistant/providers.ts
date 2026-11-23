/* Abstraction multi-provider pour STUDIO VOICE.
   Permet de raccorder Anthropic (par défaut) ou tout fournisseur
   OpenAI-compatible (Ollama, Mistral, Groq, Together, vLLM…). */
import Anthropic from "@anthropic-ai/sdk";
import { providerCostEur, type TokenUsage } from "@/domain/assistant/pricing";

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { tool_use_id: string; content: string; is_error: boolean };
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LlmTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
};

export type LlmResponse = {
  text: string[];
  toolCalls: ToolCall[];
  usage: TokenUsage;
  model: string;
  stopReason: string;
};

export interface LlmProvider {
  readonly name: string;
  chat(params: {
    model: string;
    system: string;
    messages: ChatMessage[];
    tools: LlmTool[];
    maxTokens?: number;
  }): Promise<LlmResponse>;
}

/* ---------- Anthropic ---------- */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  constructor() {
    this.client = new Anthropic({ maxRetries: 1, timeout: 45_000 });
  }
  async chat({ model, system, messages, tools, maxTokens = 8000 }: Parameters<LlmProvider["chat"]>[0]) {
    const anthMessages = messages.map((m: ChatMessage) => {
      if (m.role === "user") return { role: "user" as const, content: m.content };
      if (m.role === "assistant") {
        const blocks: unknown[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls ?? [])
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        return { role: "assistant" as const, content: blocks.length ? blocks : m.content };
      }
      return {
        role: "user" as const,
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content }],
      };
    });
    const anthTools = tools.map((t: LlmTool) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
    const response = await this.client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: anthTools as never,
      messages: anthMessages as never,
    });
    const text: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) text.push(block.text.trim());
      if (block.type === "tool_use")
        toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
    }
    return {
      text,
      toolCalls,
      usage: response.usage as TokenUsage,
      model: response.model,
      stopReason: response.stop_reason ?? "end_turn",
    };
  }
}

/* ---------- OpenAI-compatible (Ollama, Mistral, Groq, Together, vLLM…) ---------- */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai-compatible";
  constructor(private baseUrl: string, private apiKey: string) {}
  async chat({ model, system, messages, tools, maxTokens = 8000 }: Parameters<LlmProvider["chat"]>[0]) {
    const openaiMessages: unknown[] = [{ role: "system", content: system }];
    for (const m of messages as ChatMessage[]) {
      if (m.role === "user") openaiMessages.push({ role: "user", content: m.content });
      else if (m.role === "assistant") {
        const msg: Record<string, unknown> = { role: "assistant", content: m.content || null };
        if (m.tool_calls?.length)
          msg.tool_calls = m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          }));
        openaiMessages.push(msg);
      } else {
        openaiMessages.push({ role: "tool", tool_call_id: m.tool_call_id, content: m.content });
      }
    }
    const openaiTools = tools.map((t: LlmTool) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        tools: openaiTools.length ? openaiTools : undefined,
        tool_choice: openaiTools.length ? "auto" : undefined,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LLM provider error ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason?: string }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices?.[0];
    const msg = choice?.message;
    const text = msg?.content ? [msg.content.trim()] : [];
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = {};
      }
      return { id: tc.id, name: tc.function.name, input };
    });
    // Approximation du coût : on laisse pricing.ts gérer via providerCostEur avec le modèle.
    const usage: TokenUsage = {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    } as TokenUsage;
    return {
      text,
      toolCalls,
      usage,
      model: data.model ?? model,
      stopReason: choice?.finish_reason ?? "stop",
    };
  }
}

/* ---------- Factory ---------- */
export function createLlmProvider(): LlmProvider {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  if (provider === "openai-compatible" || provider === "ollama" || !!process.env.AI_BASE_URL) {
    const base = process.env.AI_BASE_URL || "http://localhost:11434/v1";
    const key = process.env.AI_API_KEY || process.env.OLLAMA_API_KEY || "ollama";
    return new OpenAiCompatibleProvider(base, key);
  }
  return new AnthropicProvider();
}

export function llmEnabled() {
  if (process.env.AI_PROVIDER === "openai-compatible" || process.env.AI_PROVIDER === "ollama" || process.env.AI_BASE_URL)
    return true;
  return !!process.env.ANTHROPIC_API_KEY;
}

export function llmModel() {
  return process.env.AI_MODEL || process.env.ATACUISINE_AI_MODEL || "claude-opus-5-5";
}
