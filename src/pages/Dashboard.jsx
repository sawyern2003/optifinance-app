import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Banknote, TrendingDown, Wallet, Plus, Download, Sparkles, Hourglass, CheckCircle, FileText } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, addMonths } from "date-fns";

import StatCard from "../components/dashboard/StatCard";
import MonthlyChart from "../components/dashboard/MonthlyChart";
import CategoryBreakdown from "../components/dashboard/CategoryBreakdown";
import CashFlowChart from "../components/dashboard/CashFlowChart";

export default function Dashboard() {
  const [dateRangePreset, setDateRangePreset] = useState('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [hasGeneratedRecurring, setHasGeneratedRecurring] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
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
    queryFn: () => base44.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list('-date'),
    initialData: [],
  });

  const { data: recurringExpenses } = useQuery({
    queryKey: ['recurringExpenses'],
    queryFn: () => base44.entities.Expense.filter({ is_recurring: true, is_active: true }, '-created_date'),
    initialData: [],
  });

  const { data: treatmentCatalog } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => base44.entities.TreatmentCatalog.list(),
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
            await base44.entities.Expense.create({
              date: newDate,
              category: recurring.category,
              amount: recurring.amount,
              notes: `${recurring.notes || ''} (Auto-generated)`.trim(),
              is_recurring: false,
              is_auto_generated: true
            });
            
            await base44.entities.Expense.update(recurring.id, {
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
    const thisPeriodTreatments = treatments.filter(item => {
      const itemDate = new Date(item.date);
      return (startDate === null || itemDate >= startDate) && (endDate === null || itemDate <= endDate);
    });
    
    const thisPeriodExpenses = expenses.filter(item => {
      const itemDate = new Date(item.date);
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
    const lastPeriodTreatments = treatments.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= previousStart && itemDate <= previousEnd;
    });

    const lastPeriodExpenses = expenses.filter(item => {
      const itemDate = new Date(item.date);
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
            ...treatments.map(t => new Date(t.date)),
            ...expenses.map(e => new Date(e.date))
        ].filter(d => !isNaN(d.getTime())); // Filter out invalid dates
        
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
      
      const monthTreatments = treatments.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= monthStart && tDate <= monthEnd;
      });
      
      const monthExpenses = expenses.filter(e => {
        const eDate = new Date(e.date);
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
            ...treatments.map(t => new Date(t.date)),
            ...expenses.map(e => new Date(e.date))
        ].filter(d => !isNaN(d.getTime())); // Filter out invalid dates
        
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
      
      const monthTreatments = treatments.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= monthStart && tDate <= monthEnd;
      });
      
      const monthExpenses = expenses.filter(e => {
        const eDate = new Date(e.date);
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
    const filteredTreatments = treatments.filter(item => {
      const itemDate = new Date(item.date);
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
    const filteredTreatments = treatments.filter(item => {
      const itemDate = new Date(item.date);
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
  const allTimeOutstanding = getAllTimeOutstanding(); // New calculation

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
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Dashboard</h1>
            <p className="text-sm text-gray-500 font-light">
              Welcome back{clinicName ? `, ${clinicName}` : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <Link to={createPageUrl("QuickAdd")}>
              <Button className="bg-[#1a2845] hover:bg-[#0f1829] text-white rounded-lg px-5 h-10 text-sm font-light tracking-wide uppercase">
                <Plus className="w-4 h-4 mr-2" />
                Quick Add
              </Button>
            </Link>
            <Link to={createPageUrl("Reports")}>
              <Button variant="outline" className="border-gray-300 hover:bg-gray-50 rounded-lg px-5 h-10 text-sm font-light tracking-wide uppercase text-[#1a2845]">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </Link>
          </div>
        </div>

        {/* Outstanding Payments Alert or All Settled Up Message */}
        {allTimeOutstanding > 0 ? (
          <div className="mb-8 bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-base font-light text-[#1a2845] tracking-tight">Outstanding Payments</h3>
                  <span className="text-xs font-light px-2 py-1 rounded bg-gray-100 text-gray-600 uppercase tracking-wide">
                    All Time
                  </span>
                </div>
                <p className="text-gray-700 mb-4 font-light">
                  <span className="text-2xl font-light text-[#1a2845]">£{allTimeOutstanding.toFixed(2)}</span> in pending and partial payments
                </p>
                {allTimeOutstanding >= 200 && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                    <p className="text-sm text-gray-700 mb-3 font-light">
                      Send professional invoices to your patients to get paid faster. Generate invoices from the Records page.
                    </p>
                    <div className="flex gap-2">
                      <Link to={createPageUrl("Records")}>
                        <Button size="sm" className="bg-[#1a2845] hover:bg-[#0f1829] text-white rounded-lg text-xs font-light tracking-wide uppercase h-8">
                          <FileText className="w-3 h-3 mr-2" />
                          Generate Invoices
                        </Button>
                      </Link>
                      <Link to={createPageUrl("Invoices")}>
                        <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-light h-8">
                          View All Invoices
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
                <Link to={createPageUrl("Records")}>
                  <Button variant="outline" size="sm" className="border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-light h-8">
                    View Unpaid Records
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-8 bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-base font-light text-[#1a2845] mb-2 tracking-tight">All Settled Up</h3>
                <p className="text-gray-700 font-light">
                  All treatments have been paid in full.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-8">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date Range</h3>
              <p className="text-sm text-gray-700 font-light">{getDateRangeLabel()}</p>
            </div>
            <div className="flex flex-col md:flex-row gap-4 md:items-end">
              <Select value={dateRangePreset} onValueChange={setDateRangePreset}>
                <SelectTrigger className="w-full md:w-48 rounded-lg border-gray-300 h-10 text-sm font-light">
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
                  <div className="space-y-1">
                    <Label htmlFor="start-date" className="text-xs text-gray-600">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="rounded-lg border-gray-300 h-10 text-sm font-light"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="end-date" className="text-xs text-gray-600 font-light">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="rounded-lg border-gray-300 h-10 text-sm font-light"
                    />
                  </div>
                </>
              )}
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
          <div className="mb-8 bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-start gap-4">
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Performance Insight</h3>
                <p className="text-sm text-gray-700 font-light">
                  {`${categoryBreakdown[0].name} treatments are performing best with £${categoryBreakdown[0].revenue.toFixed(0)} revenue this period.`}
                </p>
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
        </div>
        );
        }