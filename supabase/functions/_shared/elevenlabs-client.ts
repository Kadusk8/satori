// Wrapper ElevenLabs TTS — converte texto em áudio MP3

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

/**
 * Pré-processa texto para TTS: converte notações que o TTS lê errado.
 * Ex: "R$ 6.809,80" → "6809 reais e 80 centavos"
 *     "R$ 99,90"    → "99 reais e 90 centavos"
 *     "R$ 500"      → "500 reais"
 */
function preprocessForTTS(text: string): string {
  return text.replace(/R\$\s*([\d.,]+)/g, (_match, raw: string) => {
    // Remove separadores de milhar (pontos) e converte vírgula decimal em ponto
    const normalized = raw.replace(/\./g, '').replace(',', '.')
    const value = parseFloat(normalized)
    if (isNaN(value)) return raw

    const reais = Math.floor(value)
    const centavos = Math.round((value - reais) * 100)

    if (centavos === 0) return `${reais} reais`
    return `${reais} reais e ${centavos} centavos`
  })
}

/**
 * Converte texto em fala usando ElevenLabs TTS.
 * Retorna os bytes do áudio MP3 como Uint8Array.
 * Lança erro se a requisição falhar.
 */
export async function textToSpeech(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<Uint8Array> {
  const res = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: preprocessForTTS(text),
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.2,
      },
    }),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown error')
    throw new Error(`ElevenLabs TTS error ${res.status}: ${errorText}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

/**
 * Converte Uint8Array de áudio em string Base64.
 * Usado para enviar via Evolution API sendMedia.
 */
export function audioToBase64(audioBytes: Uint8Array): string {
  // Converte em chunks para evitar stack overflow em arrays grandes
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < audioBytes.length; i += chunkSize) {
    const chunk = audioBytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
