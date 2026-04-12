import React, { useState, useEffect } from "react";
import { api } from "@/api/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Banknote, TrendingDown, Wallet, Download, Hourglass, CheckCircle, FileText, TrendingUp, Lightbulb, LayoutGrid, Sparkles } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, addMonths } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { parseRecordDate } from "@/lib/parseRecordDate";

import StatCard from "../components/dashboard/StatCard";
import MonthlyChart from "../components/dashboard/MonthlyChart";
import CategoryBreakdown from "../components/dashboard/CategoryBreakdown";
import CashFlowChart from "../components/dashboard/CashFlowChart";

export default function Dashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRangePreset, setDateRangePreset] = useState('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [hasGeneratedRecurring, setHasGeneratedRecurring] = useState(false);

  const queryClient = useQueryClient();


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

  const { data: treatments, isLoading: loadingTreatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.entities.Expense.list('-date'),
    initialData: [],
  });

  const { data: recurringExpenses } = useQuery({
    queryKey: ['recurringExpenses'],
    queryFn: () => api.entities.Expense.filter({ is_recurring: true, is_active: true }, '-created_date'),
    initialData: [],
  });

  const { data: treatmentCatalog } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => api.entities.TreatmentCatalog.list(),
    initialData: [],
  });


  useEffect(() => {
    const generateRecurringExpenses = async () => {
      if (hasGeneratedRecurring || !recurringExpenses || recurringExpenses.length === 0) return;
      
      const today = new Date();
      const currentMonth = format(today, 'yyyy-MM');
      
      for (const recurring of recurringExpenses) {
        try {
          const lastGenerated = recurring.last_generated_date ? new Date(recurring.last_generated_date) : null;
          let shouldGenerate = false;
          let newDate = format(today, 'yyyy-MM-dd');

          if (recurring.recurrence_frequency === 'monthly') {
            const lastGeneratedMonth = lastGenerated ? format(lastGenerated, 'yyyy-MM') : null;
            shouldGenerate = lastGeneratedMonth !== currentMonth;
            newDate = format(startOfMonth(today), 'yyyy-MM-dd');
          } else if (recurring.recurrence_frequency === 'weekly') {
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(today.getDate() - 7);
            
            shouldGenerate = !lastGenerated || lastGenerated.getTime() <= sevenDaysAgo.getTime();
            newDate = format(today, 'yyyy-MM-dd');
          } else if (recurring.recurrence_frequency === 'yearly') {
            const lastGeneratedYear = lastGenerated ? format(lastGenerated, 'yyyy') : null;
            const currentYear = format(today, 'yyyy');
            shouldGenerate = lastGeneratedYear !== currentYear;
            newDate = format(startOfYear(today), 'yyyy-MM-dd');
          }
          
          if (shouldGenerate) {
            await api.entities.Expense.create({
              date: newDate,
              category: recurring.category,
              amount: recurring.amount,
              notes: `${recurring.notes || ''} (Auto-generated)`.trim(),
              is_recurring: false,
              is_auto_generated: true
            });
            
            await api.entities.Expense.update(recurring.id, {
              ...recurring,
              last_generated_date: newDate
            });
          }
        } catch (error) {
          console.error('Error generating recurring expense:', error);
        }
      }
      
      setHasGeneratedRecurring(true);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['recurringExpenses'] });
    };
    
    generateRecurringExpenses();
  }, [recurringExpenses, hasGeneratedRecurring, queryClient]);


  const calculateOptimizerMetrics = () => {
    const metrics = treatmentCatalog.map(treatment => {
      const treatmentEntries = treatments.filter(t => t.treatment_name === treatment.treatment_name);
      const count = treatmentEntries.length;
      const totalRevenue = treatmentEntries.reduce((sum, t) => sum + (t.amount_paid || 0), 0);
      const revenuePerMinute = treatment.duration_minutes
        ? treatment.default_price / treatment.duration_minutes
        : 0;
      const margin = treatment.typical_product_cost
        ? ((treatment.default_price - treatment.typical_product_cost) / treatment.default_price * 100)
        : 100;

      return {
        ...treatment,
        count,
        totalRevenue,
        revenuePerMinute,
        margin,
        priorityScore: (revenuePerMinute * 0.4) + (count * 0.3) + (margin * 0.3)
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);

    return metrics;
  };


  const getDateRange = () => {
    const now = new Date();
    switch(dateRangePreset) {
      case 'this-month':
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
      case 'last-month':
        const lastMonth = subMonths(now, 1);
        return {
          start: startOfMonth(lastMonth),
          end: endOfMonth(lastMonth)
        };
      case 'last-3-months':
        return {
          start: startOfMonth(subMonths(now, 2)),
          end: endOfMonth(now)
        };
      case 'last-6-months':
        return {
          start: startOfMonth(subMonths(now, 5)),
          end: endOfMonth(now)
        };
      case 'year-to-date':
        return {
          start: startOfYear(now),
          end: now
        };
      case 'custom':
        // Default to start/end of current month if custom dates are not set
        return {
          start: customStartDate ? new Date(customStartDate) : startOfMonth(now),
          end: customEndDate ? new Date(customEndDate) : endOfMonth(now)
        };
      case 'all-time':
        // For 'all-time', we return null for start/end to indicate no date filter
        return { start: null, end: null }; 
      default: // Fallback to this month if preset is somehow invalid
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
    }
  };

  // NEW: Calculate ALL TIME outstanding payments (not filtered by date range)
  const getAllTimeOutstanding = () => {
    return treatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum + (t.price_paid || 0);
      if (t.payment_status === 'partially_paid') return sum + ((t.price_paid || 0) - (t.amount_paid || 0));
      return sum;
    }, 0);
  };

  const getCurrentMonthStats = () => {
    const { start: startDate, end: endDate } = getDateRange();
    
    // Inline date filtering
    const thisPeriodTreatments = treatments.filter((item) => {
      const itemDate = parseRecordDate(item.date);
      if (!itemDate) return false;
      return (startDate === null || itemDate >= startDate) && (endDate === null || itemDate <= endDate);
    });

    const thisPeriodExpenses = expenses.filter((item) => {
      const itemDate = parseRecordDate(item.date);
      if (!itemDate) return false;
      return (startDate === null || itemDate >= startDate) && (endDate === null || itemDate <= endDate);
    });
    
    const revenue = thisPeriodTreatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum;
      return sum + (t.amount_paid || t.price_paid || 0);
    }, 0);
    
    const costs = thisPeriodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0) + 
                  thisPeriodTreatments.reduce((sum, t) => sum + (t.product_cost || 0), 0);
    const profit = revenue - costs;
    
    const outstanding = thisPeriodTreatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum + (t.price_paid || 0);
      if (t.payment_status === 'partially_paid') return sum + ((t.price_paid || 0) - (t.amount_paid || 0));
      return sum;
    }, 0);
    
    return { revenue, costs, profit, outstanding };
  };

  const getLastMonthStats = () => {
    const { start: currentStart, end: currentEnd } = getDateRange();

    // If 'all-time' or an invalid range (i.e., getDateRange() returned null for any reason), return zero for last period stats
    if (currentStart === null && currentEnd === null) {
      return { revenue: 0, costs: 0, profit: 0 }; 
    }
    
    // Calculate the equivalent previous period
    const daysDiff = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
    
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - daysDiff + 1);
    
    // Inline date filtering for previous period
    const lastPeriodTreatments = treatments.filter((item) => {
      const itemDate = parseRecordDate(item.date);
      if (!itemDate) return false;
      return itemDate >= previousStart && itemDate <= previousEnd;
    });

    const lastPeriodExpenses = expenses.filter((item) => {
      const itemDate = parseRecordDate(item.date);
      if (!itemDate) return false;
      return itemDate >= previousStart && itemDate <= previousEnd;
    });
    
    const revenue = lastPeriodTreatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum;
      return sum + (t.amount_paid || t.price_paid || 0);
    }, 0);
    
    const costs = lastPeriodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0) + 
                  lastPeriodTreatments.reduce((sum, t) => sum + (t.product_cost || 0), 0);
    const profit = revenue - costs;
    
    return { revenue, costs, profit };
  };

  const getMonthlyData = () => {
    let { start: rangeStartDate, end: rangeEndDate } = getDateRange();
    const months = [];
    
    // If 'all-time', determine the actual min/max dates from data
    if (rangeStartDate === null && rangeEndDate === null) {
        const allItemDates = [
            ...treatments.map((t) => parseRecordDate(t.date)),
            ...expenses.map((e) => parseRecordDate(e.date)),
        ].filter((d) => d && !isNaN(d.getTime()));

        if (allItemDates.length === 0) return []; // No data

        rangeStartDate = startOfMonth(new Date(Math.min(...allItemDates)));
        rangeEndDate = endOfMonth(new Date(Math.max(...allItemDates)));
    } else {
        // Ensure valid date objects are snapped to month boundaries for chart aggregation.
        rangeStartDate = startOfMonth(rangeStartDate);
        rangeEndDate = endOfMonth(rangeEndDate);
    }

    let currentMonth = rangeStartDate;

    while (currentMonth <= rangeEndDate) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const monthTreatments = treatments.filter((t) => {
        const tDate = parseRecordDate(t.date);
        if (!tDate) return false;
        return tDate >= monthStart && tDate <= monthEnd;
      });

      const monthExpenses = expenses.filter((e) => {
        const eDate = parseRecordDate(e.date);
        if (!eDate) return false;
        return eDate >= monthStart && eDate <= monthEnd;
      });

      const revenue = monthTreatments.reduce((sum, t) => {
        if (t.payment_status === 'pending') return sum;
        return sum + (t.amount_paid || t.price_paid || 0);
      }, 0);
      
      const costs = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0) + 
                    monthTreatments.reduce((sum, t) => sum + (t.product_cost || 0), 0);
      const profit = revenue - costs;
      
      months.push({
        month: format(currentMonth, 'MMM yyyy'),
        revenue,
        costs,
        profit
      });
      
      currentMonth = addMonths(currentMonth, 1);
    }
    
    return months;
  };

  const getCashFlowData = () => {
    let { start: rangeStartDate, end: rangeEndDate } = getDateRange();
    const months = [];

    // If 'all-time', determine the actual min/max dates from data
    if (rangeStartDate === null && rangeEndDate === null) {
        const allItemDates = [
            ...treatments.map((t) => parseRecordDate(t.date)),
            ...expenses.map((e) => parseRecordDate(e.date)),
        ].filter((d) => d && !isNaN(d.getTime()));

        if (allItemDates.length === 0) return []; // No data

        rangeStartDate = startOfMonth(new Date(Math.min(...allItemDates)));
        rangeEndDate = endOfMonth(new Date(Math.max(...allItemDates)));
    } else {
        // Ensure valid date objects are snapped to month boundaries for chart aggregation.
        rangeStartDate = startOfMonth(rangeStartDate);
        rangeEndDate = endOfMonth(rangeEndDate);
    }

    let currentMonth = rangeStartDate;

    while (currentMonth <= rangeEndDate) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const monthTreatments = treatments.filter((t) => {
        const tDate = parseRecordDate(t.date);
        if (!tDate) return false;
        return tDate >= monthStart && tDate <= monthEnd;
      });

      const monthExpenses = expenses.filter((e) => {
        const eDate = parseRecordDate(e.date);
        if (!eDate) return false;
        return eDate >= monthStart && eDate <= monthEnd;
      });

      const cashIn = monthTreatments.reduce((sum, t) => {
        if (t.payment_status === 'pending') return sum;
        return sum + (t.amount_paid || t.price_paid || 0);
      }, 0);
      
      const cashOut = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      
      months.push({
        month: format(currentMonth, 'MMM yyyy'),
        cashIn,
        cashOut
      });
      
      currentMonth = addMonths(currentMonth, 1);
    }
    
    return months;
  };

  const getCategoryBreakdown = () => {
    const { start: startDate, end: endDate } = getDateRange();

    // Inline date filtering
    const filteredTreatments = treatments.filter((item) => {
      const itemDate = parseRecordDate(item.date);
      if (!itemDate) return false;
      return (startDate === null || itemDate >= startDate) && (endDate === null || itemDate <= endDate);
    });

    const categoryMap = {};
    filteredTreatments.forEach(t => {
      const catalogTreatment = treatmentCatalog.find(ct => ct.treatment_name === t.treatment_name);
      const category = catalogTreatment?.category || 'Other';
      
      if (!categoryMap[category]) {
        categoryMap[category] = { name: category, revenue: 0, profit: 0, count: 0 };
      }
      
      const actualRevenue = t.payment_status === 'pending' ? 0 : (t.amount_paid || t.price_paid || 0);
      const actualProfit = actualRevenue - (t.product_cost || 0);
      
      categoryMap[category].revenue += actualRevenue;
      categoryMap[category].profit += actualProfit;
      categoryMap[category].count += 1;
    });
    
    return Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue);
  };

  const getTreatmentBreakdown = () => {
    const { start: startDate, end: endDate } = getDateRange();
    
    // Inline date filtering
    const filteredTreatments = treatments.filter((item) => {
      const itemDate = parseRecordDate(item.date);
      if (!itemDate) return false;
      return (startDate === null || itemDate >= startDate) && (endDate === null || itemDate <= endDate);
    });

    const treatmentMap = {};
    filteredTreatments.forEach(t => {
      if (!treatmentMap[t.treatment_name]) {
        treatmentMap[t.treatment_name] = { name: t.treatment_name, revenue: 0, profit: 0, count: 0 };
      }
      
      const actualRevenue = t.payment_status === 'pending' ? 0 : (t.amount_paid || t.price_paid || 0);
      const actualProfit = actualRevenue - (t.product_cost || 0);
      
      treatmentMap[t.treatment_name].revenue += actualRevenue;
      treatmentMap[t.treatment_name].profit += actualProfit;
      treatmentMap[t.treatment_name].count += 1;
    });
    
    return Object.values(treatmentMap).sort((a, b) => b.revenue - a.revenue);
  };

  const currentStats = getCurrentMonthStats();
  const lastMonthStats = getLastMonthStats();
  const monthlyData = getMonthlyData();
  const cashFlowData = getCashFlowData();
  const categoryBreakdown = getCategoryBreakdown();
  const treatmentBreakdown = getTreatmentBreakdown();
  const allTimeOutstanding = getAllTimeOutstanding();
  const optimizerMetrics = calculateOptimizerMetrics();

  const calculateTrend = (current, previous) => {
    if (previous === 0) {
      if (current > 0) return '∞%';
      if (current < 0) return '-∞%';
      return '0%';
    }
    const change = ((current - previous) / previous) * 100;
    return change.toFixed(0) + '%';
  };

  const getDateRangeLabel = () => {
    if (dateRangePreset === 'all-time') {
      return 'All Time';
    }
    const { start, end } = getDateRange(); // `start` and `end` will be valid Date objects here
    if (dateRangePreset === 'custom') {
      return `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}`;
    }
    return dateRangePreset.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className="min-h-screen relative overflow-hidden p-6" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 50%, #0f1419 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#d6b164]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-5xl font-light tracking-wider text-white/90 mb-3">Dashboard</h1>
            <p className="text-lg font-light text-white/60">Financial overview and pricing strategy</p>
          </div>
          {activeTab === "overview" && (
            <div className="flex gap-3">
              <Link to={createPageUrl("Reports")}>
                <Button className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#d6b164]/30 text-white/90 rounded-2xl px-6 h-12 text-sm font-light tracking-wider">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="relative group mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#4d647f]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="border-b border-white/10 p-6 pb-0">
              <div className="flex gap-2 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-2xl font-light tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === "overview"
                      ? 'bg-[#d6b164]/20 backdrop-blur-xl border-l border-r border-t border-[#d6b164]/30 text-[#d6b164]'
                      : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  <LayoutGrid className="w-5 h-5" />
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab("optimizer")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-2xl font-light tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === "optimizer"
                      ? 'bg-[#d6b164]/20 backdrop-blur-xl border-l border-r border-t border-[#d6b164]/30 text-[#d6b164]'
                      : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  <TrendingUp className="w-5 h-5" />
                  Price Optimizer
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div>

        {/* Outstanding Payments Alert or All Settled Up Message */}
        {allTimeOutstanding > 0 ? (
          <div className="mb-8 relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 backdrop-blur-xl flex items-center justify-center flex-shrink-0">
                  <Hourglass className="w-7 h-7 text-rose-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-light text-white/90 tracking-wider">Outstanding Payments</h3>
                    <span className="text-xs font-light px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-xl text-white/60 tracking-wider">
                      All Time
                    </span>
                  </div>
                  <p className="text-white/60 mb-4 font-light">
                    <span className="text-3xl font-light text-rose-400">£{allTimeOutstanding.toFixed(2)}</span> in pending and partial payments
                  </p>
                  {allTimeOutstanding >= 200 && (
                    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 mb-4 border border-white/10">
                      <p className="text-sm text-white/60 mb-3 font-light">
                        Send professional invoices to your patients to get paid faster. Generate invoices from the Records page.
                      </p>
                      <div className="flex gap-2">
                        <Link to={createPageUrl("Records")}>
                          <Button size="sm" className="bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164] rounded-2xl text-xs font-light tracking-wider h-9">
                            <FileText className="w-3 h-3 mr-2" />
                            Generate Invoices
                          </Button>
                        </Link>
                        <Link to={`${createPageUrl("Records")}?tab=invoices`}>
                          <Button size="sm" variant="outline" className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl text-xs font-light h-9">
                            View All Invoices
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                  <Link to={createPageUrl("Records")}>
                    <Button variant="outline" size="sm" className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl text-xs font-light h-9">
                      View Unpaid Records
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-8 relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 backdrop-blur-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-light text-white/90 mb-2 tracking-wider">All Settled Up</h3>
                  <p className="text-white/60 font-light">
                    All treatments have been paid in full.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="relative group mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-[#4d647f]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <h3 className="text-xs font-light text-white/40 tracking-[0.2em] uppercase mb-2">Date Range</h3>
                <p className="text-lg font-light text-white/90">{getDateRangeLabel()}</p>
              </div>
              <div className="flex flex-col md:flex-row gap-4 md:items-end">
                <Select value={dateRangePreset} onValueChange={setDateRangePreset}>
                  <SelectTrigger className="w-full md:w-48 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 h-11 text-white/90 font-light">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-time">All Time</SelectItem>
                    <SelectItem value="this-month">This Month</SelectItem>
                    <SelectItem value="last-month">Last Month</SelectItem>
                    <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                    <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                    <SelectItem value="year-to-date">Year to Date</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>

                {dateRangePreset === 'custom' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="start-date" className="text-xs text-white/60 font-light">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 h-11 text-white/90 font-light"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-date" className="text-xs text-white/60 font-light">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 h-11 text-white/90 font-light"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Revenue (This Period)"
            value={`£${currentStats.revenue.toFixed(0)}`}
            trend={dateRangePreset !== 'all-time' ? (currentStats.revenue >= lastMonthStats.revenue ? 'up' : 'down') : undefined}
            trendValue={dateRangePreset !== 'all-time' ? calculateTrend(currentStats.revenue, lastMonthStats.revenue) : undefined}
            icon={Banknote}
            valueColor="text-green-600"
          />
          <StatCard
            title="Costs (This Period)"
            value={`£${currentStats.costs.toFixed(0)}`}
            trend={dateRangePreset !== 'all-time' ? (currentStats.costs <= lastMonthStats.costs ? 'up' : 'down') : undefined}
            trendValue={dateRangePreset !== 'all-time' ? calculateTrend(currentStats.costs, lastMonthStats.costs) : undefined}
            icon={TrendingDown}
            valueColor="text-red-600"
          />
          <StatCard
            title="Net Profit (This Period)"
            value={`£${currentStats.profit.toFixed(0)}`}
            trend={dateRangePreset !== 'all-time' ? (currentStats.profit >= lastMonthStats.profit ? 'up' : 'down') : undefined}
            trendValue={dateRangePreset !== 'all-time' ? calculateTrend(currentStats.profit, lastMonthStats.profit) : undefined}
            icon={Wallet}
            valueColor={currentStats.profit >= 0 ? "text-green-600" : "text-red-600"}
          />
        </div>

        {/* The original date-range-specific outstanding payments alert is removed as per outline, replaced by the unified ALL TIME alert/message. */}

        {categoryBreakdown.length > 0 && currentStats.profit > lastMonthStats.profit && (
          <div className="mb-8 relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#d6b164]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#d6b164]/10 backdrop-blur-xl flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-7 h-7 text-[#d6b164]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-light text-white/40 tracking-[0.2em] uppercase mb-2">Performance Insight</h3>
                  <p className="text-base font-light text-white/90">
                    {`${categoryBreakdown[0].name} treatments are performing best with £${categoryBreakdown[0].revenue.toFixed(0)} revenue this period.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <CashFlowChart data={cashFlowData} />
          <MonthlyChart data={monthlyData} />
        </div>

        <div className="grid lg:grid-cols-1 gap-6">
          <CategoryBreakdown categories={categoryBreakdown} treatments={treatmentBreakdown} />
        </div>
                </div>
              )}

              {/* Price Optimizer Tab */}
              {activeTab === "optimizer" && (
                <div>
                  <div className="bg-blue-500/10 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-light text-blue-400 tracking-wider">Priority Score Calculation</h4>
                        <p className="text-sm text-white/60 mt-1 font-light">
                          Treatments are ranked by: Revenue/Minute (40%) + Frequency (30%) + Profit Margin (30%)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {optimizerMetrics.map((metric, index) => (
                      <div
                        key={metric.id}
                        className={`bg-white/5 backdrop-blur-xl rounded-2xl p-6 border-2 transition-all hover:border-[#d6b164]/30 ${
                          index === 0 ? 'border-emerald-500/30' :
                          index === 1 ? 'border-blue-500/30' :
                          index === 2 ? 'border-purple-500/30' :
                          'border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-start gap-3">
                            {index < 3 && (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-light text-white backdrop-blur-xl ${
                                index === 0 ? 'bg-emerald-500/20 border border-emerald-500/30' :
                                index === 1 ? 'bg-blue-500/20 border border-blue-500/30' :
                                'bg-purple-500/20 border border-purple-500/30'
                              }`}>
                                {index + 1}
                              </div>
                            )}
                            <div>
                              <h3 className="text-xl font-light text-white/90 tracking-wider">{metric.treatment_name}</h3>
                              <p className="text-sm text-white/50 font-light">{metric.category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-white/50 font-light">Priority Score</p>
                            <p className="text-2xl font-light text-[#d6b164]">{metric.priorityScore.toFixed(1)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-white/10">
                          <div>
                            <p className="text-xs text-white/40 mb-1 font-light tracking-wider uppercase">Price</p>
                            <p className="text-lg font-light text-white/90">£{metric.default_price.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40 mb-1 font-light tracking-wider uppercase">Revenue/Min</p>
                            <p className="text-lg font-light text-emerald-400">
                              £{metric.revenuePerMinute.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40 mb-1 font-light tracking-wider uppercase">Performed</p>
                            <p className="text-lg font-light text-blue-400">{metric.count}x</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40 mb-1 font-light tracking-wider uppercase">Total Revenue</p>
                            <p className="text-lg font-light text-white/90">£{metric.totalRevenue.toFixed(0)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40 mb-1 font-light tracking-wider uppercase">Margin</p>
                            <p className="text-lg font-light text-emerald-400">{metric.margin.toFixed(0)}%</p>
                          </div>
                        </div>

                        {index < 3 && (
                          <div className="mt-4 pt-4 border-t border-white/10">
                            <p className="text-sm font-light text-emerald-400">
                              ✓ High priority - Consider promoting this treatment more actively
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}