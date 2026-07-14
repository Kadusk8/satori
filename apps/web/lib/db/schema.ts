// Schema Drizzle espelhando neon/schema.sql (12 tabelas do domínio Satori).
// Escrito à mão porque o Neon ainda não foi provisionado (introspecção via
// `drizzle-kit pull` fica pra quando o banco estiver de pé). Mantém os mesmos
// nomes de coluna snake_case do SQL — o Drizzle expõe camelCase no TS.
//
// A coluna products.search_vector (TSVECTOR) é populada por trigger no banco
// e nunca escrita pela aplicação, então é omitida aqui de propósito.

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
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

// Identidade global (email + hash de senha). Substitui auth.users do Supabase.
export const authUsers = pgTable('auth_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  fullName: text('full_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const superAdmins = pgTable('super_admins', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),

    businessSegment: text('business_segment'),
    businessDescription: text('business_description'),
    ownerName: text('owner_name'),
    ownerEmail: text('owner_email'),
    ownerPhone: text('owner_phone'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    website: text('website'),

    plan: text('plan').notNull().default('free'),
    status: text('status').notNull().default('onboarding'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),

    evolutionInstanceName: text('evolution_instance_name'),
    evolutionApiUrl: text('evolution_api_url'),
    evolutionApiKey: text('evolution_api_key'),
    webhookSecret: text('webhook_secret').notNull(),
    whatsappNumber: text('whatsapp_number'),
    whatsappConnectionType: text('whatsapp_connection_type').default('baileys'),
    whatsappConnected: boolean('whatsapp_connected').notNull().default(false),

    businessHours: jsonb('business_hours').notNull(),
    appointmentDurationMinutes: integer('appointment_duration_minutes').notNull().default(30),
    appointmentSlotIntervalMinutes: integer('appointment_slot_interval_minutes').notNull().default(30),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    cloudinaryCloudName: text('cloudinary_cloud_name'),
    cloudinaryUploadPreset: text('cloudinary_upload_preset'),
    logoUrl: text('logo_url'),

    maxMessagesMonth: integer('max_messages_month').notNull().default(1000),
    maxProducts: integer('max_products').notNull().default(50),
    maxOperators: integer('max_operators').notNull().default(3),
    messagesUsedMonth: integer('messages_used_month').notNull().default(0),

    // Ponteiro de rotação do round-robin de leads entre vendedores online.
    // Sem `.references()` aqui de propósito: `users` referencia `tenants`, e o
    // outro sentido criaria ciclo de inferência de tipo no Drizzle. A FK real
    // já é garantida no banco (neon/schema.sql, tenants_last_lead_assigned_to_fkey).
    lastLeadAssignedTo: uuid('last_lead_assigned_to'),

    openaiApiKey: text('openai_api_key'),
    geminiApiKey: text('gemini_api_key'),
    anthropicApiKey: text('anthropic_api_key'),
    elevenlabsApiKey: text('elevenlabs_api_key'),

    createdBy: uuid('created_by').references(() => superAdmins.id),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_tenants_status').on(t.status),
    index('idx_tenants_webhook_secret').on(t.webhookSecret),
  ]
)

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull().default('operator'),
    avatarUrl: text('avatar_url'),
    isAvailable: boolean('is_available').notNull().default(true),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_users_tenant_id').on(t.tenantId),
    uniqueIndex('idx_users_tenant_email').on(t.tenantId, t.email),
  ]
)

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    whatsappNumber: text('whatsapp_number').notNull(),
    whatsappName: text('whatsapp_name'),
    customName: text('custom_name'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    tags: text('tags').array().notNull().default([]),
    metadata: jsonb('metadata').notNull().default({}),
    firstContactAt: timestamp('first_contact_at', { withTimezone: true }).notNull().defaultNow(),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_contacts_tenant_id').on(t.tenantId),
    uniqueIndex('contacts_tenant_whatsapp_unique').on(t.tenantId, t.whatsappNumber),
  ]
)

export const kanbanStages = pgTable(
  'kanban_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    color: text('color').notNull().default('#6366f1'),
    position: integer('position').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isClosed: boolean('is_closed').notNull().default(false),
    autoAssign: boolean('auto_assign').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_kanban_stages_tenant_id').on(t.tenantId),
    uniqueIndex('kanban_stages_tenant_slug_unique').on(t.tenantId, t.slug),
  ]
)

export const productCategories = pgTable(
  'product_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_product_categories_tenant_id').on(t.tenantId),
    uniqueIndex('product_categories_tenant_name_unique').on(t.tenantId, t.name),
  ]
)

