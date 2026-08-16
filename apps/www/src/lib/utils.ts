import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn's class merger: conditional classes in, conflict-resolved string out. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
