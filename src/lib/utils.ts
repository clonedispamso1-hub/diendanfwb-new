import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Append `#t=0.001` to a video URL so browsers render the first frame
 * as a poster instead of a black square when the video is paused/preloaded.
 * Safe to call on undefined/empty values.
 */
export function videoThumbSrc(url?: string | null): string {
  if (!url) return "";
  if (url.includes("#")) return url; // respect existing fragment
  return `${url}#t=0.001`;
}
