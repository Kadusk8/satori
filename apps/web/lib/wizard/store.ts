import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  WizardState,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  Step5Data,
} from './types'

export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      currentStep: 1,
      step1: {},
      step2: {},
      step3: {},
      step4: { products: [], skipped: false },
      step5: {},

      setStep: (step) => set({ currentStep: step }),

      saveStep1: (data: Step1Data) =>
        set({ step1: data, currentStep: 2 }),

      saveStep2: (data: Step2Data) =>
        set({ step2: data, currentStep: 3 }),

      saveStep3: (data: Step3Data) =>
        set({ step3: data, currentStep: 4 }),

      saveStep4: (data: Step4Data) =>
        set({ step4: data, currentStep: 5 }),

      saveStep5: (data: Step5Data) =>
        set({ step5: data, currentStep: 6 }),

      reset: () =>
        set({
          currentStep: 1,
          step1: {},
          step2: {},
          step3: {},
          step4: { products: [], skipped: false },
          step5: {},
        }),
    }),
    {
      name: 'wizard-onboarding',
    }
  )
)
