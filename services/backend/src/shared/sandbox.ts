// Modo simulador ("Teste com a IA"): o dono do negócio conversa com a IA numa tela
// parecida com o WhatsApp. Roda o mesmo pipeline de produção (processMessage), mas
// dentro deste contexto NADA sai pro mundo real: sem envio no WhatsApp, sem agendamento,
// sem follow-up, sem escalada pra equipe. Usa AsyncLocalStorage pra o isolamento valer só
// pra cadeia de chamadas da requisição de teste, sem vazar pra conversas reais em paralelo.

import { AsyncLocalStorage } from 'node:async_hooks'

export interface SandboxContext {
  /** URL do áudio TTS gerado na resposta (preenchida por sendAudio do cliente falso). */
  audioUrl?: string
}

const storage = new AsyncLocalStorage<SandboxContext>()

export function runInSandbox<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({}, fn)
}

export function getSandbox(): SandboxContext | undefined {
  return storage.getStore()
}

export function isSandbox(): boolean {
  return storage.getStore() !== undefined
}

/** Espera só fora do simulador (simula "digitando…" no WhatsApp real, mas não faz sentido no teste). */
export async function humanDelay(ms: number): Promise<void> {
  if (isSandbox()) return
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}
