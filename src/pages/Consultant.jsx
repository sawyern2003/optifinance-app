import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, Plus, Menu, X, MessageSquare, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function Consultant() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);

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

  const { data: treatmentCatalog } = useQuery({
    queryKey: ['treatmentCatalog'],
    queryFn: () => base44.entities.TreatmentCatalog.list(),
    initialData: [],
  });

  const { data: patients } = useQuery({
    queryKey: ['patients'],
    queryFn: () => base44.entities.Patient.list('name'),
    initialData: [],
  });

  const { data: chatHistory } = useQuery({
    queryKey: ['chatHistory'],
    queryFn: () => base44.entities.ChatHistory.list('-updated_date'),
    initialData: [],
  });

  const createChatMutation = useMutation({
    mutationFn: (data) => base44.entities.ChatHistory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] });
    },
  });

  const updateChatMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ChatHistory.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] });
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: (id) => base44.entities.ChatHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory'] });
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setSidebarOpen(false);
  };

  const loadChat = (chat) => {
    setMessages(chat.messages || []);
    setCurrentChatId(chat.id);
    setSidebarOpen(false);
  };

  const deleteChat = async (chatId) => {
    if (currentChatId === chatId) {
      startNewChat();
    }
    await deleteChatMutation.mutateAsync(chatId);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Calculate current stats
      const revenue = treatments.reduce((sum, t) => {
        if (t.payment_status === 'pending') return sum;
        return sum + (t.amount_paid || t.price_paid || 0);
      }, 0);

      const costs = expenses.reduce((sum, e) => sum + (e.amount || 0), 0) + 
                    treatments.reduce((sum, t) => sum + (t.product_cost || 0), 0);
      
      const profit = revenue - costs;

      const outstanding = treatments.reduce((sum, t) => {
        if (t.payment_status === 'pending') return sum + (t.price_paid || 0);
        if (t.payment_status === 'partially_paid') return sum + ((t.price_paid || 0) - (t.amount_paid || 0));
        return sum;
      }, 0);

      // Category breakdown
      const categoryMap = {};
      treatments.forEach(t => {
        const catalogTreatment = treatmentCatalog.find(ct => ct.treatment_name === t.treatment_name);
        const category = catalogTreatment?.category || 'Other';
        
        if (!categoryMap[category]) {
          categoryMap[category] = { revenue: 0, count: 0 };
        }
        
        const actualRevenue = t.payment_status === 'pending' ? 0 : (t.amount_paid || t.price_paid || 0);
        categoryMap[category].revenue += actualRevenue;
        categoryMap[category].count += 1;
      });

      const { data: user } = await base44.auth.me();

      const clinicContext = {
        clinicLocation: "United Kingdom",
        currency: "GBP",
        clinicName: user?.clinic_name || "your clinic",
        totalRevenue: revenue,
        totalCosts: costs,
        netProfit: profit,
        outstandingPayments: outstanding,
        totalTreatments: treatments.length,
        totalPatients: patients.length,
        categoryBreakdown: Object.entries(categoryMap).map(([name, data]) => ({
          category: name,
          revenue: data.revenue,
          count: data.count
        })),
        treatmentCatalog: treatmentCatalog.map(t => ({
          name: t.treatment_name,
          category: t.category,
          price: t.default_price,
          duration: t.duration_minutes
        })),
        recentTreatments: treatments.slice(0, 20).map(t => ({
          date: t.date,
          treatment: t.treatment_name,
          price: t.price_paid,
          paymentStatus: t.payment_status,
          patientName: t.patient_name
        }))
      };

      const prompt = `You are an expert business consultant specializing in beauty and wellness clinics. You provide strategic advice, financial insights, and operational recommendations based on real clinic data.

CLINIC DATA:
${JSON.stringify(clinicContext, null, 2)}

USER QUESTION: ${userMessage}

Provide a professional, helpful, and actionable response. Use the actual data to support your insights. Be specific with numbers when relevant. If asked about recommendations, provide concrete, implementable strategies. Keep the tone friendly yet professional.`;

      const response = await base44.functions.invoke('consultantChat', {
        clinicContext: clinicContext,
        userMessage: userMessage
      });

      const assistantMessage = response.data.message;
      const updatedMessages = [...newMessages, { role: "assistant", content: assistantMessage }];
      setMessages(updatedMessages);

      // Save or update chat history
      const chatTitle = messages.length === 0 
        ? userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '')
        : (chatHistory.find(c => c.id === currentChatId)?.title || userMessage.slice(0, 50));

      if (currentChatId) {
        await updateChatMutation.mutateAsync({
          id: currentChatId,
          data: { title: chatTitle, messages: updatedMessages }
        });
      } else {
        const newChat = await createChatMutation.mutateAsync({
          title: chatTitle,
          messages: updatedMessages
        });
        setCurrentChatId(newChat.id);
      }
    } catch (error) {
      console.error("AI consultant error:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "I apologize, but I encountered an error processing your request. Please try again." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQuestions = [
    "What are my top performing treatments?",
    "How can I improve my profit margins?",
    "Show me my revenue trends",
    "What pricing changes would you recommend?",
    "Which expenses should I review?"
  ];

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-gray-200 transform transition-transform duration-300 md:relative md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Chat History</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
              className="md:hidden"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="p-3">
            <Button
              onClick={startNewChat}
              className="w-full bg-gradient-to-r from-[#1a2845] to-[#2a3f5f] hover:from-[#0f1829] hover:to-[#1a2845] text-white rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatHistory.map((chat) => (
              <div
                key={chat.id}
                className={`group p-3 rounded-xl cursor-pointer transition-colors ${
                  currentChatId === chat.id
                    ? 'bg-[#fef9f0] border border-[#f0e9d8]'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
                onClick={() => loadChat(chat)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {chat.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(chat.updated_date), 'MMM d, h:mm a')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with menu button */}
        <div className="border-b border-gray-200 bg-white p-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#1a2845]" />
            <h1 className="text-base font-light text-[#1a2845] tracking-tight">AI Consultant</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[70vh]">
                <div className="w-16 h-16 bg-[#1a2845] rounded-lg flex items-center justify-center mb-6">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-light text-[#1a2845] mb-4 tracking-tight">How can I help you today?</h1>
                <p className="text-sm text-gray-500 text-center mb-8 max-w-md font-light">
                  Ask for advice, retrieve information about your clinic, or get insights into your business operations
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                  {suggestedQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => setInput(question)}
                      className="text-left p-4 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-purple-400 transition-all text-gray-700 hover:text-gray-900"
                    >
                      <span className="text-sm">{question}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-32">
                {messages.map((message, index) => (
                  <div key={index} className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 bg-gradient-to-br from-[#1a2845] to-[#2a3f5f] rounded-lg flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className={`flex-1 max-w-3xl ${message.role === 'user' ? 'text-right' : ''}`}>
                      <div className={`inline-block text-left ${
                        message.role === 'user' 
                          ? 'bg-gray-100 text-gray-900 rounded-2xl px-4 py-3' 
                          : 'text-gray-900'
                      }`}>
                        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
                      </div>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 bg-gradient-to-br from-[#1a2845] to-[#2a3f5f] rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-semibold">You</span>
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#1a2845] to-[#2a3f5f] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex items-center">
                      <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Fixed Input at Bottom */}
        <div className="border-t border-gray-200 bg-white py-4">
          <div className="max-w-3xl mx-auto px-4">
            <div className="bg-white rounded-2xl border border-gray-300 p-2 flex gap-2 items-end shadow-sm">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Message your AI consultant..."
                className="bg-transparent border-0 text-gray-900 placeholder:text-gray-400 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-[200px]"
                rows={1}
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="bg-gradient-to-r from-[#1a2845] to-[#2a3f5f] hover:from-[#0f1829] hover:to-[#1a2845] text-white rounded-xl h-10 w-10 p-0 flex-shrink-0 disabled:opacity-30"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              AI Consultant has access to all your clinic data
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}