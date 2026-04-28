// Multi-LLM client abstraction: Claude (Anthropic), OpenAI, Gemini
// Normaliza interface, tool handling, e responses entre os 3 providers

export interface LLMContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
}

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string | LLMContentBlock[]
}

export interface LLMTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface LLMResponse {
  text: string
  content: LLMContentBlock[] // Raw response content (text blocks + tool_use blocks)
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>
  stopReason: 'end_turn' | 'tool_use'
}

export interface LLMCallParams {
  model: string
  system: string
  messages: LLMMessage[]
  tools?: LLMTool[]
  maxTokens?: number
  temperature?: number
  // API keys (BYOK per tenant)
  anthropicApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
}

// ── Detects provider from model name ──────────────────────────────────────────
function getProvider(model: string): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) return 'openai'
  if (model.startsWith('gemini-')) return 'gemini'
  // Default to Claude if unclear
  return 'anthropic'
}

// ── Anthropic (Claude) ───────────────────────────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
}

interface AnthropicTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface AnthropicResponse {
  content: AnthropicContentBlock[]
  stop_reason: 'end_turn' | 'tool_use'
}

async function callAnthropic(params: {
  model: string
  system: string
  messages: AnthropicMessage[]
  tools?: AnthropicTool[]
  maxTokens?: number
  temperature?: number
  apiKey: string
}): Promise<AnthropicResponse> {
  const apiKey = params.apiKey || Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const body = {
    model: params.model,
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.7,
    system: params.system,
    messages: params.messages,
    ...(params.tools?.length ? { tools: params.tools } : {}),
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${err}`)
  }

  return res.json() as Promise<AnthropicResponse>
}

// ── OpenAI (ChatGPT) ─────────────────────────────────────────────────────────

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
    }
    finish_reason: 'stop' | 'tool_calls' | 'length'
  }>
}

async function callOpenAI(params: {
  model: string
  system: string
  messages: OpenAIMessage[]
  tools?: OpenAITool[]
  maxTokens?: number
  temperature?: number
  apiKey: string
}): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; finishReason: 'stop' | 'tool_calls' }> {
  const apiKey = params.apiKey || Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const body = {
    model: params.model,
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.7,
    messages: [
      { role: 'system' as const, content: params.system },
      ...params.messages,
    ],
    ...(params.tools?.length ? { tools: params.tools } : {}),
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API ${res.status}: ${err}`)
  }

  const data = await res.json() as OpenAIResponse
  const choice = data.choices[0]
  const message = choice.message

  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      try {
        const input = JSON.parse(tc.function.arguments) as Record<string, unknown>
        toolCalls.push({ id: tc.id, name: tc.function.name, input })
      } catch {
        // Skip malformed tool calls
      }
    }
  }

  return {
    content: message.content ?? '',
    toolCalls,
    finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
  }
}

// ── Google Gemini ────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string
  functionCall?: {
    name: string
    args: Record<string, unknown>
  }
  functionResponse?: {
    name: string
    response: Record<string, unknown>
  }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: GeminiPart[]
    }
    finishReason: string
  }>
}

