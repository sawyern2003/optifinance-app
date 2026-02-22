import React, { useState } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Download, Trash2, Search, Mail, Loader2, Pencil, MessageSquare, Send } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { invoicesAPI } from "@/api/invoices";

export default function Invoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sendingEmail, setSendingEmail] = useState(null);
  const [sendingReminder, setSendingReminder] = useState(null);
  const [sendingInvoice, setSendingInvoice] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);

  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.entities.Invoice.list('-created_date'),
    initialData: [],
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.auth.me(),
    initialData: null,
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Invoice.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({
        title: "Invoice updated",
        className: "bg-green-50 border-green-200"
      });
      setEditDialogOpen(false);
      setEditingInvoice(null);
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id) => api.entities.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({
        title: "Invoice deleted",
        className: "bg-red-50 border-red-200"
      });
      setDeleteConfirmOpen(false);
      setInvoiceToDelete(null);
    },
  });

  const handleDeleteClick = (invoice) => {
    setInvoiceToDelete(invoice);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (invoiceToDelete) {
      deleteInvoiceMutation.mutate(invoiceToDelete.id);
    }
  };

  const openEditDialog = (invoice) => {
    setEditingInvoice(invoice);
    setEditForm({
      invoice_number: invoice.invoice_number,
      patient_name: invoice.patient_name,
      patient_contact: invoice.patient_contact || '',
      treatment_name: invoice.treatment_name,
      amount: invoice.amount,
      treatment_date: format(new Date(invoice.treatment_date), 'yyyy-MM-dd'),
      issue_date: format(new Date(invoice.issue_date), 'yyyy-MM-dd'),
      notes: invoice.notes || ''
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    
    updateInvoiceMutation.mutate({
      id: editingInvoice.id,
      data: {
        ...editingInvoice,
        invoice_number: editForm.invoice_number,
        patient_name: editForm.patient_name,
        patient_contact: editForm.patient_contact,
        treatment_name: editForm.treatment_name,
        amount: parseFloat(editForm.amount),
        treatment_date: editForm.treatment_date,
        issue_date: editForm.issue_date,
        notes: editForm.notes
      }
    });
  };

  const sendPaymentReminder = async (invoice) => {
    if (!invoice.patient_contact) {
      toast({
        title: "Cannot send reminder",
        description: "Patient contact information not found",
        className: "bg-red-50 border-red-200"
      });
      return;
    }

    setSendingReminder(invoice.id);
    
    try {
      await invoicesAPI.sendPaymentReminder(invoice.id, false);
      
      toast({
        title: "Reminder sent",
        description: `Payment reminder sent to ${invoice.patient_name}`,
        className: "bg-green-50 border-green-200"
      });

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (error) {
      console.error('Failed to send reminder:', error);
      toast({
        title: "Failed to send",
        description: error.message || "Could not send payment reminder",
        className: "bg-red-50 border-red-200"
      });
    }
    
    setSendingReminder(null);
  };

  const sendInvoice = async (invoice, sendVia = 'both') => {
    setSendingInvoice(invoice.id);
    
    try {
      // First generate PDF if not exists
      if (!invoice.invoice_pdf_url) {
        await invoicesAPI.generateInvoicePDF(invoice.id);
        // Refresh invoice data
        await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }

      // Then send invoice
      await invoicesAPI.sendInvoice(invoice.id, sendVia);
      
      toast({
        title: "Invoice sent",
        description: `Invoice sent via ${sendVia === 'both' ? 'SMS and email' : sendVia}`,
        className: "bg-green-50 border-green-200"
      });

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (error) {
      console.error('Failed to send invoice:', error);
      toast({
        title: "Failed to send",
        description: error.message || "Could not send invoice",
        className: "bg-red-50 border-red-200"
      });
    }
    
    setSendingInvoice(null);
  };

  const sendInvoiceEmail = async (invoice) => {
    if (!invoice.patient_contact || !invoice.patient_contact.includes('@')) {
      toast({
        title: "Cannot send email",
        description: "Patient doesn't have a valid email address",
        className: "bg-red-50 border-red-200"
      });
      return;
    }

    setSendingEmail(invoice.id);
    
    try {
      const clinicName = user?.clinic_name || 'OptiFinance Clinic';
      
      await api.integrations.Core.SendEmail({
        from_name: clinicName,
        to: invoice.patient_contact,
        subject: `Invoice ${invoice.invoice_number} from ${clinicName}`,
        body: `
Dear ${invoice.patient_name},

Please find your invoice details below:

Invoice Number: ${invoice.invoice_number}
Treatment: ${invoice.treatment_name}
Treatment Date: ${format(new Date(invoice.treatment_date), 'dd MMMM yyyy')}
Amount: £${invoice.amount.toFixed(2)}
Issue Date: ${format(new Date(invoice.issue_date), 'dd MMMM yyyy')}

${invoice.notes ? `\nNotes:\n${invoice.notes}\n` : ''}

${invoice.invoice_pdf_url ? `\nYou can view and download your invoice here:\n${invoice.invoice_pdf_url}\n` : ''}

Thank you for your business!

Best regards,
${clinicName}
        `
      });
      
      // Update invoice status to sent
      await updateInvoiceMutation.mutateAsync({
        id: invoice.id,
        data: { ...invoice, status: 'sent' }
      });
      
      toast({
        title: "Invoice sent",
        description: `Invoice sent to ${invoice.patient_contact}`,
        className: "bg-green-50 border-green-200"
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      toast({
        title: "Failed to send",
        description: "Could not send invoice email",
        className: "bg-red-50 border-red-200"
      });
    }
    
    setSendingEmail(null);
  };

  const updateStatus = (invoice, newStatus) => {
    updateInvoiceMutation.mutate({
      id: invoice.id,
      data: { ...invoice, status: newStatus }
    });
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.treatment_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status) => {
    switch(status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'paid': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Invoices</h1>
            <p className="text-sm text-gray-500 font-light">View and manage generated invoices</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-xl border-gray-300 h-11"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-48 rounded-xl border-gray-300 h-11">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Invoices List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loadingInvoices ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
              <p className="text-gray-500">Loading invoices...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">No invoices found</p>
              <p className="text-sm text-gray-400">Generate invoices from the Records page</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Invoice #</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Treatment</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Treatment Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{invoice.invoice_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{invoice.patient_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{invoice.treatment_name}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">£{invoice.amount?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{format(new Date(invoice.treatment_date), 'dd MMM yyyy')}</td>
                      <td className="px-6 py-4">
                        <select
                          value={invoice.status}
                          onChange={(e) => updateStatus(invoice, e.target.value)}
                          className={`text-xs font-medium px-3 py-1 rounded-full border-0 focus:ring-2 focus:ring-offset-0 ${getStatusColor(invoice.status)}`}
                        >
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditDialog(invoice)}
                            className="p-2 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit Invoice"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {invoice.invoice_pdf_url && (
                            <button
                              onClick={() => window.open(invoice.invoice_pdf_url, '_blank')}
                              className="p-2 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600 transition-colors"
                              title="View/Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => sendPaymentReminder(invoice)}
                            disabled={sendingReminder === invoice.id || !invoice.patient_contact}
                            className="p-2 hover:bg-purple-50 rounded-lg text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-50"
                            title="Send Payment Reminder (SMS)"
                          >
                            {sendingReminder === invoice.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <MessageSquare className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => sendInvoice(invoice, 'both')}
                            disabled={sendingInvoice === invoice.id || !invoice.patient_contact}
                            className="p-2 hover:bg-orange-50 rounded-lg text-gray-400 hover:text-orange-600 transition-colors disabled:opacity-50"
                            title="Send Invoice (SMS & Email)"
                          >
                            {sendingInvoice === invoice.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteClick(invoice)}
                            className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Invoice Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Edit Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-5 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="invoice_number" className="text-sm font-medium text-gray-700">Invoice Number *</Label>
                  <Input
                    id="invoice_number"
                    value={editForm.invoice_number}
                    onChange={(e) => setEditForm({...editForm, invoice_number: e.target.value})}
                    placeholder="INV-202501-0001"
                    className="rounded-xl border-gray-300 h-11"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="patient_name" className="text-sm font-medium text-gray-700">Patient Name *</Label>
                  <Input
                    id="patient_name"
                    value={editForm.patient_name}
                    onChange={(e) => setEditForm({...editForm, patient_name: e.target.value})}
                    placeholder="Patient name"
                    className="rounded-xl border-gray-300 h-11"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="patient_contact" className="text-sm font-medium text-gray-700">Patient Contact</Label>
                  <Input
                    id="patient_contact"
                    value={editForm.patient_contact}
                    onChange={(e) => setEditForm({...editForm, patient_contact: e.target.value})}
                    placeholder="Email or phone"
                    className="rounded-xl border-gray-300 h-11"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="treatment_name" className="text-sm font-medium text-gray-700">Treatment *</Label>
                  <Input
                    id="treatment_name"
                    value={editForm.treatment_name}
                    onChange={(e) => setEditForm({...editForm, treatment_name: e.target.value})}
                    placeholder="Treatment name"
                    className="rounded-xl border-gray-300 h-11"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm font-medium text-gray-700">Amount (£) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                    placeholder="0.00"
                    className="rounded-xl border-gray-300 h-11"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="treatment_date" className="text-sm font-medium text-gray-700">Treatment Date *</Label>
                  <Input
                    id="treatment_date"
                    type="date"
                    value={editForm.treatment_date}
                    onChange={(e) => setEditForm({...editForm, treatment_date: e.target.value})}
                    className="rounded-xl border-gray-300 h-11"
                    required
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="issue_date" className="text-sm font-medium text-gray-700">Issue Date *</Label>
                  <Input
                    id="issue_date"
                    type="date"
                    value={editForm.issue_date}
                    onChange={(e) => setEditForm({...editForm, issue_date: e.target.value})}
                    className="rounded-xl border-gray-300 h-11"
                    required
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="notes" className="text-sm font-medium text-gray-700">Notes</Label>
                  <Textarea
                    id="notes"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                    placeholder="Additional notes..."
                    className="rounded-xl border-gray-300"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  className="flex-1 rounded-xl border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl"
                  disabled={updateInvoiceMutation.isPending}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <Trash2 className="w-6 h-6 text-red-600" />
                Confirm Deletion
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-gray-700">
                Are you sure you want to delete this invoice?
              </p>
              {invoiceToDelete && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Invoice #: <span className="font-semibold text-gray-900">{invoiceToDelete.invoice_number}</span></p>
                  <p className="text-sm text-gray-600">Patient: <span className="font-semibold text-gray-900">{invoiceToDelete.patient_name}</span></p>
                  <p className="text-sm text-gray-600">Amount: <span className="font-semibold text-gray-900">£{invoiceToDelete.amount?.toFixed(2)}</span></p>
                </div>
              )}
              <p className="text-sm text-red-600 font-medium">This action cannot be undone.</p>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="flex-1 rounded-xl border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl"
                >
                  Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}