export const aiAgents = pgTable(
  'ai_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type').notNull().default('sdr'),
    isActive: boolean('is_active').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),

    model: text('model').notNull().default('claude-sonnet-4-20250514'),
    temperature: numeric('temperature').notNull().default('0.7'),
    maxTokens: integer('max_tokens').notNull().default(1024),

    systemPrompt: text('system_prompt').notNull(),
    personality: text('personality'),
    language: text('language').notNull().default('pt-BR'),

    greetingMessage: text('greeting_message'),
    farewellMessage: text('farewell_message'),
    outOfHoursMessage: text('out_of_hours_message'),

    escalationRules: jsonb('escalation_rules').notNull(),

    canSearchProducts: boolean('can_search_products').notNull().default(true),
    canBookAppointments: boolean('can_book_appointments').notNull().default(true),
    canSendImages: boolean('can_send_images').notNull().default(true),
    canEscalate: boolean('can_escalate').notNull().default(true),
    canCollectLeadInfo: boolean('can_collect_lead_info').notNull().default(true),

    sdrInstructions: jsonb('sdr_instructions').notNull(),

    followUpEnabled: boolean('follow_up_enabled').notNull().default(true),
    followUpDelayHours: integer('follow_up_delay_hours').notNull().default(24),
    followUpMaxAttempts: integer('follow_up_max_attempts').notNull().default(3),
    followUpMessageTemplate: text('follow_up_message_template'),

    voiceId: text('voice_id'),
    audioResponseEnabled: boolean('audio_response_enabled').default(false),

    // BYOK por agente — cada agente escolhe seu próprio provedor + chave.
    // Se llmApiKey for null, o backend cai pra chave do tenant e depois pro env global.
    llmProvider: text('llm_provider').notNull().default('anthropic'),
    llmApiKey: text('llm_api_key'),

    totalConversations: integer('total_conversations').notNull().default(0),
    totalEscalations: integer('total_escalations').notNull().default(0),
    avgResponseTimeSeconds: integer('avg_response_time_seconds'),
    satisfactionScore: numeric('satisfaction_score'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_agents_tenant_id').on(t.tenantId),
    uniqueIndex('ai_agents_tenant_slug_unique').on(t.tenantId, t.slug),
  ]
)

export const onboardingLogs = pgTable(
  'onboarding_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => superAdmins.id),
    step: text('step').notNull(),
    stepData: jsonb('step_data').notNull().default({}),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_onboarding_logs_tenant_id').on(t.tenantId)]
)

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    aiAgentId: uuid('ai_agent_id').references(() => aiAgents.id),
    kanbanStageId: uuid('kanban_stage_id').references(() => kanbanStages.id),
    assignedTo: uuid('assigned_to').references(() => users.id),

    status: text('status').notNull().default('ai_handling'),
    aiContext: jsonb('ai_context').notNull().default({}),
    aiSummary: text('ai_summary'),
    priority: text('priority').notNull().default('normal'),
    channel: text('channel').notNull().default('whatsapp'),
    // true quando a IA assumiu o fechamento sozinha por falta de vendedor online.
    autonomousMode: boolean('autonomous_mode').notNull().default(false),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_conversations_tenant_id').on(t.tenantId),
    index('idx_conversations_contact_id').on(t.contactId),
    index('idx_conversations_status').on(t.tenantId, t.status),
  ]
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),

    senderType: text('sender_type').notNull(),
    senderId: uuid('sender_id'),

    content: text('content'),
    contentType: text('content_type').notNull().default('text'),

    mediaUrl: text('media_url'),
    mediaMimeType: text('media_mime_type'),
    whatsappMessageId: text('whatsapp_message_id'),

    aiToolCalls: jsonb('ai_tool_calls'),
    aiConfidence: numeric('ai_confidence'),

    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_messages_conversation_id').on(t.conversationId, t.createdAt),
    index('idx_messages_tenant_id').on(t.tenantId),
  ]
)

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    shortDescription: text('short_description'),
    price: numeric('price'),
    priceDisplay: text('price_display'),
    currency: text('currency').notNull().default('BRL'),
    category: text('category'),
    subcategory: text('subcategory'),
    tags: text('tags').array().notNull().default([]),
    images: jsonb('images').notNull().default([]),
    isAvailable: boolean('is_available').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    isRunningAd: boolean('is_running_ad').notNull().default(false),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_products_tenant_id').on(t.tenantId),
    index('idx_products_category').on(t.tenantId, t.category),
  ]
)

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    assignedTo: uuid('assigned_to').references(() => users.id),

    title: text('title'),
    notes: text('notes'),

    date: date('date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),

    status: text('status').notNull().default('confirmed'),

    reminder24hSent: boolean('reminder_24h_sent').notNull().default(false),
    reminder1hSent: boolean('reminder_1h_sent').notNull().default(false),
    whatsappReminderSent: boolean('whatsapp_reminder_sent').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_appointments_tenant_id').on(t.tenantId),
    index('idx_appointments_date').on(t.tenantId, t.date),
  ]
)

export const followUps = pgTable(
  'follow_ups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    aiAgentId: uuid('ai_agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    status: text('status').notNull().default('pending'),
    messageContent: text('message_content'),
    context: text('context'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_follow_ups_contact_pending').on(t.contactId)]
)

export const aiErrorLogs = pgTable(
  'ai_error_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    aiAgentId: uuid('ai_agent_id').references(() => aiAgents.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    errorType: text('error_type').notNull().default('other'),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_ai_error_logs_tenant_created').on(t.tenantId, t.createdAt)]
)

// Tipos inferidos — usar nos Server Components/Actions ao invés das interfaces
// DB manuais espalhadas hoje pelas páginas.
export type Tenant = typeof tenants.$inferSelect
export type User = typeof users.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type KanbanStage = typeof kanbanStages.$inferSelect
export type AiAgent = typeof aiAgents.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type Product = typeof products.$inferSelect
export type Appointment = typeof appointments.$inferSelect
export type FollowUp = typeof followUps.$inferSelect
export type SuperAdmin = typeof superAdmins.$inferSelect
export type AuthUser = typeof authUsers.$inferSelect