async function callGemini(params: {
  model: string
  system: string
  messages: GeminiContent[]
  tools?: GeminiTool[]
  maxTokens?: number
  temperature?: number
  apiKey: string
}): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; finishReason: 'stop' | 'tool_calls' }> {
  const apiKey = params.apiKey || Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: params.system }],
      },
      ...params.messages,
    ],
    ...(params.tools ? { tools: params.tools } : {}),
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 1024,
      temperature: params.temperature ?? 0.7,
    },
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API ${res.status}: ${err}`)
  }

  const data = await res.json() as GeminiResponse
  const candidate = data.candidates?.[0]
  if (!candidate) throw new Error('No candidates in Gemini response')

  let textContent = ''
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
  let hasToolCall = false

  for (const part of candidate.content.parts) {
    if (part.text) textContent += part.text
    if (part.functionCall) {
      hasToolCall = true
      toolCalls.push({
        id: part.functionCall.name,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
      })
    }
  }

  return {
    content: textContent,
    toolCalls,
    finishReason: hasToolCall ? 'tool_calls' : 'stop',
  }
}

// ── Public main function ─────────────────────────────────────────────────────

export async function callLLM(params: LLMCallParams): Promise<LLMResponse> {
  const provider = getProvider(params.model)

  if (provider === 'anthropic') {
    // Convert LLM* interfaces to Anthropic
    const messages: AnthropicMessage[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))
    const tools: AnthropicTool[] | undefined = params.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }))

    const response = await callAnthropic({
      model: params.model,
      system: params.system,
      messages,
      tools,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      apiKey: params.anthropicApiKey || '',
    })

    // Extract text blocks
    const textBlocks = response.content.filter((b) => b.type === 'text')
    const text = textBlocks.map((b) => b.text ?? '').join('')

    // Extract tool uses
    const toolUses = response.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({
        id: b.id!,
        name: b.name!,
        input: b.input ?? {},
      }))

    return {
      text,
      content: response.content,
      toolUses,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
    }
  }

  if (provider === 'openai') {
    // Convert to OpenAI message format
    const messages: OpenAIMessage[] = params.messages.flatMap((m) => {
      if (typeof m.content === 'string') {
        return [{ role: m.role, content: m.content }]
      }

      // Assistant message with tool_use blocks → OpenAI format with tool_calls
      if (m.role === 'assistant') {
        const toolUseBlocks = m.content.filter((b) => b.type === 'tool_use')
        const textBlocks = m.content.filter((b) => b.type === 'text')
        const textContent = textBlocks.map((b) => b.text ?? '').join('') || null

        if (toolUseBlocks.length > 0) {
          return [{
            role: 'assistant' as const,
            content: textContent,
            tool_calls: toolUseBlocks.map((b) => ({
              id: b.id || `call_${b.name}`,
              type: 'function' as const,
              function: {
                name: b.name || '',
                arguments: JSON.stringify(b.input ?? {}),
              },
            })),
          }]
        }
        return [{ role: 'assistant' as const, content: textContent ?? '' }]
      }

      // User message with tool_result blocks → OpenAI 'tool' role messages
      const result: OpenAIMessage[] = []
      for (const block of m.content) {
        if (block.type === 'tool_result') {
          result.push({
            role: 'tool',
            content: block.content || '',
            tool_call_id: block.tool_use_id || '',
          })
        } else if (block.type === 'text') {
          result.push({
            role: m.role,
            content: block.text || '',
          })
        }
      }
      return result.length > 0 ? result : [{ role: m.role, content: '' }]
    })

    const tools: OpenAITool[] | undefined = params.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))

    const result = await callOpenAI({
      model: params.model,
      system: params.system,
      messages,
      tools,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      apiKey: params.openaiApiKey || '',
    })

    // Build content array for consistency with Anthropic format
    const content: LLMContentBlock[] = []
    if (result.content) content.push({ type: 'text', text: result.content })
    for (const tc of result.toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }

    return {
      text: result.content,
      content,
      toolUses: result.toolCalls,
      stopReason: result.finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
    }
  }

  if (provider === 'gemini') {
    // Convert to Gemini message format
    const messages: GeminiContent[] = params.messages.map((m) => {
      const parts: GeminiPart[] = []
      if (typeof m.content === 'string') {
        parts.push({ text: m.content })
      } else {
        for (const block of m.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text })
          } else if (block.type === 'tool_result') {
            parts.push({
              functionResponse: {
                name: block.tool_use_id || 'unknown',
                response: { result: block.content || '' },
              },
            })
          }
        }
      }
      return {
        role: m.role === 'user' ? 'user' : 'model',
        parts,
      }
    })

    const tools: GeminiTool[] | undefined = params.tools
      ? [
          {
            functionDeclarations: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.input_schema,
            })),
          },
        ]
      : undefined

    const result = await callGemini({
      model: params.model,
      system: params.system,
      messages,
      tools,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      apiKey: params.geminiApiKey || '',
    })

    // Build content array for consistency
    const content: LLMContentBlock[] = []
    if (result.content) content.push({ type: 'text', text: result.content })
    for (const tc of result.toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }

    return {
      text: result.content,
      content,
      toolUses: result.toolCalls,
      stopReason: result.finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
    }
  }

  throw new Error(`Unsupported provider for model: ${params.model}`)
}
