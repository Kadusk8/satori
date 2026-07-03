// Upload de áudio do WhatsApp — substitui o bucket `media` do Supabase Storage.
// Cloudinary trata arquivos de áudio como resource_type "video" (não existe
// um tipo "audio" de primeira classe na API clássica de upload).

import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/** Envia os bytes de um áudio pro Cloudinary e retorna a URL pública (https). */
export async function uploadAudio(tenantId: string, messageId: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg'
  const dataUri = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: 'video', // áudio entra sob "video" na API do Cloudinary
    folder: `zapagent/${tenantId}/audio`,
    public_id: messageId,
    format: ext,
    overwrite: true,
  })

  return result.secure_url
}
