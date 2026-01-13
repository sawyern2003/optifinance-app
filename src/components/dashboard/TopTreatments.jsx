import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#1a2845', '#2a3f5f', '#3a5575', '#4a6585', '#d4a740'];

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-200">
        <p className="text-sm font-semibold text-gray-900">{payload[0].name}</p>
        <p className="text-sm text-gray-600">
          Profit: <span className="font-semibold text-green-600">£{payload[0].value.toFixed(2)}</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function TopTreatments({ treatments }) {
  const topFive = treatments.slice(0, 5);
  const chartData = topFive.map((t, index) => ({
    name: t.name,
    value: t.profit,
    color: COLORS[index]
  }));

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Treatments by Profit</h3>
      
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-6 space-y-3">
        {topFive.map((treatment, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[index] }}
              />
              <span className="text-sm font-medium text-gray-900">{treatment.name}</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              £{treatment.profit.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}