/** Patient contact on an invoice is either email or phone (single field). */

export function looksLikeEmail(contact) {
  return Boolean(contact?.trim()) && String(contact).includes("@");
}

/** SMS / Twilio: must not be an email */
export function looksLikePhone(contact) {
  return Boolean(contact?.trim()) && !String(contact).includes("@");
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
