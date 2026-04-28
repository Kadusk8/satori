'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

export function SettingsForm() {
  const [platformName, setPlatformName] = useState('SATORI')
  const [supportEmail, setSupportEmail] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSave() {
    setLoading(true)
    setTimeout(() => {
      toast.success('Configurações salvas')
      setLoading(false)
    }, 600)
  }

  return (
    <>
      <div className="space-y-1">
        <label className="text-sm font-medium">Nome da plataforma</label>
        <Input
          value={platformName}
          onChange={e => setPlatformName(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Email de suporte</label>
        <Input
          type="email"
          value={supportEmail}
          onChange={e => setSupportEmail(e.target.value)}
          placeholder="suporte@satori.com.br"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">Exibido nos emails enviados às empresas</p>
      </div>
      <Separator />
      <Button onClick={handleSave} disabled={loading} size="sm">
        {loading ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </>
  )
}
