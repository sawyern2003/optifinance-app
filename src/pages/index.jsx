import Layout from "./Layout.jsx";
import Auth from "./Auth.jsx";

import Catalog from "./Catalog";

import Catalogue from "./Catalogue";

import Consultant from "./Consultant";

import Dashboard from "./Dashboard";

import Home from "./Home";

import Invoices from "./Invoices";

import Pricing from "./Pricing";

import QuickAdd from "./QuickAdd";

import Records from "./Records";

import Reports from "./Reports";

import Settings from "./Settings";

import VoiceDiary from "./VoiceDiary";

import Checkout from "./Checkout";

import Billing from "./Billing";

import SubscriptionPricing from "./SubscriptionPricing";

import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';

const PAGES = {
    
    Catalog: Catalog,
    
    Catalogue: Catalogue,
    
    Consultant: Consultant,
    
    Dashboard: Dashboard,
    
    Home: Home,
    
    Invoices: Invoices,
    
    Pricing: Pricing,
    
    QuickAdd: QuickAdd,
    
    Records: Records,
    
    Reports: Reports,
    
    Settings: Settings,
    
    VoiceDiary: VoiceDiary,
    
    Checkout: Checkout,
    
    Billing: Billing,
    
    SubscriptionPricing: SubscriptionPricing,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Protected Route Component
function ProtectedRoute({ children }) {
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const [hasSubscription, setHasSubscription] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                setAuthenticated(!!session);

                if (session) {
                    // Check subscription status
                    try {
                        const { data: subscription } = await supabase
                            .from('subscriptions')
                            .select('status')
                            .eq('user_id', session.user.id)
                            .single();

                        const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
                        setHasSubscription(isActive);
                    } catch (error) {
                        // No subscription found or error
                        setHasSubscription(false);
                    }
                }
            } catch (error) {
                console.error('Auth check error:', error);
                setAuthenticated(false);
                setHasSubscription(false);
            } finally {
                setLoading(false);
            }
        };

        checkAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setAuthenticated(!!session);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #fafbfc 0%, #f5f6f8 100%)'}}>
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-[#1a2845] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (!authenticated) {
        return <Navigate to="/auth" replace />;
    }

    // Subscription required: redirect to pricing if no active subscription
    const allowedPaths = ['/Billing', '/Checkout', '/SubscriptionPricing'];
    const currentPath = location.pathname;
    const isAllowedPath = allowedPaths.some(path => currentPath.includes(path));
    if (!isAllowedPath && !hasSubscription) {
        return <Navigate to="/SubscriptionPricing" replace />;
    }

    return children;
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/*" element={
                <ProtectedRoute>
                    <Layout currentPageName={currentPage}>
                        <Routes>
                            <Route path="/" element={<Catalog />} />
                            <Route path="/Catalog" element={<Catalog />} />
                            <Route path="/Catalogue" element={<Catalogue />} />
                            <Route path="/Consultant" element={<Consultant />} />
                            <Route path="/Dashboard" element={<Dashboard />} />
                            <Route path="/Home" element={<Home />} />
                            <Route path="/Invoices" element={<Invoices />} />
                            <Route path="/Pricing" element={<Pricing />} />
                            <Route path="/QuickAdd" element={<QuickAdd />} />
                            <Route path="/VoiceDiary" element={<VoiceDiary />} />
                            <Route path="/Records" element={<Records />} />
                            <Route path="/Checkout" element={<Checkout />} />
                            <Route path="/Billing" element={<Billing />} />
                            <Route path="/SubscriptionPricing" element={<SubscriptionPricing />} />
                            <Route path="/Reports" element={<Reports />} />
                            <Route path="/Settings" element={<Settings />} />
                        </Routes>
                    </Layout>
                </ProtectedRoute>
            } />
        </Routes>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}