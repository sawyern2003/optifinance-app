import React, { useMemo, useState } from "react";
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

  const rows = useMemo(
    () => aggregateByPatient(patients, treatmentEntriesAll, clinicalNotesAll),
    [patients, treatmentEntriesAll, clinicalNotesAll],
  );

  const loading = loadingPatients || loadingTreatments || loadingNotes;

  const nextCard = () => {
    setCurrentIndex((prev) => (prev + 1) % rows.length);
  };

  const prevCard = () => {
    setCurrentIndex((prev) => (prev - 1 + rows.length) % rows.length);
  };

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

  if (!currentPatient) return null;

  const { patient, treatments, notes, totalBilled, totalPaid, outstanding } = currentPatient;

  return (
    <div className="min-h-screen pb-20 px-4 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="pt-8 pb-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#1a2845] mb-1">
              Patient Cards
            </h1>
            <p className="text-sm text-slate-600">
              {currentIndex + 1} of {rows.length} patients
            </p>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={prevCard}
              className="group h-11 w-11 rounded-xl bg-white border-2 border-slate-200 shadow-sm hover:shadow-md hover:border-[#1a2845] transition-all duration-200 flex items-center justify-center disabled:opacity-50"
              disabled={rows.length <= 1}
            >
              <ChevronLeft className="h-5 w-5 text-slate-600 group-hover:text-[#1a2845]" />
            </button>
            <button
              onClick={nextCard}
              className="group h-11 w-11 rounded-xl bg-[#1a2845] border-2 border-[#1a2845] shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center disabled:opacity-50"
              disabled={rows.length <= 1}
            >
              <ChevronRight className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Card Deck Container */}
      <div className="relative max-w-6xl mx-auto" style={{ perspective: "2000px" }}>
        <div className="relative h-[600px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ rotateY: -20, opacity: 0, x: -100, scale: 0.9 }}
              animate={{ rotateY: 0, opacity: 1, x: 0, scale: 1 }}
              exit={{ rotateY: 20, opacity: 0, x: 100, scale: 0.9 }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1]
              }}
              className="w-full max-w-4xl"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Main Card */}
              <div
                className="relative bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200"
                style={{
                  transform: "rotateY(-2deg) rotateX(1deg)",
                  transformStyle: "preserve-3d"
                }}
              >
                {/* Premium Header with Gold Accent */}
                <div className="relative h-48 bg-gradient-to-br from-[#1a2845] via-[#243556] to-[#1a2845] overflow-hidden">
                  {/* Subtle pattern overlay */}
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)",
                      backgroundSize: "32px 32px"
                    }}
                  />

                  {/* Gold accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#c7a86a] to-transparent" />

                  <div className="relative h-full px-8 py-6 flex flex-col justify-between">
                    {/* Patient Info */}
                    <div className="flex items-start gap-5">
                      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-[#c7a86a] to-[#b8935a] flex items-center justify-center shadow-lg border-2 border-white/20">
                        <span className="text-2xl font-bold text-white tracking-tight">
                          {patientInitials(patient.name)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
                          {patient.name || "Patient"}
                        </h2>
                        <div className="flex flex-col gap-2 text-sm text-white/90">
                          {patient.phone && (
                            <a
                              href={`tel:${patient.phone}`}
                              className="inline-flex items-center gap-2.5 hover:text-[#c7a86a] transition-colors w-fit"
                            >
                              <Phone className="h-4 w-4" />
                              <span>{patient.phone}</span>
                            </a>
                          )}
                          {(patient.contact || patient.email) && (
                            <div className="inline-flex items-center gap-2.5 w-fit">
                              <Mail className="h-4 w-4" />
                              <span className="truncate">{patient.contact || patient.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Financial Stats - Sleek Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-3 border border-white/20">
                        <p className="text-[10px] uppercase tracking-widest text-white/70 font-semibold mb-1">
                          Total Billed
                        </p>
                        <p className="text-2xl font-bold text-white tabular-nums">
                          £{money(totalBilled)}
                        </p>
                      </div>
                      <div className="bg-emerald-500/20 backdrop-blur-md rounded-xl px-4 py-3 border border-emerald-400/30">
                        <p className="text-[10px] uppercase tracking-widest text-emerald-100 font-semibold mb-1">
                          Paid
                        </p>
                        <p className="text-2xl font-bold text-emerald-50 tabular-nums">
                          £{money(totalPaid)}
                        </p>
                      </div>
                      <div className={`backdrop-blur-md rounded-xl px-4 py-3 border ${
                        outstanding > 0
                          ? "bg-amber-500/20 border-amber-400/30"
                          : "bg-white/10 border-white/20"
                      }`}>
                        <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1 ${
                          outstanding > 0 ? "text-amber-100" : "text-white/70"
                        }`}>
                          Outstanding
                        </p>
                        <p className={`text-2xl font-bold tabular-nums ${
                          outstanding > 0 ? "text-amber-50" : "text-white"
                        }`}>
                          £{money(outstanding)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="bg-gradient-to-b from-white to-slate-50/50 p-6">
                  <Tabs defaultValue="visits" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4 bg-slate-100/80 p-1 h-12">
                      <TabsTrigger
                        value="visits"
                        className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm font-semibold gap-2 data-[state=active]:text-[#1a2845]"
                      >
                        <Stethoscope className="h-4 w-4" />
                        Treatments <span className="text-xs opacity-60">({treatments.length})</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="notes"
                        className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-sm font-semibold gap-2 data-[state=active]:text-[#1a2845]"
                      >
                        <FileText className="h-4 w-4" />
                        Notes <span className="text-xs opacity-60">({notes.length})</span>
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="visits" className="mt-0">
                      <ScrollArea className="h-[280px] pr-4">
                        {treatments.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                              <Stethoscope className="h-7 w-7 text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-500">No treatments recorded yet</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {treatments.map((t) => (
                              <div
                                key={t.id}
                                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-[#c7a86a]/50 transition-all duration-200"
                              >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-[#1a2845] text-base mb-1">
                                      {t.treatment_name || "Treatment"}
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                      {t.date ? format(new Date(t.date), "d MMMM yyyy") : "—"}
                                      {t.practitioner_name && (
                                        <span className="text-slate-400 ml-2">
                                          • {t.practitioner_name}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <PaymentBadge status={t.payment_status} />
                                </div>

                                <div className="flex items-center gap-5 text-sm">
                                  <div>
                                    <span className="text-slate-500">Price: </span>
                                    <span className="font-bold text-[#1a2845] tabular-nums">
                                      £{money(t.price_paid)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Paid: </span>
                                    <span className="font-bold text-emerald-600 tabular-nums">
                                      £{money(t.amount_paid)}
                                    </span>
                                  </div>
                                  {Number(t.price_paid) - Number(t.amount_paid || 0) > 0 && (
                                    <div>
                                      <span className="text-slate-500">Due: </span>
                                      <span className="font-bold text-amber-600 tabular-nums">
                                        £{money(Number(t.price_paid) - Number(t.amount_paid || 0))}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {t.notes && (
                                  <p className="mt-3 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
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
                      <ScrollArea className="h-[280px] pr-4">
                        {notes.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                              <FileText className="h-7 w-7 text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-500 mb-2">No clinical notes yet</p>
                            <p className="text-xs text-slate-400">
                              Add notes from{" "}
                              <Link
                                to={createPageUrl("Catalogue")}
                                className="text-[#1a2845] font-medium hover:text-[#c7a86a]"
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
                                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                                >
                                  <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                                    <span className="font-medium">
                                      {note.visit_date
                                        ? format(new Date(note.visit_date), "d MMMM yyyy")
                                        : "—"}
                                    </span>
                                    <span className="capitalize px-2 py-1 rounded-md bg-white border border-slate-200">
                                      {(note.source || "").replace(/_/g, " ") || "note"}
                                    </span>
                                  </div>
                                  <p className="text-sm text-[#1a2845] leading-relaxed">{summary}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>

                  {/* Action Buttons */}
                  <div className="mt-6 pt-4 border-t border-slate-200 flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl border-2 border-slate-200 hover:border-[#1a2845] hover:bg-[#1a2845] hover:text-white transition-all duration-200 font-semibold h-11"
                      asChild
                    >
                      <Link to={createPageUrl("Records")} className="gap-2">
                        <CreditCard className="h-4 w-4" />
                        View Records
                      </Link>
                    </Button>
                    <Button
                      className="flex-1 rounded-xl bg-[#1a2845] hover:bg-[#243556] shadow-md hover:shadow-lg transition-all duration-200 font-semibold h-11"
                      asChild
                    >
                      <Link to={createPageUrl("Catalogue")} className="gap-2">
                        <User className="h-4 w-4" />
                        Patient Details
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Gold accent bottom */}
                <div className="h-1 bg-gradient-to-r from-transparent via-[#c7a86a] to-transparent" />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress Dots */}
        {rows.length > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {rows.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-8 bg-[#1a2845]"
                    : "w-2.5 bg-slate-300 hover:bg-slate-400"
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
