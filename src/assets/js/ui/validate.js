// Field validation for the booking form (name, WhatsApp number, email).
import { COUNTRIES, countryByIso } from '../data/countries.js';

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII */
export const toAsciiDigits = (s) =>
  String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0);

/* ---------- name ---------- */
// Letters from any language, spaces, apostrophe, hyphen, dot. No digits, emoji or symbols.
const NAME_OK = /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;
export function cleanName(v) {
  return String(v).replace(/\s+/g, ' ').trim();
}
export function validateName(v) {
  const name = cleanName(v);
  if (!name) return { ok: false, code: 'empty' };
  if (/\d|[٠-٩۰-۹]/.test(name)) return { ok: false, code: 'digits' };
  if (!NAME_OK.test(name)) return { ok: false, code: 'chars' };
  const letters = (name.match(/\p{L}/gu) || []).length;
  if (letters < 2) return { ok: false, code: 'short' };
  if (name.length > 60) return { ok: false, code: 'long' };
  return { ok: true, value: name };
}

/* ---------- phone ---------- */
/**
 * Parses what the visitor typed in the number box together with the selected country.
 * Handles: spaces/dashes/brackets, Arabic digits, a leading trunk "0", and numbers pasted in
 * international form (+966…, 00966…) — in that case the country is detected from the code.
 * Returns { ok, code, country, e164, display }.
 */
export function validatePhone(raw, iso) {
  let s = toAsciiDigits(raw).trim();
  if (!s) return { ok: false, code: 'empty', country: iso };
  if (/[^\d+\s\-().]/.test(s)) return { ok: false, code: 'chars', country: iso };
  s = s.replace(/[\s\-().]/g, '');
  let country = countryByIso(iso);

  // International form typed or pasted → detect the country from the dialling code
  const intl = s.startsWith('+') ? s.slice(1) : s.startsWith('00') ? s.slice(2) : null;
  if (intl !== null) {
    if (!/^\d+$/.test(intl)) return { ok: false, code: 'chars', country: iso };
    const match = COUNTRIES.filter((c) => c.dial && intl.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
    if (match) { country = match; s = intl.slice(match.dial.length); }
    else {
      if (intl.length < 8 || intl.length > 15) return { ok: false, code: 'invalid', country: 'XX' };
      return { ok: true, country: 'XX', e164: `+${intl}`, display: `+${intl}` };
    }
  }

  if (country.iso === 'XX') {
    // "Other": the full international number, country code first, digits only (e.g. 8613812345678)
    s = s.replace(/^0+/, '');
    if (!/^\d{8,15}$/.test(s)) return { ok: false, code: 'needIntl', country: 'XX' };
    return { ok: true, country: 'XX', e164: `+${s}`, display: `+${s}` };
  }
  if (!/^\d+$/.test(s)) return { ok: false, code: 'chars', country: country.iso };
  // A national number may start with the trunk prefix 0 (e.g. 010… in Egypt, 05… in KSA)
  if (!country.keepZero) s = s.replace(/^0+/, '');
  // People sometimes type their own country code without "+": 2010…, 9665…
  if (s.startsWith(country.dial) && !country.re.test(s) && country.re.test(s.slice(country.dial.length))) s = s.slice(country.dial.length);
  if (!country.re.test(s)) return { ok: false, code: 'invalid', country: country.iso };
  return { ok: true, country: country.iso, e164: `+${country.dial}${s}`, display: `+${country.dial} ${s}` };
}

/* ---------- email (optional) ---------- */
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;
// Common misspellings of popular providers → suggestion
const DOMAIN_FIX = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.om': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.comm': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com',
  'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com',
};
export function validateEmail(v) {
  const email = String(v).trim();
  if (!email) return { ok: true, value: null }; // optional
  if (email.length > 254 || !EMAIL_RE.test(email) || email.includes('..')) return { ok: false, code: 'invalid' };
  const [user, domain] = [email.slice(0, email.lastIndexOf('@')), email.slice(email.lastIndexOf('@') + 1).toLowerCase()];
  if (DOMAIN_FIX[domain]) return { ok: false, code: 'typo', suggestion: `${user}@${DOMAIN_FIX[domain]}` };
  return { ok: true, value: `${user}@${domain}` };
}
