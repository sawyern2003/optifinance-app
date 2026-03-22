import React, { useMemo, useState } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, MessageSquare, FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import {
  invoicesAPI,
  summarizeSendInvoiceResults,
} from "@/api/invoices";

function looksLikeEmail(contact) {
  return Boolean(contact?.trim()) && contact.includes("@");
}

/** SMS / Twilio: must not be an email; expect a phone (ideally E.164 e.g. +44…) */
function looksLikePhone(contact) {
  return Boolean(contact?.trim()) && !contact.includes("@");
}

export default function Communications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("outstanding");
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.entities.Invoice.list("-created_date"),
    initialData: [],
  });

  const filtered = useMemo(() => {
    if (filter === "outstanding") {
      return invoices.filter(
        (inv) => inv.status !== "paid" && String(inv.status).toLowerCase() !== "paid",
      );
    }
    return invoices;
  }, [invoices, filter]);

  const runBusy = async (invoiceId, action, fn) => {
    setBusyId(invoiceId);
    setBusyAction(action);
    try {
      await fn();
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const sendReminderSms = (invoice) =>
    runBusy(invoice.id, "reminder", async () => {
      if (!looksLikePhone(invoice.patient_contact)) {
        toast({
          title: "Need a mobile number",
          description:
            "Edit the invoice on the Invoices page and set patient contact to a phone (e.g. +447700900123), not an email.",
          variant: "destructive",
        });
        return;
      }
      try {
        await invoicesAPI.sendPaymentReminder(invoice.id, false);
        toast({
          title: "Reminder sent",
          description: `Payment reminder SMS sent for ${invoice.invoice_number}.`,
          className: "bg-green-50 border-green-200",
        });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } catch (e) {
        toast({
          title: "Reminder failed",
          description: e?.message || "Could not send SMS.",
          variant: "destructive",
        });
      }
    });

  const sendInvoiceEmail = (invoice) =>
    runBusy(invoice.id, "email", async () => {
      if (!looksLikeEmail(invoice.patient_contact)) {
        toast({
          title: "Need an email address",
          description:
            "Edit the invoice on the Invoices page and set patient contact to the patient's email.",
          variant: "destructive",
        });
        return;
      }
      try {
        if (!invoice.invoice_pdf_url) {
          await invoicesAPI.generateInvoicePDF(invoice.id);
          await queryClient.refetchQueries({ queryKey: ["invoices"] });
        }
        const list =
          queryClient.getQueryData(["invoices"]) || [];
        const invFresh =
          list.find((i) => i.id === invoice.id) || invoice;
        const sendData = await invoicesAPI.sendInvoice(invFresh.id, "email");
        const summary = summarizeSendInvoiceResults("email", sendData);
        if (!summary.hasSuccess && summary.hasFailure) {
          toast({
            title: "Email not sent",
            description: summary.description,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Invoice emailed",
            description: summary.description,
            className: "bg-green-50 border-green-200",
          });
        }
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } catch (e) {
        toast({
          title: "Email failed",
          description: e?.message || "Could not send email.",
          variant: "destructive",
        });
      }
    });

  const sendInvoiceSmsLink = (invoice) =>
    runBusy(invoice.id, "sms", async () => {
      if (!looksLikePhone(invoice.patient_contact)) {
        toast({
          title: "Need a mobile number",
          description:
            "Set patient contact to a phone number on the Invoices page.",
          variant: "destructive",
        });
        return;
      }
      try {
        if (!invoice.invoice_pdf_url) {
          await invoicesAPI.generateInvoicePDF(invoice.id);
          await queryClient.refetchQueries({ queryKey: ["invoices"] });
        }
        const list =
          queryClient.getQueryData(["invoices"]) || [];
        const invFresh =
          list.find((i) => i.id === invoice.id) || invoice;
        const sendData = await invoicesAPI.sendInvoice(invFresh.id, "sms");
        const summary = summarizeSendInvoiceResults("sms", sendData);
        toast({
          title: summary.hasSuccess ? "SMS sent" : "Could not send",
          description: summary.description || "Done.",
          variant: summary.hasSuccess ? undefined : "destructive",
          className: summary.hasSuccess ? "bg-green-50 border-green-200" : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } catch (e) {
        toast({
          title: "SMS failed",
          description: e?.message || "Could not send SMS.",
          variant: "destructive",
        });
      }
    });

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">
          Communications
        </h1>
        <p className="text-sm text-gray-500 font-light max-w-2xl">
          Send payment reminders by text and invoice PDFs by email. Uses your
          existing Twilio and Resend setup (Supabase Edge Function secrets).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card className="border-[#f0e9d8] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-[#1a2845] flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#d4a740]" />
              Text (Twilio)
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Payment reminder SMS uses <code className="text-[11px] bg-slate-100 px-1 rounded">send-payment-reminder</code>.
              Invoice SMS includes amount, bank details, and a link to the PDF.
              Set <strong>TWILIO_ACCOUNT_SID</strong>,{" "}
              <strong>TWILIO_AUTH_TOKEN</strong>,{" "}
              <strong>TWILIO_PHONE_NUMBER</strong> in Supabase → Edge Functions
              → Secrets.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-[#f0e9d8] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-[#1a2845] flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#d4a740]" />
              Email + PDF (Resend)
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Sends a branded email with the invoice <strong>PDF attached</strong>{" "}
              (same as Wix-style invoice email). Set{" "}
              <strong>SENDGRID_API_KEY</strong> (Twilio SendGrid) or{" "}
              <strong>RESEND_API_KEY</strong> in Supabase secrets. Each clinic sets{" "}
              <strong>Clinician name</strong> and <strong>Clinic send-from email</strong> in{" "}
              <strong>Settings</strong> (that domain must be verified in SendGrid/Resend). Each clinic can
              set a custom &quot;from&quot; or reply-to in{" "}
              <strong>Settings → Invoice emails</strong>. Patient contact must
              be an <strong>email address</strong> on the invoice.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-gray-600">Show:</span>
        <Button
          type="button"
          variant={filter === "outstanding" ? "default" : "outline"}
          size="sm"
          className={
            filter === "outstanding"
              ? "bg-[#1a2845] hover:bg-[#1a2845]/90"
              : ""
          }
          onClick={() => setFilter("outstanding")}
        >
          Outstanding
        </Button>
        <Button
          type="button"
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          className={
            filter === "all" ? "bg-[#1a2845] hover:bg-[#1a2845]/90" : ""
          }
          onClick={() => setFilter("all")}
        >
          All invoices
        </Button>
        <Link
          to={createPageUrl("Invoices")}
          className="ml-auto inline-flex items-center gap-1 text-sm text-[#1a2845] hover:underline"
        >
          <FileText className="h-4 w-4" />
          Manage invoices
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
      </div>

      <Card className="border-[#f0e9d8] shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500 px-4">
              No invoices in this view. Create invoices from{" "}
              <Link
                to={createPageUrl("Records")}
                className="text-[#1a2845] underline"
              >
                Records
              </Link>{" "}
              or open{" "}
              <Link
                to={createPageUrl("Invoices")}
                className="text-[#1a2845] underline"
              >
                Invoices
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="text-[#1a2845]">Patient</TableHead>
                    <TableHead className="text-[#1a2845]">Invoice</TableHead>
                    <TableHead className="text-[#1a2845]">Amount</TableHead>
                    <TableHead className="text-[#1a2845]">Status</TableHead>
                    <TableHead className="text-[#1a2845]">Contact</TableHead>
                    <TableHead className="text-right text-[#1a2845]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const phoneOk = looksLikePhone(inv.patient_contact);
                    const emailOk = looksLikeEmail(inv.patient_contact);
                    const loading = busyId === inv.id;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-gray-900">
                          {inv.patient_name}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {inv.invoice_number}
                          <div className="text-xs text-gray-400">
                            {format(new Date(inv.issue_date), "dd MMM yyyy")}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          £{Number(inv.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="font-normal capitalize text-xs"
                          >
                            {inv.status || "draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 max-w-[140px] truncate">
                          {inv.patient_contact || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!phoneOk || busyId === inv.id}
                              className="h-8 text-xs border-[#e8dcc8]"
                              title={
                                phoneOk
                                  ? "Send payment reminder SMS"
                                  : "Need phone in patient contact"
                              }
                              onClick={() => sendReminderSms(inv)}
                            >
                              {loading && busyAction === "reminder" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <MessageSquare className="h-3.5 w-3.5 mr-1" />
                                  Reminder SMS
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!emailOk || busyId === inv.id}
                              className="h-8 text-xs border-[#e8dcc8]"
                              title={
                                emailOk
                                  ? "Email PDF invoice"
                                  : "Need email in patient contact"
                              }
                              onClick={() => sendInvoiceEmail(inv)}
                            >
                              {loading && busyAction === "email" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Mail className="h-3.5 w-3.5 mr-1" />
                                  Email PDF
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!phoneOk || busyId === inv.id}
                              className="h-8 text-xs border-[#e8dcc8]"
                              title={
                                phoneOk
                                  ? "SMS with invoice link"
                                  : "Need phone in patient contact"
                              }
                              onClick={() => sendInvoiceSmsLink(inv)}
                            >
                              {loading && busyAction === "sms" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "SMS link"
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-gray-400">
        One field <strong>patient contact</strong> per invoice holds either a
        phone or an email. For both channels, duplicate the row or add a second
        contact field in a future update.
      </p>
    </div>
  );
}
