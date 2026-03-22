/**
 * Patient is eligible for friends & family pricing when a discount % is set on their record.
 */
export function patientEligibleForFriendsFamily(patient) {
  if (!patient) return false;
  const raw = patient.friends_family_discount_percent;
  if (raw == null || raw === "") return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

/**
 * Snapshot friends & family discount fields for invoices (PDF / history).
 * Discount % comes from the patient; standard list price from the treatment catalogue.
 * @param {object} treatment - treatment_entries row
 * @param {Array<object>} treatmentCatalog - treatment_catalog list
 * @param {Array<object>} patients - patients list
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
  const pctRaw = patient?.friends_family_discount_percent;
  const pct =
    pctRaw != null && pctRaw !== "" && Number.isFinite(Number(pctRaw))
      ? Number(pctRaw)
      : null;
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
