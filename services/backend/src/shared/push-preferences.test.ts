import { describe, expect, it } from 'vitest'
import { filterByPreferences, isWithinQuietHours, localMinutes, type UserPushPrefs } from './push-preferences.js'

const at = (h: number, m = 0) => h * 60 + m

describe('isWithinQuietHours', () => {
  it('sem horário configurado: nunca silencioso', () => {
    expect(isWithinQuietHours(at(3), null, null)).toBe(false)
  })

  it('intervalo no mesmo dia (12:00–14:00): início incluído, fim excluído', () => {
    expect(isWithinQuietHours(at(11, 59), '12:00:00', '14:00:00')).toBe(false)
    expect(isWithinQuietHours(at(12), '12:00:00', '14:00:00')).toBe(true)
    expect(isWithinQuietHours(at(13, 59), '12:00:00', '14:00:00')).toBe(true)
    expect(isWithinQuietHours(at(14), '12:00:00', '14:00:00')).toBe(false)
  })

  it('atravessando a meia-noite (22:00–07:00)', () => {
    expect(isWithinQuietHours(at(21, 59), '22:00', '07:00')).toBe(false)
    expect(isWithinQuietHours(at(22), '22:00', '07:00')).toBe(true)
    expect(isWithinQuietHours(at(0), '22:00', '07:00')).toBe(true)
    expect(isWithinQuietHours(at(6, 59), '22:00', '07:00')).toBe(true)
    expect(isWithinQuietHours(at(7), '22:00', '07:00')).toBe(false)
  })

  it('valores inválidos ou iguais não silenciam', () => {
    expect(isWithinQuietHours(at(3), '25:00', '07:00')).toBe(false)
    expect(isWithinQuietHours(at(3), '08:00', '08:00')).toBe(false)
  })
})

describe('localMinutes', () => {
  // 2026-11-25T01:30Z = 22:30 em São Paulo (UTC-3, sem horário de verão)
  const now = new Date('2026-11-25T01:30:00Z')

  it('converte pro fuso do tenant', () => {
    expect(localMinutes(now, 'America/Sao_Paulo')).toBe(at(22, 30))
    expect(localMinutes(now, 'UTC')).toBe(at(1, 30))
  })

  it('fuso inválido cai no padrão do Brasil em vez de quebrar o envio', () => {
    expect(localMinutes(now, 'Fuso/Inexistente')).toBe(at(22, 30))
  })
})

describe('filterByPreferences', () => {
  const base: UserPushPrefs = { userId: 'x', onlyAssigned: false, quietStart: null, quietEnd: null }
  const now = new Date('2026-11-25T15:00:00Z') // 12:00 em São Paulo
  const ctx = { assignedUserId: 'vendedor', now, timezone: 'America/Sao_Paulo' }

  it('sem preferências: todo mundo recebe', () => {
    const prefs = [{ ...base, userId: 'a' }, { ...base, userId: 'b' }]
    expect(filterByPreferences(prefs, ctx)).toEqual(['a', 'b'])
  })

  it('"só atribuídas a mim": recebe só se for o dono da conversa', () => {
    const prefs = [
      { ...base, userId: 'vendedor', onlyAssigned: true },
      { ...base, userId: 'outro', onlyAssigned: true },
      { ...base, userId: 'dono' },
    ]
    expect(filterByPreferences(prefs, ctx)).toEqual(['vendedor', 'dono'])
  })

  it('"só atribuídas a mim" em conversa sem dono: não recebe', () => {
    const prefs = [{ ...base, userId: 'a', onlyAssigned: true }]
    expect(filterByPreferences(prefs, { ...ctx, assignedUserId: null })).toEqual([])
  })

  it('horário silencioso no fuso do tenant', () => {
    const prefs = [
      { ...base, userId: 'almoco', quietStart: '11:30:00', quietEnd: '13:00:00' },
      { ...base, userId: 'noite', quietStart: '22:00:00', quietEnd: '07:00:00' },
    ]
    expect(filterByPreferences(prefs, ctx)).toEqual(['noite'])
  })
})
