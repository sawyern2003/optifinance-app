
import React, { useState } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, Sparkles, Plus, Trash2, Loader2, Lightbulb, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function BusinessIntelligence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("optimizer");
  const [competitorDialogOpen, setCompetitorDialogOpen] = useState(false);
  const [analyzingCompetitors, setAnalyzingCompetitors] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [competitorToDelete, setCompetitorToDelete] = useState(null);
  const [competitorForm, setCompetitorForm] = useState({
    competitor_name: '',
    location: '',
    treatment_name: '',
    treatment_category: '',
    price: '',
    notes: ''
  });

  const { data: treatmentCatalog } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => api.entities.TreatmentCatalog.list('treatment_name'),
    initialData: [],
  });

  const { data: treatments } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => api.entities.TreatmentEntry.list('-date'),
    initialData: [],
  });

  const { data: competitorPricing } = useQuery({
    queryKey: ['competitorPricing'],
    queryFn: () => api.entities.CompetitorPricing.list('-created_date'),
    initialData: [],
  });

  const createCompetitorMutation = useMutation({
    mutationFn: (data) => api.entities.CompetitorPricing.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitorPricing'] });
      toast({
        title: "Competitor price added",
        className: "bg-green-50 border-green-200"
      });
      setCompetitorForm({
        competitor_name: '',
        location: '',
        treatment_name: '',
        treatment_category: '',
        price: '',
        notes: ''
      });
      setCompetitorDialogOpen(false);
    },
  });

  const deleteCompetitorMutation = useMutation({
    mutationFn: (id) => api.entities.CompetitorPricing.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitorPricing'] });
      toast({
        title: "Competitor price deleted",
        className: "bg-red-50 border-red-200"
      });
      setDeleteConfirmOpen(false);
      setCompetitorToDelete(null);
    },
  });

  const handleDeleteClick = (competitor) => {
    setCompetitorToDelete(competitor);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (competitorToDelete) {
      deleteCompetitorMutation.mutate(competitorToDelete.id);
    }
  };

  const handleCompetitorSubmit = (e) => {
    e.preventDefault();
    createCompetitorMutation.mutate({
      competitor_name: competitorForm.competitor_name,
      location: competitorForm.location,
      treatment_name: competitorForm.treatment_name,
      treatment_category: competitorForm.treatment_category,
      price: parseFloat(competitorForm.price),
      notes: competitorForm.notes
    });
  };

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

  // Get competitor comparison data
  const getCompetitorComparison = () => {
    return treatmentCatalog.map(treatment => {
      const competitorPrices = competitorPricing.filter(
        cp => cp.treatment_name.toLowerCase() === treatment.treatment_name.toLowerCase()
      );

      const avgCompetitorPrice = competitorPrices.length > 0
        ? competitorPrices.reduce((sum, cp) => sum + cp.price, 0) / competitorPrices.length
        : null;

      const priceDifference = avgCompetitorPrice
        ? ((treatment.default_price - avgCompetitorPrice) / avgCompetitorPrice * 100)
        : null;

      return {
        treatment,
        competitorPrices,
        avgCompetitorPrice,
        priceDifference
      };
    }).filter(item => item.competitorPrices.length > 0);
  };

  // AI-powered pricing analysis
  const analyzeWithAI = async () => {
    setAnalyzingCompetitors(true);

    const optimizerMetrics = calculateOptimizerMetrics();
    const competitorComparison = getCompetitorComparison();

    const prompt = `You are a pricing strategy consultant for an aesthetic clinic. Analyze the following data and provide strategic pricing recommendations:

CLINIC'S CURRENT TREATMENTS:
${optimizerMetrics.map(m => `- ${m.treatment_name}: £${m.default_price}, ${m.count} performed, ${m.duration_minutes || 'N/A'} min, £${m.revenuePerMinute.toFixed(2)}/min`).join('\n')}

COMPETITOR PRICING DATA:
${competitorComparison.map(c =>
  `- ${c.treatment.treatment_name}:
    Our price: £${c.treatment.default_price}
    Competitor avg: £${c.avgCompetitorPrice.toFixed(2)}
    Difference: ${c.priceDifference > 0 ? '+' : ''}${c.priceDifference.toFixed(1)}%
    Competitors: ${c.competitorPrices.map(cp => `${cp.competitor_name} (£${cp.price})`).join(', ')}`
).join('\n\n')}

Please provide:
1. Top 3 pricing adjustment recommendations with specific new prices and reasoning
2. Market positioning analysis (are we premium, competitive, or budget?)
3. Opportunities for bundling or package deals
4. Treatments that are underpriced or overpriced compared to market
5. Strategic insights on which treatments to promote more

Be specific, actionable, and focus on maximizing revenue while staying competitive.`;

    try {
      const { insights } = await api.integrations.Core.AnalyzePricingInsights({
        prompt,
      });

      setAiInsights(insights || "");
      toast({
        title: "Analysis complete",
        description: "AI recommendations generated",
        className: "bg-green-50 border-green-200"
      });
    } catch (error) {
      console.error('AI analysis failed:', error);
      toast({
        title: "Analysis failed",
        description: error?.message || "Could not generate AI recommendations",
        className: "bg-red-50 border-red-200"
      });
    } finally {
      setAnalyzingCompetitors(false);
    }
  };

  const optimizerMetrics = calculateOptimizerMetrics();
  const competitorComparison = getCompetitorComparison();

  return (
    <div className="min-h-screen relative overflow-hidden p-6" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 50%, #0f1419 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#d6b164]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-5xl font-light tracking-wider text-white/90 mb-3">Business Intelligence</h1>
            <p className="text-lg font-light text-white/60">Optimize pricing strategy and analyze market positioning</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="relative group mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#4d647f]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="border-b border-white/10 p-6 pb-0">
              <div className="flex gap-2 overflow-x-auto">
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
                <button
                  onClick={() => setActiveTab("competitors")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-t-2xl font-light tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === "competitors"
                      ? 'bg-[#d6b164]/20 backdrop-blur-xl border-l border-r border-t border-[#d6b164]/30 text-[#d6b164]'
                      : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  Competitor Analysis
                </button>
              </div>
            </div>

            <div className="p-6">
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

              {/* Competitor Analysis Tab */}
              {activeTab === "competitors" && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <p className="text-white/60 font-light">
                      Compare your pricing with competitors and get AI-powered recommendations
                    </p>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setCompetitorDialogOpen(true)}
                        variant="outline"
                        className="bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 rounded-2xl font-light"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        Add Competitor Price
                      </Button>
                      <Button
                        onClick={analyzeWithAI}
                        disabled={analyzingCompetitors || competitorPricing.length === 0}
                        className="bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164] rounded-2xl font-light tracking-wider"
                      >
                        {analyzingCompetitors ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5 mr-2" />
                            AI Analysis
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {aiInsights && (
                    <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 backdrop-blur-xl border-2 border-[#d6b164]/30 rounded-2xl p-6 mb-6">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 rounded-2xl flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-6 h-6 text-[#d6b164]" />
                        </div>
                        <div>
                          <h3 className="text-xl font-light text-white/90 tracking-wider">AI Pricing Recommendations</h3>
                          <p className="text-sm text-white/60 font-light">Generated by advanced market analysis</p>
                        </div>
                      </div>
                      <div className="prose prose-sm max-w-none text-white/80 whitespace-pre-wrap bg-white/5 backdrop-blur-xl rounded-2xl p-6 font-light">
                        {aiInsights}
                      </div>
                    </div>
                  )}

                  {competitorComparison.length === 0 ? (
                    <div className="text-center py-12 bg-white/5 backdrop-blur-xl rounded-2xl border-2 border-dashed border-white/10">
                      <AlertCircle className="w-12 h-12 text-white/20 mx-auto mb-3" />
                      <p className="text-white/50 mb-2 font-light">No competitor data yet</p>
                      <p className="text-sm text-white/40 font-light">Add competitor pricing to see comparison analysis</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {competitorComparison.map((item) => (
                        <div key={item.treatment.id} className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 hover:border-[#d6b164]/30 transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-xl font-light text-white/90 tracking-wider">{item.treatment.treatment_name}</h3>
                              <p className="text-sm text-white/50 font-light">{item.treatment.category}</p>
                            </div>
                            <div className={`px-4 py-2 rounded-2xl font-light backdrop-blur-xl border ${
                              item.priceDifference > 10 ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                              item.priceDifference > 0 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                              item.priceDifference > -10 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                              'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            }`}>
                              {item.priceDifference > 0 ? '+' : ''}{item.priceDifference.toFixed(1)}%
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                              <p className="text-sm text-white/40 mb-1 font-light tracking-wider uppercase">Your Price</p>
                              <p className="text-2xl font-light text-[#d6b164]">£{item.treatment.default_price.toFixed(2)}</p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                              <p className="text-sm text-white/40 mb-1 font-light tracking-wider uppercase">Competitor Average</p>
                              <p className="text-2xl font-light text-white/90">£{item.avgCompetitorPrice.toFixed(2)}</p>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/10">
                            <p className="text-sm font-light text-white/50 mb-2 tracking-wider">Competitor Prices:</p>
                            <div className="space-y-2">
                              {item.competitorPrices.map((cp) => (
                                <div key={cp.id} className="flex justify-between items-center bg-white/5 backdrop-blur-xl rounded-2xl p-3 border border-white/10">
                                  <div>
                                    <p className="font-light text-white/90">{cp.competitor_name}</p>
                                    {cp.location && <p className="text-xs text-white/40 font-light">{cp.location}</p>}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <p className="font-light text-white/90">£{cp.price.toFixed(2)}</p>
                                    <button
                                      onClick={() => handleDeleteClick(cp)}
                                      className="p-1 hover:bg-rose-500/10 rounded text-white/40 hover:text-rose-400 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Add Competitor Dialog */}
        <Dialog open={competitorDialogOpen} onOpenChange={setCompetitorDialogOpen}>
          <DialogContent className="sm:max-w-md bg-[#0a0e1a] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-light tracking-wider text-white/90">Add Competitor Pricing</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCompetitorSubmit} className="space-y-5 mt-4">
              <div className="space-y-2">
                <Label htmlFor="competitor_name" className="text-sm font-light text-white/70">Competitor Name *</Label>
                <Input
                  id="competitor_name"
                  value={competitorForm.competitor_name}
                  onChange={(e) => setCompetitorForm({...competitorForm, competitor_name: e.target.value})}
                  placeholder="e.g. Elite Aesthetics"
                  className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/90 font-light h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="text-sm font-light text-white/70">Location</Label>
                <Input
                  id="location"
                  value={competitorForm.location}
                  onChange={(e) => setCompetitorForm({...competitorForm, location: e.target.value})}
                  placeholder="e.g. London, Manchester"
                  className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/90 font-light h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="treatment_name" className="text-sm font-light text-white/70">Treatment *</Label>
                <Select
                  value={competitorForm.treatment_name}
                  onValueChange={(value) => {
                    const treatment = treatmentCatalog.find(t => t.treatment_name === value);
                    setCompetitorForm({
                      ...competitorForm,
                      treatment_name: value,
                      treatment_category: treatment?.category || ''
                    });
                  }}
                  required
                >
                  <SelectTrigger className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/90 font-light h-11">
                    <SelectValue placeholder="Select treatment" />
                  </SelectTrigger>
                  <SelectContent>
                    {treatmentCatalog.map((treatment) => (
                      <SelectItem key={treatment.id} value={treatment.treatment_name}>
                        {treatment.treatment_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price" className="text-sm font-light text-white/70">Price (£) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={competitorForm.price}
                  onChange={(e) => setCompetitorForm({...competitorForm, price: e.target.value})}
                  placeholder="0.00"
                  className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/90 font-light h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-light text-white/70">Notes</Label>
                <Textarea
                  id="notes"
                  value={competitorForm.notes}
                  onChange={(e) => setCompetitorForm({...competitorForm, notes: e.target.value})}
                  placeholder="Additional information..."
                  className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/90 font-light"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCompetitorDialogOpen(false)}
                  className="flex-1 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 font-light"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 hover:bg-[#d6b164]/30 text-[#d6b164] rounded-2xl font-light tracking-wider"
                  disabled={createCompetitorMutation.isPending}
                >
                  Add Competitor
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md bg-[#0a0e1a] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-xl font-light tracking-wider flex items-center gap-2 text-white/90">
                <Trash2 className="w-6 h-6 text-rose-400" />
                Confirm Deletion
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <p className="text-white/70 font-light">
                Are you sure you want to delete this competitor price?
              </p>
              {competitorToDelete && (
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-3 border border-white/10">
                  <p className="text-sm text-white/60 font-light">Competitor: <span className="font-light text-white/90">{competitorToDelete.competitor_name}</span></p>
                  <p className="text-sm text-white/60 font-light">Treatment: <span className="font-light text-white/90">{competitorToDelete.treatment_name}</span></p>
                  <p className="text-sm text-white/60 font-light">Price: <span className="font-light text-white/90">£{competitorToDelete.price?.toFixed(2)}</span></p>
                </div>
              )}
              <p className="text-sm text-rose-400 font-light">This action cannot be undone.</p>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="flex-1 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white/90 font-light"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  className="flex-1 bg-rose-500/20 backdrop-blur-xl border border-rose-500/30 hover:bg-rose-500/30 text-rose-400 rounded-2xl font-light"
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
