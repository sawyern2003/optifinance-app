import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/api/api";
import { createPageUrl } from "@/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
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
  Sparkles,
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
  const [carouselApi, setCarouselApi] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);

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

  useEffect(() => {
    if (!carouselApi) return;
    const sync = () => setSlideIndex(carouselApi.selectedScrollSnap());
    sync();
    carouselApi.on("select", sync);
    carouselApi.on("reInit", sync);
    return () => {
      carouselApi.off("select", sync);
      carouselApi.off("reInit", sync);
    };
  }, [carouselApi]);

  const loading = loadingPatients || loadingTreatments || loadingNotes;

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

  return (
    <div className="pb-16 px-4 md:px-8 max-w-5xl mx-auto">
      <div className="pt-6 md:pt-10 mb-2 text-center space-y-2">
        <div className="inline-flex items-center gap-2 text-violet-700 text-xs font-semibold uppercase tracking-widest">
          <Sparkles className="h-3.5 w-3.5" />
          Clinical overview
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#0f172a]">
          Patient cards
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto text-sm md:text-base">
          Swipe horizontally (or use the arrows) to move between patients. Each card shows treatment
          history, notes, and what they&apos;ve paid versus what&apos;s outstanding.
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 mb-6">
        <span className="text-sm font-medium text-slate-500">
          {slideIndex + 1} <span className="text-slate-400">/</span> {rows.length}
        </span>
        <div className="flex gap-1">
          {rows.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to patient ${i + 1}`}
              onClick={() => carouselApi?.scrollTo(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === slideIndex ? "w-6 bg-violet-600" : "w-2 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="relative">
        <Carousel
          setApi={setCarouselApi}
          opts={{ align: "center", loop: false, dragFree: false }}
          className="w-full"
        >
          <CarouselContent className="-ml-3 md:-ml-4 pb-4">
            {rows.map(({ patient, treatments, notes, totalBilled, totalPaid, outstanding }) => (
              <CarouselItem key={patient.id} className="pl-3 md:pl-4 basis-full md:basis-[92%] lg:basis-[88%]">
                <div className="rounded-[1.75rem] overflow-hidden shadow-2xl shadow-slate-900/10 border border-white/60 bg-white/90 backdrop-blur-sm ring-1 ring-slate-200/80 min-h-[520px] flex flex-col">
                  {/* Header */}
                  <div className="relative px-6 pt-8 pb-10 text-white overflow-hidden shrink-0">
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-[#1e1b4b] via-violet-800 to-fuchsia-700"
                      aria-hidden
                    />
                    <div
                      className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"
                      aria-hidden
                    />
                    <div className="relative flex items-start gap-4">
                      <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-xl font-bold tracking-tight border border-white/20 shadow-lg">
                        {patientInitials(patient.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-2xl font-bold truncate">{patient.name || "Patient"}</h2>
                        <div className="mt-2 flex flex-col gap-1.5 text-sm text-violet-100/95">
                          {patient.phone && (
                            <a
                              href={`tel:${patient.phone}`}
                              className="inline-flex items-center gap-2 hover:text-white transition-colors"
                            >
                              <Phone className="h-3.5 w-3.5 shrink-0 opacity-80" />
                              <span className="truncate">{patient.phone}</span>
                            </a>
                          )}
                          {(patient.contact || patient.email) && (
                            <span className="inline-flex items-center gap-2 truncate">
                              <Mail className="h-3.5 w-3.5 shrink-0 opacity-80" />
                              <span className="truncate">{patient.contact || patient.email}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="relative mt-8 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-black/20 backdrop-blur-md border border-white/10 px-3 py-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-violet-200/80 font-semibold">
                          Billed
                        </p>
                        <p className="text-lg font-bold tabular-nums">£{money(totalBilled)}</p>
                      </div>
                      <div className="rounded-xl bg-black/20 backdrop-blur-md border border-white/10 px-3 py-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-200/90 font-semibold">
                          Paid
                        </p>
                        <p className="text-lg font-bold tabular-nums text-emerald-100">£{money(totalPaid)}</p>
                      </div>
                      <div className="rounded-xl bg-black/20 backdrop-blur-md border border-white/10 px-3 py-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-amber-200/90 font-semibold">
                          Owes
                        </p>
                        <p
                          className={`text-lg font-bold tabular-nums ${
                            outstanding > 0 ? "text-amber-100" : "text-white/90"
                          }`}
                        >
                          £{money(outstanding)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-slate-50/80 to-white px-4 pb-4 pt-2">
                    <Tabs defaultValue="visits" className="flex-1 flex flex-col min-h-0">
                      <TabsList className="w-full grid grid-cols-2 h-10 rounded-xl bg-slate-200/60 p-1">
                        <TabsTrigger
                          value="visits"
                          className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs sm:text-sm gap-1.5"
                        >
                          <Stethoscope className="h-3.5 w-3.5" />
                          Treatments ({treatments.length})
                        </TabsTrigger>
                        <TabsTrigger
                          value="notes"
                          className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs sm:text-sm gap-1.5"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Notes ({notes.length})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="visits" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden">
                        <ScrollArea className="h-[240px] pr-3">
                          {treatments.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-10">
                              No treatment visits recorded yet.
                            </p>
                          ) : (
                            <ul className="space-y-2.5">
                              {treatments.map((t) => (
                                <li
                                  key={t.id}
                                  className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-[#0f172a] truncate">
                                        {t.treatment_name || "Treatment"}
                                      </p>
                                      <p className="text-xs text-slate-500 mt-0.5">
                                        {t.date
                                          ? format(new Date(t.date), "d MMM yyyy")
                                          : "—"}{" "}
                                        {t.practitioner_name && (
                                          <span className="text-slate-400">
                                            · {t.practitioner_name}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <PaymentBadge status={t.payment_status} />
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                                    <span className="tabular-nums">
                                      Price <strong className="text-slate-900">£{money(t.price_paid)}</strong>
                                    </span>
                                    <span className="tabular-nums">
                                      Paid <strong className="text-emerald-700">£{money(t.amount_paid)}</strong>
                                    </span>
                                    {Number(t.price_paid) - Number(t.amount_paid || 0) > 0 && (
                                      <span className="tabular-nums text-amber-700">
                                        Due £{money(Number(t.price_paid) - Number(t.amount_paid || 0))}
                                      </span>
                                    )}
                                  </div>
                                  {t.notes ? (
                                    <p className="mt-2 text-xs text-slate-500 line-clamp-2 border-t border-slate-100 pt-2">
                                      {t.notes}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </ScrollArea>
                      </TabsContent>

                      <TabsContent value="notes" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden">
                        <ScrollArea className="h-[240px] pr-3">
                          {notes.length === 0 ? (
                            <div className="text-center py-8 px-2">
                              <p className="text-sm text-slate-500 mb-3">
                                No clinical notes yet for this patient.
                              </p>
                              <p className="text-xs text-slate-400">
                                Add notes from{" "}
                                <Link
                                  to={createPageUrl("Catalogue")}
                                  className="text-violet-700 font-medium underline-offset-2 hover:underline"
                                >
                                  Catalogue → Patients
                                </Link>{" "}
                                (clinical file) or via Voice Diary.
                              </p>
                            </div>
                          ) : (
                            <ul className="space-y-2.5">
                              {notes.map((note) => {
                                const s =
                                  note.structured && typeof note.structured === "object"
                                    ? note.structured
                                    : {};
                                const summary = s.clinical_summary || note.raw_narrative || "—";
                                return (
                                  <li
                                    key={note.id}
                                    className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 text-sm"
                                  >
                                    <div className="flex justify-between gap-2 text-xs text-slate-500 mb-1.5">
                                      <span>
                                        {note.visit_date
                                          ? format(new Date(note.visit_date), "d MMM yyyy")
                                          : "—"}
                                      </span>
                                      <span className="capitalize">
                                        {(note.source || "").replace(/_/g, " ") || "note"}
                                      </span>
                                    </div>
                                    <p className="text-[#0f172a] leading-snug">{summary}</p>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>

                    <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-200 text-slate-700"
                        asChild
                      >
                        <Link to={createPageUrl("Records")} className="gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" />
                          Records & payments
                          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-slate-200 text-slate-700"
                        asChild
                      >
                        <Link to={createPageUrl("Catalogue")} className="gap-1.5">
                          Catalogue
                          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden sm:flex -left-2 md:left-0 h-11 w-11 border-slate-200 bg-white shadow-md text-slate-700 hover:bg-slate-50" />
          <CarouselNext className="hidden sm:flex -right-2 md:right-0 h-11 w-11 border-slate-200 bg-white shadow-md text-slate-700 hover:bg-slate-50" />
        </Carousel>

        <p className="text-center text-xs text-slate-400 mt-4 sm:hidden">
          Swipe the card left or right to change patient
        </p>
      </div>
    </div>
  );
}
