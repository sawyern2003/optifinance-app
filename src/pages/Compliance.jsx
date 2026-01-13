import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, FileText, Download, Calendar, AlertCircle, CheckCircle2, Info, Settings } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

export default function Compliance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [taxYear, setTaxYear] = useState('2024-2025');
  const [settingsForm, setSettingsForm] = useState({
    business_structure: 'sole_trader',
    vat_registered: false,
    vat_number: '',
    vat_scheme: 'standard',
    flat_rate_percentage: '',
    company_number: '',
    utr_number: '',
    accounting_year_end: '5 April',
    tax_year_start: '2024-04-06'
  });

  const { data: treatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => base44.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: expenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list('-date'),
    initialData: [],
  });

  const { data: taxSettings } = useQuery({
    queryKey: ['taxSettings'],
    queryFn: async () => {
      const settings = await base44.entities.TaxSettings.list();
      return settings[0] || null;
    },
    initialData: null,
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    initialData: null,
  });

  const createTaxSettingsMutation = useMutation({
    mutationFn: (data) => base44.entities.TaxSettings.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxSettings'] });
      toast({
        title: "Settings saved",
        className: "bg-green-50 border-green-200"
      });
      setSettingsDialogOpen(false);
    },
  });

  const updateTaxSettingsMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TaxSettings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxSettings'] });
      toast({
        title: "Settings updated",
        className: "bg-green-50 border-green-200"
      });
      setSettingsDialogOpen(false);
    },
  });

  React.useEffect(() => {
    if (taxSettings) {
      setSettingsForm({
        business_structure: taxSettings.business_structure || 'sole_trader',
        vat_registered: taxSettings.vat_registered || false,
        vat_number: taxSettings.vat_number || '',
        vat_scheme: taxSettings.vat_scheme || 'standard',
        flat_rate_percentage: taxSettings.flat_rate_percentage || '',
        company_number: taxSettings.company_number || '',
        utr_number: taxSettings.utr_number || '',
        accounting_year_end: taxSettings.accounting_year_end || '5 April',
        tax_year_start: taxSettings.tax_year_start || '2024-04-06'
      });
    }
  }, [taxSettings]);

  const handleSettingsSubmit = (e) => {
    e.preventDefault();
    if (taxSettings) {
      updateTaxSettingsMutation.mutate({ id: taxSettings.id, data: settingsForm });
    } else {
      createTaxSettingsMutation.mutate(settingsForm);
    }
  };

  const getTaxYearRange = () => {
    const [startYear] = taxYear.split('-');
    return {
      start: new Date(`${startYear}-04-06`),
      end: new Date(`${parseInt(startYear) + 1}-04-05`)
    };
  };

  const getFilteredDataForTaxYear = () => {
    const { start, end } = getTaxYearRange();
    
    const filteredTreatments = treatments.filter(t => {
      const tDate = new Date(t.date);
      return isWithinInterval(tDate, { start, end });
    });
    
    const filteredExpenses = expenses.filter(e => {
      const eDate = new Date(e.date);
      return isWithinInterval(eDate, { start, end });
    });
    
    return { filteredTreatments, filteredExpenses };
  };

  const calculateTaxSummary = () => {
    const { filteredTreatments, filteredExpenses } = getFilteredDataForTaxYear();
    
    // Calculate revenue (only received payments)
    const totalRevenue = filteredTreatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum;
      return sum + (t.amount_paid || t.price_paid || 0);
    }, 0);

    // VAT exempt treatments (most medical/therapeutic treatments)
    const vatExemptRevenue = filteredTreatments.reduce((sum, t) => {
      if (t.payment_status === 'pending') return sum;
      const isExempt = ['Wellness', 'Consultation'].includes(
        t.treatment_name // This should check category, but we'll use treatment name for now
      );
      return isExempt ? sum + (t.amount_paid || t.price_paid || 0) : sum;
    }, 0);

    const vatTaxableRevenue = totalRevenue - vatExemptRevenue;

    // Categorize expenses for tax purposes
    const allowableExpenses = filteredExpenses.reduce((acc, e) => {
      const category = e.category || 'Other';
      acc[category] = (acc[category] || 0) + (e.amount || 0);
      return acc;
    }, {});

    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    // Product costs from treatments
    const productCosts = filteredTreatments.reduce((sum, t) => sum + (t.product_cost || 0), 0);
    
    const totalCosts = totalExpenses + productCosts;
    const profit = totalRevenue - totalCosts;

    // Calculate VAT if applicable
    let vatOwed = 0;
    if (settingsForm.vat_registered) {
      if (settingsForm.vat_scheme === 'standard') {
        vatOwed = vatTaxableRevenue * 0.20; // 20% standard VAT
      } else if (settingsForm.vat_scheme === 'flat_rate' && settingsForm.flat_rate_percentage) {
        vatOwed = totalRevenue * (parseFloat(settingsForm.flat_rate_percentage) / 100);
      }
    }

    return {
      totalRevenue,
      vatExemptRevenue,
      vatTaxableRevenue,
      totalExpenses,
      productCosts,
      totalCosts,
      profit,
      allowableExpenses,
      vatOwed
    };
  };

  const exportTaxReport = async () => {
    const { filteredTreatments, filteredExpenses } = getFilteredDataForTaxYear();
    const summary = calculateTaxSummary();
    const { start, end } = getTaxYearRange();
    const clinicName = user?.clinic_name || 'OptiFinance Clinic';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tax Report ${taxYear} - ${clinicName}</title>
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
            grid-template-columns: repeat(2, 1fr);
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
          .text-right { text-align: right; }
          .highlight-box {
            background: #fef3c7;
            border: 2px solid #fbbf24;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .info-box {
            background: #dbeafe;
            border: 2px solid #60a5fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
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
          <h1>UK Tax Compliance Report</h1>
          <p class="subtitle">
            <strong>${clinicName}</strong><br>
            Tax Year: ${format(start, 'dd MMMM yyyy')} to ${format(end, 'dd MMMM yyyy')}<br>
            Generated: ${format(new Date(), 'dd MMMM yyyy, HH:mm')}
          </p>
        </div>

        <section>
          <h2>Income & Profit Summary</h2>
          <div class="summary-grid">
            <div class="summary-card">
              <h3>Total Turnover</h3>
              <p class="value green">£${summary.totalRevenue.toFixed(2)}</p>
            </div>
            <div class="summary-card">
              <h3>Total Allowable Expenses</h3>
              <p class="value red">£${summary.totalCosts.toFixed(2)}</p>
            </div>
            <div class="summary-card">
              <h3>Net Profit (Before Tax)</h3>
              <p class="value ${summary.profit >= 0 ? 'green' : 'red'}">£${summary.profit.toFixed(2)}</p>
            </div>
            ${settingsForm.vat_registered ? `
            <div class="summary-card">
              <h3>VAT Owed to HMRC</h3>
              <p class="value blue">£${summary.vatOwed.toFixed(2)}</p>
            </div>
            ` : ''}
          </div>
        </section>

        ${settingsForm.vat_registered ? `
        <section>
          <h2>VAT Analysis</h2>
          <div class="info-box">
            <p><strong>VAT Scheme:</strong> ${settingsForm.vat_scheme === 'standard' ? 'Standard VAT Accounting' : settingsForm.vat_scheme === 'flat_rate' ? 'Flat Rate Scheme' : 'Cash Accounting'}</p>
            ${settingsForm.vat_number ? `<p><strong>VAT Number:</strong> ${settingsForm.vat_number}</p>` : ''}
          </div>
          <table>
            <tr>
              <td><strong>Total Revenue</strong></td>
              <td class="text-right">£${summary.totalRevenue.toFixed(2)}</td>
            </tr>
            <tr>
              <td>VAT Exempt Revenue (Medical/Therapeutic)</td>
              <td class="text-right">£${summary.vatExemptRevenue.toFixed(2)}</td>
            </tr>
            <tr>
              <td>VAT Taxable Revenue (Cosmetic)</td>
              <td class="text-right">£${summary.vatTaxableRevenue.toFixed(2)}</td>
            </tr>
            <tr style="background: #f8fafc; font-weight: bold;">
              <td><strong>VAT Owed (${settingsForm.vat_scheme === 'standard' ? '20%' : settingsForm.flat_rate_percentage + '%'})</strong></td>
              <td class="text-right"><strong>£${summary.vatOwed.toFixed(2)}</strong></td>
            </tr>
          </table>
          <div class="highlight-box">
            <p><strong>⚠️ Important:</strong> Most medical treatments are VAT exempt. Cosmetic treatments may be taxable. Consult with your accountant to properly classify your treatments.</p>
          </div>
        </section>
        ` : ''}

        <section>
          <h2>Allowable Expenses Breakdown</h2>
          <p style="color: #64748b; margin-bottom: 20px;">Expenses categorized for HMRC self-assessment</p>
          <table>
            <thead>
              <tr>
                <th>Expense Category</th>
                <th class="text-right">Total (£)</th>
                <th>HMRC Classification</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(summary.allowableExpenses).map(([category, amount]) => {
                const hmrcCategory = {
                  'Rent': 'Premises costs',
                  'Products': 'Cost of goods sold',
                  'Wages': 'Staff costs',
                  'Insurance': 'Insurance',
                  'Marketing': 'Advertising',
                  'Utilities': 'Premises costs',
                  'Equipment': 'Capital allowances',
                  'Other': 'Other business expenses'
                }[category] || 'Other business expenses';
                return `
                  <tr>
                    <td>${category}</td>
                    <td class="text-right">£${amount.toFixed(2)}</td>
                    <td style="color: #64748b; font-size: 12px;">${hmrcCategory}</td>
                  </tr>
                `;
              }).join('')}
              <tr>
                <td><strong>Product Costs</strong></td>
                <td class="text-right"><strong>£${summary.productCosts.toFixed(2)}</strong></td>
                <td style="color: #64748b; font-size: 12px;">Cost of goods sold</td>
              </tr>
              <tr style="background: #f8fafc; font-weight: bold;">
                <td><strong>Total Allowable Expenses</strong></td>
                <td class="text-right"><strong>£${summary.totalCosts.toFixed(2)}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </section>

        <div class="page-break"></div>

        <section>
          <h2>Income Ledger (Tax Year ${taxYear})</h2>
          <p style="color: #64748b; margin-bottom: 20px;">${filteredTreatments.length} treatment entries</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Treatment</th>
                <th class="text-right">Amount</th>
                <th>Status</th>
                <th>VAT Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTreatments.map(t => {
                const isExempt = ['Wellness', 'Consultation'].includes(t.treatment_name);
                return `
                  <tr>
                    <td>${format(new Date(t.date), 'dd/MM/yyyy')}</td>
                    <td>${t.patient_name || '-'}</td>
                    <td>${t.treatment_name}</td>
                    <td class="text-right">£${(t.amount_paid || t.price_paid || 0).toFixed(2)}</td>
                    <td>${t.payment_status}</td>
                    <td style="color: ${isExempt ? '#16a34a' : '#dc2626'}; font-size: 12px;">
                      ${isExempt ? 'Exempt' : 'Taxable'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </section>

        <div class="page-break"></div>

        <section>
          <h2>Expenses Ledger (Tax Year ${taxYear})</h2>
          <p style="color: #64748b; margin-bottom: 20px;">${filteredExpenses.length} expense entries</p>
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
                  <td>${format(new Date(e.date), 'dd/MM/yyyy')}</td>
                  <td>${e.category}</td>
                  <td class="text-right">£${(e.amount || 0).toFixed(2)}</td>
                  <td>${e.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Tax Compliance Notes</h2>
          <div class="info-box">
            <h3 style="margin-top: 0; color: #1e40af;">Important Information for HMRC</h3>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>This report covers tax year ${taxYear}</li>
              <li>All amounts are in GBP (£)</li>
              <li>Revenue figures include only received payments</li>
              <li>Expenses are categorized according to HMRC guidelines</li>
              <li>Keep all receipts and invoices for at least 6 years</li>
              <li>This report should be reviewed by a qualified accountant</li>
            </ul>
          </div>
        </section>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    toast({
      title: "Tax report opened",
      description: "Use your browser's print dialog to save as PDF",
      className: "bg-green-50 border-green-200"
    });
  };

  const summary = calculateTaxSummary();
  const { filteredTreatments, filteredExpenses } = getFilteredDataForTaxYear();

  const keyDates = [
    { date: '31 January', description: 'Self-assessment tax return deadline', type: 'critical' },
    { date: '31 January', description: 'Payment on account deadline (1st payment)', type: 'critical' },
    { date: '31 July', description: 'Payment on account deadline (2nd payment)', type: 'important' },
    { date: '5 April', description: 'Tax year end', type: 'info' },
    { date: '19th of each month', description: 'PAYE/NI payment deadline (if applicable)', type: 'info' },
  ];

  if (settingsForm.vat_registered) {
    keyDates.push(
      { date: 'Quarterly', description: 'VAT return submission', type: 'important' },
      { date: '1 month after quarter end', description: 'VAT payment deadline', type: 'important' }
    );
  }

  return (
    <div className="p-6 md:p-10 bg-[#F5F6F8] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">UK Tax Compliance</h1>
            <p className="text-gray-600">Manage tax records and HMRC requirements</p>
          </div>
          <Button
            onClick={() => setSettingsDialogOpen(true)}
            variant="outline"
            className="border-[#2C3E50] text-[#2C3E50] hover:bg-gray-50 rounded-xl"
          >
            <Settings className="w-5 h-5 mr-2" />
            Tax Settings
          </Button>
        </div>

        {!taxSettings && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">Setup Required</h3>
                <p className="text-yellow-800 mb-3">
                  Please configure your tax settings to get accurate compliance information.
                </p>
                <Button
                  onClick={() => setSettingsDialogOpen(true)}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg"
                >
                  Configure Settings
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tax Year Selector */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Tax Year</h3>
              <p className="text-sm text-gray-600">UK tax year runs from 6 April to 5 April</p>
            </div>
            <Select value={taxYear} onValueChange={setTaxYear}>
              <SelectTrigger className="w-full md:w-48 rounded-xl border-gray-300 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024-2025">2024/2025</SelectItem>
                <SelectItem value="2023-2024">2023/2024</SelectItem>
                <SelectItem value="2022-2023">2022/2023</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Total Turnover</p>
                <p className="text-3xl font-bold text-green-600">£{summary.totalRevenue.toFixed(0)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-gray-500">{filteredTreatments.length} treatments</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Total Expenses</p>
                <p className="text-3xl font-bold text-red-600">£{summary.totalCosts.toFixed(0)}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-gray-500">{filteredExpenses.length} expense entries</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Net Profit</p>
                <p className={`text-3xl font-bold ${summary.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  £{summary.profit.toFixed(0)}
                </p>
              </div>
              <div className={`w-12 h-12 ${summary.profit >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-2xl flex items-center justify-center`}>
                <Shield className={`w-6 h-6 ${summary.profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
            <p className="text-xs text-gray-500">Before tax</p>
          </div>

          {settingsForm.vat_registered && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">VAT Owed</p>
                  <p className="text-3xl font-bold text-blue-600">£{summary.vatOwed.toFixed(0)}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500">{settingsForm.vat_scheme || 'Standard'} scheme</p>
            </div>
          )}
        </div>

        {/* Expense Categories for Tax */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Allowable Expenses by Category</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(summary.allowableExpenses).map(([category, amount]) => (
              <div key={category} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-gray-900">{category}</p>
                    <p className="text-xs text-gray-500">
                      {filteredExpenses.filter(e => e.category === category).length} entries
                    </p>
                  </div>
                  <p className="text-xl font-bold text-[#2C3E50]">£{amount.toFixed(2)}</p>
                </div>
              </div>
            ))}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-900">Product Costs</p>
                  <p className="text-xs text-gray-500">From treatments</p>
                </div>
                <p className="text-xl font-bold text-[#2C3E50]">£{summary.productCosts.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Key Tax Dates */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-6 h-6 text-[#2C3E50]" />
            <h3 className="text-xl font-semibold text-gray-900">Key Tax Dates</h3>
          </div>
          <div className="space-y-3">
            {keyDates.map((item, index) => (
              <div 
                key={index}
                className={`flex items-start gap-4 p-4 rounded-xl ${
                  item.type === 'critical' ? 'bg-red-50 border-2 border-red-200' :
                  item.type === 'important' ? 'bg-yellow-50 border-2 border-yellow-200' :
                  'bg-blue-50 border-2 border-blue-200'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.type === 'critical' ? 'bg-red-500' :
                  item.type === 'important' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}>
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className={`font-semibold ${
                    item.type === 'critical' ? 'text-red-900' :
                    item.type === 'important' ? 'text-yellow-900' :
                    'text-blue-900'
                  }`}>
                    {item.date}
                  </p>
                  <p className={`text-sm ${
                    item.type === 'critical' ? 'text-red-800' :
                    item.type === 'important' ? 'text-yellow-800' :
                    'text-blue-800'
                  }`}>
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* HMRC Guidance */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Info className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">HMRC Record Keeping Requirements</h3>
              <div className="space-y-3 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p><strong>Keep all records for at least 6 years</strong> from the end of the tax year</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p><strong>VAT-exempt treatments:</strong> Most medical and therapeutic treatments (physiotherapy, medical consultations)</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p><strong>VAT-taxable treatments:</strong> Purely cosmetic procedures (Botox for wrinkles, dermal fillers for aesthetics)</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p><strong>Allowable expenses:</strong> Rent, products, equipment, insurance, marketing, utilities, staff costs</p>
                </div>
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p><strong>Capital allowances:</strong> Equipment over £1,000 may qualify for Annual Investment Allowance</p>
                </div>
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p><strong>Making Tax Digital:</strong> Ensure digital records are maintained for VAT (if registered)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Export Section */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-[#2C3E50] rounded-2xl flex items-center justify-center flex-shrink-0">
              <Download className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Export Tax Report</h3>
              <p className="text-gray-600 mb-4">
                Generate a comprehensive tax report for tax year {taxYear} ready for your accountant or HMRC submission
              </p>
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Report includes:</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                    Income summary with VAT analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                    Allowable expenses categorized for HMRC
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                    Complete income and expense ledgers
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                    Net profit calculation
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#2C3E50] rounded-full" />
                    Compliance notes and record-keeping guidance
                  </li>
                </ul>
              </div>
              <Button
                onClick={exportTaxReport}
                className="bg-[#2C3E50] hover:bg-[#34495E] text-white rounded-xl"
              >
                <Download className="w-5 h-5 mr-2" />
                Download Tax Report for {taxYear}
              </Button>
            </div>
          </div>
        </div>

        {/* Tax Settings Dialog */}
        <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Tax Settings</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSettingsSubmit} className="space-y-6 mt-4">
              <div className="space-y-2">
                <Label htmlFor="business_structure" className="text-sm font-medium text-gray-700">Business Structure *</Label>
                <Select
                  value={settingsForm.business_structure}
                  onValueChange={(value) => setSettingsForm({...settingsForm, business_structure: value})}
                  required
                >
                  <SelectTrigger className="rounded-xl border-gray-300 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sole_trader">Sole Trader</SelectItem>
                    <SelectItem value="partnership">Partnership</SelectItem>
                    <SelectItem value="limited_company">Limited Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="utr_number" className="text-sm font-medium text-gray-700">Unique Taxpayer Reference (UTR)</Label>
                <Input
                  id="utr_number"
                  value={settingsForm.utr_number}
                  onChange={(e) => setSettingsForm({...settingsForm, utr_number: e.target.value})}
                  placeholder="1234567890"
                  className="rounded-xl border-gray-300 h-11"
                />
                <p className="text-xs text-gray-500">10-digit number from HMRC</p>
              </div>

              {settingsForm.business_structure === 'limited_company' && (
                <div className="space-y-2">
                  <Label htmlFor="company_number" className="text-sm font-medium text-gray-700">Companies House Number</Label>
                  <Input
                    id="company_number"
                    value={settingsForm.company_number}
                    onChange={(e) => setSettingsForm({...settingsForm, company_number: e.target.value})}
                    placeholder="12345678"
                    className="rounded-xl border-gray-300 h-11"
                  />
                </div>
              )}

              <div className="border-t border-gray-200 pt-6">
                <h4 className="font-semibold text-gray-900 mb-4">VAT Settings</h4>
                
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    id="vat_registered"
                    checked={settingsForm.vat_registered}
                    onChange={(e) => setSettingsForm({...settingsForm, vat_registered: e.target.checked})}
                    className="w-4 h-4 text-[#2C3E50] border-gray-300 rounded"
                  />
                  <Label htmlFor="vat_registered" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Business is VAT registered
                  </Label>
                </div>

                {settingsForm.vat_registered && (
                  <>
                    <div className="space-y-2 mb-4">
                      <Label htmlFor="vat_number" className="text-sm font-medium text-gray-700">VAT Number</Label>
                      <Input
                        id="vat_number"
                        value={settingsForm.vat_number}
                        onChange={(e) => setSettingsForm({...settingsForm, vat_number: e.target.value})}
                        placeholder="GB123456789"
                        className="rounded-xl border-gray-300 h-11"
                      />
                    </div>

                    <div className="space-y-2 mb-4">
                      <Label htmlFor="vat_scheme" className="text-sm font-medium text-gray-700">VAT Scheme</Label>
                      <Select
                        value={settingsForm.vat_scheme}
                        onValueChange={(value) => setSettingsForm({...settingsForm, vat_scheme: value})}
                      >
                        <SelectTrigger className="rounded-xl border-gray-300 h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard VAT Accounting</SelectItem>
                          <SelectItem value="flat_rate">Flat Rate Scheme</SelectItem>
                          <SelectItem value="cash_accounting">Cash Accounting</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {settingsForm.vat_scheme === 'flat_rate' && (
                      <div className="space-y-2">
                        <Label htmlFor="flat_rate_percentage" className="text-sm font-medium text-gray-700">Flat Rate Percentage</Label>
                        <Input
                          id="flat_rate_percentage"
                          type="number"
                          step="0.1"
                          value={settingsForm.flat_rate_percentage}
                          onChange={(e) => setSettingsForm({...settingsForm, flat_rate_percentage: e.target.value})}
                          placeholder="e.g. 12.5"
                          className="rounded-xl border-gray-300 h-11"
                        />
                        <p className="text-xs text-gray-500">Medical/dental practices: 6.5% (first year) or 7.5%</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSettingsDialogOpen(false)}
                  className="flex-1 rounded-xl border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#2C3E50] hover:bg-[#34495E] rounded-xl"
                >
                  Save Settings
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}