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
import { Loader2, Send, Sparkles, Database } from "lucide-react";
import { Link } from "react-router-dom";
import { applyPopulateFromTextResult } from "@/lib/applyPopulateFromText";

const CHAT_SOFT_MAX = 75_000;

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
  if (n(data.catalog_treatments)) parts.push(`${n(data.catalog_treatments)} catalogue type(s)`);
  if (n(data.treatments)) parts.push(`${n(data.treatments)} treatment visit(s)`);
  if (n(data.expenses)) parts.push(`${n(data.expenses)} expense(s)`);
  if (n(data.clinical_notes)) parts.push(`${n(data.clinical_notes)} clinical note(s)`);
  if (n(data.payment_updates)) parts.push(`${n(data.payment_updates)} payment update(s) (not auto-applied)`);
  if (n(data.invoices)) parts.push(`${n(data.invoices)} invoice row(s) — not auto-sent`);
  if (parts.length === 0) {
    return "Nothing structured was found. Try adding names, dates, treatments, and prices.";
  }
  return `Found: ${parts.join(", ")}. Review the preview below, then apply to save.`;
}

export default function ClinicDataChat() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bottomRef = useRef(null);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Describe your patients, your treatment menu, and past visits — or paste notes from another system. I will extract structured data. Use **Extract** after each message (or paste), then **Apply to clinic** when the preview looks right.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, extracted]);

  const recentPending = treatments
    .filter((t) => t.payment_status === "pending" || t.payment_status === "partially_paid")
    .slice(0, 25)
    .map((t) => ({
      patient_name: t.patient_name || "",
      treatment_name: t.treatment_name || "",
      price_paid: Number(t.price_paid) || 0,
      date: t.date,
    }));

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
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">
            AI clinic data chat
          </h1>
          <p className="text-sm text-gray-500 font-light max-w-2xl">
            Type or paste patients, services, and visit history. Extract pulls everything we can into patients, catalogue, treatment entries, expenses, and clinical notes. Invoices and payment updates are not applied automatically from this screen.
          </p>
          <p className="text-sm mt-2">
            <Link
              className="text-[#1a2845] underline underline-offset-2"
              to={createPageUrl("CsvImport")}
            >
              CSV import
            </Link>
            {" · "}
            <Link
              className="text-[#1a2845] underline underline-offset-2"
              to={createPageUrl("Dashboard")}
            >
              Dashboard
            </Link>
          </p>
        </div>

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
                Apply writes to your live database (same rules as CSV import for
                duplicates).
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
      </div>
    </div>
  );
}
