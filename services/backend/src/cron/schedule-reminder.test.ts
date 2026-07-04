import { describe, expect, it } from 'vitest'
import { formatDateBR, formatTime, toHM } from './schedule-reminder.js'

describe('toHM', () => {
  it('trunca segundos/microssegundos que o pg sempre inclui em TIME', () => {
    expect(toHM('18:06:00')).toBe('18:06')
    expect(toHM('18:04:48.534856')).toBe('18:04')
  })

  it('mantém HH:MM já normalizado', () => {
    expect(toHM('09:30')).toBe('09:30')
  })
})

describe('formatTime', () => {
  it('omite minutos quando são :00', () => {
    expect(formatTime('18:00:00')).toBe('18h')
  })

  it('mantém minutos quando != :00', () => {
    expect(formatTime('18:06:00')).toBe('18h06')
  })
})

describe('formatDateBR', () => {
  it('converte YYYY-MM-DD pra DD/MM/YYYY', () => {
    expect(formatDateBR('2026-07-04')).toBe('04/07/2026')
  })
})
