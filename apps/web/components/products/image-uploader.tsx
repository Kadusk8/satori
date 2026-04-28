'use client'

import { useState, useRef, DragEvent } from 'react'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface UploadedImage {
  url: string
  thumbnailUrl: string
  publicId: string
  alt: string
}

interface ImageUploaderProps {
  images: UploadedImage[]
  onChange: (images: UploadedImage[]) => void
  cloudName: string
  uploadPreset: string
  maxImages?: number
}

export function ImageUploader({
  images,
  onChange,
  cloudName,
  uploadPreset,
  maxImages = 5,
}: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadToCloudinary(file: File): Promise<UploadedImage> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', uploadPreset)
    formData.append('folder', 'zapagent/products')

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    )

    if (!res.ok) throw new Error('Falha ao fazer upload da imagem')

    const data = await res.json()
    // Gera thumbnail otimizada para WhatsApp (400×400, auto quality)
    const thumbnailUrl = (data.secure_url as string).replace(
      '/upload/',
      '/upload/w_400,h_400,c_fill,q_auto,f_auto/'
    )

    return {
      url: data.secure_url,
      thumbnailUrl,
      publicId: data.public_id,
      alt: file.name.replace(/\.[^.]+$/, ''),
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = maxImages - images.length
    if (remaining <= 0) {
      setError(`Máximo de ${maxImages} imagens por produto`)
      return
    }

    setError(null)
    setUploading(true)

    const toUpload = Array.from(files).slice(0, remaining)
    try {
      const uploaded = await Promise.all(toUpload.map(uploadToCloudinary))
      onChange([...images, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {/* Zona de drop */}
      {images.length < maxImages && (
        <div
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={cn(
            'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 px-4 cursor-pointer transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30',
            uploading && 'cursor-not-allowed opacity-50'
          )}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              {uploading ? 'Fazendo upload...' : 'Arraste imagens ou clique para selecionar'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              JPG, PNG, WebP — máx 5 MB — até {maxImages} imagens
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Preview das imagens */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <div key={img.publicId} className="group relative rounded-lg overflow-hidden aspect-square bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnailUrl || img.url}
                alt={img.alt}
                className="h-full w-full object-cover"
              />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white rounded px-1 py-0.5">
                  Principal
                </span>
              )}
              <button
                onClick={() => removeImage(i)}
                type="button"
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < maxImages && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
