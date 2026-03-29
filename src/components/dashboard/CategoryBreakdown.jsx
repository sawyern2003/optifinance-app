import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY_COLORS = {
  'Face': '#d6b164',
  'Body': '#4d647f',
  'Skin': '#34d399',
  'Wellness': '#f87171',
  'Consultation': '#a78bfa',
  'Other': '#64748b'
};

const TREATMENT_COLORS = [
  '#d6b164', '#4d647f', '#34d399', '#f87171', '#a78bfa',
  '#fbbf24', '#60a5fa', '#f472b6', '#10b981', '#8b5cf6'
];

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    return (
      <div className="bg-[#0a0e1a]/95 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
        <p className="text-sm font-light text-white/90 mb-3 tracking-wider">{data.name}</p>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-white/50 font-light">Treatments</span>
            <span className="text-sm font-light text-white/90">{data.count}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-white/50 font-light">Revenue</span>
            <span className="text-sm font-light text-emerald-400">£{data.revenue.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-white/50 font-light">Profit</span>
            <span className="text-sm font-light text-[#4d647f]">£{data.profit.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-white/50 font-light">Percentage</span>
            <span className="text-sm font-light text-white/90">{data.percentage}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null; // Don't show label if less than 5%

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-[11px] font-light"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function CategoryBreakdown({ categories, treatments }) {
  const [viewBy, setViewBy] = useState('category');

  const data = viewBy === 'category' ? categories : treatments;
  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);

  // Add percentage to each item
  const chartData = data.map((item, index) => ({
    ...item,
    percentage: totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) : 0,
    color: viewBy === 'category'
      ? (CATEGORY_COLORS[item.name] || CATEGORY_COLORS['Other'])
      : TREATMENT_COLORS[index % TREATMENT_COLORS.length]
  }));

  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#d6b164]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-light text-white/90 tracking-wider">Revenue & Profit Breakdown</h3>
          <Select value={viewBy} onValueChange={setViewBy}>
            <SelectTrigger className="w-48 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 h-11 text-white/90 font-light">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category">By Category</SelectItem>
              <SelectItem value="treatment">By Treatment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="revenue"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {chartData.map((item, index) => (
                <div key={index} className="flex items-center justify-between bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm font-light text-white/90 truncate">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-light text-white/90">£{item.revenue.toFixed(0)}</p>
                    <p className="text-xs text-white/40 font-light">{item.count} treatment{item.count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-white/40 font-light">No data available for this period</p>
          </div>
        )}
      </div>
    </div>
  );
}
