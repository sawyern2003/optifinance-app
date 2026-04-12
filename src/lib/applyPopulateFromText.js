/**
 * Persist clinic-llm populate_from_text (voice-diary-shaped) payload to Supabase.
 * Skips invoices and payment_updates (review those manually in Records).
 */

function normalizePersonName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolvePatientByName(name, patientByNorm, patientsList) {
  const nk = normalizePersonName(name);
  if (!nk) return null;
  if (patientByNorm.has(nk)) return patientByNorm.get(nk);
  const exact = patientsList.find(
    (p) => normalizePersonName(p.name) === nk,
  );
  if (exact) return exact;
  return (
    patientsList.find(
      (p) =>
        normalizePersonName(p.name).includes(nk) ||
        nk.includes(normalizePersonName(p.name)),
    ) || null
  );
}

export async function applyPopulateFromTextResult({
  api,
  data,
  treatmentCatalog,
  patients,
  practitioners,
}) {
  const stats = {
    patientsCreated: 0,
    patientsSkipped: 0,
    catalogCreated: 0,
    treatmentsCreated: 0,
    expensesCreated: 0,
    clinicalNotesCreated: 0,
    clinicalNotesSkipped: 0,
  };

  const leadPractitioner = practitioners.find((p) => p.is_lead);

  let catList = [...(treatmentCatalog || [])];
  const findCatalog = (name) =>
    catList.find(
      (t) =>
        t.treatment_name.toLowerCase().trim() ===
        String(name).toLowerCase().trim(),
    );

  const patientByNorm = new Map();
  const patientsList = [...(patients || [])];
  for (const p of patientsList) {
    patientByNorm.set(normalizePersonName(p.name), p);
  }

  const existingPatientKeys = new Set(
    patientsList.map((p) => normalizePersonName(p.name)),
  );

  for (const row of data.patients || []) {
    const key = normalizePersonName(row.name);
    if (!key) continue;
    if (existingPatientKeys.has(key)) {
      stats.patientsSkipped++;
      continue;
    }
    const payload = { name: String(row.name).trim() };
    if (row.contact) payload.contact = row.contact;
    if (row.phone) payload.phone = row.phone;
    if (row.email) payload.email = row.email;
    if (row.address) payload.address = row.address;
    if (row.notes) payload.notes = row.notes;
    if (
      row.friends_family_discount_percent != null &&
      !Number.isNaN(Number(row.friends_family_discount_percent))
    ) {
      payload.friends_family_discount_percent = Number(
        row.friends_family_discount_percent,
      );
    }
    const created = await api.entities.Patient.create(payload);
    patientsList.push(created);
    patientByNorm.set(key, created);
    existingPatientKeys.add(key);
    stats.patientsCreated++;
  }

  const seenCat = new Map();
  for (const c of data.catalog_treatments || []) {
    const n = String(c.treatment_name || "").trim();
    if (!n) continue;
    const nk = n.toLowerCase();
    if (seenCat.has(nk)) continue;
    seenCat.set(nk, true);
    if (findCatalog(n)) continue;
    const createdCat = await api.entities.TreatmentCatalog.create({
      treatment_name: n,
      category: c.category || undefined,
      default_price:
        c.default_price != null && !Number.isNaN(Number(c.default_price))
          ? Number(c.default_price)
          : 0,
      typical_product_cost:
        c.typical_product_cost != null &&
        !Number.isNaN(Number(c.typical_product_cost))
          ? Number(c.typical_product_cost)
          : 0,
      default_duration_minutes:
        c.default_duration_minutes != null &&
        !Number.isNaN(Number(c.default_duration_minutes))
          ? Number(c.default_duration_minutes)
          : undefined,
    });
    catList.push(createdCat);
    stats.catalogCreated++;
  }

  const treatmentRows = data.treatments || [];
  const missingCatalogNames = new Set();
  for (const row of treatmentRows) {
    const n = String(row.treatment_name || "").trim();
    if (n && !findCatalog(n)) missingCatalogNames.add(n);
  }
  for (const n of missingCatalogNames) {
    const sample = treatmentRows.find(
      (r) => String(r.treatment_name || "").trim() === n,
    );
    const guessPrice = Number(sample?.price_paid) || 0;
    const guessDur =
      sample?.duration_minutes != null && sample.duration_minutes !== ""
        ? Number(sample.duration_minutes)
        : undefined;
    const createdCat = await api.entities.TreatmentCatalog.create({
      treatment_name: n,
      default_price: guessPrice,
      typical_product_cost: 0,
      default_duration_minutes: guessDur,
    });
    catList.push(createdCat);
    stats.catalogCreated++;
  }

  for (const row of treatmentRows) {
    const treatmentName = String(row.treatment_name || "").trim();
    if (!treatmentName) continue;

    const cat = findCatalog(treatmentName);
    if (!cat) {
      throw new Error(
        `No catalogue match for "${treatmentName}". Add it in Catalogue and try again.`,
      );
    }

    let patientId;
    let patientName;
    const pname = row.patient_name ? String(row.patient_name).trim() : "";
    if (pname) {
      const nk = normalizePersonName(pname);
      let patient = patientByNorm.get(nk);
      if (!patient) {
        patient = await api.entities.Patient.create({ name: pname });
        patientByNorm.set(nk, patient);
        patientsList.push(patient);
        stats.patientsCreated++;
      }
      patientId = patient.id;
      patientName = patient.name;
    }

    const prFromRow = row.practitioner_name
      ? practitioners.find(
          (p) =>
            p.name.toLowerCase().trim() ===
            String(row.practitioner_name).toLowerCase().trim(),
        )
      : null;
    const pr = prFromRow || leadPractitioner;

    const productCost = Number(cat.typical_product_cost) || 0;
    const pricePaid = Number(row.price_paid) || 0;
    const status = row.payment_status || "paid";
    const amountPaid =
      status === "partially_paid"
        ? Number(row.amount_paid) || 0
        : status === "paid"
          ? pricePaid
          : 0;
    const profit = amountPaid - productCost;

    await api.entities.TreatmentEntry.create({
      date: row.date,
      patient_id: patientId,
      patient_name: patientName,
      treatment_id: cat.id,
      treatment_name: cat.treatment_name,
      duration_minutes:
        row.duration_minutes != null && row.duration_minutes !== ""
          ? Number(row.duration_minutes)
          : cat.duration_minutes ?? cat.default_duration_minutes ?? undefined,
      price_paid: pricePaid,
      payment_status: status,
      amount_paid: amountPaid,
      product_cost: productCost,
      profit,
      practitioner_id: pr?.id,
      practitioner_name: pr?.name || row.practitioner_name || undefined,
      notes: row.notes || undefined,
      friends_family_discount_applied: false,
      friends_family_discount_percent: null,
      friends_family_list_price: null,
    });
    stats.treatmentsCreated++;
  }

  for (const e of data.expenses || []) {
    const amt = Number(e.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    await api.entities.Expense.create({
      date: e.date,
      category: e.category || "Other",
      amount: amt,
      notes: e.notes || undefined,
      is_recurring: false,
    });
    stats.expensesCreated++;
  }

  for (const note of data.clinical_notes || []) {
    const pname = String(note.patient_name || "").trim();
    if (!pname) {
      stats.clinicalNotesSkipped++;
      continue;
    }
    const patient = resolvePatientByName(pname, patientByNorm, patientsList);
    if (!patient) {
      stats.clinicalNotesSkipped++;
      continue;
    }
    await api.entities.ClinicalNote.create({
      patient_id: patient.id,
      visit_date: note.visit_date,
      source: "voice_diary",
      raw_narrative: note.raw_narrative || note.clinical_summary || "",
      structured: {
        clinical_summary:
          note.clinical_summary || note.raw_narrative || "",
        procedure_summary: note.procedure_summary,
        areas: note.areas,
        units: note.units,
        complications: note.complications,
        patient_feedback: note.patient_feedback,
        next_steps: note.next_steps,
        treatment_name_hint: note.treatment_name,
      },
    });
    stats.clinicalNotesCreated++;
  }

  return stats;
}
