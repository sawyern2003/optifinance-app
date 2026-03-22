/** Round to 2 decimal places for GBP */
export function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Catalogue list price for a treatment (standard rate before F&F). */
export function listPriceFromCatalogEntry(catalogEntry) {
  if (!catalogEntry || catalogEntry.default_price == null || catalogEntry.default_price === "") {
    return null;
  }
  const n = Number(catalogEntry.default_price);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * When friends & family applies: list snapshot + charged total + amount_paid for this save.
 * @param {object} opts
 * @param {boolean} opts.ffApplied
 * @param {number|null} opts.effectivePct 0–100
 * @param {object|null} opts.catalogEntry treatment_catalog row
 * @param {string} opts.paymentStatus 'paid' | 'pending' | 'partially_paid'
 * @param {string|number} opts.currentAmountPaidInput for partially_paid clamp
 */
export function computeTreatmentFriendsFamilyPricing({
  ffApplied,
  effectivePct,
  catalogEntry,
  paymentStatus,
  currentAmountPaidInput,
}) {
  if (!ffApplied || effectivePct == null || !Number.isFinite(effectivePct)) {
    return {
      ok: true,
      listSnapshot: null,
      chargedPrice: null,
      amountPaid: null,
    };
  }
  const list = listPriceFromCatalogEntry(catalogEntry);
  if (list == null) {
    return { ok: false, code: "NO_LIST_PRICE", listSnapshot: null, chargedPrice: null, amountPaid: null };
  }
  const charged = roundMoney(list * (1 - effectivePct / 100));
  let amountPaid = charged;
  if (paymentStatus === "pending") {
    amountPaid = 0;
  } else if (paymentStatus === "partially_paid") {
    const ap = parseFloat(String(currentAmountPaidInput ?? 0), 10);
    const safe = Number.isFinite(ap) ? Math.max(0, ap) : 0;
    amountPaid = roundMoney(Math.min(safe, charged));
  }
  return {
    ok: true,
    listSnapshot: list,
    chargedPrice: charged,
    amountPaid,
  };
}
