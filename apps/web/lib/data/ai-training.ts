'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm'
import { withAdmin } from '@/lib/db'
import {
  aiAgents, aiTrainingFeedback, aiTrainingSessions, contacts, conversations, messages, superAdmins, tenants,
} from '@/lib/db/schema'
import { getDbClaims } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/resend'

// No Coolify o valor às vezes é salvo com aspas literais ('https://...'): limpa antes de usar.
const cleanEnv = (v: string | undefined) => v?.trim().replace(/^['"]+|['"]+$/g, '').trim() || undefined
const BACKEND_URL = cleanEnv(process.env.BACKEND_URL)?.replace(/\/$/, '')
const BACKEND_TOKEN = cleanEnv(process.env.BACKEND_TOKEN)
const STALE_SESSION_MS = 2 * 60 * 60 * 1000

export interface TrainingMessage {
  id: string
  sender: 'customer' | 'ai'
  content: string | null
  contentType: string
  mediaUrl: string | null
  createdAt: string
}

export interface TrainingFeedbackItem {
  id: string
  customerMessage: string | null
  aiResponse: string | null
  desiredResponse: string
  createdAt: string
}

// Só owner/admin do tenant treina a IA. Os dados vêm sempre dos claims, nunca do input.
async function trainerOrThrow() {
  const claims = await getDbClaims()
  if (!claims?.tenant_id || claims.is_super_admin === true) throw new Error('Acesso restrito ao proprietário da empresa.')
  if (claims.user_role !== 'owner' && claims.user_role !== 'admin') throw new Error('Apenas o proprietário pode testar a IA.')
  return { tenantId: claims.tenant_id, userId: claims.sub as string }
}

async function superAdminOrThrow() {
  const claims = await getDbClaims()
  if (claims?.is_super_admin !== true) throw new Error('Acesso restrito.')
}

// O backend baixa essa URL pra transcrever o áudio, então só aceitamos arquivo do NOSSO
// Cloudinary (host exato + pasta do nosso cloud + sem credenciais/porta). Qualquer outra
// URL permitiria fazer o servidor buscar endereços internos (SSRF).
function validateCloudinaryAudioUrl(raw: string): string {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Áudio inválido.') }
  const ok =
    !!cloud &&
    url.protocol === 'https:' &&
    url.hostname === 'res.cloudinary.com' &&
    url.port === '' && url.username === '' && url.password === '' &&
    url.pathname.startsWith(`/${cloud}/video/upload/`)
  if (!ok) throw new Error('Áudio inválido.')
  return url.toString()
}

export type ActionError = { error: string }

// Em produção o Next esconde a mensagem de qualquer erro lançado numa server action. Pra o dono
// ver o motivo real (ex: "A IA não conseguiu responder agora"), as ações do teste devolvem o erro
// como dado em vez de lançar.
async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | ActionError> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[ai-training] ${label}:`, err instanceof Error ? err.stack ?? err.message : err)
    return { error: err instanceof Error ? err.message : 'Erro inesperado.' }
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Avisa os super admins quando o cliente encerra um teste com pedidos de mudança ou observações.
// Nunca derruba o encerramento: falha de e-mail só vai pro log.
async function notifyAdminsOfTraining(tenantId: string, sessionId: string, notes: string): Promise<void> {
  try {
    const { tenantName, admins, items } = await withAdmin(async (tx) => {
      const [t] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
      const a = await tx.select({ email: superAdmins.email }).from(superAdmins).where(eq(superAdmins.active, true))
      const f = await tx.select({
        customerMessage: aiTrainingFeedback.customerMessage,
        aiResponse: aiTrainingFeedback.aiResponse,
        desiredResponse: aiTrainingFeedback.desiredResponse,
      }).from(aiTrainingFeedback).where(eq(aiTrainingFeedback.sessionId, sessionId)).orderBy(asc(aiTrainingFeedback.createdAt))
      return { tenantName: t?.name?.trim() ?? 'Empresa', admins: a, items: f }
    })
    if (admins.length === 0) return
    const base = (process.env.ADMIN_APP_URL ?? 'https://admin.satori.ia.br').replace(/\/$/, '')
    const list = items.map((i) => `
      <li style="margin-bottom:12px">
        ${i.customerMessage ? `<div><b>Cliente:</b> ${esc(i.customerMessage)}</div>` : ''}
        <div><b>IA respondeu:</b> ${esc(i.aiResponse ?? '—')}</div>
        <div><b>Queria:</b> ${esc(i.desiredResponse)}</div>
      </li>`).join('')
    const html = `
      <p><strong>${esc(tenantName)}</strong> terminou um teste da IA.</p>
      ${items.length > 0 ? `<p>${items.length} mudança(s) pedida(s):</p><ul>${list}</ul>` : '<p>Nenhuma mudança pontual, só observações.</p>'}
      ${notes ? `<p><b>Observações gerais:</b><br>${esc(notes).replace(/\n/g, '<br>')}</p>` : ''}
      <p><a href="${base}/admin/training">Abrir o painel de treinamento</a></p>`
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `Treinamento da IA — ${tenantName}: ${items.length} mudança(s)`,
        html,
      })
    }
  } catch (err) {
    console.error('[ai-training] Falha ao avisar admins por e-mail:', err instanceof Error ? err.message : err)
  }
}

async function ownSession(tenantId: string, sessionId: string) {
  const [session] = await withAdmin((tx) =>
    tx.select().from(aiTrainingSessions)
      .where(and(eq(aiTrainingSessions.id, sessionId), eq(aiTrainingSessions.tenantId, tenantId)))
      .limit(1)
  )
  if (!session) throw new Error('Sessão de teste não encontrada.')
  return session
}

function toMessage(m: typeof messages.$inferSelect): TrainingMessage {
  return {
    id: m.id,
    sender: m.senderType === 'customer' ? 'customer' : 'ai',
    content: m.content,
    contentType: m.contentType ?? 'text',
    mediaUrl: m.mediaUrl,
    createdAt: m.createdAt.toISOString(),
  }
}

async function listMessages(conversationId: string): Promise<TrainingMessage[]> {
  const rows = await withAdmin((tx) =>
    tx.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt))
  )
  return rows.map(toMessage)
}

// Apaga a conversa de teste (o contato leva junto por cascata). A cópia fica em transcript.
async function dropSandbox(tx: Parameters<Parameters<typeof withAdmin>[0]>[0], conversationId: string | null) {
  if (!conversationId) return
  const [conv] = await tx.select({ contactId: conversations.contactId }).from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.isSandbox, true))).limit(1)
  if (!conv) return
  // messages.contact_id não tem cascata: apaga as mensagens da conversa de teste antes do contato.
  await tx.delete(messages).where(eq(messages.conversationId, conversationId))
  await tx.delete(contacts).where(and(eq(contacts.id, conv.contactId), eq(contacts.isSandbox, true)))
}

export async function startTrainingSession(): Promise<{ sessionId: string; messages: TrainingMessage[] } | ActionError> {
  return guard('start', () => startTrainingSessionImpl())
}

async function startTrainingSessionImpl(): Promise<{ sessionId: string; messages: TrainingMessage[] }> {
  const { tenantId, userId } = await trainerOrThrow()

  const sessionId = await withAdmin(async (tx) => {
    // Sessões antigas esquecidas abertas: limpa a conversa de teste e marca como abandonada.
    const stale = await tx.select({ id: aiTrainingSessions.id, conversationId: aiTrainingSessions.conversationId })
      .from(aiTrainingSessions)
      .where(and(eq(aiTrainingSessions.tenantId, tenantId), eq(aiTrainingSessions.status, 'active'), lt(aiTrainingSessions.startedAt, new Date(Date.now() - STALE_SESSION_MS))))
    for (const s of stale) await dropSandbox(tx, s.conversationId)
    if (stale.length > 0) {
      await tx.update(aiTrainingSessions).set({ status: 'abandoned', finishedAt: new Date() })
        .where(inArray(aiTrainingSessions.id, stale.map((s) => s.id)))
    }

    const [agent] = await tx.select({ id: aiAgents.id }).from(aiAgents)
      .where(eq(aiAgents.tenantId, tenantId)).orderBy(desc(aiAgents.isDefault)).limit(1)
    if (!agent) throw new Error('Esta empresa ainda não tem um agente de IA configurado.')

    const [contact] = await tx.insert(contacts).values({
      tenantId,
      whatsappNumber: `teste-${crypto.randomUUID().slice(0, 12)}`,
      whatsappName: 'Você (teste)',
      isSandbox: true,
    }).returning({ id: contacts.id })
    const [conv] = await tx.insert(conversations).values({
      tenantId, contactId: contact.id, aiAgentId: agent.id, isSandbox: true, status: 'ai_handling',
    }).returning({ id: conversations.id })
    const [session] = await tx.insert(aiTrainingSessions).values({
      tenantId, userId, conversationId: conv.id,
    }).returning({ id: aiTrainingSessions.id })
    return session.id
  })

  return { sessionId, messages: [] }
}

export async function sendTrainingMessage(input: {
  sessionId: string
  text?: string
  audioUrl?: string
}): Promise<{ messages: TrainingMessage[] } | ActionError> {
  return guard('send', () => sendTrainingMessageImpl(input))
}

async function sendTrainingMessageImpl(input: {
  sessionId: string
  text?: string
  audioUrl?: string
}): Promise<{ messages: TrainingMessage[] }> {
  const { tenantId } = await trainerOrThrow()
  const session = await ownSession(tenantId, input.sessionId)
  if (session.status !== 'active' || !session.conversationId) throw new Error('Esta sessão de teste já foi encerrada.')

  const text = input.text?.trim() ?? ''
  const audioUrl = input.audioUrl ? validateCloudinaryAudioUrl(input.audioUrl) : null
  if (!text && !audioUrl) throw new Error('Digite uma mensagem ou grave um áudio.')
  if (text.length > 4000) throw new Error('Mensagem muito longa.')
  if (!BACKEND_URL) throw new Error('Serviço da IA indisponível no momento (BACKEND_URL não configurada).')

  const conversationId = session.conversationId
  await withAdmin(async (tx) => {
    const [conv] = await tx.select({ contactId: conversations.contactId }).from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId), eq(conversations.isSandbox, true))).limit(1)
    if (!conv) throw new Error('Conversa de teste não encontrada.')
    await tx.insert(messages).values({
      tenantId,
      conversationId,
      contactId: conv.contactId,
      senderType: 'customer',
      content: audioUrl ? null : text,
      contentType: audioUrl ? 'audio' : 'text',
      mediaUrl: audioUrl,
    })
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId))
  })

  const res = await fetch(`${BACKEND_URL}/sandbox/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}) },
    body: JSON.stringify({ tenantId, conversationId }),
    signal: AbortSignal.timeout(110_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`A IA não conseguiu responder agora (${res.status}). ${detail.slice(0, 120)}`)
  }
  return { messages: await listMessages(conversationId) }
}

