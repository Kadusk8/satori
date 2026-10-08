'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateContactProfile, type ContactProfileInput } from '@/lib/actions/contacts'

const schema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório'),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido')]),
  phone: z.string(),
  birthDate: z.string(),
  document: z.string(),
  address: z.string(),
  notes: z.string(),
}) satisfies z.ZodType<ContactProfileInput>

export function ContactProfileForm({
  contactId,
  whatsappName,
  initial,
}: {
  contactId: string
  whatsappName: string | null
  initial: ContactProfileInput
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ContactProfileInput>({ resolver: zodResolver(schema), defaultValues: initial })

  async function onSubmit(data: ContactProfileInput) {
    setSaving(true)
    try {
      await updateContactProfile(contactId, data)
      reset(data)
      toast.success('Cadastro atualizado')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <Field label="Nome" error={errors.name?.message}>
        <Input {...register('name')} />
        {whatsappName && <p className="text-xs text-muted-foreground mt-1">Nome no WhatsApp: {whatsappName}</p>}
      </Field>
      <Field label="E-mail" error={errors.email?.message}>
        <Input type="email" {...register('email')} placeholder="cliente@email.com" />
      </Field>
      <Field label="Telefone alternativo">
        <Input {...register('phone')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nascimento">
          <Input type="date" {...register('birthDate')} />
        </Field>
        <Field label="CPF / documento">
          <Input {...register('document')} />
        </Field>
      </div>
      <Field label="Endereço">
        <Input {...register('address')} />
      </Field>
      <Field label="Observações">
        <Textarea {...register('notes')} rows={3} />
      </Field>
      <Button type="submit" disabled={saving || !isDirty} className="w-full gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar cadastro
      </Button>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}
