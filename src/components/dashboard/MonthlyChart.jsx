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
      <div className="bg-[#0a0e1a]/95 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
        <p className="text-sm font-light text-white/90 mb-3 tracking-wider">{label}</p>

        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-white/50 font-light">Revenue</span>
              </div>
              <span className="text-sm font-light text-white/90">£{revenue.toFixed(2)}</span>
            </div>
            {revenueChange !== null && (
              <p className={`text-xs mt-1 ml-5 font-light ${parseFloat(revenueChange) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {parseFloat(revenueChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(revenueChange))}% vs prev month
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <span className="text-xs text-white/50 font-light">Costs</span>
              </div>
              <span className="text-sm font-light text-white/90">£{costs.toFixed(2)}</span>
            </div>
            {costsChange !== null && (
              <p className={`text-xs mt-1 ml-5 font-light ${parseFloat(costsChange) >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {parseFloat(costsChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(costsChange))}% vs prev month
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#4d647f]" />
                <span className="text-xs text-white/50 font-light">Profit</span>
              </div>
              <span className="text-sm font-light text-white/90">£{profit.toFixed(2)}</span>
            </div>
            {profitChange !== null && (
              <p className={`text-xs mt-1 ml-5 font-light ${parseFloat(profitChange) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#4d647f]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-light text-white/90 mb-6 tracking-wider">
          {isSingleMonth ? 'Revenue, Costs & Profit' : 'Revenue, Costs & Profit Trend'}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          {isSingleMonth ? (
            <BarChart data={enhancedData}>
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
                dataKey="revenue"
                fill="#34d399"
                radius={[6, 6, 0, 0]}
                name="Revenue"
              />
              <Bar
                dataKey="costs"
                fill="#f87171"
                radius={[6, 6, 0, 0]}
                name="Costs"
              />
              <Bar
                dataKey="profit"
                fill="#4d647f"
                radius={[6, 6, 0, 0]}
                name="Profit"
              />
            </BarChart>
          ) : (
            <LineChart data={enhancedData}>
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
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#34d399"
                strokeWidth={2.5}
                dot={{ fill: '#34d399', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6 }}
                name="Revenue"
              />
              <Line
                type="monotone"
                dataKey="costs"
                stroke="#f87171"
                strokeWidth={2.5}
                dot={{ fill: '#f87171', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6 }}
                name="Costs"
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#4d647f"
                strokeWidth={2.5}
                dot={{ fill: '#4d647f', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6 }}
                name="Profit"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
