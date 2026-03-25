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
    <div className="min-h-screen pb-20 px-4 md:px-8">
      {/* Elegant Header */}
      <div className="max-w-7xl mx-auto pt-8 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-[#1a2845] tracking-tight">Patient Cards</h1>
            <p className="text-slate-500 mt-1">
              Viewing {currentIndex + 1} of {rows.length}
            </p>
          </div>

          {/* Sleek Navigation Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={prevCard}
              disabled={rows.length <= 1}
              className="h-12 w-12 rounded-xl bg-white border border-slate-200 hover:border-[#1a2845] hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center group"
            >
              <ChevronLeft className="h-5 w-5 text-slate-600 group-hover:text-[#1a2845]" />
            </button>
            <button
              onClick={nextCard}
              disabled={rows.length <= 1}
              className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#1a2845] to-[#2d4263] hover:from-[#243556] hover:to-[#1a2845] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-xl flex items-center justify-center"
            >
              <ChevronRight className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Card Container */}
      <div className="max-w-5xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="relative"
          >
            {/* Premium Card Design */}
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/60">
              {/* Header Section - Modern Glass Effect */}
              <div className="relative bg-gradient-to-br from-[#1a2845] via-[#243556] to-[#1a2845] px-8 py-8">
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#c7a86a] to-transparent opacity-80" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent" />

                {/* Patient Info */}
                <div className="relative flex items-start gap-6 mb-8">
                  {/* Avatar */}
                  <div className="relative">
                    <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-[#c7a86a] to-[#b8935a] flex items-center justify-center shadow-xl">
                      <span className="text-3xl font-bold text-white">
                        {patientInitials(patient.name)}
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-lg bg-emerald-500 border-4 border-[#1a2845] flex items-center justify-center">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  </div>

                  {/* Name & Contact */}
                  <div className="flex-1 min-w-0 pt-1">
                    <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">
                      {patient.name || "Patient"}
                    </h2>
                    <div className="flex flex-wrap gap-4 text-sm">
                      {patient.phone && (
                        <a
                          href={`tel:${patient.phone}`}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 hover:text-white backdrop-blur-sm border border-white/10 transition-all"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>{patient.phone}</span>
                        </a>
                      )}
                      {(patient.contact || patient.email) && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-white/90 backdrop-blur-sm border border-white/10">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[200px]">{patient.contact || patient.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial Overview - Elegant Cards */}
                <div className="relative grid grid-cols-3 gap-4">
                  <div className="bg-white/10 backdrop-blur-xl rounded-xl p-4 border border-white/20 hover:bg-white/15 transition-all">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 mb-2">
                      Total Billed
                    </p>
                    <p className="text-3xl font-bold text-white tabular-nums">
                      £{money(totalBilled)}
                    </p>
                  </div>
                  <div className="bg-emerald-500/20 backdrop-blur-xl rounded-xl p-4 border border-emerald-400/40 hover:bg-emerald-500/25 transition-all">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100 mb-2">
                      Paid
                    </p>
                    <p className="text-3xl font-bold text-white tabular-nums">
                      £{money(totalPaid)}
                    </p>
                  </div>
                  <div
                    className={`backdrop-blur-xl rounded-xl p-4 border transition-all ${
                      outstanding > 0
                        ? "bg-amber-500/20 border-amber-400/40 hover:bg-amber-500/25"
                        : "bg-white/10 border-white/20 hover:bg-white/15"
                    }`}
                  >
                    <p
                      className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
                        outstanding > 0 ? "text-amber-100" : "text-white/60"
                      }`}
                    >
                      Outstanding
                    </p>
                    <p className={`text-3xl font-bold tabular-nums ${outstanding > 0 ? "text-white" : "text-white"}`}>
                      £{money(outstanding)}
                    </p>
                  </div>
                </div>

                {/* Bottom accent */}
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#c7a86a] to-transparent opacity-80" />
              </div>

              {/* Content Section */}
              <div className="p-8">
                <Tabs defaultValue="visits" className="w-full">
                  {/* Modern Tab Buttons */}
                  <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1.5 rounded-xl mb-6 h-14">
                    <TabsTrigger
                      value="visits"
                      className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md text-sm font-semibold gap-2.5 data-[state=active]:text-[#1a2845] transition-all"
                    >
                      <Stethoscope className="h-4 w-4" />
                      Treatments
                      <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-200 data-[state=active]:bg-[#1a2845]/10">
                        {treatments.length}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="notes"
                      className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md text-sm font-semibold gap-2.5 data-[state=active]:text-[#1a2845] transition-all"
                    >
                      <FileText className="h-4 w-4" />
                      Clinical Notes
                      <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-200 data-[state=active]:bg-[#1a2845]/10">
                        {notes.length}
                      </span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Treatments Tab */}
                  <TabsContent value="visits" className="mt-0">
                    <ScrollArea className="h-[320px] pr-4">
                      {treatments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center mb-4 shadow-inner">
                            <Stethoscope className="h-9 w-9 text-slate-300" />
                          </div>
                          <p className="text-slate-600 font-medium">No treatments recorded yet</p>
                          <p className="text-sm text-slate-400 mt-1">Treatment history will appear here</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {treatments.map((t) => (
                            <div
                              key={t.id}
                              className="group rounded-2xl border-2 border-slate-100 bg-gradient-to-br from-white to-slate-50/30 p-5 hover:border-[#c7a86a] hover:shadow-lg transition-all duration-200"
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex-1">
                                  <h3 className="font-bold text-[#1a2845] text-lg mb-1">
                                    {t.treatment_name || "Treatment"}
                                  </h3>
                                  <p className="text-sm text-slate-500">
                                    {t.date ? format(new Date(t.date), "d MMMM yyyy") : "—"}
                                    {t.practitioner_name && (
                                      <span className="text-slate-400">
                                        {" "}• {t.practitioner_name}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <PaymentBadge status={t.payment_status} />
                              </div>

                              <div className="flex items-center gap-6 text-sm">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Price</span>
                                  <span className="font-bold text-[#1a2845] text-base tabular-nums">
                                    £{money(t.price_paid)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500">Paid</span>
                                  <span className="font-bold text-emerald-600 text-base tabular-nums">
                                    £{money(t.amount_paid)}
                                  </span>
                                </div>
                                {Number(t.price_paid) - Number(t.amount_paid || 0) > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-500">Due</span>
                                    <span className="font-bold text-amber-600 text-base tabular-nums">
                                      £{money(Number(t.price_paid) - Number(t.amount_paid || 0))}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {t.notes && (
                                <p className="mt-4 text-sm text-slate-600 leading-relaxed border-t border-slate-200 pt-3">
                                  {t.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  {/* Notes Tab */}
                  <TabsContent value="notes" className="mt-0">
                    <ScrollArea className="h-[320px] pr-4">
                      {notes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center mb-4 shadow-inner">
                            <FileText className="h-9 w-9 text-slate-300" />
                          </div>
                          <p className="text-slate-600 font-medium mb-2">No clinical notes yet</p>
                          <p className="text-sm text-slate-400">
                            Add notes from{" "}
                            <Link
                              to={createPageUrl("Catalogue")}
                              className="text-[#1a2845] font-semibold hover:text-[#c7a86a] underline"
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
                                className="rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-5 hover:border-slate-200 transition-all"
                              >
                                <div className="flex items-center justify-between mb-3 text-xs">
                                  <span className="font-semibold text-slate-600">
                                    {note.visit_date
                                      ? format(new Date(note.visit_date), "d MMMM yyyy")
                                      : "—"}
                                  </span>
                                  <span className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 font-medium capitalize">
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
                <div className="mt-8 pt-6 border-t-2 border-slate-100 grid grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-xl border-2 border-slate-200 hover:border-[#1a2845] hover:bg-slate-50 font-semibold h-14 text-base"
                    asChild
                  >
                    <Link to={createPageUrl("Records")} className="gap-2.5">
                      <CreditCard className="h-5 w-5" />
                      View Records
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    className="rounded-xl bg-gradient-to-r from-[#1a2845] to-[#2d4263] hover:from-[#243556] hover:to-[#1a2845] shadow-lg hover:shadow-xl font-semibold h-14 text-base"
                    asChild
                  >
                    <Link to={createPageUrl("Catalogue")} className="gap-2.5">
                      <User className="h-5 w-5" />
                      Patient Details
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Elegant Progress Indicators */}
        {rows.length > 1 && (
          <div className="flex justify-center items-center gap-2 mt-10">
            {rows.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-10 h-3 bg-gradient-to-r from-[#1a2845] to-[#2d4263]"
                    : "w-3 h-3 bg-slate-300 hover:bg-slate-400"
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
