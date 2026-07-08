// Schema Drizzle — subconjunto de neon/schema.sql usado pelo serviço backend
// (webhook, IA, cron). Mantido separado do schema de apps/web de propósito:
// este serviço é implantado independentemente (Portainer) e não deve puxar
// as dependências do Next.js. Mesmos nomes de coluna/tabela do SQL.

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  date,
  time,
} from 'drizzle-orm/pg-core'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  businessSegment: text('business_segment'),
  businessDescription: text('business_description'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  website: text('website'),
  ownerPhone: text('owner_phone'),
  status: text('status').notNull(),
  evolutionInstanceName: text('evolution_instance_name'),
  evolutionApiUrl: text('evolution_api_url'),
  evolutionApiKey: text('evolution_api_key'),
  webhookSecret: text('webhook_secret').notNull(),
  whatsappConnected: boolean('whatsapp_connected').notNull().default(false),
  businessHours: jsonb('business_hours').notNull(),
  appointmentDurationMinutes: integer('appointment_duration_minutes').notNull(),
  timezone: text('timezone').notNull(),
  openaiApiKey: text('openai_api_key'),
  geminiApiKey: text('gemini_api_key'),
  anthropicApiKey: text('anthropic_api_key'),
  elevenlabsApiKey: text('elevenlabs_api_key'),
  lastLeadAssignedTo: uuid('last_lead_assigned_to'),
})

// Subconjunto de users usado pra elegibilidade do round-robin de leads
// (services/backend/src/core/lead-routing.ts) — não existia neste arquivo
// antes porque nada aqui precisava de dados de operador/vendedor.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull(),
  isAvailable: boolean('is_available').notNull(),
  active: boolean('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  whatsappNumber: text('whatsapp_number').notNull(),
  whatsappName: text('whatsapp_name'),
  customName: text('custom_name'),
  lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
})

export const kanbanStages = pgTable('kanban_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  slug: text('slug').notNull(),
})

export const aiAgents = pgTable('ai_agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull(),
  isDefault: boolean('is_default').notNull(),
  model: text('model').notNull(),
  temperature: numeric('temperature').notNull(),
  maxTokens: integer('max_tokens').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  outOfHoursMessage: text('out_of_hours_message'),
  canSearchProducts: boolean('can_search_products').notNull(),
  canBookAppointments: boolean('can_book_appointments').notNull(),
  canSendImages: boolean('can_send_images').notNull(),
  canEscalate: boolean('can_escalate').notNull(),
  followUpEnabled: boolean('follow_up_enabled').notNull(),
  followUpDelayHours: integer('follow_up_delay_hours').notNull(),
  followUpMaxAttempts: integer('follow_up_max_attempts').notNull(),
  followUpMessageTemplate: text('follow_up_message_template'),
  voiceId: text('voice_id'),
  audioResponseEnabled: boolean('audio_response_enabled'),
})

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  aiAgentId: uuid('ai_agent_id'),
  kanbanStageId: uuid('kanban_stage_id'),
  assignedTo: uuid('assigned_to'),
  status: text('status').notNull(),
  aiSummary: text('ai_summary'),
  priority: text('priority').notNull(),
  autonomousMode: boolean('autonomous_mode').notNull().default(false),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  senderType: text('sender_type').notNull(),
  content: text('content'),
  contentType: text('content_type').notNull(),
  mediaUrl: text('media_url'),
  whatsappMessageId: text('whatsapp_message_id'),
  aiToolCalls: jsonb('ai_tool_calls'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  shortDescription: text('short_description'),
  price: numeric('price'),
  priceDisplay: text('price_display'),
  category: text('category'),
  images: jsonb('images').notNull(),
  isAvailable: boolean('is_available').notNull(),
  isFeatured: boolean('is_featured').notNull(),
})

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  conversationId: uuid('conversation_id'),
  title: text('title'),
  notes: text('notes'),
  date: date('date').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  status: text('status').notNull(),
  reminder24hSent: boolean('reminder_24h_sent').notNull(),
  reminder1hSent: boolean('reminder_1h_sent').notNull(),
})

export const followUps = pgTable('follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  aiAgentId: uuid('ai_agent_id').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  attemptNumber: integer('attempt_number').notNull(),
  status: text('status').notNull(),
  messageContent: text('message_content'),
  context: text('context'),
})
