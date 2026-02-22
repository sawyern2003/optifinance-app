
import React, { useState } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, Loader2, Download, Calendar, FileText, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, subMonths } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

export default function Reports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [dateRangePreset, setDateRangePreset] = useState('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [exportToDelete, setExportToDelete] = useState(null);

  const { data: treatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: expenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.entities.Expense.list('-date'),
    initialData: [],
  });

  const { data: exportHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['exportHistory'],
    queryFn: () => api.entities.ExportHistory.list('-created_date'),
    initialData: [],
  });

  const deleteExportMutation = useMutation({
    mutationFn: (id) => api.entities.ExportHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exportHistory'] });
      toast({
        title: "Export deleted",
        description: "Export record removed from history",
        className: "bg-red-50 border-red-200"
      });
      setDeleteConfirmOpen(false);
      setExportToDelete(null);
    },
  });

  const handleDeleteClick = (exportRecord) => {
    setExportToDelete(exportRecord);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (exportToDelete) {
      deleteExportMutation.mutate(exportToDelete.id);
    }
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
        return {
          start: customStartDate ? new Date(customStartDate) : startOfMonth(now),
          end: customEndDate ? new Date(customEndDate) : endOfMonth(now)
        };
      case 'all-time':
      default:
        return null;
    }
  };

  const getFilteredData = () => {
    const dateRange = getDateRange();
    
    if (!dateRange) {
      return { filteredTreatments: treatments, filteredExpenses: expenses };
    }
    
    const { start: startDate, end: endDate } = dateRange;
    
    const filteredTreatments = treatments.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= startDate && tDate <= endDate;
    });
    
    const filteredExpenses = expenses.filter(e => {
      const eDate = new Date(e.date);
      return eDate >= startDate && eDate <= endDate;
    });
    
    return { filteredTreatments, filteredExpenses };
  };

  const calculateStats = () => {
    const { filteredTreatments, filteredExpenses } = getFilteredData();
    
    const revenue = filteredTreatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum;
      return sum + (t.amount_paid || t.price_paid || 0);
    }, 0);
    
    const productCosts = filteredTreatments.reduce((sum, t) => sum + (t.product_cost || 0), 0);
    const expenseCosts = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalCosts = productCosts + expenseCosts;
    const profit = revenue - totalCosts;
    
    const outstanding = filteredTreatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum + (t.price_paid || 0);
      if (t.payment_status === 'partially_paid') return sum + ((t.price_paid || 0) - (t.amount_paid || 0));
      return sum;
    }, 0);
    
    return { revenue, productCosts, expenseCosts, totalCosts, profit, outstanding };
  };

  const generateHTMLContent = (filteredTreatments, filteredExpenses, stats, start, end, fileName) => {
    // Create treatment summary by type
    const treatmentMap = {};
    filteredTreatments.forEach(t => {
      if (!treatmentMap[t.treatment_name]) {
        treatmentMap[t.treatment_name] = { count: 0, revenue: 0, cost: 0, profit: 0 };
      }
      const actualRevenue = t.payment_status === 'pending' ? 0 : (t.amount_paid || t.price_paid || 0);
      const actualProfit = actualRevenue - (t.product_cost || 0);
      treatmentMap[t.treatment_name].count += 1;
      treatmentMap[t.treatment_name].revenue += actualRevenue;
      treatmentMap[t.treatment_name].cost += t.product_cost || 0;
      treatmentMap[t.treatment_name].profit += actualProfit;
    });

    // Create practitioner summary
    const practitionerMap = {};
    filteredTreatments.forEach(t => {
      const name = t.practitioner_name || 'Unassigned';
      if (!practitionerMap[name]) {
        practitionerMap[name] = { count: 0, revenue: 0, profit: 0 };
      }
      const actualRevenue = t.payment_status === 'pending' ? 0 : (t.amount_paid || t.price_paid || 0);
      const actualProfit = actualRevenue - (t.product_cost || 0);
      practitionerMap[name].count += 1;
      practitionerMap[name].revenue += actualRevenue;
      practitionerMap[name].profit += actualProfit;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${fileName}</title>
        <style>
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
            .page-break { page-break-after: always; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            padding: 40px;
            color: #1e293b;
            line-height: 1.6;
          }
          .header {
            margin-bottom: 40px;
            border-bottom: 3px solid #2C3E50;
            padding-bottom: 20px;
          }
          h1 {
            color: #2C3E50;
            font-size: 32px;
            margin: 0 0 10px 0;
          }
          .subtitle {
            color: #64748b;
            font-size: 16px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin: 30px 0;
          }
          .summary-card {
            background: #f8fafc;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }
          .summary-card h3 {
            font-size: 12px;
            text-transform: uppercase;
            color: #64748b;
            margin: 0 0 8px 0;
            font-weight: 600;
            letter-spacing: 0.5px;
          }
          .summary-card .value {
            font-size: 28px;
            font-weight: 700;
            margin: 0;
          }
          .summary-card .value.green { color: #16a34a; }
          .summary-card .value.red { color: #dc2626; }
          .summary-card .value.blue { color: #2563eb; }
          section {
            margin: 40px 0;
          }
          h2 {
            color: #2C3E50;
            font-size: 22px;
            margin: 30px 0 20px 0;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 13px;
          }
          th {
            background: #2C3E50;
            color: white;
            padding: 12px 10px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          tr:hover {
            background: #f8fafc;
          }
          .text-right { text-align: right; }
          .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            background: #2C3E50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 1000;
          }
          .print-button:hover {
            background: #34495E;
          }
        </style>
      </head>
      <body>
        <button class="print-button no-print" onclick="window.print()">Print / Save as PDF</button>
        
        <div class="header">
          <h1>OptiFinance Financial Report</h1>
          <p class="subtitle">
            <strong>Date Range:</strong> ${start && end ? `${format(start, 'dd MMM yyyy')} to ${format(end, 'dd MMM yyyy')}` : 'All Time'}<br>
            <strong>Generated:</strong> ${format(new Date(), 'dd MMM yyyy, HH:mm')}
          </p>
        </div>

        <section>
          <h2>Profit & Loss Summary</h2>
          <div class="summary-grid">
            <div class="summary-card">
              <h3>Total Revenue</h3>
              <p class="value green">£${stats.revenue.toFixed(2)}</p>
            </div>
            <div class="summary-card">
              <h3>Total Costs</h3>
              <p class="value red">£${stats.totalCosts.toFixed(2)}</p>
            </div>
            <div class="summary-card">
              <h3>Net Profit</h3>
              <p class="value ${stats.profit >= 0 ? 'green' : 'red'}">£${stats.profit.toFixed(2)}</p>
            </div>
            <div class="summary-card">
              <h3>Outstanding Payments</h3>
              <p class="value blue">£${stats.outstanding.toFixed(2)}</p>
            </div>
            <div class="summary-card">
              <h3>Product Costs</h3>
              <p class="value red">£${stats.productCosts.toFixed(2)}</p>
            </div>
            <div class="summary-card">
              <h3>Other Expenses</h3>
              <p class="value red">£${stats.expenseCosts.toFixed(2)}</p>
            </div>
          </div>
        </section>

        <div class="page-break"></div>

        <section>
          <h2>Treatments Ledger (${filteredTreatments.length} treatments)</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Treatment</th>
                <th class="text-right">Price</th>
                <th class="text-right">Paid</th>
                <th>Status</th>
                <th>Practitioner</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTreatments.map(t => `
                <tr>
                  <td>${format(new Date(t.date), 'dd MMM yyyy')}</td>
                  <td>${t.patient_name || '-'}</td>
                  <td>${t.treatment_name}</td>
                  <td class="text-right">£${t.price_paid?.toFixed(2) || '0.00'}</td>
                  <td class="text-right">£${(t.amount_paid || 0).toFixed(2)}</td>
                  <td>${t.payment_status}</td>
                  <td>${t.practitioner_name || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <div class="page-break"></div>

        <section>
          <h2>Expenses Ledger (${filteredExpenses.length} expenses)</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th class="text-right">Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${filteredExpenses.map(e => `
                <tr>
                  <td>${format(new Date(e.date), 'dd MMM yyyy')}</td>
                  <td>${e.category}</td>
                  <td class="text-right">£${e.amount?.toFixed(2) || '0.00'}</td>
                  <td>${e.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <div class="page-break"></div>

        <section>
          <h2>Summary by Treatment</h2>
          <table>
            <thead>
              <tr>
                <th>Treatment</th>
                <th class="text-right">Count</th>
                <th class="text-right">Revenue</th>
                <th class="text-right">Cost</th>
                <th class="text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(treatmentMap).map(([name, data]) => `
                <tr>
                  <td>${name}</td>
                  <td class="text-right">${data.count}</td>
                  <td class="text-right">£${data.revenue.toFixed(2)}</td>
                  <td class="text-right">£${data.cost.toFixed(2)}</td>
                  <td class="text-right">£${data.profit.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Summary by Practitioner</h2>
          <table>
            <thead>
              <tr>
                <th>Practitioner</th>
                <th class="text-right">Count</th>
                <th class="text-right">Revenue</th>
                <th class="text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(practitionerMap).map(([name, data]) => `
                <tr>
                  <td>${name}</td>
                  <td class="text-right">${data.count}</td>
                  <td class="text-right">£${data.revenue.toFixed(2)}</td>
                  <td class="text-right">£${data.profit.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <script>
          // Auto-trigger print dialog when page loads
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    
    const { filteredTreatments, filteredExpenses } = getFilteredData();
    const stats = calculateStats();
    
    const dateRange = getDateRange();
    const start = dateRange ? dateRange.start : null;
    const end = dateRange ? dateRange.end : null;

    const fileName = `OptiFinance_Report_${start && end ? `${format(start, 'yyyy-MM-dd')}_to_${format(end, 'yyyy-MM-dd')}` : 'AllTime'}.html`;

    const htmlContent = generateHTMLContent(filteredTreatments, filteredExpenses, stats, start, end, fileName);

    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Upload HTML file to storage
    try {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const file = new File([blob], fileName, { type: 'text/html' });
      
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      
      // Save export to history with file URL
      await api.entities.ExportHistory.create({
        export_type: 'Financial Report (PDF)',
        date_range: start && end ? `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}` : 'All Time',
        file_name: fileName,
        file_url: file_url,
        record_count: {
          treatments: filteredTreatments.length,
          expenses: filteredExpenses.length
        }
      });
      queryClient.invalidateQueries({ queryKey: ['exportHistory'] });
      
      toast({
        title: "PDF ready",
        description: "Print dialog opened automatically - choose 'Save as PDF'",
        className: "bg-green-50 border-green-200"
      });
    } catch (error) {
      console.error('Failed to save export:', error);
      toast({
        title: "Export opened",
        description: "Report opened but couldn't save to history",
        className: "bg-yellow-50 border-yellow-200"
      });
    }
    
    setIsExporting(false);
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    
    const { filteredTreatments, filteredExpenses } = getFilteredData();
    const stats = calculateStats();
    
    const dateRange = getDateRange();
    const start = dateRange ? dateRange.start : null;
    const end = dateRange ? dateRange.end : null;

    let csvContent = '';
    
    csvContent += 'OptiFinance Export\n';
    csvContent += `Date Range: ${start && end ? `${format(start, 'dd MMM yyyy')} to ${format(end, 'dd MMM yyyy')}` : 'All Time'}\n`;
    csvContent += `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}\n`;
    csvContent += '\n\n';
    
    csvContent += 'PROFIT & LOSS SUMMARY\n';
    csvContent += 'Metric,Amount (£)\n';
    csvContent += `Total Revenue (Received),${stats.revenue.toFixed(2)}\n`;
    csvContent += `Outstanding Payments,${stats.outstanding.toFixed(2)}\n`;
    csvContent += `Product Costs,${stats.productCosts.toFixed(2)}\n`;
    csvContent += `Other Expenses,${stats.expenseCosts.toFixed(2)}\n`;
    csvContent += `Total Costs,${stats.totalCosts.toFixed(2)}\n`;
    csvContent += `Net Profit,${stats.profit.toFixed(2)}\n`;
    csvContent += '\n\n';
    
    csvContent += 'TREATMENTS LEDGER\n';
    csvContent += 'Date,Patient,Treatment,Price (£),Amount Paid (£),Payment Status,Product Cost (£),Profit (£),Practitioner,Notes\n';
    filteredTreatments.forEach(t => {
      csvContent += `${format(new Date(t.date), 'yyyy-MM-dd')},`;
      csvContent += `"${t.patient_name || '-'}",`;
      csvContent += `"${t.treatment_name}",`;
      csvContent += `${t.price_paid?.toFixed(2) || '0.00'},`;
      csvContent += `${(t.amount_paid || 0).toFixed(2)},`;
      csvContent += `"${t.payment_status}",`;
      csvContent += `${t.product_cost?.toFixed(2) || '0.00'},`;
      csvContent += `${t.profit?.toFixed(2) || '0.00'},`;
      csvContent += `"${t.practitioner_name || '-'}",`;
      csvContent += `"${(t.notes || '').replace(/"/g, '""')}"\n`;
    });
    csvContent += '\n\n';
    
    csvContent += 'EXPENSES LEDGER\n';
    csvContent += 'Date,Category,Amount (£),Notes\n';
    filteredExpenses.forEach(e => {
      csvContent += `${format(new Date(e.date), 'yyyy-MM-dd')},`;
      csvContent += `"${e.category}",`;
      csvContent += `${e.amount?.toFixed(2) || '0.00'},`;
      csvContent += `"${(e.notes || '').replace(/"/g, '""')}"\n`;
    });
    csvContent += '\n\n';
    
    csvContent += 'SUMMARY BY TREATMENT\n';
    csvContent += 'Treatment,Count,Total Revenue (£),Total Cost (£),Total Profit (£)\n';
    const treatmentMap = {};
    filteredTreatments.forEach(t => {
      if (!treatmentMap[t.treatment_name]) {
        treatmentMap[t.treatment_name] = { count: 0, revenue: 0, cost: 0, profit: 0 };
      }
      const actualRevenue = t.payment_status === 'pending' ? 0 : (t.amount_paid || t.price_paid || 0);
      const actualProfit = actualRevenue - (t.product_cost || 0);

      treatmentMap[t.treatment_name].count += 1;
      treatmentMap[t.treatment_name].revenue += actualRevenue;
      treatmentMap[t.treatment_name].cost += t.product_cost || 0;
      treatmentMap[t.treatment_name].profit += actualProfit;
    });
    Object.entries(treatmentMap).forEach(([name, data]) => {
      csvContent += `"${name}",${data.count},${data.revenue.toFixed(2)},${data.cost.toFixed(2)},${data.profit.toFixed(2)}\n`;
    });
    csvContent += '\n\n';
    
    csvContent += 'SUMMARY BY PRACTITIONER\n';
    csvContent += 'Practitioner,Count,Total Revenue (£),Total Profit (£)\n';
    const practitionerMap = {};
    filteredTreatments.forEach(t => {
      const name = t.practitioner_name || 'Unassigned';
      if (!practitionerMap[name]) {
        practitionerMap[name] = { count: 0, revenue: 0, profit: 0 };
      }
      const actualRevenue = t.payment_status === 'pending' ? 0 : (t.amount_paid || t.price_paid || 0);
      const actualProfit = actualRevenue - (t.product_cost || 0);

      practitionerMap[name].count += 1;
      practitionerMap[name].revenue += actualRevenue;
      practitionerMap[name].profit += actualProfit;
    });
    Object.entries(practitionerMap).forEach(([name, data]) => {
      csvContent += `"${name}",${data.count},${data.revenue.toFixed(2)},${data.profit.toFixed(2)}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fileName = `OptiFinance_Report_${start && end ? `${format(start, 'yyyy-MM-dd')}_to_${format(end, 'yyyy-MM-dd')}` : 'AllTime'}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Upload CSV file to storage
    try {
      const file = new File([blob], fileName, { type: 'text/csv' });
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      
      // Save export to history with file URL
      await api.entities.ExportHistory.create({
        export_type: 'Financial Report (CSV)',
        date_range: start && end ? `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}` : 'All Time',
        file_name: fileName,
        file_url: file_url,
        record_count: {
          treatments: filteredTreatments.length,
          expenses: filteredExpenses.length
        }
      });
      queryClient.invalidateQueries({ queryKey: ['exportHistory'] });
      
      toast({
        title: "Export successful",
        description: "Your financial report has been downloaded and saved",
        className: "bg-green-50 border-green-200"
      });
    } catch (error) {
      console.error('Failed to save export:', error);
      toast({
        title: "Download complete",
        description: "Report downloaded but couldn't save to history",
        className: "bg-yellow-50 border-yellow-200"
      });
    }
    
    setIsExporting(false);
  };

  const handleRedownload = (exportRecord) => {
    if (exportRecord.file_url) {
      window.open(exportRecord.file_url, '_blank');
    }
  };

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-[#1a2845] mb-2">Reports & Export</h1>
            <p className="text-sm text-gray-500 font-light">Generate and download financial reports</p>
          </div>
        </div>

        {/* Export Generator Card */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 mb-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 bg-[#2C3E50] rounded-2xl flex items-center justify-center flex-shrink-0">
              <FileDown className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Generate New Report</h3>
              <p className="text-gray-600">Export comprehensive financial data including treatments, expenses, and summaries</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <Label className="text-sm font-semibold text-gray-900 mb-3 block">Select Date Range</Label>
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <Select value={dateRangePreset} onValueChange={setDateRangePreset}>
                  <SelectTrigger className="w-full md:w-48 rounded-xl border-gray-300 h-11">
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
                        className="rounded-xl border-gray-300 h-11"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="end-date" className="text-xs text-gray-600">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="rounded-xl border-gray-300 h-11"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Report will include:</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                  Profit & Loss Summary
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                  Complete Treatments Ledger
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                  Complete Expenses Ledger
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                  Summary by Treatment Type
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                  Summary by Practitioner
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={exportToPDF}
                disabled={isExporting}
                className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl px-8 h-12 text-base"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 mr-2" />
                    Export as PDF
                  </>
                )}
              </Button>
              <Button
                onClick={exportToCSV}
                disabled={isExporting}
                variant="outline"
                className="flex-1 border-[#2C3E50] text-[#2C3E50] hover:bg-gray-50 rounded-xl px-8 h-12 text-base"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileDown className="w-5 h-5 mr-2" />
                    Export as CSV
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Export History */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-xl font-semibold text-gray-900">Export History</h3>
            <p className="text-sm text-gray-600 mt-1">View and re-download your previous exports</p>
          </div>

          <div className="p-6">
            {loadingHistory ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
                <p className="text-gray-500">Loading history...</p>
              </div>
            ) : exportHistory.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 mb-1">No exports yet</p>
                <p className="text-sm text-gray-400">Your export history will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {exportHistory.map((exportRecord) => (
                  <div
                    key={exportRecord.id}
                    className="bg-gray-50 rounded-xl p-5 border border-gray-200 hover:bg-white transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-12 h-12 bg-[#2C3E50] rounded-xl flex items-center justify-center flex-shrink-0">
                          {exportRecord.export_type?.includes('PDF') ? (
                            <FileText className="w-6 h-6 text-white" />
                          ) : (
                            <FileDown className="w-6 h-6 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900">{exportRecord.file_name}</h4>
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                              {exportRecord.export_type?.includes('PDF') ? 'PDF' : 'CSV'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              <span>{exportRecord.date_range}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-4 h-4" />
                              <span>
                                {exportRecord.record_count?.treatments || 0} treatments, {exportRecord.record_count?.expenses || 0} expenses
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            Exported on {format(new Date(exportRecord.created_date), 'dd MMM yyyy, HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRedownload(exportRecord)}
                          className="rounded-lg border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white flex-shrink-0"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(exportRecord)}
                          className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
                Are you sure you want to delete this export?
              </p>
              {exportToDelete && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">File: <span className="font-semibold text-gray-900">{exportToDelete.file_name}</span></p>
                  <p className="text-sm text-gray-600">Date Range: <span className="font-semibold text-gray-900">{exportToDelete.date_range}</span></p>
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
