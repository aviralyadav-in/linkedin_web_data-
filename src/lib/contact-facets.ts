// What a contact's value says about it (an email's domain, a number's country calling code): the dashboard
// filters on these and shows them in its Details column.

// Free mail providers: an address there is a person's own, not a company's. Their regional variants
// (yahoo.co.in, hotmail.co.uk, outlook.in, ...) are matched by FREE_MAIL_FAMILY.
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "msn.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "tutanota.com",
  "tuta.io",
  "fastmail.com",
  "hey.com",
  "mail.com",
  "inbox.com",
  "zoho.com",
  "zohomail.com",
  "zohomail.in",
  "rediffmail.com",
  "rediff.com",
  "mail.ru",
  "web.de",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
]);
const FREE_MAIL_FAMILY = /^(yahoo|ymail|rocketmail|hotmail|outlook|live|aol|gmx|yandex)\.[a-z]{2,3}(\.[a-z]{2})?$/;

const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

// E.164 country calling codes. The ITU hands them out so that no code is the start of another, so the first
// 1-, 2- or 3-digit prefix of a number that is in this set is its calling code.
const CALLING_CODES = new Set([
  "1",
  "7",
  ..."20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98".split(
    " ",
  ),
  ..."211 212 213 216 218 290 291 297 298 299 385 386 387 389 420 421 423 670 800 808 850 852 853 855 856 870 878 880 881 882 883 886 888 979 998".split(
    " ",
  ),
  ...span(220, 258),
  ...span(260, 269),
  ...span(350, 359),
  ...span(370, 383),
  ...span(500, 509),
  ...span(590, 599),
  ...span(672, 683),
  ...span(685, 692),
  ...span(960, 968),
  ...span(970, 977),
  ...span(992, 996),
]);

// names for the codes that come up most; any other code is shown as just "+code"
const COUNTRY: Record<string, string> = {
  "1": "US/Canada",
  "7": "Russia/Kazakhstan",
  "20": "Egypt",
  "27": "South Africa",
  "30": "Greece",
  "31": "Netherlands",
  "32": "Belgium",
  "33": "France",
  "34": "Spain",
  "36": "Hungary",
  "39": "Italy",
  "40": "Romania",
  "41": "Switzerland",
  "43": "Austria",
  "44": "United Kingdom",
  "45": "Denmark",
  "46": "Sweden",
  "47": "Norway",
  "48": "Poland",
  "49": "Germany",
  "51": "Peru",
  "52": "Mexico",
  "54": "Argentina",
  "55": "Brazil",
  "56": "Chile",
  "57": "Colombia",
  "60": "Malaysia",
  "61": "Australia",
  "62": "Indonesia",
  "63": "Philippines",
  "64": "New Zealand",
  "65": "Singapore",
  "66": "Thailand",
  "81": "Japan",
  "82": "South Korea",
  "84": "Vietnam",
  "86": "China",
  "90": "Türkiye",
  "91": "India",
  "92": "Pakistan",
  "93": "Afghanistan",
  "94": "Sri Lanka",
  "95": "Myanmar",
  "98": "Iran",
  "212": "Morocco",
  "233": "Ghana",
  "234": "Nigeria",
  "254": "Kenya",
  "255": "Tanzania",
  "256": "Uganda",
  "351": "Portugal",
  "353": "Ireland",
  "358": "Finland",
  "380": "Ukraine",
  "852": "Hong Kong",
  "880": "Bangladesh",
  "886": "Taiwan",
  "960": "Maldives",
  "961": "Lebanon",
  "962": "Jordan",
  "965": "Kuwait",
  "966": "Saudi Arabia",
  "968": "Oman",
  "971": "UAE",
  "972": "Israel",
  "973": "Bahrain",
  "974": "Qatar",
  "975": "Bhutan",
  "977": "Nepal",
};

export type Facets = {
  domain: string | null; // emails: the part after the @, lowercased
  personal: boolean; // the domain is a free mail provider
  code: string | null; // phone and WhatsApp numbers: the calling code, "?" when it isn't recognized; null otherwise
};

function callingCode(value: string): string | null {
  const digits = /^\+(\d{7,15})$/.exec(value)?.[1];
  if (!digits) return null;
  for (let n = 1; n <= 3; n++) {
    if (CALLING_CODES.has(digits.slice(0, n))) return digits.slice(0, n);
  }
  return null;
}

export function facetsOf({ type, value }: { type: string; value: string }): Facets {
  const domain = type === "email" ? (/@([^@\s]+)$/.exec(value)?.[1].toLowerCase() ?? null) : null;
  // a WhatsApp contact is a number, or a group / channel link
  const isNumber = type === "phone" || (type === "whatsapp" && !/^https?:/i.test(value));
  return {
    domain,
    personal: domain !== null && (FREE_MAIL.has(domain) || FREE_MAIL_FAMILY.test(domain)),
    code: isNumber ? (callingCode(value) ?? "?") : null,
  };
}

export const countryName = (code: string): string | null => COUNTRY[code] ?? null;

// "+91 India", "+356", or for "?" the given fallback
export function codeLabel(code: string, unknown: string) {
  if (code === "?") return unknown;
  const name = countryName(code);
  return name ? `+${code} ${name}` : `+${code}`;
}

// one line describing the contact, for the Details column
export function detailsFor({ type, value }: { type: string; value: string }, facets: Facets): string {
  if (type === "email") {
    return facets.domain ? `${facets.domain} · ${facets.personal ? "Personal" : "Business"}` : "Unrecognized address";
  }
  if (facets.code !== null) {
    if (facets.code === "?") return "Unrecognized number";
    const name = countryName(facets.code);
    return name ? `+${facets.code} · ${name}` : `+${facets.code}`;
  }
  if (type === "whatsapp") {
    if (/chat\.whatsapp\.com\//i.test(value)) return "Group invite";
    if (/whatsapp\.com\/channel\//i.test(value)) return "Channel";
    if (/wa\.me\/message\//i.test(value)) return "Message link";
    return "WhatsApp link";
  }
  if (type === "telegram") {
    if (value.startsWith("@")) return "Username";
    if (/t\.me\/(\+|joinchat\/)/i.test(value)) return "Invite link";
    return "Link";
  }
  if (type === "linkedin") {
    if (/\/in\//.test(value)) return "Profile";
    if (/\/company\//.test(value)) return "Company page";
    if (/\/school\//.test(value)) return "School page";
    if (/\/showcase\//.test(value)) return "Showcase page";
    return "LinkedIn link";
  }
  return "";
}
