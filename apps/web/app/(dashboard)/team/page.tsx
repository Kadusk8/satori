import { asc, eq } from 'drizzle-orm'
import { withClaims } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getSessionClaims, getDbClaims } from '@/lib/auth/session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bell, BellOff, ShieldAlert, Users } from 'lucide-react'
import { InviteOperatorDialog, OperatorRowActions } from './team-actions'
import { getTeamPushDevices } from '@/lib/data/team-push'

const roleLabel: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Vendedor',
}

const roleVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  operator: 'outline',
}

export default async function TeamPage() {
  const claims = await getSessionClaims()

  if (!claims.tenantId || !claims.userRole) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Não foi possível identificar sua empresa.</p>
      </div>
    )
  }

  const canManage = ['owner', 'admin'].includes(claims.userRole)

  if (!canManage) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <ShieldAlert className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Apenas o owner ou administradores da empresa podem gerenciar a equipe.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const dbClaims = (await getDbClaims())!
  const all = await withClaims(dbClaims, (tx) =>
    tx
      .select({
        id: users.id,
        full_name: users.fullName,
        email: users.email,
        role: users.role,
        is_available: users.isAvailable,
        active: users.active,
        created_at: users.createdAt,
      })
      .from(users)
      .where(eq(users.tenantId, claims.tenantId!))
      .orderBy(asc(users.createdAt))
  )
  // Só chega aqui owner/admin (checado acima) — pré-condição de getTeamPushDevices.
  const pushDevices = await getTeamPushDevices(claims.tenantId)
  const activeMembers = all.filter((m) => m.active)
  const withPush = activeMembers.filter((m) => pushDevices.has(m.id)).length

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Convide e gerencie os vendedores que atendem pelo painel
          </p>
        </div>
        <InviteOperatorDialog />
      </div>

      {/* Adoção do app: sem notificação, o vendedor não sabe que um cliente está esperando. */}
      {activeMembers.length > 0 && withPush < activeMembers.length && (
        <div className="flex items-start gap-3 rounded-lg border border-cyan-900 bg-cyan-950/30 p-4 text-sm">
          <BellOff className="h-5 w-5 shrink-0 text-cyan-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {withPush} de {activeMembers.length} {activeMembers.length === 1 ? 'pessoa recebe' : 'pessoas recebem'} aviso de cliente esperando
            </p>
            <p className="text-muted-foreground">
              Peça pra quem está sem notificação instalar o app pelo link{' '}
              <span className="font-mono text-foreground">satori.ia.br/instalar</span> e tocar em{' '}
              <strong className="text-foreground">Ativar</strong>.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Membros ({all.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {all.length === 0 && (
              <p className="text-sm text-muted-foreground p-6">Nenhum membro cadastrado.</p>
            )}
            {all.map((member) => (
              <div key={member.id} className="flex items-center gap-4 px-6 py-4">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                    {member.full_name?.slice(0, 2).toUpperCase() ?? '??'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{member.full_name}</span>
                    <Badge variant={roleVariant[member.role]} className="text-[10px] px-1.5 py-0">
                      {roleLabel[member.role] ?? member.role}
                    </Badge>
                    {!member.active && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">inativo</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
                  {member.active && (
                    <p
                      className={`mt-1 flex items-center gap-1 text-[11px] ${pushDevices.has(member.id) ? 'text-emerald-400' : 'text-muted-foreground'}`}
                    >
                      {pushDevices.has(member.id) ? (
                        <>
                          <Bell className="h-3 w-3" />
                          Notificações ligadas · {pushDevices.get(member.id)!.join(', ')}
                        </>
                      ) : (
                        <>
                          <BellOff className="h-3 w-3" />
                          Sem notificações
                        </>
                      )}
                    </p>
                  )}
                </div>
                <OperatorRowActions member={member} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
