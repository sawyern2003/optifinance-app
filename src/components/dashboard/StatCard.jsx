import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ title, value, trend, trendValue, icon: Icon, valueColor }) {
  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 border border-[#f0e9d8] shadow-lg shadow-gray-200/50 hover:shadow-xl hover:shadow-[#d4a740]/10 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg ${
          valueColor === 'text-green-600' ? 'from-green-400 to-emerald-500 shadow-green-200' :
          valueColor === 'text-red-600' ? 'from-red-400 to-rose-500 shadow-red-200' :
          'from-[#1a2845] to-[#2a3f5f] shadow-[#1a2845]/30'
        }`}>
          <Icon className="w-7 h-7 text-white" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
            trend === 'up' 
              ? 'bg-green-50 text-green-700' 
              : 'bg-red-50 text-red-700'
          }`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendValue}
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <p className={`text-3xl font-bold ${valueColor || 'text-gray-900'}`}>{value}</p>
      {trend && (
        <p className="text-xs text-gray-500 mt-2">vs. previous period</p>
      )}
    </div>
  );
}