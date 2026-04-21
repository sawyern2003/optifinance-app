import React, { useState, useMemo } from 'react';
import { api } from '@/api/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Menu } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  invoicesAPI,
  summarizeSendInvoiceResults,
} from '@/api/invoices';
import {
  extractEmailAddress,
  extractPhoneNumber,
} from '@/lib/contactGuards';

// Import new components
import { useCommunications } from '@/hooks/useCommunications';
import { PatientSidebar } from '@/components/communications/PatientSidebar';
import { MessageThread } from '@/components/communications/MessageThread';
import { EmptyState } from '@/components/communications/EmptyState';

function normalizePatientKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizePatientLooseKey(value) {
  return normalizePatientKey(value).replace(/[^a-z0-9]/g, '');
}

export default function Communications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // UI State
  const [selectedPatientKey, setSelectedPatientKey] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composeMode, setComposeMode] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyInvoiceId, setBusyInvoiceId] = useState(null);
  const [ephemeralMessages, setEphemeralMessages] = useState([]);

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.entities.Invoice.list('-created_date'),
    initialData: [],
  });

  const { data: communicationMessages = [] } = useQuery({
    queryKey: ['communicationMessages'],
    queryFn: () => api.entities.CommunicationMessage.list('-created_at'),
    initialData: [],
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api.entities.Patient.list('name'),
    initialData: [],
  });

  const { data: treatmentEntries = [] } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  // Group invoices by patient
  const rawConversations = useCommunications(
    invoices,
    [...communicationMessages, ...ephemeralMessages],
    'all',
    searchQuery,
  );

  const patientConversations = useMemo(() => {
    const outstandingByName = new Map();
    for (const t of treatmentEntries || []) {
      const key = normalizePatientKey(t.patient_name);
      if (!key) continue;
      const pricePaid = Number(t.price_paid || 0);
      const amountPaid = Number(t.amount_paid || 0);
      let outstandingForTreatment = 0;
      if (t.payment_status === 'pending') {
        outstandingForTreatment = Math.max(0, pricePaid);
      } else if (t.payment_status === 'partially_paid') {
        outstandingForTreatment = Math.max(0, pricePaid - amountPaid);
      }
      if (outstandingForTreatment <= 0) continue;
      const prev = outstandingByName.get(key) || { balance: 0, count: 0 };
      prev.balance += outstandingForTreatment;
      prev.count += 1;
      outstandingByName.set(key, prev);
    }

    const patientByName = new Map();
    const patientByLooseName = new Map();
    for (const p of patients || []) {
      const nameKey = normalizePatientKey(p.name);
      const looseKey = normalizePatientLooseKey(p.name);
      if (nameKey && !patientByName.has(nameKey)) patientByName.set(nameKey, p);
      if (looseKey && !patientByLooseName.has(looseKey)) patientByLooseName.set(looseKey, p);
    }
    let conversations = rawConversations.map((conv) => {
      const patientKey = normalizePatientKey(conv.patient_name || conv.key);
      const p =
        patientByName.get(patientKey) ||
        patientByLooseName.get(normalizePatientLooseKey(conv.patient_name || conv.key));
      const outstanding = outstandingByName.get(patientKey) || { balance: 0, count: 0 };
      const displayContact =
        String(p?.contact || '').trim() ||
        String(p?.email || '').trim() ||
        String(p?.phone || '').trim() ||
        String(conv.patient_contact || '').trim();
      const messagingPhone =
        extractPhoneNumber(p?.phone) ||
        extractPhoneNumber(p?.contact) ||
        extractPhoneNumber(conv.patient_contact) ||
        null;
      const messagingEmail =
        extractEmailAddress(p?.email) ||
        extractEmailAddress(p?.contact) ||
        extractEmailAddress(conv.patient_contact) ||
        null;
      const contacts = Array.from(
        new Set(
          [
            ...(conv.contacts || []),
            conv.patient_contact,
            p?.contact,
            p?.email,
            p?.phone,
          ].filter(Boolean),
        ),
      );
      return {
        ...conv,
        patient_contact: displayContact,
        contacts,
        outstandingBalance: Number(outstanding.balance || 0),
        outstandingCount: Number(outstanding.count || 0),
        messagingPhone,
        messagingEmail,
      };
    });

    // Include patients with no invoice/message history so a new chat can be started.
    const existingKeys = new Set(conversations.map((c) => normalizePatientKey(c.key || c.patient_name)));
    for (const p of patients || []) {
      const key = normalizePatientKey(p.name);
      if (!key || existingKeys.has(key)) continue;
      const contact = p.contact || p.email || p.phone || '';
      conversations.push({
        key,
        patient_name: p.name || 'Patient',
        patient_contact: contact,
        invoices: [],
        customMessages: [],
        contacts: [contact].filter(Boolean),
        outstandingBalance: Number((outstandingByName.get(key) || { balance: 0 }).balance || 0),
        outstandingCount: Number((outstandingByName.get(key) || { count: 0 }).count || 0),
        lastActivity: null,
        messagingPhone: extractPhoneNumber(contact) || extractPhoneNumber(p.phone) || null,
        messagingEmail:
          extractEmailAddress(contact) ||
          extractEmailAddress(p.contact) ||
          extractEmailAddress(p.email) ||
          null,
      });
    }

    if (filter === 'outstanding') {
      conversations = conversations.filter((c) => Number(c.outstandingBalance || 0) > 0);
    }
    return conversations;
  }, [rawConversations, patients, treatmentEntries, filter]);

  // Get selected patient
  const selectedPatient = useMemo(() => {
    return patientConversations.find(p => p.key === selectedPatientKey);
  }, [patientConversations, selectedPatientKey]);

  // Auto-select first patient on load or when selected key disappears after recompute.
  React.useEffect(() => {
    if (patientConversations.length === 0) return;
    const hasSelection = patientConversations.some((p) => p.key === selectedPatientKey);
    if (!selectedPatientKey || !hasSelection) {
      setSelectedPatientKey(patientConversations[0].key);
    }
  }, [patientConversations, selectedPatientKey]);

  // === Communication Functions (same logic as original) ===

  const sendReminderSms = async (invoice) => {
    const targetPhone =
      selectedPatient?.messagingPhone ||
      extractPhoneNumber(invoice.patient_contact) ||
      null;
    if (!targetPhone) {
      toast({
        title: 'Phone number required',
        description:
          'Patient contact must be a phone number to send SMS reminders.',
        variant: 'destructive',
      });
      return;
    }

    setBusyInvoiceId(invoice.id);
    try {
      let invoiceForSend = invoice;
      if (String(invoice.patient_contact || '').trim() !== targetPhone) {
        await api.entities.Invoice.update(invoice.id, { patient_contact: targetPhone });
        queryClient.setQueryData(['invoices'], (prev = []) =>
          prev.map((inv) => (inv.id === invoice.id ? { ...inv, patient_contact: targetPhone } : inv)),
        );
        invoiceForSend = { ...invoice, patient_contact: targetPhone };
      }
      await invoicesAPI.sendPaymentReminder(invoiceForSend.id, false);
      toast({
        title: 'Reminder sent',
        description: `Payment reminder SMS sent for ${invoice.invoice_number}`,
        className: 'bg-green-50 border-green-200',
      });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast({
        title: 'Reminder failed',
        description: e?.message || 'Could not send SMS',
        variant: 'destructive',
      });
    } finally {
      setBusyInvoiceId(null);
      setComposeMode(null);
    }
  };

  const sendInvoiceEmail = async (invoice) => {
    const targetEmail =
      selectedPatient?.messagingEmail ||
      extractEmailAddress(invoice.patient_contact) ||
      null;
    if (!targetEmail) {
      toast({
        title: 'Email address required',
        description:
          'Patient contact must be an email address to send invoice emails.',
        variant: 'destructive',
      });
      return;
    }

    setBusyInvoiceId(invoice.id);
    try {
      let invoiceForSend = invoice;
      if (String(invoice.patient_contact || '').trim().toLowerCase() !== String(targetEmail).toLowerCase()) {
        await api.entities.Invoice.update(invoice.id, { patient_contact: targetEmail });
        queryClient.setQueryData(['invoices'], (prev = []) =>
          prev.map((inv) => (inv.id === invoice.id ? { ...inv, patient_contact: targetEmail } : inv)),
        );
        invoiceForSend = { ...invoice, patient_contact: targetEmail };
      }

      // Generate PDF if needed
      if (!invoiceForSend.invoice_pdf_url) {
        await invoicesAPI.generateInvoicePDF(invoiceForSend.id);
        await queryClient.refetchQueries({ queryKey: ['invoices'] });
      }

      // Get fresh invoice data
      const list = queryClient.getQueryData(['invoices']) || [];
      const invFresh = list.find((i) => i.id === invoice.id) || invoiceForSend;

      // Send email
      const sendData = await invoicesAPI.sendInvoice(invFresh.id, 'email');
      const summary = summarizeSendInvoiceResults('email', sendData);

      if (!summary.hasSuccess && summary.hasFailure) {
        toast({
          title: 'Email not sent',
          description: summary.description,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Invoice emailed',
          description: summary.description,
          className: 'bg-green-50 border-green-200',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast({
        title: 'Email failed',
        description: e?.message || 'Could not send email',
        variant: 'destructive',
      });
    } finally {
      setBusyInvoiceId(null);
      setComposeMode(null);
    }
  };

  const sendInvoiceSmsLink = async (invoice) => {
    const targetPhone =
      selectedPatient?.messagingPhone ||
      extractPhoneNumber(invoice.patient_contact) ||
      null;
    if (!targetPhone) {
      toast({
        title: 'Phone number required',
        description: 'Patient contact must be a phone number to send SMS.',
        variant: 'destructive',
      });
      return;
    }

    setBusyInvoiceId(invoice.id);
    try {
      let invoiceForSend = invoice;
      if (String(invoice.patient_contact || '').trim() !== targetPhone) {
        await api.entities.Invoice.update(invoice.id, { patient_contact: targetPhone });
        queryClient.setQueryData(['invoices'], (prev = []) =>
          prev.map((inv) => (inv.id === invoice.id ? { ...inv, patient_contact: targetPhone } : inv)),
        );
        invoiceForSend = { ...invoice, patient_contact: targetPhone };
      }

      // Generate PDF if needed
      if (!invoiceForSend.invoice_pdf_url) {
        await invoicesAPI.generateInvoicePDF(invoiceForSend.id);
        await queryClient.refetchQueries({ queryKey: ['invoices'] });
      }

      // Get fresh invoice data
      const list = queryClient.getQueryData(['invoices']) || [];
      const invFresh = list.find((i) => i.id === invoice.id) || invoiceForSend;

      // Send SMS
      const sendData = await invoicesAPI.sendInvoice(invFresh.id, 'sms');
      const summary = summarizeSendInvoiceResults('sms', sendData);

      toast({
        title: summary.hasSuccess ? 'SMS sent' : 'Could not send',
        description: summary.description || 'Done',
        variant: summary.hasSuccess ? undefined : 'destructive',
        className: summary.hasSuccess
          ? 'bg-green-50 border-green-200'
          : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast({
        title: 'SMS failed',
        description: e?.message || 'Could not send SMS',
        variant: 'destructive',
      });
    } finally {
      setBusyInvoiceId(null);
      setComposeMode(null);
    }
  };

  const sendCustomSms = async (patient, messageBody) => {
    if (!patient || !patient.messagingPhone) {
      toast({
        title: 'Phone number required',
        description: 'No phone number found for this patient.',
        variant: 'destructive',
      });
      return;
    }
    const firstInvoice = patient.invoices?.[0] || null;
    setBusyInvoiceId(firstInvoice?.id || `custom-${patient.key}`);
    try {
      await api.functions.invoke('sendCustomSMS', {
        patientName: patient.patient_name,
        patientContact: patient.messagingPhone,
        messageBody,
        relatedInvoiceId: firstInvoice?.id || null,
        metadata: { source: 'communications_custom' },
      });

      // Immediate UX feedback in timeline even if DB logging is delayed/missing.
      setEphemeralMessages((prev) => [
        ...prev,
        {
          id: `tmp-${Date.now()}`,
          patient_name: patient.patient_name,
          patient_contact: patient.messagingPhone,
          channel: 'sms',
          direction: 'outbound',
          status: 'sent',
          message_body: messageBody,
          created_at: new Date().toISOString(),
        },
      ]);

      toast({
        title: 'SMS sent',
        description: `Custom message sent to ${patient.patient_name}`,
        className: 'bg-green-50 border-green-200',
      });
      queryClient.invalidateQueries({ queryKey: ['communicationMessages'] });
    } catch (e) {
      toast({
        title: 'SMS failed',
        description: e?.message || 'Could not send custom SMS',
        variant: 'destructive',
      });
    } finally {
      setBusyInvoiceId(null);
      setComposeMode(null);
    }
  };

  // Handle message send from compose panel
  const handleSendMessage = async (invoice, method, customMessageBody) => {
    if (method === 'reminder') {
      await sendReminderSms(invoice);
    } else if (method === 'email') {
      await sendInvoiceEmail(invoice);
    } else if (method === 'sms') {
      await sendInvoiceSmsLink(invoice);
    } else if (method === 'custom_sms') {
      await sendCustomSms(selectedPatient, customMessageBody);
    }
  };

  // Handle view PDF
  const handleViewPDF = (invoice) => {
    if (invoice.invoice_pdf_url) {
      window.open(invoice.invoice_pdf_url, '_blank');
    } else {
      toast({
        title: 'PDF not available',
        description: 'Generate the PDF first',
        variant: 'destructive',
      });
    }
  };

  // Handle resend
  const handleResend = async (invoice, method) => {
    if (method === 'email') {
      await sendInvoiceEmail(invoice);
    } else if (method === 'sms') {
      await sendInvoiceSmsLink(invoice);
    }
  };

  // Loading state
  if (isLoading && invoices.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#d4a740] mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 50%, #0f1419 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#d6b164]/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Mobile Header */}
      <div className="md:hidden border-b border-white/10 p-4 flex items-center justify-between bg-white/5 backdrop-blur-xl relative z-10">
        <h1 className="text-lg font-light text-white/90 tracking-wider">Messages</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(true)}
          className="text-white/70 hover:text-white/90"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Main Layout */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Sidebar */}
        <PatientSidebar
          conversations={patientConversations}
          selectedKey={selectedPatientKey}
          onSelectPatient={setSelectedPatientKey}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          filter={filter}
          onFilterChange={setFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Main Content */}
        {selectedPatient ? (
          <MessageThread
            patient={selectedPatient}
            composeMode={composeMode}
            setComposeMode={setComposeMode}
            onSendMessage={handleSendMessage}
            onViewPDF={handleViewPDF}
            onResend={handleResend}
            isSending={busyInvoiceId !== null}
            resendingId={busyInvoiceId}
          />
        ) : (
          <EmptyState onToggleSidebar={() => setSidebarOpen(true)} />
        )}
      </div>
    </div>
  );
}
