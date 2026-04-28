// Tipos compartilhados entre as edge functions

export interface BusinessHours {
  mon: DayHours
  tue: DayHours
  wed: DayHours
  thu: DayHours
  fri: DayHours
  sat: DayHours
  sun: DayHours
}

export interface DayHours {
  enabled: boolean
  start: string
  end: string
}

export interface OnboardingPayload {
  currentStepId?: string
  step1: {
    name: string
    segment: string
    description: string
    ownerName: string
    ownerEmail: string
    ownerPassword: string
    ownerPhone: string
    address: string
    city: string
    state: string
    website: string
  }
  // Step 2 atualizado: Evolution API por tenant (sem URL global)
  step2: {
    evolutionApiUrl: string          // URL base da Evolution API do tenant
    evolutionApiKey: string          // API Key em texto puro (será criptografada no backend)
    instanceName: string             // Nome da instância escolhido pelo admin
    whatsappNumber: string
    connectionType: 'baileys' | 'cloud_api'
    cloudApiToken?: string
    cloudApiBusinessId?: string
  }
  step3: {
    agentName: string
    personality: string
    toneDescription: string
    greetingMessage: string
    outOfHoursMessage: string
    customRules: string
    llmProvider: 'openai' | 'gemini' | 'anthropic'
    llmModel: string
    llmApiKey: string
  }
  step4: {
    products: Array<{
      name: string
      description: string
      price: string
      category: string
    }>
    skipped: boolean
  }
  step5: {
    businessHours: BusinessHours
    timezone: string
    appointmentDurationMinutes: number
  }
}

export type OnboardingStepId =
  | 'tenant'
  | 'user'
  | 'kanban'
  | 'evolution'
  | 'webhook'
  | 'agent'
  | 'email'
