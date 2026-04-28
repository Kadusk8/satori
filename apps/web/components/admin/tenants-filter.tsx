'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

export function TenantsFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const status: string = searchParams.get('status') ?? ''
  const plan: string = searchParams.get('plan') ?? ''
  const q: string = searchParams.get('q') ?? ''

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, router, pathname]
  )

  const clearFilters = () => {
    router.push(pathname)
  }

  const hasFilters = status || plan || q

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Busca textual */}
      <div className="relative flex-1 min-w-48 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar por nome, responsável..."
          defaultValue={q}
          className="pl-9"
          onChange={(e) => {
            const value = e.target.value
            // Debounce simples via setTimeout
            const timeout = setTimeout(() => updateParams('q', value), 400)
            return () => clearTimeout(timeout)
          }}
        />
      </div>

      {/* Filtro por status */}
      <Select
        value={status}
        onValueChange={(value) => updateParams('status', value === 'all' || value == null ? '' : value)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="active">Ativo</SelectItem>
          <SelectItem value="onboarding">Onboarding</SelectItem>
          <SelectItem value="suspended">Suspenso</SelectItem>
          <SelectItem value="cancelled">Cancelado</SelectItem>
        </SelectContent>
      </Select>

      {/* Filtro por plano */}
      <Select
        value={plan}
        onValueChange={(value) => updateParams('plan', value === 'all' || value == null ? '' : value)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Plano" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os planos</SelectItem>
          <SelectItem value="free">Free</SelectItem>
          <SelectItem value="starter">Starter</SelectItem>
          <SelectItem value="pro">Pro</SelectItem>
          <SelectItem value="enterprise">Enterprise</SelectItem>
        </SelectContent>
      </Select>

      {/* Limpar filtros */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  )
}
