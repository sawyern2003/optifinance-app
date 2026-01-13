import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY_COLORS = {
  'Face': '#1a2845',
  'Body': '#2a3f5f',
  'Skin': '#3a5575',
  'Wellness': '#d4a740',
  'Consultation': '#c9962f',
  'Other': '#90a4ae'
};

const TREATMENT_COLORS = [
  '#1a2845', '#2a3f5f', '#3a5575', '#4a6585', '#d4a740',
  '#c9962f', '#b8851f', '#5a7595', '#6a85a5', '#7a95b5'
];

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    return (
      <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200">
        <p className="text-sm font-semibold text-gray-900 mb-3">{data.name}</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-gray-600">Treatments</span>
            <span className="text-sm font-semibold text-gray-900">{data.count}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-gray-600">Revenue</span>
            <span className="text-sm font-semibold text-green-600">£{data.revenue.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-gray-600">Profit</span>
            <span className="text-sm font-semibold text-[#1a2845]">£{data.profit.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs text-gray-600">Percentage</span>
            <span className="text-sm font-semibold text-gray-900">{data.percentage}%</span>
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
      className="text-xs font-semibold"
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
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Revenue & Profit Breakdown</h3>
        <Select value={viewBy} onValueChange={setViewBy}>
          <SelectTrigger className="w-40 rounded-xl border-gray-300 h-10">
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
              <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">£{item.revenue.toFixed(0)}</p>
                  <p className="text-xs text-gray-500">{item.count} treatment{item.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No data available for this period</p>
        </div>
      )}
    </div>
  );
}