
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Plus, FileText, BarChart3, Settings, LogOut, TrendingUp, FileCheck, MessageSquare, CircleDot } from "lucide-react";
import { api } from "@/api/api";

const navigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
  },
  {
    title: "Consultant",
    url: createPageUrl("Consultant"),
    icon: MessageSquare,
  },
  {
    title: "Quick Add",
    url: createPageUrl("QuickAdd"),
    icon: Plus,
  },
  {
    title: "Voice Diary",
    url: createPageUrl("VoiceDiary"),
    icon: CircleDot,
  },
  {
    title: "Records",
    url: createPageUrl("Records"),
    icon: FileText,
  },
  {
    title: "Invoices",
    url: createPageUrl("Invoices"),
    icon: FileCheck,
  },
  {
    title: "Pricing",
    url: createPageUrl("Pricing"),
    icon: TrendingUp,
  },
  {
    title: "Reports",
    url: createPageUrl("Reports"),
    icon: BarChart3,
  },
  {
    title: "Catalogue",
    url: createPageUrl("Catalogue"),
    icon: Settings,
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [clinicName, setClinicName] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await api.auth.me();
        if (user?.clinic_name) {
          setClinicName(user.clinic_name);
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };
    fetchUser();
  }, []);

  const handleLogout = () => {
    api.auth.logout();
  };

  return (
    <>
      <style>{`
        :root {
          --background: 250 248 255;
          --foreground: 30 27 47;
          --card: 255 255 255;
          --card-foreground: 30 27 47;
          --primary: 139 92 246;
          --primary-foreground: 255 255 255;
          --secondary: 251 245 255;
          --secondary-foreground: 107 70 193;
          --muted: 248 243 255;
          --muted-foreground: 124 94 181;
          --accent: 168 85 247;
          --accent-foreground: 255 255 255;
          --border: 233 213 255;
          --input: 233 213 255;
          --ring: 139 92 246;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Inter', system-ui, sans-serif;
          background: linear-gradient(135deg, #fafbfc 0%, #f5f6f8 100%);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        input,
        textarea,
        select,
        input[type="date"],
        input[type="text"],
        input[type="number"],
        button[role="combobox"],
        [role="combobox"] {
          color: #1e1b2f !important;
        }
        
        input::placeholder,
        textarea::placeholder {
          color: #8a7b9a !important;
        }
        
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5) hue-rotate(30deg);
        }
        
        [role="combobox"] > span {
          color: #1e1b2f !important;
        }
        
        [role="option"] {
          color: #1e1b2f !important;
        }
        
        button:focus,
        button:active,
        button:focus-visible,
        a:focus,
        a:active,
        a:focus-visible,
        input:focus,
        input:active,
        textarea:focus,
        textarea:active,
        select:focus,
        select:active {
          outline: none !important;
          box-shadow: none !important;
        }
        
        button:focus-visible {
          box-shadow: 0 0 0 3px rgba(212, 167, 64, 0.3) !important;
        }
        
        input:focus-visible,
        textarea:focus-visible,
        select:focus-visible {
          box-shadow: 0 0 0 3px rgba(212, 167, 64, 0.2) !important;
          border-color: #d4a740 !important;
        }
        
        * {
          -webkit-tap-highlight-color: transparent;
        }
        
        .focus\:ring-2:focus,
        .focus-visible\:ring-2:focus-visible {
          --tw-ring-color: #d4a740 !important;
        }
      `}</style>
      <div className="min-h-screen flex w-full" style={{background: 'linear-gradient(135deg, #fafbfc 0%, #f5f6f8 100%)'}}>
        {/* Sidebar */}
        <div className="hidden md:flex md:w-64 md:flex-col fixed inset-y-0 z-50 bg-white/95 backdrop-blur-xl border-r border-[#f0e9d8]/50">
          <div className="flex flex-col items-center px-6 py-6 border-b border-[#f0e9d8]/50">
            <img
              src="/logo.png"
              alt="OptiFinance Logo"
              className="w-24 h-24 object-contain mb-0.5"
            />
            <p className="text-[10px] text-[#d4a740] font-light text-center">{clinicName || "Your Clinic"}</p>
          </div>
          
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigationItems.map((item) => {
              const isActive = location.pathname === item.url;
              return (
                <Link
                  key={item.title}
                  to={item.url}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-light transition-all duration-300 ${
                    isActive
                      ? 'bg-[#1a2845] text-white'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-[#1a2845]'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-[#f0e9d8]/50 p-4 space-y-1">
            <Link
              to={createPageUrl("Settings")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 text-gray-700 hover:text-[#1a2845] transition-all duration-300 text-sm font-light ${
                location.pathname === createPageUrl("Settings") ? 'bg-gray-50 text-[#1a2845]' : ''
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 text-gray-700 hover:text-red-600 transition-all duration-300 w-full text-sm font-light text-left"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        <main className="flex-1 md:pl-64">
          <header className="md:hidden bg-white/95 backdrop-blur-xl border-b border-[#f0e9d8]/50 px-4 py-4 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="OptiFinance Logo"
                className="w-16 h-16 object-contain"
              />
              {clinicName && <p className="text-[10px] text-[#d4a740] font-light">{clinicName}</p>}
            </div>
          </header>

          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-[#f0e9d8]/50 z-50">
            <div className="grid grid-cols-5 gap-1 px-2 py-2">
              {navigationItems.slice(0, 5).map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <Link
                    key={item.title}
                    to={item.url}
                    className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-light transition-all duration-300 ${
                      isActive
                        ? 'bg-[#1a2845] text-white'
                        : 'text-gray-600 hover:text-[#1a2845]'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="pb-20 md:pb-0">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
