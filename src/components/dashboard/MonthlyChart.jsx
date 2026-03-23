import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const revenue = payload.find(p => p.dataKey === 'revenue')?.value || 0;
    const costs = payload.find(p => p.dataKey === 'costs')?.value || 0;
    const profit = payload.find(p => p.dataKey === 'profit')?.value || 0;
    
    // Get previous month data for percentage calculation
    const prevData = payload[0].payload.prevData;
    
    let revenueChange = null;
    let costsChange = null;
    let profitChange = null;
    
    if (prevData) {
      if (prevData.revenue !== 0) {
        revenueChange = ((revenue - prevData.revenue) / prevData.revenue * 100).toFixed(1);
      }
      if (prevData.costs !== 0) {
        costsChange = ((costs - prevData.costs) / prevData.costs * 100).toFixed(1);
      }
      if (prevData.profit !== 0) {
        profitChange = ((profit - prevData.profit) / Math.abs(prevData.profit) * 100).toFixed(1);
      }
    }
    
    return (
      <div className="bg-white p-4 rounded-xl shadow-lg border border-[#e5e7eb]">
        <p className="text-sm font-medium text-slate-800 mb-3">{label}</p>
        
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-500">Revenue</span>
              </div>
              <span className="text-sm font-medium text-slate-900">£{revenue.toFixed(2)}</span>
            </div>
            {revenueChange !== null && (
              <p className={`text-xs mt-1 ml-5 ${parseFloat(revenueChange) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {parseFloat(revenueChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(revenueChange))}% vs prev month
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-xs text-slate-500">Costs</span>
              </div>
              <span className="text-sm font-medium text-slate-900">£{costs.toFixed(2)}</span>
            </div>
            {costsChange !== null && (
              <p className={`text-xs mt-1 ml-5 ${parseFloat(costsChange) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {parseFloat(costsChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(costsChange))}% vs prev month
              </p>
            )}
          </div>
          
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#50668a]" />
                <span className="text-xs text-slate-500">Profit</span>
              </div>
              <span className="text-sm font-medium text-slate-900">£{profit.toFixed(2)}</span>
            </div>
            {profitChange !== null && (
              <p className={`text-xs mt-1 ml-5 ${parseFloat(profitChange) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {parseFloat(profitChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(profitChange))}% vs prev month
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function MonthlyChart({ data }) {
  // Add index and previous month data to each data point
  const enhancedData = data.map((item, index) => ({
    ...item,
    index,
    prevData: index > 0 ? data[index - 1] : null
  }));

  // Use bar chart for single month, line chart for multiple months
  const isSingleMonth = data.length <= 1;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e9e6df]">
      <h3 className="text-lg font-medium text-[#1f2f46] mb-6">
        {isSingleMonth ? 'Revenue, Costs & Profit' : 'Revenue, Costs & Profit Trend'}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        {isSingleMonth ? (
          <BarChart data={enhancedData}>
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
              dataKey="revenue" 
              fill="#34b37b" 
              radius={[6, 6, 0, 0]}
              name="Revenue"
            />
            <Bar 
              dataKey="costs" 
              fill="#e07a7a" 
              radius={[6, 6, 0, 0]}
              name="Costs"
            />
            <Bar 
              dataKey="profit" 
              fill="#50668a" 
              radius={[6, 6, 0, 0]}
              name="Profit"
            />
          </BarChart>
        ) : (
          <LineChart data={enhancedData}>
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
            <Line 
              type="monotone" 
              dataKey="revenue" 
              stroke="#34b37b" 
              strokeWidth={2.25}
              dot={{ fill: '#34b37b', strokeWidth: 1.5, r: 4 }}
              activeDot={{ r: 6 }}
              name="Revenue"
            />
            <Line 
              type="monotone" 
              dataKey="costs" 
              stroke="#e07a7a" 
              strokeWidth={2.25}
              dot={{ fill: '#e07a7a', strokeWidth: 1.5, r: 4 }}
              activeDot={{ r: 6 }}
              name="Costs"
            />
            <Line 
              type="monotone" 
              dataKey="profit" 
              stroke="#50668a" 
              strokeWidth={2.25}
              dot={{ fill: '#50668a', strokeWidth: 1.5, r: 4 }}
              activeDot={{ r: 6 }}
              name="Profit"
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}