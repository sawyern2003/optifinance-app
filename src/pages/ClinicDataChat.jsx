import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/api/api";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Loader2,
  Send,
  Sparkles,
  Database,
  Upload,
  Users,
  Stethoscope,
  MessageSquare,
} from "lucide-react";
import { Link } from "react-router-dom";
import { applyPopulateFromTextResult } from "@/lib/applyPopulateFromText";

const CHAT_SOFT_MAX = 75_000;
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
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read file"));
    reader.readAsText(file, "UTF-8");
  });
}

function buildTranscriptFromMessages(messages) {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n---\n\n")
    .slice(0, CHAT_SOFT_MAX);
}

function summarizeExtract(data) {
  const parts = [];
  const n = (arr) => (Array.isArray(arr) ? arr.length : 0);
  if (n(data.patients)) parts.push(`${n(data.patients)} patient(s)`);
  if (n(data.catalog_treatments))
    parts.push(`${n(data.catalog_treatments)} catalogue type(s)`);
  if (n(data.treatments)) parts.push(`${n(data.treatments)} treatment visit(s)`);
  if (n(data.expenses)) parts.push(`${n(data.expenses)} expense(s)`);
  if (n(data.clinical_notes))
    parts.push(`${n(data.clinical_notes)} clinical note(s)`);
  if (n(data.payment_updates))
    parts.push(`${n(data.payment_updates)} payment update(s) (not auto-applied)`);
  if (n(data.invoices))
    parts.push(`${n(data.invoices)} invoice row(s) — not auto-sent`);
  if (parts.length === 0) {
    return "Nothing structured was found. Try adding names, dates, treatments, and prices.";
  }
  return `Found: ${parts.join(", ")}. Review the preview below, then apply to save.`;
}

