// Upload direto do browser pro Cloudinary via upload preset unsigned — mesmo
// padrão usado em components/products/image-uploader.tsx, extraído aqui pra
// ser reaproveitado por outros fluxos de anexo (ex: chat).

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? 'demo'
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? 'ml_default'

export interface UploadedFile {
  url: string
  publicId: string
  fileName: string
}

// Cloudinary não tem um resource_type "audio" de primeira classe — áudio sobe
// como "video" (mesma convenção já usada no upload de áudio do WhatsApp no
// backend, ver services/backend/src/shared/cloudinary.ts). Documentos/PDFs
// exigem "raw", senão o Cloudinary tenta (e falha) interpretar como imagem.
function resourceTypeFor(contentType: 'image' | 'audio' | 'document'): 'image' | 'video' | 'raw' {
  if (contentType === 'audio') return 'video'
  if (contentType === 'document') return 'raw'
  return 'image'
}

export async function uploadToCloudinary(file: File, contentType: 'image' | 'audio' | 'document', folder: string): Promise<UploadedFile> {
  const resourceType = resourceTypeFor(contentType)

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
  formData.append('folder', folder)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) throw new Error('Falha ao fazer upload do arquivo')

  const data = await res.json()
  return {
    url: data.secure_url,
    publicId: data.public_id,
    fileName: file.name,
  }
}
