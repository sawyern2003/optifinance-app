import React, { useState, useEffect } from "react";
import { api } from "@/api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Building2, User, Mail, Landmark, Image } from "lucide-react";
import { BookingSettings } from "@/components/settings/BookingSettings";

export default function Settings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [clinicName, setClinicName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [invoiceSenderName, setInvoiceSenderName] = useState("");
  const [invoiceFromEmail, setInvoiceFromEmail] = useState("");
  const [invoiceReplyToEmail, setInvoiceReplyToEmail] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);
      const userData = await api.auth.me();
      setUser(userData);
      setClinicName(userData.clinic_name || "OptiFinance");
      setBankName(userData.bank_name || "");
      setAccountNumber(userData.account_number || "");
      setSortCode(userData.sort_code || "");
      setLogoUrl(userData.logo_url || "");
      setBusinessAddress(userData.business_address || "");
      setInvoiceSenderName(userData.invoice_sender_name || "");
      setInvoiceFromEmail(userData.invoice_from_email || "");
      setInvoiceReplyToEmail(userData.invoice_reply_to_email || "");
      setIsLoading(false);
    };
    fetchUser();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    await api.auth.updateMe({ 
      clinic_name: clinicName,
      bank_name: bankName,
      account_number: accountNumber,
      sort_code: sortCode,
      logo_url: logoUrl || null,
      business_address: businessAddress || null,
      invoice_sender_name: invoiceSenderName.trim() || null,
      invoice_from_email: invoiceFromEmail.trim() || null,
      invoice_reply_to_email: invoiceReplyToEmail.trim() || null,
    });
    
    toast({
      title: "Settings saved",
      description: "Your clinic settings have been updated",
      className: "bg-green-50 border-green-200"
    });
    
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Settings</h1>
          <p className="text-sm text-gray-500 font-light">Manage your account and clinic information</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <form onSubmit={handleSave} className="space-y-8">
            {/* Profile Information */}
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Profile Information</h2>
              <div className="space-y-4 bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Email</p>
                    <p className="text-sm font-medium text-gray-900">{user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Name</p>
                    <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Clinic Settings */}
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Clinic Settings</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clinic-name" className="text-sm font-medium text-gray-700">
                    Clinic Name
                  </Label>
                  <Input
                    id="clinic-name"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="Enter your clinic name"
                    className="rounded-xl border-gray-300 h-11"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    This name will appear in the sidebar and throughout the app
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logo-url" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Logo URL (for invoice PDFs)
                  </Label>
                  <Input
                    id="logo-url"
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://… (PNG or JPG, public URL)"
                    className="rounded-xl border-gray-300 h-11"
                  />
                  <p className="text-xs text-gray-500">
                    Optional. A public image URL (e.g. from Supabase Storage) — appears on generated invoice PDFs.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-address" className="text-sm font-medium text-gray-700">
                    Business Address (for invoice PDFs)
                  </Label>
                  <Textarea
                    id="business-address"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    placeholder={"e.g. 10 High Street\nLondon\nSW1A 1AA"}
                    className="rounded-xl border-gray-300 min-h-[96px]"
                  />
                </div>
              </div>
            </div>

            {/* Invoice emails (per clinic) */}
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
                Invoice emails
              </h2>
              <div className="space-y-4 bg-amber-50/60 border border-amber-100 rounded-xl p-4">
                {import.meta.env.VITE_INVOICE_SEND_DOMAIN ? (
                  <>
                    <p className="text-xs text-amber-950/80 leading-relaxed">
                      <strong>Platform send address.</strong> Invoices go out from a unique address at{" "}
                      <code className="bg-white/80 px-1 rounded">
                        @{import.meta.env.VITE_INVOICE_SEND_DOMAIN}
                      </code>{" "}
                      (you verify that domain <strong>once</strong> in SendGrid). Patients still see{" "}
                      <strong>your clinician name</strong> and <strong>clinic name</strong> in their inbox;{" "}
                      <strong>replies</strong> go to your reply-to or login email — like Wix-style routing.
                    </p>
                    <div className="rounded-lg border border-amber-200/80 bg-white/90 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-900/70">
                        Your send-from address
                      </p>
                      <p className="text-sm font-mono text-[#1a2845] break-all mt-1">
                        {user?.invoice_send_slug
                          ? `${user.invoice_send_slug}@${import.meta.env.VITE_INVOICE_SEND_DOMAIN}`
                          : `(e.g. your-clinic-name-xxxxxxxxx@${import.meta.env.VITE_INVOICE_SEND_DOMAIN} — saved when you first send an invoice)`}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-amber-950/80 leading-relaxed">
                    <strong>Custom domain mode.</strong> Set <code className="bg-white/80 px-1 rounded">VITE_INVOICE_SEND_DOMAIN</code> in
                    your app env and <code className="bg-white/80 px-1 rounded">INVOICE_SEND_DOMAIN</code> in Supabase for automatic{" "}
                    <code className="bg-white/80 px-1 rounded">slug@mail.yourbrand.com</code> addresses. Otherwise use{" "}
                    <strong>Clinic send-from</strong> below (must be verified in SendGrid).
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="invoice-sender-name" className="text-sm font-medium text-gray-700">
                    Clinician name (inbox display name)
                  </Label>
                  <Input
                    id="invoice-sender-name"
                    type="text"
                    value={invoiceSenderName}
                    onChange={(e) => setInvoiceSenderName(e.target.value)}
                    placeholder='e.g. Dr Jane Smith'
                    className="rounded-xl border-gray-300 h-11"
                  />
                  <p className="text-xs text-gray-500">
                    Shown as the sender <strong>name</strong> in Gmail (e.g. Oxford Wellness). If empty,{" "}
                    <strong>Clinic name</strong> is used.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoice-reply-to" className="text-sm font-medium text-gray-700">
                    Reply-to email (recommended)
                  </Label>
                  <Input
                    id="invoice-reply-to"
                    type="email"
                    value={invoiceReplyToEmail}
                    onChange={(e) => setInvoiceReplyToEmail(e.target.value)}
                    placeholder={`Your real inbox${user?.email ? ` (default: ${user.email})` : ""}`}
                    className="rounded-xl border-gray-300 h-11"
                  />
                  <p className="text-xs text-gray-500">
                    Patient <strong>Reply</strong> goes here (e.g. your real clinic or personal email).
                  </p>
                </div>
                <div className="space-y-2 pt-2 border-t border-amber-200/60">
                  <Label htmlFor="invoice-from-email" className="text-sm font-medium text-gray-700">
                    Custom send-from email (advanced, optional)
                  </Label>
                  <Input
                    id="invoice-from-email"
                    type="email"
                    value={invoiceFromEmail}
                    onChange={(e) => setInvoiceFromEmail(e.target.value)}
                    placeholder="Only if not using platform domain above"
                    className="rounded-xl border-gray-300 h-11"
                  />
                  <p className="text-xs text-gray-500">
                    Leave blank when using <strong>INVOICE_SEND_DOMAIN</strong>. Fill only if you run without
                    platform mail and send from your own verified address (e.g.{" "}
                    <code className="bg-white/80 px-1 rounded">info@yourclinic.com</code>).
                  </p>
                </div>
              </div>
            </div>

            {/* Bank Details */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Landmark className="w-5 h-5" />
                Bank Details
              </h2>
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <p className="text-sm text-blue-900">
                    These details will be included in invoice SMS messages so patients can pay via bank transfer
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="bank-name" className="text-sm font-medium text-gray-700">
                    Bank Name
                  </Label>
                  <Input
                    id="bank-name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Barclays, HSBC, Lloyds"
                    className="rounded-xl border-gray-300 h-11"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sort-code" className="text-sm font-medium text-gray-700">
                      Sort Code
                    </Label>
                    <Input
                      id="sort-code"
                      value={sortCode}
                      onChange={(e) => setSortCode(e.target.value)}
                      placeholder="12-34-56"
                      className="rounded-xl border-gray-300 h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account-number" className="text-sm font-medium text-gray-700">
                      Account Number
                    </Label>
                    <Input
                      id="account-number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="12345678"
                      className="rounded-xl border-gray-300 h-11"
                    />
                  </div>
                </div>
              </div>
            </div>



            <div className="pt-4">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-[#2C3E50] hover:bg-[#34495E] rounded-xl h-11 px-8"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Online Booking Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mt-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-[#1a2845] mb-2">Online Booking</h1>
            <p className="text-sm text-gray-500 font-light">
              Allow patients to book appointments online via your personal booking page
            </p>
          </div>
          <BookingSettings />
        </div>
      </div>
    </div>
  );
}