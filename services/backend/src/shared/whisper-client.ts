// Wrapper OpenAI Whisper STT — transcreve áudio para texto.
// Porta 1:1 de supabase/functions/_shared/whisper-client.ts.

const OPENAI_API_URL = 'https://api.openai.com/v1'

export async function transcribeAudio(
  audioUrl: string,
  openaiApiKey: string,
  downloadHeaders?: Record<string, string>
): Promise<string> {
  try {
    const audioRes = await fetch(audioUrl, downloadHeaders ? { headers: downloadHeaders } : undefined)
    if (!audioRes.ok) {
      console.error(`[whisper-client] Falha ao baixar áudio: ${audioRes.status}`)
      return ''
    }

    const audioBuffer = await audioRes.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })

    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.ogg')
    formData.append('model', 'whisper-1')
    formData.append('language', 'pt')
    formData.append('response_format', 'text')

    const res = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown error')
      console.error(`[whisper-client] Whisper API error ${res.status}: ${errorText}`)
      return ''
    }

    const transcript = await res.text()
    return transcript.trim()
  } catch (err) {
    console.error('[whisper-client] Erro na transcrição:', err)
    return ''
  }
}
