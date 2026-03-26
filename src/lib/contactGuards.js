/** Helpers for mixed contact fields (email + phone in one string). */

export function extractEmailAddress(contact) {
  const s = String(contact || "").trim();
  if (!s) return null;
  const m = s.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].trim().toLowerCase() : null;
}

export function extractPhoneNumber(contact) {
  const s = String(contact || "").trim();
  if (!s) return null;
  // Accepts common formats and keeps leading + when present.
  const m = s.match(/(?:\+|00)?\d[\d\s\-()]{7,}\d/);
  if (!m) return null;
  let phone = m[0].trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  return phone;
}

export function looksLikeEmail(contact) {
  return Boolean(extractEmailAddress(contact));
}

export function looksLikePhone(contact) {
  return Boolean(extractPhoneNumber(contact));
}

/**
 * Map desired channel + contact shape to send-invoice sendVia.
 * @param {'email'|'sms'|'both'} wish
 * @param {string} contact
 */
export function resolveInvoiceSendVia(wish, contact) {
  const c = String(contact || "").trim();
  const em = looksLikeEmail(c);
  const ph = looksLikePhone(c);
  const w = wish === "email" || wish === "sms" ? wish : "both";

  if (w === "both") {
    if (em && !ph) return "email";
    if (ph && !em) return "sms";
    return "both";
  }
  return w;
}
