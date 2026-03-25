import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/api/api";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreditCard,
  FileText,
  Loader2,
  Phone,
  Mail,
  Stethoscope,
  ChevronRight,
  ChevronLeft,
  User,
  Search,
  X,
} from "lucide-react";

function money(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return "0.00";
  return v.toFixed(2);
}

function patientInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function aggregateByPatient(patients, treatmentEntries, clinicalNotes) {
  const map = new Map();
  for (const p of patients || []) {
    map.set(p.id, {
      patient: p,
      treatments: [],
      notes: [],
      totalBilled: 0,
      totalPaid: 0,
    });
  }
  for (const t of treatmentEntries || []) {
    if (!t.patient_id || !map.has(t.patient_id)) continue;
    const row = map.get(t.patient_id);
    row.treatments.push(t);
    row.totalBilled += Number(t.price_paid) || 0;
    row.totalPaid += Number(t.amount_paid) || 0;
  }
  for (const row of map.values()) {
    row.treatments.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  for (const n of clinicalNotes || []) {
    if (!n.patient_id || !map.has(n.patient_id)) continue;
    map.get(n.patient_id).notes.push(n);
  }
  for (const row of map.values()) {
    row.notes.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
    row.outstanding = Math.max(0, row.totalBilled - row.totalPaid);
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.patient.name || "").localeCompare(String(b.patient.name || ""), undefined, {
      sensitivity: "base",
    }),
  );
}

