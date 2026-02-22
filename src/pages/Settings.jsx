import React, { useState, useEffect } from "react";
import { api } from "@/api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Building2, User, Mail, Landmark } from "lucide-react";

export default function Settings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [clinicName, setClinicName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [sortCode, setSortCode] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);
      const userData = await api.auth.me();
      setUser(userData);
      setClinicName(userData.clinic_name || "OptiFinance");
      setBankName(userData.bank_name || "");
      setAccountNumber(userData.account_number || "");
      setSortCode(userData.sort_code || "");
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
      sort_code: sortCode
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
      </div>
    </div>
  );
}