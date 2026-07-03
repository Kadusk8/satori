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
  // Step 2: Evolution Go externa, já criada e conectada pelo próprio tenant.
  // Só validamos a conexão e registramos nosso webhook — não criamos instância.
  step2: {
    evolutionApiUrl: string          // URL base do servidor Evolution Go do tenant
    evolutionApiKey: string          // Token da instância (não é a GLOBAL_API_KEY do servidor). Será criptografado no backend.
    instanceName: string             // Nome/ID da instância já existente no Evolution Go do tenant
    whatsappNumber: string
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
