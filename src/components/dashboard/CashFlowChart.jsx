import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const cashIn = payload.find(p => p.dataKey === 'cashIn')?.value || 0;
    const cashOut = payload.find(p => p.dataKey === 'cashOut')?.value || 0;
    const net = cashIn - cashOut;
    
    return (
      <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200">
        <p className="text-sm font-semibold text-gray-900 mb-3">{label}</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-600" />
              <span className="text-xs text-gray-600">Cash In</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">£{cashIn.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-600" />
              <span className="text-xs text-gray-600">Cash Out</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">£{cashOut.toFixed(2)}</span>
          </div>
          
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between gap-6">
              <span className="text-xs font-medium text-gray-700">Net Cash Flow</span>
              <span className={`text-sm font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Cash In / Cash Out</h3>
      
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis 
              dataKey="month" 
              stroke="#6b7280" 
              style={{ fontSize: '13px' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280" 
              style={{ fontSize: '13px' }}
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
              fill="#16a34a" 
              radius={[8, 8, 0, 0]}
              name="Cash In"
            />
            <Bar 
              dataKey="cashOut" 
              fill="#dc2626" 
              radius={[8, 8, 0, 0]}
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