export default function ClinicDataChat() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bottomRef = useRef(null);

  const [mainMode, setMainMode] = useState("chat");
  const [csvSection, setCsvSection] = useState("patients");

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Describe your patients, treatment menu, and visit history — or use the **CSV files** tab to upload exports. For chat, use **Extract** after your messages, then **Apply to clinic** when the preview looks right.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);

  const [patientCsvText, setPatientCsvText] = useState("");
  const [parsedPatients, setParsedPatients] = useState([]);
  const [parsingPatients, setParsingPatients] = useState(false);
  const [importingPatients, setImportingPatients] = useState(false);

  const [treatmentCsvText, setTreatmentCsvText] = useState("");
  const [parsedTreatments, setParsedTreatments] = useState([]);
  const [parsedCatalogTreatments, setParsedCatalogTreatments] = useState([]);
  const [parsingTreatments, setParsingTreatments] = useState(false);
  const [importingTreatments, setImportingTreatments] = useState(false);

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

  const { data: treatments = [] } = useQuery({
    queryKey: ["treatments"],
    queryFn: () => api.entities.TreatmentEntry.list("-date"),
    initialData: [],
  });

  const leadPractitioner = practitioners.find((p) => p.is_lead);

  useEffect(() => {
    if (mainMode === "chat") {
      bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [messages, extracted, mainMode]);

  const recentPending = treatments
    .filter(
      (t) =>
        t.payment_status === "pending" || t.payment_status === "partially_paid",
    )
    .slice(0, 25)
    .map((t) => ({
      patient_name: t.patient_name || "",
      treatment_name: t.treatment_name || "",
      price_paid: Number(t.price_paid) || 0,
      date: t.date,
    }));

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
      const { treatments: tRows, catalog_treatments } =
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
      const tList = tRows || [];
      const cList = catalog_treatments || [];
      setParsedTreatments(tList);
      setParsedCatalogTreatments(cList);
      if (tList.length === 0) {
        toast({
          title: "No treatments parsed",
          description:
            "Check the file has date, patient, and treatment columns.",
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
              : cat.duration_minutes ??
                cat.default_duration_minutes ??
                undefined,
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

  const handleSendUser = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", content: text }]);
  };

  const handleExtract = async () => {
    const userAdds = draft.trim()
      ? [{ role: "user", content: draft.trim() }]
      : [];
    const nextMessages = [...messages, ...userAdds];
    const transcript = buildTranscriptFromMessages(nextMessages);
    if (!transcript.trim()) {
      toast({
        title: "Add a message first",
        description: "Type or paste your clinic data, then extract.",
        variant: "destructive",
      });
      return;
    }

    if (userAdds.length) {
      setMessages(nextMessages);
      setDraft("");
    }

    setExtracting(true);
    try {
      const data = await api.integrations.Core.ParsePopulateFromText({
        message: transcript,
        todayDate: format(new Date(), "yyyy-MM-dd"),
        treatmentsCatalog: treatmentCatalog.map((t) => ({
          treatment_name: t.treatment_name,
          default_price: t.default_price ?? null,
          duration_minutes:
            t.duration_minutes ?? t.default_duration_minutes ?? null,
        })),
        practitionerNames: practitioners.map((p) => p.name),
        patientNames: patients.map((p) => p.name),
        recentPending,
      });
      setExtracted(data);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: summarizeExtract(data) },
      ]);
    } catch (err) {
      toast({
        title: "Extract failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleApply = async () => {
    if (!extracted) return;
    setApplying(true);
    try {
      const stats = await applyPopulateFromTextResult({
        api,
        data: extracted,
        treatmentCatalog,
        patients,
        practitioners,
      });
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      await queryClient.invalidateQueries({ queryKey: ["treatmentCatalog"] });
      await queryClient.invalidateQueries({ queryKey: ["treatments"] });
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["clinicalNotes"] });
      await queryClient.invalidateQueries({ queryKey: ["clinical_notes"] });

      toast({
        title: "Clinic data updated",
        description: `Patients +${stats.patientsCreated} (skipped ${stats.patientsSkipped}), catalogue +${stats.catalogCreated}, visits +${stats.treatmentsCreated}, expenses +${stats.expensesCreated}, notes +${stats.clinicalNotesCreated}${stats.clinicalNotesSkipped ? `, notes skipped ${stats.clinicalNotesSkipped}` : ""}.`,
        className: "bg-green-50 border-green-200",
      });
      setExtracted(null);
    } catch (err) {
      toast({
        title: "Apply stopped",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  const d = extracted || {};

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div
        className={`mx-auto space-y-6 ${mainMode === "csv" ? "max-w-5xl" : "max-w-4xl"}`}
      >
        <div>
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">
            Clinic data import
          </h1>
          <p className="text-sm text-gray-500 font-light max-w-2xl">
            Free-text chat and CSV uploads both use AI to infer columns and
            structure. Apply when you are happy with the preview. Invoices and
            payment updates from chat are not applied automatically.
          </p>
          <p className="text-sm mt-2">
            <Link
              className="text-[#1a2845] underline underline-offset-2"
              to={createPageUrl("Dashboard")}
            >
              Dashboard
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mainMode === "chat" ? "default" : "outline"}
            className={
              mainMode === "chat" ? "bg-[#1a2845] hover:bg-[#1a2845]/90" : ""
            }
            onClick={() => setMainMode("chat")}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Free text &amp; chat
          </Button>
          <Button
            type="button"
            variant={mainMode === "csv" ? "default" : "outline"}
            className={
              mainMode === "csv" ? "bg-[#1a2845] hover:bg-[#1a2845]/90" : ""
            }
            onClick={() => setMainMode("csv")}
          >
            <Upload className="w-4 h-4 mr-2" />
            CSV files
          </Button>
        </div>

        {mainMode === "chat" && (
          <>
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-light text-[#1a2845]">
                  Conversation
                </CardTitle>
                <CardDescription>
                  All of your messages are sent together on each extract (up to{" "}
                  {CHAT_SOFT_MAX.toLocaleString()} characters).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-gray-200 bg-white max-h-[360px] overflow-y-auto p-4 space-y-3">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-[#1a2845] text-white"
                            : "bg-gray-100 text-gray-800 border border-gray-200"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                <Textarea
                  placeholder="e.g. Patients: Anna 07123… Treatments we sell: Lip filler £350… On 2024-03-01 Anna had lip filler £350 paid…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  className="resize-y min-h-[120px]"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSendUser}
                    disabled={!draft.trim()}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Add to chat
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#1a2845] hover:bg-[#1a2845]/90"
                    onClick={handleExtract}
                    disabled={extracting}
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Extract data
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {extracted && (
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-light text-[#1a2845]">
                    Preview
                  </CardTitle>
                  <CardDescription>
                    Apply writes to your live database (same rules as CSV import
                    for duplicates).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={handleApply}
                      disabled={applying}
                      className="bg-emerald-700 hover:bg-emerald-700/90"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Applying…
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4 mr-2" />
                          Apply to clinic
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setExtracted(null)}
                      disabled={applying}
                    >
                      Discard preview
                    </Button>
                  </div>

                  {(d.patients || []).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-[#1a2845] mb-2">
                        Patients ({d.patients.length})
                      </h3>
                      <div className="border rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Email</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.patients.map((p, i) => (
                              <TableRow key={i}>
                                <TableCell>{p.name}</TableCell>
                                <TableCell>{p.phone || "—"}</TableCell>
                                <TableCell>{p.email || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {(d.catalog_treatments || []).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-[#1a2845] mb-2">
                        New catalogue types ({d.catalog_treatments.length})
                      </h3>
                      <div className="border rounded-lg overflow-x-auto max-h-40 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.catalog_treatments.map((c, i) => (
                              <TableRow key={i}>
                                <TableCell>{c.treatment_name}</TableCell>
                                <TableCell>{c.default_price ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {(d.treatments || []).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-[#1a2845] mb-2">
                        Treatment visits ({d.treatments.length})
                      </h3>
                      <div className="border rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Patient</TableHead>
                              <TableHead>Treatment</TableHead>
                              <TableHead>Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.treatments.map((t, i) => (
                              <TableRow key={i}>
                                <TableCell>{t.date}</TableCell>
                                <TableCell>{t.patient_name || "—"}</TableCell>
                                <TableCell>{t.treatment_name}</TableCell>
                                <TableCell>{t.price_paid}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {(d.expenses || []).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-[#1a2845] mb-2">
                        Expenses ({d.expenses.length})
                      </h3>
                      <div className="border rounded-lg overflow-x-auto max-h-40 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.expenses.map((e, i) => (
                              <TableRow key={i}>
                                <TableCell>{e.date}</TableCell>
                                <TableCell>{e.category}</TableCell>
                                <TableCell>{e.amount}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {(d.clinical_notes || []).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-[#1a2845] mb-2">
                        Clinical notes ({d.clinical_notes.length})
                      </h3>
                      <div className="border rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Patient</TableHead>
                              <TableHead>Visit</TableHead>
                              <TableHead>Summary</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.clinical_notes.map((n, i) => (
                              <TableRow key={i}>
                                <TableCell>{n.patient_name}</TableCell>
                                <TableCell>{n.visit_date}</TableCell>
                                <TableCell className="max-w-xs truncate">
                                  {n.clinical_summary}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {mainMode === "csv" && (
          <>
            <p className="text-sm text-gray-500">
              Upload exports from another system (up to{" "}
              {CSV_SOFT_MAX.toLocaleString()} characters). AI infers columns; you
              confirm from the preview. Patient import skips duplicate names.
            </p>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={csvSection === "patients" ? "default" : "outline"}
                className={
                  csvSection === "patients"
                    ? "bg-[#1a2845] hover:bg-[#1a2845]/90"
                    : ""
                }
                onClick={() => setCsvSection("patients")}
              >
                <Users className="w-4 h-4 mr-2" />
                Patients
              </Button>
              <Button
                type="button"
                variant={csvSection === "treatments" ? "default" : "outline"}
                className={
                  csvSection === "treatments"
                    ? "bg-[#1a2845] hover:bg-[#1a2845]/90"
                    : ""
                }
                onClick={() => setCsvSection("treatments")}
              >
                <Stethoscope className="w-4 h-4 mr-2" />
                Treatment history
              </Button>
            </div>

            {csvSection === "patients" && (
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-light text-[#1a2845]">
                    Patient CSV
                  </CardTitle>
                  <CardDescription>
                    Typical columns: name, phone, email, address, notes. Headers
                    can vary.
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

            {csvSection === "treatments" && (
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-light text-[#1a2845]">
                    Treatment history CSV
                  </CardTitle>
                  <CardDescription>
                    Rows should represent visits (date, patient, service,
                    amount). New service names become catalogue entries on import.
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
          </>
        )}
      </div>
    </div>
  );
}
