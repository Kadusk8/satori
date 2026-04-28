// Wrapper OpenAI Whisper STT — transcreve áudio para texto

const OPENAI_API_URL = 'https://api.openai.com/v1'

/**
 * Transcreve um áudio a partir de uma URL usando OpenAI Whisper.
 * 1. Baixa o áudio da URL fornecida (geralmente da Evolution API)
 * 2. Envia para a API Whisper como multipart/form-data
 * 3. Retorna o texto transcrito, ou string vazia em caso de falha
 */
export async function transcribeAudio(
  audioUrl: string,
  openaiApiKey: string,
  downloadHeaders?: Record<string, string>
): Promise<string> {
  try {
    // Baixa o áudio (com headers opcionais para URLs autenticadas como Evolution API)
    const audioRes = await fetch(audioUrl, downloadHeaders ? { headers: downloadHeaders } : undefined)
    if (!audioRes.ok) {
      console.error(`[whisper-client] Falha ao baixar áudio: ${audioRes.status}`)
      return ''
    }

    const audioBuffer = await audioRes.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })

    // Monta o form-data para a API Whisper
    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.ogg')
    formData.append('model', 'whisper-1')
    formData.append('language', 'pt')
    formData.append('response_format', 'text')

    const res = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        // Content-Type é definido automaticamente pelo FormData (multipart/form-data)
      },
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown error')
      console.error(`[whisper-client] Whisper API error ${res.status}: ${errorText}`)
      return ''
    }

    // response_format: 'text' retorna plain text
    const transcript = await res.text()
    return transcript.trim()
  } catch (err) {
    console.error('[whisper-client] Erro na transcrição:', err)
    return ''
  }
}