export async function saveTrainingFeedback(input: {
  sessionId: string
  aiMessageId: string
  desiredResponse: string
}): Promise<TrainingFeedbackItem | ActionError> {
  return guard('feedback', () => saveTrainingFeedbackImpl(input))
}

async function saveTrainingFeedbackImpl(input: {
  sessionId: string
  aiMessageId: string
  desiredResponse: string
}): Promise<TrainingFeedbackItem> {
  const { tenantId } = await trainerOrThrow()
  const session = await ownSession(tenantId, input.sessionId)
  if (!session.conversationId) throw new Error('Sessão sem conversa.')
  const desired = input.desiredResponse.trim()
  if (!desired) throw new Error('Escreva como você queria que a IA respondesse.')
  if (desired.length > 3000) throw new Error('Texto muito longo.')

  const all = await listMessages(session.conversationId)
  const idx = all.findIndex((m) => m.id === input.aiMessageId && m.sender === 'ai')
  if (idx === -1) throw new Error('Mensagem da IA não encontrada.')
  const customerBefore = [...all.slice(0, idx)].reverse().find((m) => m.sender === 'customer')

  const [row] = await withAdmin((tx) =>
    tx.insert(aiTrainingFeedback).values({
      sessionId: session.id,
      tenantId,
      customerMessage: customerBefore ? (customerBefore.content ?? '🎤 (áudio)') : null,
      aiResponse: all[idx].content ?? (all[idx].mediaUrl ? '(imagem/áudio)' : null),
      desiredResponse: desired,
    }).returning()
  )
  return { id: row.id, customerMessage: row.customerMessage, aiResponse: row.aiResponse, desiredResponse: row.desiredResponse, createdAt: row.createdAt.toISOString() }
}

