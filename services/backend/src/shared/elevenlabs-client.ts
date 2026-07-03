// Wrapper ElevenLabs TTS — converte texto em áudio MP3.
// Porta 1:1 de supabase/functions/_shared/elevenlabs-client.ts.

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

function preprocessForTTS(text: string): string {
  return text.replace(/R\$\s*([\d.,]+)/g, (_match, raw: string) => {
    const normalized = raw.replace(/\./g, '').replace(',', '.')
    const value = parseFloat(normalized)
    if (isNaN(value)) return raw

    const reais = Math.floor(value)
    const centavos = Math.round((value - reais) * 100)

    if (centavos === 0) return `${reais} reais`
    return `${reais} reais e ${centavos} centavos`
  })
}

export async function textToSpeech(text: string, voiceId: string, apiKey: string): Promise<Uint8Array> {
  const res = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: preprocessForTTS(text),
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.2 },
    }),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown error')
    throw new Error(`ElevenLabs TTS error ${res.status}: ${errorText}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

/** Converte Uint8Array de áudio em string Base64 (usado pra sendAudio da Evolution). */
export function audioToBase64(audioBytes: Uint8Array): string {
  return Buffer.from(audioBytes).toString('base64')
}
