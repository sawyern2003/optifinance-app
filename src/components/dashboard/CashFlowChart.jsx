import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const cashIn = payload.find(p => p.dataKey === 'cashIn')?.value || 0;
    const cashOut = payload.find(p => p.dataKey === 'cashOut')?.value || 0;
    const net = cashIn - cashOut;

    return (
      <div className="bg-[#0a0e1a]/95 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
        <p className="text-sm font-light text-white/90 mb-3 tracking-wider">{label}</p>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-white/50 font-light">Cash In</span>
            </div>
            <span className="text-sm font-light text-white/90">£{cashIn.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="text-xs text-white/50 font-light">Cash Out</span>
            </div>
            <span className="text-sm font-light text-white/90">£{cashOut.toFixed(2)}</span>
          </div>

          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center justify-between gap-6">
              <span className="text-xs font-light text-white/60">Net Cash Flow</span>
              <span className={`text-sm font-light ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#4d647f]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-light text-white/90 mb-6 tracking-wider">Cash In / Cash Out</h3>

        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#ffffff40"
                style={{ fontSize: '12px', fontWeight: '300' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                stroke="#ffffff40"
                style={{ fontSize: '12px', fontWeight: '300' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `£${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '13px', paddingTop: '20px', fontWeight: '300', color: '#ffffff90' }}
                iconType="circle"
              />
              <Bar
                dataKey="cashIn"
                fill="#34d399"
                radius={[6, 6, 0, 0]}
                name="Cash In"
              />
              <Bar
                dataKey="cashOut"
                fill="#f87171"
                radius={[6, 6, 0, 0]}
                name="Cash Out"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12">
            <p className="text-white/40 font-light">No data available for this period</p>
          </div>
        )}
      </div>
    </div>
  );
}
