import { describe, expect, it } from 'vitest'
import { formatBusinessHours } from './tools.js'

describe('formatBusinessHours', () => {
  it('formata dias habilitados em ordem, ignorando dias sem horário', () => {
    const result = formatBusinessHours({
      mon: { enabled: true, start: '08:00', end: '18:00' },
      tue: { enabled: true, start: '08:00', end: '18:00' },
      sat: { enabled: false, start: '', end: '' },
      sun: undefined,
    })
    expect(result).toBe('Seg: 08:00–18:00 | Ter: 08:00–18:00')
  })

  it('retorna "Não configurado" quando nenhum dia está habilitado', () => {
    expect(formatBusinessHours({ sun: undefined })).toBe('Não configurado')
  })
})
