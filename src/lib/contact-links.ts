// The values come from scraped LinkedIn text, so links are only built for shapes the scraper produces;
// anything else is shown as plain text.
export function hrefFor({ type, value }: { type: string; value: string }): string | null {
  // strict shape so a value like "a@b.com?subject=..." can't smuggle mailto parameters
  if (type === "email" && /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(value)) return `mailto:${value}`;
  if (type === "phone" && /^\+\d{7,15}$/.test(value)) return `tel:${value}`;
  if (type === "whatsapp") {
    if (/^\+\d{7,15}$/.test(value)) return `https://wa.me/${value.slice(1)}`;
    if (/^https:\/\/(chat\.whatsapp\.com|whatsapp\.com|wa\.me)\/[\w/+-]+$/.test(value)) return value;
  }
  if (type === "telegram") {
    if (/^@\w{5,32}$/.test(value)) return `https://t.me/${value.slice(1)}`;
    if (/^https:\/\/t\.me\/[\w/+-]+$/.test(value)) return value;
  }
  return null;
}
