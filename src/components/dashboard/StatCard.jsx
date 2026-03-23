import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ title, value, trend, trendValue, icon: Icon, valueColor }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-[#e9e6df] shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
          valueColor === 'text-green-600'
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : valueColor === 'text-red-600'
              ? 'bg-rose-50 border-rose-100 text-rose-700'
              : 'bg-[#f4f6fa] border-[#e6eaf2] text-[#334866]'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
            trend === 'up' 
              ? 'bg-emerald-50 text-emerald-700' 
              : 'bg-rose-50 text-rose-700'
          }`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendValue}
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-slate-500 mb-2">{title}</h3>
      <p className={`text-[30px] leading-none tracking-tight font-semibold ${valueColor || 'text-[#1a2845]'}`}>{value}</p>
      {trend && (
        <p className="text-xs text-slate-400 mt-2">vs previous period</p>
      )}
    </div>
  );
}