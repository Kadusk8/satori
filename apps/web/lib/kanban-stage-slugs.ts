// Slugs usados por código do backend (webhook, process-message, tools) e pelo
// trigger sync_conversation_status_to_kanban pra mover cards automaticamente
// (ver neon/schema.sql). Excluir uma dessas quebraria essa automação, então
// ficam protegidas contra exclusão — só podem ser renomeadas/recoloridas.
//
// Arquivo sem 'use server' de propósito: precisa ser importável tanto pela
// Server Action (lib/actions/kanban-stages.ts) quanto pelo componente client
// (kanban-stages-manager.tsx) — um arquivo 'use server' só pode exportar
// funções async, então uma constante como esta não pode viver lá.
export const PROTECTED_STAGE_SLUGS = [
  'novo_lead',
  'ia_atendendo',
  'aguardando_humano',
  'em_atendimento',
  'agendado',
  'finalizado',
] as const
