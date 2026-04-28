import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Settings,
  Shield,
  Bell,
  Globe,
  Database,
} from 'lucide-react'
import { SettingsForm } from './settings-form'

export default function SettingsPage() {
  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configurações globais da plataforma SATORI
        </p>
      </div>

      {/* Plataforma */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Plataforma
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsForm />
        </CardContent>
      </Card>

      {/* Segurança */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Segurança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1">
            <label className="font-medium">Domínio permitido para convites</label>
            <Input placeholder="Ex: minhaempresa.com.br" disabled className="max-w-sm" />
            <p className="text-xs text-muted-foreground">Deixe em branco para permitir qualquer domínio</p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Autenticação em 2 fatores</p>
              <p className="text-xs text-muted-foreground mt-0.5">Exigir 2FA para super admins</p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Em breve</span>
          </div>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { label: 'Nova empresa cadastrada', desc: 'Receber email quando uma empresa concluir o onboarding' },
            { label: 'Empresa suspensa', desc: 'Receber email quando uma empresa for suspensa automaticamente' },
            { label: 'Uso próximo do limite', desc: 'Alertar quando uma empresa atingir 90% do limite de mensagens' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Em breve</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Banco de dados */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between items-center py-1 border-b">
            <span className="text-muted-foreground">Versão da plataforma</span>
            <span className="font-medium font-mono text-xs">SATORI v1.0.0</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b">
            <span className="text-muted-foreground">Ambiente</span>
            <span className="font-medium font-mono text-xs">production</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted-foreground">Região do banco</span>
            <span className="font-medium font-mono text-xs">sa-east-1</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
