// Helper de permissão compartilhado — owner/admin (managers) têm o mesmo
// nível de acesso; vendedor (role 'operator' no banco) tem acesso restrito.

export const MANAGER_ROLES = ['owner', 'admin'] as const

export function isManager(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}