export async function finishTrainingSession(input: { sessionId: string; generalNotes: string }): Promise<{ feedbackCount: number } | ActionError> {
  return guard('finish', () => finishTrainingSessionImpl(input))
}

async function finishTrainingSessionImpl(input: { sessionId: string; generalNotes: string }): Promise<{ feedbackCount: number }> {
  const { tenantId } = await trainerOrThrow()
  const session = await ownSession(tenantId, input.sessionId)
  if (session.status !== 'active') return { feedbackCount: 0 }

  const transcript = session.conversationId ? await listMessages(session.conversationId) : []
  const notes = input.generalNotes.trim().slice(0, 5000)

  const feedbackCount = await withAdmin(async (tx) => {
    await tx.update(aiTrainingSessions).set({
      status: 'finished', finishedAt: new Date(), generalNotes: notes || null, transcript,
    }).where(eq(aiTrainingSessions.id, session.id))
    await dropSandbox(tx, session.conversationId)
    const fb = await tx.select({ id: aiTrainingFeedback.id }).from(aiTrainingFeedback).where(eq(aiTrainingFeedback.sessionId, session.id))
    return fb.length
  })
  revalidatePath('/admin/training')
  if (feedbackCount > 0 || notes) await notifyAdminsOfTraining(tenantId, session.id, notes)
  return { feedbackCount }
}

