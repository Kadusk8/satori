// Wrapper da Claude API (Anthropic) para as edge functions

import type { Tool } from './claude-tools.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  // text block
  text?: string
  // tool_use block
  id?: string
  name?: string
  input?: Record<string, unknown>
  // tool_result block
  tool_use_id?: string
  content?: string
}

export interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ClaudeContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  usage: { input_tokens: number; output_tokens: number }
}

export interface ClaudeCallParams {
  model: string
  system: string
  messages: ClaudeMessage[]
  tools?: Tool[]
  maxTokens?: number
  temperature?: number
}

export async function callClaude(params: ClaudeCallParams): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  const body = {
    model: params.model,
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.7,
    system: params.system,
    messages: params.messages,
    ...(params.tools?.length ? { tools: params.tools } : {}),
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API ${res.status}: ${err}`)
  }

  return res.json() as Promise<ClaudeResponse>
}

// Extrai o texto da resposta (blocos de texto concatenados)
export function extractText(response: ClaudeResponse): string {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim()
}

// Verifica se a resposta contém tool_use
export function hasToolUse(response: ClaudeResponse): boolean {
  return response.stop_reason === 'tool_use'
}

// Extrai os blocos tool_use da resposta
export function extractToolUses(
  response: ClaudeResponse
): Array<{ id: string; name: string; input: Record<string, unknown> }> {
  return response.content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: b.id!,
      name: b.name!,
      input: b.input ?? {},
    }))
}
