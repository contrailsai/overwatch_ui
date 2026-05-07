import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Strip legacy/noise `safe` from threat_types everywhere we show them (UI only). */
export function omitSafeThreatTypes(threatTypes) {
  if (!Array.isArray(threatTypes)) return []
  return threatTypes.filter((t) => String(t).toLowerCase() !== 'safe')
}
