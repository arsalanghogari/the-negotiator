import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Agents sometimes emit stage directions like "[Confidently]" despite prompt rules —
// never display, speak, or store them.
export const stripDirections = (t: string) => t.replace(/\[[^\]]{0,60}\]\s*/g, '').trim();
