import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ title, value, trend, trendValue, icon: Icon, valueColor }) {
  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#d6b164]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 transition-all duration-200 hover:border-[#d6b164]/30">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-xl ${
            valueColor === 'text-green-600'
              ? 'bg-emerald-500/10 text-emerald-400'
              : valueColor === 'text-red-600'
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-[#4d647f]/20 text-[#4d647f]'
          }`}>
            <Icon className="w-6 h-6" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-light tracking-wider ${
              trend === 'up'
                ? 'bg-emerald-500/10 text-emerald-400 backdrop-blur-xl'
                : 'bg-rose-500/10 text-rose-400 backdrop-blur-xl'
            }`}>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trendValue}
            </div>
          )}
        </div>
        <h3 className="text-xs font-light text-white/40 tracking-[0.2em] uppercase mb-3">{title}</h3>
        <p className={`text-4xl leading-none tracking-tight font-light ${
          valueColor === 'text-green-600' ? 'text-emerald-400' :
          valueColor === 'text-red-600' ? 'text-rose-400' :
          'text-white/90'
        }`}>{value}</p>
        {trend && (
          <p className="text-xs text-white/30 mt-3 font-light">vs previous period</p>
        )}
      </div>
    </div>
  );
}