function PaymentBadge({ status }) {
  const s = (status || "pending").toLowerCase();
  const styles = {
    paid: "bg-emerald-500/15 text-emerald-800 border-emerald-200",
    partially_paid: "bg-amber-500/15 text-amber-900 border-amber-200",
    pending: "bg-slate-500/10 text-slate-700 border-slate-200",
  };
  const label =
    s === "partially_paid" ? "Partial" : s === "paid" ? "Paid" : "Pending";
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${styles[s] || styles.pending}`}>
      {label}
    </Badge>
  );
}

export default function PatientCards() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: patients = [], isLoading: loadingPatients } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.entities.Patient.list("name"),
    initialData: [],
  });

  const { data: treatmentEntriesAll = [], isLoading: loadingTreatments } = useQuery({
    queryKey: ["treatmentEntriesCatalogue"],
    queryFn: () => api.entities.TreatmentEntry.list("-date"),
    initialData: [],
  });

  const { data: clinicalNotesAll = [], isLoading: loadingNotes } = useQuery({
    queryKey: ["clinicalNotes"],
    queryFn: () => api.entities.ClinicalNote.list("-visit_date"),
    initialData: [],
  });

  const allRows = useMemo(
    () => aggregateByPatient(patients, treatmentEntriesAll, clinicalNotesAll),
    [patients, treatmentEntriesAll, clinicalNotesAll],
  );

  const rows = useMemo(() => {
    if (!searchQuery.trim()) return allRows;
    const query = searchQuery.toLowerCase();
    return allRows.filter((row) =>
      row.patient.name?.toLowerCase().includes(query)
    );
  }, [allRows, searchQuery]);

  const loading = loadingPatients || loadingTreatments || loadingNotes;

  const nextCard = () => {
    setCurrentIndex((prev) => (prev + 1) % rows.length);
  };

  const prevCard = () => {
    setCurrentIndex((prev) => (prev - 1 + rows.length) % rows.length);
  };

  // Reset to first card when search changes
  useEffect(() => {
    if (rows.length > 0 && currentIndex >= rows.length) {
      setCurrentIndex(0);
    }
  }, [rows.length, currentIndex]);

  const currentPatient = rows[currentIndex];

  if (loading && patients.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-[#1a2845]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
        <p className="text-sm text-slate-600">Loading patient cards…</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 px-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 mb-6">
          <Stethoscope className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-[#0f172a] mb-2">No patients yet</h1>
        <p className="text-slate-600 mb-8">
          Add patients in the Catalogue, then swipe through their cards here — visits, clinical notes,
          and balances in one place.
        </p>
        <Button asChild className="rounded-xl bg-[#1a2845] hover:bg-[#0f1829]">
          <Link to={createPageUrl("Catalogue")}>Open Catalogue</Link>
        </Button>
      </div>
    );
  }

  if (!currentPatient && rows.length === 0 && searchQuery) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-4">Patient Cards</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-11 border-gray-300"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="text-center py-16">
            <p className="text-gray-600">No patients found matching "{searchQuery}"</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentPatient) return null;

  const { patient, treatments, notes, totalBilled, totalPaid, outstanding } = currentPatient;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header with Search */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold text-gray-900">Patient Cards</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={prevCard}
                disabled={rows.length <= 1}
                className="h-9 w-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4 text-gray-700" />
              </button>
              <span className="text-sm text-gray-600 min-w-[60px] text-center">
                {currentIndex + 1} / {rows.length}
              </span>
              <button
                onClick={nextCard}
                disabled={rows.length <= 1}
                className="h-9 w-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <ChevronRight className="h-4 w-4 text-gray-700" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 h-11 border-gray-300"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Main Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Patient Header */}
              <div className="bg-gray-900 px-6 py-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="h-16 w-16 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-semibold text-white">
                      {patientInitials(patient.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold text-white mb-3">
                      {patient.name || "Patient"}
                    </h2>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {patient.phone && (
                        <a
                          href={`tel:${patient.phone}`}
                          className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>{patient.phone}</span>
                        </a>
                      )}
                      {(patient.contact || patient.email) && (
                        <div className="inline-flex items-center gap-1.5 text-gray-300">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[200px]">{patient.contact || patient.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Total Billed</p>
                    <p className="text-lg font-semibold text-white tabular-nums">
                      £{money(totalBilled)}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Paid</p>
                    <p className="text-lg font-semibold text-emerald-400 tabular-nums">
                      £{money(totalPaid)}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Outstanding</p>
                    <p className={`text-lg font-semibold tabular-nums ${
                      outstanding > 0 ? "text-amber-400" : "text-white"
                    }`}>
                      £{money(outstanding)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <Tabs defaultValue="visits" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-lg mb-4 h-10">
                    <TabsTrigger
                      value="visits"
                      className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm font-medium gap-2"
                    >
                      <Stethoscope className="h-4 w-4" />
                      Treatments ({treatments.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="notes"
                      className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm font-medium gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Notes ({notes.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="visits" className="mt-0">
                    <ScrollArea className="h-[400px] pr-3">
                      {treatments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <Stethoscope className="h-12 w-12 text-gray-300 mb-3" />
                          <p className="text-gray-600">No treatments recorded</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {treatments.map((t) => (
                            <div
                              key={t.id}
                              className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all bg-white"
                            >
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1">
                                  <h3 className="font-medium text-gray-900 mb-0.5">
                                    {t.treatment_name || "Treatment"}
                                  </h3>
                                  <p className="text-sm text-gray-500">
                                    {t.date ? format(new Date(t.date), "d MMM yyyy") : "—"}
                                    {t.practitioner_name && <span> · {t.practitioner_name}</span>}
                                  </p>
                                </div>
                                <PaymentBadge status={t.payment_status} />
                              </div>

                              <div className="flex items-center gap-4 text-sm mt-3">
                                <div>
                                  <span className="text-gray-500">Price: </span>
                                  <span className="font-semibold text-gray-900 tabular-nums">
                                    £{money(t.price_paid)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Paid: </span>
                                  <span className="font-semibold text-emerald-600 tabular-nums">
                                    £{money(t.amount_paid)}
                                  </span>
                                </div>
                                {Number(t.price_paid) - Number(t.amount_paid || 0) > 0 && (
                                  <div>
                                    <span className="text-gray-500">Due: </span>
                                    <span className="font-semibold text-amber-600 tabular-nums">
                                      £{money(Number(t.price_paid) - Number(t.amount_paid || 0))}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {t.notes && (
                                <p className="mt-3 text-sm text-gray-600 pt-3 border-t border-gray-100">
                                  {t.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="notes" className="mt-0">
                    <ScrollArea className="h-[400px] pr-3">
                      {notes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <FileText className="h-12 w-12 text-gray-300 mb-3" />
                          <p className="text-gray-600 mb-1">No clinical notes yet</p>
                          <p className="text-sm text-gray-500">
                            Add notes from{" "}
                            <Link
                              to={createPageUrl("Catalogue")}
                              className="text-gray-900 font-medium hover:underline"
                            >
                              Catalogue
                            </Link>
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {notes.map((note) => {
                            const s = note.structured && typeof note.structured === "object" ? note.structured : {};
                            const summary = s.clinical_summary || note.raw_narrative || "—";
                            return (
                              <div
                                key={note.id}
                                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                              >
                                <div className="flex items-center justify-between mb-2 text-xs">
                                  <span className="font-medium text-gray-600">
                                    {note.visit_date
                                      ? format(new Date(note.visit_date), "d MMM yyyy")
                                      : "—"}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-500 capitalize">
                                    {(note.source || "").replace(/_/g, " ") || "note"}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>

                {/* Actions */}
                <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="rounded-lg h-10"
                    asChild
                  >
                    <Link to={createPageUrl("Records")} className="gap-2">
                      <CreditCard className="h-4 w-4" />
                      Records
                    </Link>
                  </Button>
                  <Button
                    className="rounded-lg bg-gray-900 hover:bg-gray-800 h-10"
                    asChild
                  >
                    <Link to={createPageUrl("Catalogue")} className="gap-2">
                      <User className="h-4 w-4" />
                      Details
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Pagination Dots */}
        {rows.length > 1 && (
          <div className="flex justify-center items-center gap-1.5 mt-6">
            {rows.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`rounded-full transition-all ${
                  i === currentIndex
                    ? "w-6 h-2 bg-gray-900"
                    : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                }`}
                aria-label={`Go to patient ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
