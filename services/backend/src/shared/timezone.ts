// Converte um horário "de parede" (a data/hora que o dono do agendamento vê,
// ex: 18:06 em America/Sao_Paulo) pro instante UTC real correspondente.
//
// Sem isso, `new Date("2026-07-04T18:06:00")` é interpretado no timezone do
// processo Node (normalmente UTC dentro de um container Docker) — não no
// timezone do tenant. Um tenant em America/Sao_Paulo (UTC-3) teria todo
// cálculo de "faltam X horas" desviado em 3h, o suficiente pra nunca cair
// dentro da janela de tolerância dos lembretes de agendamento.
export function zonedWallTimeToDate(dateStr: string, timeStr: string, timeZone: string): Date {
  const reference = new Date(`${dateStr}T${timeStr}:00Z`)
  // Formata o mesmo instante em duas timezones e reparseia ambas as strings —
  // `new Date(string-sem-offset)` interpreta como horário local do processo,
  // mas como as DUAS reparses usam essa mesma (qualquer que seja) suposição,
  // o erro se cancela na subtração, sobrando só a diferença real de offset.
  const asUtc = new Date(reference.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const asZone = new Date(reference.toLocaleString('en-US', { timeZone })).getTime()
  return new Date(reference.getTime() + (asUtc - asZone))
}
