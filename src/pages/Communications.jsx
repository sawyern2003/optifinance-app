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
  looksLikeEmail,
  looksLikePhone,
} from '@/lib/contactGuards';

// Import new components
import { useCommunications } from '@/hooks/useCommunications';
import { PatientSidebar } from '@/components/communications/PatientSidebar';
import { MessageThread } from '@/components/communications/MessageThread';
import { EmptyState } from '@/components/communications/EmptyState';

export default function Communications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // UI State
  const [selectedPatientKey, setSelectedPatientKey] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composeMode, setComposeMode] = useState(null);
  const [filter, setFilter] = useState('outstanding');
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

  // Group invoices by patient
  const rawConversations = useCommunications(
    invoices,
    [...communicationMessages, ...ephemeralMessages],
    filter,
    searchQuery,
  );

  const patientConversations = useMemo(() => {
    const patientByName = new Map(
      (patients || []).map((p) => [String(p.name || '').trim().toLowerCase(), p]),
    );
    return rawConversations.map((conv) => {
      const p = patientByName.get(String(conv.patient_name || '').trim().toLowerCase());
      const messagingPhone =
        extractPhoneNumber(conv.patient_contact) ||
        extractPhoneNumber(p?.phone) ||
        extractPhoneNumber(p?.contact) ||
        null;
      const messagingEmail =
        extractEmailAddress(conv.patient_contact) ||
        extractEmailAddress(p?.contact) ||
        null;
      return {
        ...conv,
        messagingPhone,
        messagingEmail,
      };
    });
  }, [rawConversations, patients]);

  // Get selected patient
  const selectedPatient = useMemo(() => {
    return patientConversations.find(p => p.key === selectedPatientKey);
  }, [patientConversations, selectedPatientKey]);

  // Auto-select first patient on load
  React.useEffect(() => {
    if (!selectedPatientKey && patientConversations.length > 0) {
      setSelectedPatientKey(patientConversations[0].key);
    }
  }, [patientConversations, selectedPatientKey]);

  // === Communication Functions (same logic as original) ===

  const sendReminderSms = async (invoice) => {
    if (!looksLikePhone(invoice.patient_contact)) {
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
      await invoicesAPI.sendPaymentReminder(invoice.id, false);
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
    if (!looksLikeEmail(invoice.patient_contact)) {
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
      // Generate PDF if needed
      if (!invoice.invoice_pdf_url) {
        await invoicesAPI.generateInvoicePDF(invoice.id);
        await queryClient.refetchQueries({ queryKey: ['invoices'] });
      }

      // Get fresh invoice data
      const list = queryClient.getQueryData(['invoices']) || [];
      const invFresh = list.find((i) => i.id === invoice.id) || invoice;

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
    if (!looksLikePhone(invoice.patient_contact)) {
      toast({
        title: 'Phone number required',
        description: 'Patient contact must be a phone number to send SMS.',
        variant: 'destructive',
      });
      return;
    }

    setBusyInvoiceId(invoice.id);
    try {
      // Generate PDF if needed
      if (!invoice.invoice_pdf_url) {
        await invoicesAPI.generateInvoicePDF(invoice.id);
        await queryClient.refetchQueries({ queryKey: ['invoices'] });
      }

      // Get fresh invoice data
      const list = queryClient.getQueryData(['invoices']) || [];
      const invFresh = list.find((i) => i.id === invoice.id) || invoice;

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
    <div className="h-screen flex flex-col bg-white">
      {/* Mobile Header */}
      <div className="md:hidden border-b border-gray-200 p-4 flex items-center justify-between bg-white">
        <h1 className="text-lg font-semibold text-[#1a2845]">Messages</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(true)}
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
