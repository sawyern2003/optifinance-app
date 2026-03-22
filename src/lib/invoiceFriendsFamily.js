/**
 * Patient has a default friends & family rate on file (Catalogue → Patients).
 */
export function patientEligibleForFriendsFamily(patient) {
  if (!patient) return false;
  const raw = patient.friends_family_discount_percent;
  if (raw == null || raw === "") return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

/** Parse discount % from form input; null if empty/invalid */
export function parseFriendsFamilyPercentInput(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = parseFloat(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Discount % for this visit: typed amount wins, else patient's catalogue default.
 */
export function effectiveFriendsFamilyPercent(formPercentStr, patient) {
  const fromForm = parseFriendsFamilyPercentInput(formPercentStr);
  if (fromForm !== null) return fromForm;
  if (patientEligibleForFriendsFamily(patient)) {
    return Number(patient.friends_family_discount_percent);
  }
  return null;
}

/**
 * Snapshot friends & family discount fields for invoices (PDF / history).
 * Uses visit-level % on treatment entry first, then patient default.
 */
export function friendsFamilyInvoiceFields(
  treatment,
  treatmentCatalog = [],
  patients = [],
) {
  const applied = !!treatment?.friends_family_discount_applied;
  if (!applied) {
    return {
      friends_family_discount_applied: false,
      friends_family_discount_percent: null,
      friends_family_standard_price: null,
    };
  }
  const patient =
    patients.find((p) => p.id === treatment.patient_id) || null;

  let pct = null;
  const tRaw = treatment?.friends_family_discount_percent;
  if (tRaw != null && tRaw !== "") {
    const n = Number(tRaw);
    if (Number.isFinite(n)) pct = n;
  }
  if (pct == null && patient) {
    const pRaw = patient.friends_family_discount_percent;
    if (pRaw != null && pRaw !== "") {
      const n = Number(pRaw);
      if (Number.isFinite(n)) pct = n;
    }
  }

  const cat =
    treatmentCatalog.find((t) => t.id === treatment.treatment_id) || null;
  const stdRaw = cat?.default_price;
  const std =
    stdRaw != null && stdRaw !== "" && Number.isFinite(Number(stdRaw))
      ? Number(stdRaw)
      : null;
  return {
    friends_family_discount_applied: true,
    friends_family_discount_percent: pct,
    friends_family_standard_price: std,
  };
}
