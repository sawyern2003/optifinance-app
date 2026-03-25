import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
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
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  Bell,
  Plus,
  Calendar,
  AlertCircle,
  Clock,
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

// Patient Header Component
function PatientHeader({ patient, lastSeen, hasOutstanding }) {
  // Generate unique cartoon avatar based on patient name - always happy and cheerful!
  const avatarSeed = patient.name || "anonymous";
  const avatarUrl = `https://api.dicebear.com/7.x/big-smile/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

  return (
    <div className="mb-6">
      <div className="flex items-start gap-4 mb-3">
        <div className="h-14 w-14 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img
            src={avatarUrl}
            alt={`${patient.name} avatar`}
            className="h-full w-full"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            {patient.name || "Patient"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {lastSeen && (
              <Badge variant="outline" className="text-xs font-normal border-gray-300 text-gray-600">
                <Clock className="h-3 w-3 mr-1" />
                Last seen {lastSeen}
              </Badge>
            )}
            {hasOutstanding && (
              <Badge variant="outline" className="text-xs font-normal border-rose-300 bg-rose-50 text-rose-700">
                <AlertCircle className="h-3 w-3 mr-1" />
                Payment due
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        {patient.phone && (
          <a
            href={`tel:${patient.phone}`}
            className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>{patient.phone}</span>
          </a>
        )}
        {(patient.contact || patient.email) && (
          <a
            href={`mailto:${patient.contact || patient.email}`}
            className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors"
          >
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate max-w-[200px]">{patient.contact || patient.email}</span>
          </a>
        )}
      </div>
    </div>
  );
}

// Compact Financial Summary
function FinancialSummary({ totalBilled, totalPaid, outstanding }) {
  return (
    <div className="py-4 border-y border-gray-200">
      {outstanding > 0 ? (
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xl font-semibold text-rose-600 tabular-nums">
            £{money(outstanding)}
          </span>
          <span className="text-sm text-gray-600">outstanding balance</span>
        </div>
      ) : (
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-lg font-medium text-emerald-600">Paid in full</span>
        </div>
      )}
      <div className="text-sm text-gray-500">
        £{money(totalPaid)} paid · £{money(totalBilled)} total spent
      </div>
    </div>
  );
}

// Quick Actions Component
function QuickActions({ hasOutstanding, patientId }) {
  return (
    <div className="flex flex-wrap gap-2 py-4">
      {hasOutstanding && (
        <Button size="sm" variant="default" className="bg-gray-900 hover:bg-gray-800 text-white">
          <Bell className="h-3.5 w-3.5 mr-1.5" />
          Send reminder
        </Button>
      )}
      <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50" asChild>
        <Link to={createPageUrl("Records")}>
          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
          View records
        </Link>
      </Button>
      <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add note
      </Button>
      <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
        <Calendar className="h-3.5 w-3.5 mr-1.5" />
        Follow up
      </Button>
    </div>
  );
}

// Treatment Timeline Component
function TreatmentTimeline({ treatments }) {
  if (treatments.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No treatments recorded</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[7px] top-6 bottom-6 w-px bg-gray-200" />

      <div className="space-y-6">
        {treatments.map((t, index) => {
          const isPaid = t.payment_status === "paid";
          const isPartial = t.payment_status === "partially_paid";
          const dueAmount = Number(t.price_paid) - Number(t.amount_paid || 0);

          return (
            <div key={t.id} className="relative pl-8">
              {/* Timeline dot */}
              <div
                className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 ${
                  isPaid
                    ? "bg-emerald-500 border-emerald-500"
                    : isPartial
                    ? "bg-rose-400 border-rose-400"
                    : "bg-white border-gray-300"
                }`}
              />

              <div>
                {/* Date */}
                <div className="text-xs font-medium text-gray-500 mb-1">
                  {t.date ? format(new Date(t.date), "d MMM yyyy") : "—"}
                </div>

                {/* Treatment name */}
                <div className="font-medium text-gray-900 mb-1">
                  {t.treatment_name || "Treatment"}
                </div>

                {/* Details */}
                <div className="text-sm text-gray-600 space-y-1">
                  {t.practitioner_name && (
                    <div className="text-xs text-gray-500">with {t.practitioner_name}</div>
                  )}

                  <div className="flex items-center gap-3 text-xs">
                    <span className="tabular-nums">
                      £{money(t.price_paid)} {!isPaid && `· £{money(t.amount_paid)} paid`}
                    </span>
                    {!isPaid && dueAmount > 0 && (
                      <span className="text-rose-600 font-medium">
                        £{money(dueAmount)} due
                      </span>
                    )}
                    {isPaid && (
                      <span className="text-emerald-600 font-medium">Paid</span>
                    )}
                  </div>

                  {t.notes && (
                    <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100">
                      {t.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Notes Timeline Component
function NotesTimeline({ notes }) {
  if (notes.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-1">No clinical notes yet</p>
        <p className="text-xs text-gray-400">
          Add notes from{" "}
          <Link to={createPageUrl("Catalogue")} className="text-gray-900 font-medium hover:underline">
            Catalogue
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => {
        const s = note.structured && typeof note.structured === "object" ? note.structured : {};
        const summary = s.clinical_summary || note.raw_narrative || "—";
        return (
          <div key={note.id} className="border-l-2 border-gray-200 pl-4 py-1">
            <div className="text-xs font-medium text-gray-500 mb-1">
              {note.visit_date ? format(new Date(note.visit_date), "d MMM yyyy") : "—"}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
            {note.source && (
              <div className="text-xs text-gray-400 mt-1 capitalize">
                {note.source.replace(/_/g, " ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
    return allRows.filter((row) => row.patient.name?.toLowerCase().includes(query));
  }, [allRows, searchQuery]);

  const loading = loadingPatients || loadingTreatments || loadingNotes;

  const nextCard = () => {
    setCurrentIndex((prev) => (prev + 1) % rows.length);
  };

  const prevCard = () => {
    setCurrentIndex((prev) => (prev - 1 + rows.length) % rows.length);
  };

  useEffect(() => {
    if (rows.length > 0 && currentIndex >= rows.length) {
      setCurrentIndex(0);
    }
  }, [rows.length, currentIndex]);

  if (loading && patients.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
        <p className="text-sm text-gray-600">Loading patient cards…</p>
      </div>
    );
  }

  if (!rows.length && !searchQuery) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 px-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100 text-gray-400 mb-6">
          <FileText className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">No patients yet</h1>
        <p className="text-gray-600 mb-8">
          Add patients in the Catalogue to view their treatment history and financial records here.
        </p>
        <Button asChild className="bg-gray-900 hover:bg-gray-800">
          <Link to={createPageUrl("Catalogue")}>Open Catalogue</Link>
        </Button>
      </div>
    );
  }

  if (!rows.length && searchQuery) {
    return (
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="max-w-3xl mx-auto">
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

  const currentPatient = rows[currentIndex];
  if (!currentPatient) return null;

  const { patient, treatments, notes, totalBilled, totalPaid, outstanding } = currentPatient;

  // Elegant gradient colors for each patient
  const glowColors = [
    { gradient: "from-blue-500/20 via-cyan-500/20 to-blue-500/20", shadow: "shadow-blue-500/10" },
    { gradient: "from-purple-500/20 via-pink-500/20 to-purple-500/20", shadow: "shadow-purple-500/10" },
    { gradient: "from-emerald-500/20 via-teal-500/20 to-emerald-500/20", shadow: "shadow-emerald-500/10" },
    { gradient: "from-violet-500/20 via-fuchsia-500/20 to-violet-500/20", shadow: "shadow-violet-500/10" },
    { gradient: "from-cyan-500/20 via-blue-500/20 to-cyan-500/20", shadow: "shadow-cyan-500/10" },
    { gradient: "from-indigo-500/20 via-purple-500/20 to-indigo-500/20", shadow: "shadow-indigo-500/10" },
  ];

  const cardGlow = glowColors[currentIndex % glowColors.length];

  // Calculate last seen
  const lastTreatment = treatments[0];
  const lastSeenDate = lastTreatment?.date ? new Date(lastTreatment.date) : null;
  const lastSeenText = lastSeenDate
    ? differenceInDays(new Date(), lastSeenDate) === 0
      ? "today"
      : formatDistanceToNow(lastSeenDate, { addSuffix: true })
    : null;

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header with Search */}
        <div className="mb-8">
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
            transition={{ duration: 0.15 }}
            className="relative"
          >
            {/* Ambient glow effect */}
            <div className={`absolute -inset-4 rounded-2xl bg-gradient-to-br ${cardGlow.gradient} blur-2xl opacity-30`} />

            <div className={`relative bg-white rounded-lg p-8 overflow-hidden shadow-2xl ${cardGlow.shadow}`}>
              {/* Gradient glow border effect */}
              <div className={`absolute inset-0 rounded-lg bg-gradient-to-br ${cardGlow.gradient} opacity-100`} />
              <div className="absolute inset-[1px] rounded-lg bg-white" />

              {/* Content wrapper with relative positioning */}
              <div className="relative z-10">
              {/* Patient Header */}
              <PatientHeader
                patient={patient}
                lastSeen={lastSeenText}
                hasOutstanding={outstanding > 0}
              />

              {/* Financial Summary */}
              <FinancialSummary
                totalBilled={totalBilled}
                totalPaid={totalPaid}
                outstanding={outstanding}
              />

              {/* Quick Actions */}
              <QuickActions hasOutstanding={outstanding > 0} patientId={patient.id} />

              {/* Tabs for History */}
              <Tabs defaultValue="treatments" className="mt-6">
                <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-lg h-10 mb-6">
                  <TabsTrigger
                    value="treatments"
                    className="rounded-md text-gray-500 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-sm font-medium transition-colors"
                  >
                    Treatment history ({treatments.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="notes"
                    className="rounded-md text-gray-500 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-sm font-medium transition-colors"
                  >
                    Clinical notes ({notes.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="treatments" className="mt-0">
                  <ScrollArea className="h-[400px] pr-3">
                    <TreatmentTimeline treatments={treatments} />
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="notes" className="mt-0">
                  <ScrollArea className="h-[400px] pr-3">
                    <NotesTimeline notes={notes} />
                  </ScrollArea>
                </TabsContent>
              </Tabs>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Pagination Dots */}
        {rows.length > 1 && (
          <div className="flex justify-center items-center gap-1.5 mt-8">
            {rows.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`rounded-full transition-all ${
                  i === currentIndex ? "w-6 h-2 bg-gray-900" : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
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
