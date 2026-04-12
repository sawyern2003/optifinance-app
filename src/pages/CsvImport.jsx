import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/api/api";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, Users, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";

const CSV_SOFT_MAX = 150_000;

function normalizePersonName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      resolve(text);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsText(file, "UTF-8");
  });
}

export default function CsvImport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [section, setSection] = useState("patients");

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.entities.Patient.list("name"),
    initialData: [],
  });

  const { data: treatmentCatalog = [] } = useQuery({
    queryKey: ["treatmentCatalog"],
    queryFn: () => api.entities.TreatmentCatalog.list("treatment_name"),
    initialData: [],
  });

  const { data: practitioners = [] } = useQuery({
    queryKey: ["practitioners"],
    queryFn: () => api.entities.Practitioner.list("name"),
    initialData: [],
  });

  const [patientCsvText, setPatientCsvText] = useState("");
  const [parsedPatients, setParsedPatients] = useState([]);
  const [parsingPatients, setParsingPatients] = useState(false);
  const [importingPatients, setImportingPatients] = useState(false);

  const [treatmentCsvText, setTreatmentCsvText] = useState("");
  const [parsedTreatments, setParsedTreatments] = useState([]);
  const [parsedCatalogTreatments, setParsedCatalogTreatments] = useState([]);
  const [parsingTreatments, setParsingTreatments] = useState(false);
  const [importingTreatments, setImportingTreatments] = useState(false);

  const leadPractitioner = practitioners.find((p) => p.is_lead);

  const handlePatientFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readCsvFile(file);
      if (text.length > CSV_SOFT_MAX) {
        toast({
          title: "File is very large",
          description: `Only the first ~${CSV_SOFT_MAX.toLocaleString()} characters are used. Consider splitting the file.`,
          className: "bg-amber-50 border-amber-200",
        });
      }
      setPatientCsvText(text.slice(0, CSV_SOFT_MAX));
      setParsedPatients([]);
    } catch (err) {
      toast({
        title: "Could not read file",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const handleTreatmentFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readCsvFile(file);
      if (text.length > CSV_SOFT_MAX) {
        toast({
          title: "File is very large",
          description: `Only the first ~${CSV_SOFT_MAX.toLocaleString()} characters are used. Consider splitting the file.`,
          className: "bg-amber-50 border-amber-200",
        });
      }
      setTreatmentCsvText(text.slice(0, CSV_SOFT_MAX));
      setParsedTreatments([]);
      setParsedCatalogTreatments([]);
    } catch (err) {
      toast({
        title: "Could not read file",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const parsePatients = async () => {
    if (!patientCsvText.trim()) {
      toast({
        title: "Choose a CSV first",
        description: "Upload a patient export, then parse.",
        variant: "destructive",
      });
      return;
    }
    setParsingPatients(true);
    try {
      const { patients: rows } = await api.integrations.Core.ParseCsvPatients({
        csvText: patientCsvText,
      });
      const list = rows || [];
      setParsedPatients(list);
      if (list.length === 0) {
        toast({
          title: "No patients parsed",
          description: "Check the file has readable headers and data rows.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Preview ready",
          description: `${list.length} patient row(s) — review the table, then import.`,
          className: "bg-green-50 border-green-200",
        });
      }
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setParsingPatients(false);
    }
  };

  const parseTreatments = async () => {
    if (!treatmentCsvText.trim()) {
      toast({
        title: "Choose a CSV first",
        description: "Upload a treatment history export, then parse.",
        variant: "destructive",
      });
      return;
    }
    setParsingTreatments(true);
    try {
      const { treatments, catalog_treatments } =
        await api.integrations.Core.ParseCsvTreatmentEntries({
          csvText: treatmentCsvText,
          todayDate: format(new Date(), "yyyy-MM-dd"),
          treatmentsCatalog: treatmentCatalog.map((t) => ({
            treatment_name: t.treatment_name,
            default_price: t.default_price ?? null,
            duration_minutes:
              t.duration_minutes ?? t.default_duration_minutes ?? null,
          })),
          practitionerNames: practitioners.map((p) => p.name),
          patientNames: patients.map((p) => p.name),
        });
      const tList = treatments || [];
      const cList = catalog_treatments || [];
      setParsedTreatments(tList);
      setParsedCatalogTreatments(cList);
      if (tList.length === 0) {
        toast({
          title: "No treatments parsed",
          description: "Check the file has date, patient, and treatment columns.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Preview ready",
          description: `${tList.length} treatment row(s)${
            cList.length ? `, ${cList.length} new catalogue suggestion(s)` : ""
          }.`,
          className: "bg-green-50 border-green-200",
        });
      }
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setParsingTreatments(false);
    }
  };

  const importPatients = async () => {
    if (parsedPatients.length === 0) return;
    setImportingPatients(true);
    const existing = new Set(patients.map((p) => normalizePersonName(p.name)));
    let created = 0;
    let skipped = 0;
    try {
      for (const row of parsedPatients) {
        const key = normalizePersonName(row.name);
        if (!key) continue;
        if (existing.has(key)) {
          skipped++;
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
        await api.entities.Patient.create(payload);
        existing.add(key);
        created++;
      }
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast({
        title: "Patients imported",
        description: `Created ${created}. Skipped ${skipped} duplicate name(s).`,
        className: "bg-green-50 border-green-200",
      });
      setParsedPatients([]);
      setPatientCsvText("");
    } catch (err) {
      toast({
        title: "Import stopped",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setImportingPatients(false);
    }
  };

  const importTreatments = async () => {
    if (parsedTreatments.length === 0) return;
    setImportingTreatments(true);

    let catList = [...treatmentCatalog];
    const findCatalog = (name) =>
      catList.find(
        (t) =>
          t.treatment_name.toLowerCase().trim() ===
          String(name).toLowerCase().trim(),
      );

    const patientByNorm = new Map();
    for (const p of patients) {
      patientByNorm.set(normalizePersonName(p.name), p);
    }

    let entriesCreated = 0;
    let catalogCreated = 0;
    let patientsCreated = 0;

    try {
      const seenCat = new Map();
      for (const c of parsedCatalogTreatments) {
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
        catalogCreated++;
      }

      const missingCatalogNames = new Set();
      for (const row of parsedTreatments) {
        const n = String(row.treatment_name || "").trim();
        if (n && !findCatalog(n)) missingCatalogNames.add(n);
      }
      for (const n of missingCatalogNames) {
        const sample = parsedTreatments.find(
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
        catalogCreated++;
      }

      for (const row of parsedTreatments) {
        const treatmentName = String(row.treatment_name || "").trim();
        if (!treatmentName) continue;

        const cat = findCatalog(treatmentName);
        if (!cat) {
          throw new Error(
            `No catalogue match for "${treatmentName}" — add it in Catalogue or re-parse after fixing the CSV.`,
          );
        }

        let patientId;
        let patientName;
        const pname = row.patient_name
          ? String(row.patient_name).trim()
          : "";
        if (pname) {
          const nk = normalizePersonName(pname);
          let patient = patientByNorm.get(nk);
          if (!patient) {
            patient = await api.entities.Patient.create({ name: pname });
            patientByNorm.set(nk, patient);
            patientsCreated++;
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
        const practitionerId = pr?.id;
        const practitionerName = pr?.name || row.practitioner_name || undefined;

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
          practitioner_id: practitionerId,
          practitioner_name: practitionerName,
          notes: row.notes || undefined,
          friends_family_discount_applied: false,
          friends_family_discount_percent: null,
          friends_family_list_price: null,
        });
        entriesCreated++;
      }

      await queryClient.invalidateQueries({ queryKey: ["treatments"] });
      await queryClient.invalidateQueries({ queryKey: ["treatmentCatalog"] });
      await queryClient.invalidateQueries({ queryKey: ["patients"] });

      toast({
        title: "Treatments imported",
        description: `${entriesCreated} entr(y/ies). ${catalogCreated} new catalogue type(s). ${patientsCreated} new patient(s).`,
        className: "bg-green-50 border-green-200",
      });
      setParsedTreatments([]);
      setParsedCatalogTreatments([]);
      setTreatmentCsvText("");
    } catch (err) {
      toast({
        title: "Import stopped",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setImportingTreatments(false);
    }
  };

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">
            CSV import
          </h1>
          <p className="text-sm text-gray-500 font-light max-w-2xl">
            Upload exports from another system. We use AI to infer columns, then
            you confirm from the preview. Patient import skips names that already
            exist. Treatment import adds missing catalogue types from the preview,
            creates patients when needed, and logs each row as a treatment entry.
            Files are limited to roughly {CSV_SOFT_MAX.toLocaleString()} characters.
          </p>
          <p className="text-sm mt-2">
            <Link
              className="text-[#1a2845] underline underline-offset-2"
              to={createPageUrl("ClinicDataChat")}
            >
              AI data chat
            </Link>
            {" · "}
            <Link
              className="text-[#1a2845] underline underline-offset-2"
              to={createPageUrl("Dashboard")}
            >
              Open dashboard
            </Link>
            {" · "}
            <Link
              className="text-[#1a2845] underline underline-offset-2"
              to={createPageUrl("Records")}
            >
              Records
            </Link>
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={section === "patients" ? "default" : "outline"}
            className={
              section === "patients"
                ? "bg-[#1a2845] hover:bg-[#1a2845]/90"
                : ""
            }
            onClick={() => setSection("patients")}
          >
            <Users className="w-4 h-4 mr-2" />
            Patients
          </Button>
          <Button
            type="button"
            variant={section === "treatments" ? "default" : "outline"}
            className={
              section === "treatments"
                ? "bg-[#1a2845] hover:bg-[#1a2845]/90"
                : ""
            }
            onClick={() => setSection("treatments")}
          >
            <Stethoscope className="w-4 h-4 mr-2" />
            Treatment history
          </Button>
        </div>

        {section === "patients" && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-light text-[#1a2845]">
                Patient CSV
              </CardTitle>
              <CardDescription>
                Typical columns: name, phone, email, address, notes. Headers can
                vary.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handlePatientFile}
                  />
                  <span className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-9 px-4 cursor-pointer hover:bg-muted/50">
                    <Upload className="w-4 h-4 mr-2" />
                    Choose file
                  </span>
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={parsePatients}
                  disabled={parsingPatients || !patientCsvText.trim()}
                >
                  {parsingPatients ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Parsing…
                    </>
                  ) : (
                    "Parse with AI"
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={importPatients}
                  disabled={
                    importingPatients ||
                    parsedPatients.length === 0 ||
                    parsingPatients
                  }
                >
                  {importingPatients ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    "Import patients"
                  )}
                </Button>
              </div>
              {patientCsvText ? (
                <p className="text-xs text-gray-500">
                  Loaded {patientCsvText.length.toLocaleString()} characters.
                </p>
              ) : null}

              {parsedPatients.length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>F&amp;F %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedPatients.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {p.name}
                          </TableCell>
                          <TableCell>{p.phone || "—"}</TableCell>
                          <TableCell>{p.email || "—"}</TableCell>
                          <TableCell>
                            {p.friends_family_discount_percent ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {section === "treatments" && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-light text-[#1a2845]">
                Treatment history CSV
              </CardTitle>
              <CardDescription>
                Rows should represent completed or booked treatments (date,
                patient, service, amount). New service names become catalogue
                entries when you import.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleTreatmentFile}
                  />
                  <span className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-9 px-4 cursor-pointer hover:bg-muted/50">
                    <Upload className="w-4 h-4 mr-2" />
                    Choose file
                  </span>
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={parseTreatments}
                  disabled={parsingTreatments || !treatmentCsvText.trim()}
                >
                  {parsingTreatments ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Parsing…
                    </>
                  ) : (
                    "Parse with AI"
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={importTreatments}
                  disabled={
                    importingTreatments ||
                    parsedTreatments.length === 0 ||
                    parsingTreatments
                  }
                >
                  {importingTreatments ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    "Import treatments"
                  )}
                </Button>
              </div>
              {treatmentCsvText ? (
                <p className="text-xs text-gray-500">
                  Loaded {treatmentCsvText.length.toLocaleString()} characters.
                </p>
              ) : null}

              {parsedCatalogTreatments.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[#1a2845] mb-2">
                    New catalogue types (will be created on import)
                  </h3>
                  <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Default price</TableHead>
                          <TableHead>Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedCatalogTreatments.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell>{c.treatment_name}</TableCell>
                            <TableCell>{c.default_price ?? "—"}</TableCell>
                            <TableCell>
                              {c.default_duration_minutes ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {parsedTreatments.length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Treatment</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedTreatments.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell>{t.date}</TableCell>
                          <TableCell>{t.patient_name || "—"}</TableCell>
                          <TableCell>{t.treatment_name}</TableCell>
                          <TableCell>{t.price_paid}</TableCell>
                          <TableCell>{t.payment_status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
