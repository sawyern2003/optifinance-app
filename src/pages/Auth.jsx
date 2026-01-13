import React, { useState } from "react";
import { supabase } from "@/config/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Mail, Lock, Building2 } from "lucide-react";

export default function Auth() {
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clinicName, setClinicName] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        // Sign in
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: "Welcome back!",
          description: "You've successfully signed in.",
          className: "bg-green-50 border-green-200",
        });

        // Redirect to home page
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } else {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              clinic_name: clinicName || "My Clinic",
            },
          },
        });

        if (error) throw error;

        // Create profile
        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              clinic_name: clinicName || "My Clinic",
            });

          if (profileError) {
            console.error("Profile creation error:", profileError);
            // Don't throw - profile might already exist or will be created later
          }
        }

        toast({
          title: "Account created!",
          description: "Please check your email to verify your account.",
          className: "bg-blue-50 border-blue-200",
        });

        // Switch to login mode
        setIsLogin(true);
        setClinicName("");
      }
    } catch (error) {
      console.error("Auth error:", error);
      toast({
        title: "Error",
        description: error.message || "An error occurred. Please try again.",
        className: "bg-red-50 border-red-200",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background: 'linear-gradient(135deg, #fafbfc 0%, #f5f6f8 100%)'}}>
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690c8679071d7faff17b5647/380fb76f3_LogoMakr-9V1my7-300dpi1.png"
              alt="OptiFinance Logo"
              className="w-20 h-20 object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-4xl font-bold text-[#1a2845] mb-2">
            OptiFinance
          </h1>
          <p className="text-gray-600">
            {isLogin ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-[#f0e9d8] p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="clinic-name" className="text-sm font-medium text-gray-700">
                  Clinic Name
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="clinic-name"
                    type="text"
                    placeholder="Enter your clinic name"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    className="pl-10 rounded-xl border-gray-300 h-11"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 rounded-xl border-gray-300 h-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 rounded-xl border-gray-300 h-11"
                  required
                  minLength={6}
                />
              </div>
              {!isLogin && (
                <p className="text-xs text-gray-500">
                  Password must be at least 6 characters
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#1a2845] to-[#2a3f5f] hover:from-[#0f1829] hover:to-[#1a2845] text-white rounded-xl h-11 shadow-lg shadow-[#1a2845]/30 border-t-2 border-[#d4a740]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {isLogin ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                isLogin ? "Sign In" : "Sign Up"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setEmail("");
                setPassword("");
                setClinicName("");
              }}
              className="text-sm text-[#1a2845] hover:text-[#d4a740] font-medium"
            >
              {isLogin ? (
                <>Don't have an account? <span className="underline">Sign up</span></>
              ) : (
                <>Already have an account? <span className="underline">Sign in</span></>
              )}
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
          <p className="font-medium mb-1">💡 Note:</p>
          <p>If you just signed up, check your email to verify your account before signing in.</p>
        </div>
      </div>
    </div>
  );
}
