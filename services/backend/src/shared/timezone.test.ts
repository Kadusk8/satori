import { describe, expect, it } from 'vitest'
import { zonedWallTimeToDate } from './timezone.js'

describe('zonedWallTimeToDate', () => {
  it('converte horário de parede em America/Sao_Paulo (UTC-3) pro instante UTC correto', () => {
    const result = zonedWallTimeToDate('2026-07-04', '18:06', 'America/Sao_Paulo')
    expect(result.toISOString()).toBe('2026-07-04T21:06:00.000Z')
  })

  it('não desvia quando o timezone já é UTC', () => {
    const result = zonedWallTimeToDate('2026-07-04', '18:06', 'UTC')
    expect(result.toISOString()).toBe('2026-07-04T18:06:00.000Z')
  })

  it('não sofre com DST — Brasil não observa horário de verão desde 2019', () => {
    const summer = zonedWallTimeToDate('2026-01-15', '12:00', 'America/Sao_Paulo')
    const winter = zonedWallTimeToDate('2026-07-15', '12:00', 'America/Sao_Paulo')
    expect(summer.getUTCHours()).toBe(winter.getUTCHours())
  })
})
