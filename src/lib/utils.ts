import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui's class helper: joins class names and lets the later Tailwind class win.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