// Abandono explícito (fechou a janela sem encerrar): só limpa a conversa de teste.
export async function discardTrainingSession(sessionId: string): Promise<void> {
  const { tenantId } = await trainerOrThrow()
  const session = await ownSession(tenantId, sessionId)
  if (session.status !== 'active') return
  const transcript = session.conversationId ? await listMessages(session.conversationId) : []
  await withAdmin(async (tx) => {
    await tx.update(aiTrainingSessions).set({ status: 'abandoned', finishedAt: new Date(), transcript }).where(eq(aiTrainingSessions.id, session.id))
    await dropSandbox(tx, session.conversationId)
  })
}

// ── Painel do super admin ────────────────────────────────────────────────────

export interface AdminFeedbackRow {
  id: string
  tenantName: string
  customerMessage: string | null
  aiResponse: string | null
  desiredResponse: string
  status: 'new' | 'applied' | 'dismissed'
  ruleText: string | null
  ruleActive: boolean
  createdAt: string
  sessionId: string
}

export interface AdminSessionRow {
  id: string
  tenantName: string
  status: string
  generalNotes: string | null
  startedAt: string
  messageCount: number
  feedbackCount: number
}

export async function listTrainingForAdmin(): Promise<{ feedback: AdminFeedbackRow[]; sessions: AdminSessionRow[] }> {
  await superAdminOrThrow()
  return withAdmin(async (tx) => {
    const fb = await tx.select({
      id: aiTrainingFeedback.id,
      tenantName: tenants.name,
      customerMessage: aiTrainingFeedback.customerMessage,
      aiResponse: aiTrainingFeedback.aiResponse,
      desiredResponse: aiTrainingFeedback.desiredResponse,
      status: aiTrainingFeedback.status,
      ruleText: aiTrainingFeedback.ruleText,
      ruleActive: aiTrainingFeedback.ruleActive,
      createdAt: aiTrainingFeedback.createdAt,
      sessionId: aiTrainingFeedback.sessionId,
    }).from(aiTrainingFeedback)
      .innerJoin(tenants, eq(tenants.id, aiTrainingFeedback.tenantId))
      .orderBy(desc(aiTrainingFeedback.createdAt)).limit(300)

    const sessions = await tx.select({
      id: aiTrainingSessions.id,
      tenantName: tenants.name,
      status: aiTrainingSessions.status,
      generalNotes: aiTrainingSessions.generalNotes,
      startedAt: aiTrainingSessions.startedAt,
      transcript: aiTrainingSessions.transcript,
    }).from(aiTrainingSessions)
      .innerJoin(tenants, eq(tenants.id, aiTrainingSessions.tenantId))
      .orderBy(desc(aiTrainingSessions.startedAt)).limit(100)

    const countBySession = new Map<string, number>()
    for (const f of fb) countBySession.set(f.sessionId, (countBySession.get(f.sessionId) ?? 0) + 1)

    return {
      feedback: fb.map((f) => ({ ...f, status: f.status as AdminFeedbackRow['status'], createdAt: f.createdAt.toISOString() })),
      sessions: sessions.map((s) => ({
        id: s.id,
        tenantName: s.tenantName,
        status: s.status,
        generalNotes: s.generalNotes,
        startedAt: s.startedAt.toISOString(),
        messageCount: Array.isArray(s.transcript) ? s.transcript.length : 0,
        feedbackCount: countBySession.get(s.id) ?? 0,
      })),
    }
  })
}

export async function getTrainingTranscript(sessionId: string): Promise<TrainingMessage[]> {
  await superAdminOrThrow()
  const [s] = await withAdmin((tx) =>
    tx.select({ transcript: aiTrainingSessions.transcript }).from(aiTrainingSessions).where(eq(aiTrainingSessions.id, sessionId)).limit(1)
  )
  return (Array.isArray(s?.transcript) ? s.transcript : []) as TrainingMessage[]
}

export async function setTrainingFeedbackStatus(id: string, status: 'new' | 'applied' | 'dismissed'): Promise<void> {
  await superAdminOrThrow()
  await withAdmin((tx) => tx.update(aiTrainingFeedback).set({ status }).where(eq(aiTrainingFeedback.id, id)))
  revalidatePath('/admin/training')
}

// Ativa (texto) ou desativa (null) a regra que entra no prompt da IA do tenant do pedido.
export async function setTrainingFeedbackRule(id: string, ruleText: string | null): Promise<void> {
  await superAdminOrThrow()
  const text = ruleText?.replace(/\s+/g, ' ').trim() ?? ''
  if (ruleText !== null && !text) throw new Error('Escreva a regra antes de ativar.')
  if (text.length > 500) throw new Error('A regra pode ter no máximo 500 caracteres.')
  await withAdmin((tx) =>
    tx.update(aiTrainingFeedback)
      .set(ruleText === null ? { ruleActive: false } : { ruleText: text, ruleActive: true, status: 'applied' })
      .where(eq(aiTrainingFeedback.id, id))
  )
  revalidatePath('/admin/training')
}
