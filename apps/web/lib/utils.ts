import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function formatBRL(value: number) {
  return brl.format(value)
}
