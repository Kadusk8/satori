// Reenvio pelo LID quando o Evolution Go recusa o número ("not registered on WhatsApp").
//
// O Evolution Go tira o 9 dos celulares BR com DDD >= 31 antes de checar se o número existe no
// WhatsApp. Contas cadastradas COM o 9 (comuns) falham com esse erro mesmo tendo acabado de nos
// escrever. O LID do contato (gravado no webhook a cada mensagem) não passa por essa normalização.
//
// Módulo sem dependências de propósito, pra ser testável sem banco.

const NOT_REGISTERED_RE = /not registered on WhatsApp/i

export function isNotRegisteredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return NOT_REGISTERED_RE.test(msg)
}

/**
 * Tenta `send(number)`. Se falhar com "not registered" e o contato tiver LID, tenta uma vez
 * `send(lid)`. Qualquer outro erro (ou sem LID, ou `number` já ser um JID) sobe como estava.
 */
export async function sendWithLidRetry<T>(
  number: string,
  send: (target: string) => Promise<T>,
  lookupLid: (number: string) => Promise<string | null>,
  onRetry?: (number: string, lid: string) => void
): Promise<T> {
  try {
    return await send(number)
  } catch (err) {
    if (!isNotRegisteredError(err) || number.includes('@')) throw err
    const lid = await lookupLid(number)
    if (!lid) throw err
    onRetry?.(number, lid)
    return await send(lid)
  }
}
