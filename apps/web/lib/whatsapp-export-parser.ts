// Parser do arquivo .txt que o próprio WhatsApp gera em "Exportar conversa"
// (sem mídia). Cobre os dois formatos de data mais comuns:
//   Android: "12/07/2026 14:32 - João Silva: Oi, tudo bem?"
//   iOS:     "[12/07/2026, 14:32:05] João Silva: Oi, tudo bem?"
// Linhas de mensagens de mídia omitida (ex: "<Arquivo de mídia oculto>") viram
// texto normal — não há arquivo real pra anexar num export sem mídia.

export interface ParsedWaMessage {
  timestamp: Date
  senderName: string
  content: string
}

const LINE_PATTERN =
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?[Mm]\.?)?)\]?\s*-?\s*([^:]+):\s(.*)$/

function parseTimestamp(dateStr: string, timeStr: string): Date | null {
  const [d, m, y] = dateStr.split('/').map((n) => parseInt(n, 10))
  if (!d || !m || !y) return null
  const year = y < 100 ? 2000 + y : y

  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s?([AaPp]\.?[Mm]\.?)?$/.exec(timeStr.trim())
  if (!timeMatch) return null
  let hour = parseInt(timeMatch[1], 10)
  const minute = parseInt(timeMatch[2], 10)
  const second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0
  const meridiem = timeMatch[4]?.toLowerCase().replace(/\./g, '')
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0

  const date = new Date(year, m - 1, d, hour, minute, second)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Parseia o texto bruto do export. Linhas que não abrem uma nova mensagem
 * (continuação de uma mensagem multi-linha) são anexadas à mensagem anterior. */
export function parseWhatsAppExport(text: string): ParsedWaMessage[] {
  const lines = text.split(/\r?\n/)
  const messages: ParsedWaMessage[] = []

  for (const line of lines) {
    const match = LINE_PATTERN.exec(line.trim())
    if (match) {
      const [, dateStr, timeStr, senderName, content] = match
      const timestamp = parseTimestamp(dateStr, timeStr)
      if (timestamp) {
        messages.push({ timestamp, senderName: senderName.trim(), content: content.trim() })
        continue
      }
    }
    // Linha de continuação (mensagem multi-linha) ou linha de sistema no topo
    // do arquivo (antes da primeira mensagem reconhecida) — ignorada nesse caso.
    if (messages.length > 0 && line.trim()) {
      messages[messages.length - 1].content += `\n${line.trim()}`
    }
  }

  return messages
}

/** Nomes distintos de remetente encontrados, ordenados por frequência (mais comum primeiro). */
export function getDistinctSenders(messages: ParsedWaMessage[]): string[] {
  const counts = new Map<string, number>()
  for (const m of messages) counts.set(m.senderName, (counts.get(m.senderName) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}
