'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { usePushNotifications } from '@/lib/hooks/use-push-notifications'
import {
  updateMyNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/actions/notification-preferences'

/** Ligar/desligar neste aparelho + preferências (valem pra todos os aparelhos do usuário). */
export function NotificationSettings({ initial }: { initial: NotificationPreferences }) {
  const push = usePushNotifications()

  const [onlyAssigned, setOnlyAssigned] = useState(initial.onlyAssigned)
  const [quietEnabled, setQuietEnabled] = useState(initial.quietStart !== null)
  const [quietStart, setQuietStart] = useState(initial.quietStart ?? '22:00')
  const [quietEnd, setQuietEnd] = useState(initial.quietEnd ?? '07:00')
  const [saving, setSaving] = useState(false)
  // Último valor salvo — referência do "tem alteração?" (initial fica velho após salvar).
  const [saved, setSaved] = useState(initial)

  const current: NotificationPreferences = {
    onlyAssigned,
    quietStart: quietEnabled ? quietStart : null,
    quietEnd: quietEnabled ? quietEnd : null,
  }
  const dirty =
    current.onlyAssigned !== saved.onlyAssigned ||
    current.quietStart !== saved.quietStart ||
    current.quietEnd !== saved.quietEnd

  async function save() {
    setSaving(true)
    try {
      const res = await updateMyNotificationPreferences(current)
      if (res.error) {
        toast.error(res.error)
      } else {
        setSaved(current)
        toast.success('Preferências salvas.')
      }
    } catch {
      toast.error('Não foi possível salvar as preferências.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Este aparelho */}
      <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          {push.isSubscribed ? (
            <Bell className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span>
            {push.isLoading
              ? 'Verificando este aparelho…'
              : !push.isSupported
                ? 'Este navegador não recebe notificações.'
                : push.isSubscribed
                  ? 'Notificações ligadas neste aparelho.'
                  : push.permission === 'denied'
                    ? 'Notificações bloqueadas nas configurações do aparelho.'
                    : 'Notificações desligadas neste aparelho.'}
          </span>
        </div>
        {!push.isLoading && push.isSupported && push.permission !== 'denied' && (
          <Button
            size="sm"
            variant={push.isSubscribed ? 'outline' : 'default'}
            onClick={() => void (push.isSubscribed ? push.unsubscribe() : push.subscribe())}
          >
            {push.isSubscribed ? 'Desligar' : 'Ativar'}
          </Button>
        )}
        {!push.isLoading && !push.isSupported && (
          <Button size="sm" variant="outline" render={<Link href="/instalar" />} nativeButton={false}>
            Instalar app
          </Button>
        )}
      </div>

      {/* Preferências */}
      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <div>
          <p className="text-sm font-medium">Só conversas atribuídas a mim</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Não avisa de clientes aguardando que ainda não têm vendedor.
          </p>
        </div>
        <Switch checked={onlyAssigned} onCheckedChange={setOnlyAssigned} className="mt-1" />
      </label>

      <div className="space-y-3">
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium">Horário silencioso</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nenhuma notificação nesse intervalo (no fuso da empresa).
            </p>
          </div>
          <Switch checked={quietEnabled} onCheckedChange={setQuietEnabled} className="mt-1" />
        </label>
        {quietEnabled && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">De</span>
            <Input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="w-36"
              aria-label="Início do horário silencioso"
            />
            <span className="text-muted-foreground">até</span>
            <Input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="w-36"
              aria-label="Fim do horário silencioso"
            />
          </div>
        )}
      </div>

      <Button size="sm" onClick={save} disabled={!dirty || saving}>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Salvar preferências
      </Button>
    </div>
  )
}
