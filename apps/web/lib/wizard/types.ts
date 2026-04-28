// Tipos compartilhados do wizard de onboarding de tenant

export type BusinessSegment =
  | 'clinica'
  | 'loja'
  | 'restaurante'
  | 'servicos'
  | 'outro'

export type WhatsAppConnectionType = 'baileys' | 'cloud_api'

export type AgentPersonality =
  | 'simpatico'
  | 'formal'
  | 'descontraido'
  | 'tecnico'

export interface DayHours {
  enabled: boolean
  start: string
  end: string
}

export interface BusinessHours {
  mon: DayHours
  tue: DayHours
  wed: DayHours
  thu: DayHours
  fri: DayHours
  sat: DayHours
  sun: DayHours
}

// Step 1
export interface Step1Data {
  name: string
  segment: BusinessSegment
  description?: string
  ownerName: string
  ownerEmail: string
  ownerPassword: string
  ownerPhone: string
  address?: string
  city?: string
  state?: string
  website?: string
}

// Step 2
export interface Step2Data {
  whatsappNumber: string
  connectionType: WhatsAppConnectionType
  evolutionApiUrl: string
  evolutionApiKey: string
  instanceName: string
  cloudApiToken?: string
  cloudApiBusinessId?: string
}

export type LLMProvider = 'openai' | 'gemini'

export const LLM_MODELS: Record<LLMProvider, Array<{ value: string; label: string }>> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (recomendado)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (mais barato)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  gemini: [
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (recomendado)' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (mais rápido)' },
  ],
}

// Step 3
export interface Step3Data {
  agentName: string
  personality: AgentPersonality
  toneDescription?: string
  greetingMessage: string
  outOfHoursMessage: string
  customRules?: string
  llmProvider: LLMProvider
  llmModel: string
  llmApiKey: string
}

// Step 4
export interface ProductDraft {
  name: string
  description: string
  price: string
  category: string
}

export interface Step4Data {
  products: ProductDraft[]
  skipped: boolean
}

// Step 5
export interface Step5Data {
  businessHours: BusinessHours
  timezone: string
  appointmentDurationMinutes: number
}

// Estado completo do wizard
export interface WizardState {
  currentStep: number
  step1: Partial<Step1Data>
  step2: Partial<Step2Data>
  step3: Partial<Step3Data>
  step4: Partial<Step4Data>
  step5: Partial<Step5Data>
  // Ações
  setStep: (step: number) => void
  saveStep1: (data: Step1Data) => void
  saveStep2: (data: Step2Data) => void
  saveStep3: (data: Step3Data) => void
  saveStep4: (data: Step4Data) => void
  saveStep5: (data: Step5Data) => void
  reset: () => void
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  mon: { enabled: true, start: '08:00', end: '18:00' },
  tue: { enabled: true, start: '08:00', end: '18:00' },
  wed: { enabled: true, start: '08:00', end: '18:00' },
  thu: { enabled: true, start: '08:00', end: '18:00' },
  fri: { enabled: true, start: '08:00', end: '18:00' },
  sat: { enabled: false, start: '08:00', end: '13:00' },
  sun: { enabled: false, start: '08:00', end: '13:00' },
}
