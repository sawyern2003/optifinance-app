import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const cashIn = payload.find(p => p.dataKey === 'cashIn')?.value || 0;
    const cashOut = payload.find(p => p.dataKey === 'cashOut')?.value || 0;
    const net = cashIn - cashOut;
    
    return (
      <div className="bg-white p-4 rounded-xl shadow-lg border border-[#e5e7eb]">
        <p className="text-sm font-medium text-slate-800 mb-3">{label}</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-500">Cash In</span>
            </div>
            <span className="text-sm font-medium text-slate-900">£{cashIn.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-xs text-slate-500">Cash Out</span>
            </div>
            <span className="text-sm font-medium text-slate-900">£{cashOut.toFixed(2)}</span>
          </div>
          
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-6">
              <span className="text-xs font-medium text-slate-700">Net Cash Flow</span>
              <span className={`text-sm font-medium ${net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                £{net.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function CashFlowChart({ data }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e9e6df]">
      <h3 className="text-lg font-medium text-[#1f2f46] mb-6">Cash In / Cash Out</h3>
      
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
            <XAxis 
              dataKey="month" 
              stroke="#94a3b8" 
              style={{ fontSize: '12px' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              stroke="#94a3b8" 
              style={{ fontSize: '12px' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `£${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ fontSize: '13px', paddingTop: '20px' }}
              iconType="circle"
            />
            <Bar 
              dataKey="cashIn" 
              fill="#34b37b" 
              radius={[6, 6, 0, 0]}
              name="Cash In"
            />
            <Bar 
              dataKey="cashOut" 
              fill="#e07a7a" 
              radius={[6, 6, 0, 0]}
              name="Cash Out"
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No data available for this period</p>
        </div>
      )}
    </div>
  );
}