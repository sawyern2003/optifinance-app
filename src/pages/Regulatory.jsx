import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { Plus, Thermometer, Wrench, AlertCircle, CheckCircle, X } from 'lucide-react';
import { format } from 'date-fns';

export default function Regulatory() {
  const [selectedTab, setSelectedTab] = useState('fridge');

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 50%, #0f1419 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#4d647f]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[#d6b164]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-light text-white/90 mb-3 tracking-tight">Regulatory</h1>
          <p className="text-white/40 text-lg font-light">Compliance tracking for fridge temps and equipment maintenance</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-12">
          <button
            onClick={() => setSelectedTab('fridge')}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl transition-all ${
              selectedTab === 'fridge'
                ? 'bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 text-[#d6b164]'
                : 'bg-white/5 backdrop-blur-xl border border-white/10 text-white/40 hover:border-white/20'
            }`}
          >
            <Thermometer className="w-5 h-5" />
            <span className="text-sm tracking-wider font-light">FRIDGE TEMPS</span>
          </button>
          <button
            onClick={() => setSelectedTab('equipment')}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl transition-all ${
              selectedTab === 'equipment'
                ? 'bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 text-[#d6b164]'
                : 'bg-white/5 backdrop-blur-xl border border-white/10 text-white/40 hover:border-white/20'
            }`}
          >
            <Wrench className="w-5 h-5" />
            <span className="text-sm tracking-wider font-light">EQUIPMENT</span>
          </button>
        </div>

        {/* Content */}
        {selectedTab === 'fridge' && <FridgeTemperatures />}
        {selectedTab === 'equipment' && <EquipmentMaintenance />}
      </div>
    </div>
  );
}

function FridgeTemperatures() {
  const [showAddLog, setShowAddLog] = useState(false);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['fridge-temps'],
    queryFn: async () => {
      return await api.entities.FridgeTemperature.list('-logged_at');
    },
  });

  // Get today's logs
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLogs = logs.filter(log => format(new Date(log.logged_at), 'yyyy-MM-dd') === today);
  const hasAMLog = todayLogs.some(log => log.time_of_day === 'am');
  const hasPMLog = todayLogs.some(log => log.time_of_day === 'pm');

  // Check if any readings are out of range
  const outOfRangeLogs = logs.filter(log => log.temperature < 2 || log.temperature > 8);
  const recentLogs = logs.slice(0, 10);

  return (
    <div>
      {/* Alert */}
      {(!hasAMLog || !hasPMLog) && (
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 to-transparent rounded-2xl blur-xl" />
          <div className="relative bg-amber-400/10 backdrop-blur-xl rounded-2xl p-6 border border-amber-400/30">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-amber-400 font-light text-lg mb-1">Action Required</h3>
                <p className="text-white/60 text-sm">
                  {!hasAMLog && !hasPMLog && "No temperature readings recorded today. Log AM and PM readings."}
                  {!hasAMLog && hasPMLog && "Morning (AM) temperature reading not recorded yet."}
                  {hasAMLog && !hasPMLog && "Afternoon (PM) temperature reading not recorded yet."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Log Button */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-light text-white/90 mb-1">Temperature Log</h2>
          <p className="text-white/40 text-sm">Record twice daily (AM & PM)</p>
        </div>
        <button
          onClick={() => setShowAddLog(true)}
          className="px-6 py-3 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 rounded-full hover:bg-[#d6b164]/30 transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5 text-[#d6b164]" />
          <span className="text-[#d6b164] text-sm tracking-wider">LOG TEMP</span>
        </button>
      </div>

      {/* Recent Logs */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#d6b164]/30 border-t-[#d6b164] rounded-full animate-spin" />
        </div>
      ) : recentLogs.length === 0 ? (
        <div className="text-center py-20">
          <Thermometer className="w-16 h-16 text-white/10 mx-auto mb-4" />
          <p className="text-white/30 text-lg">No temperature logs yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recentLogs.map((log) => {
            const isOutOfRange = log.temperature < 2 || log.temperature > 8;
            const logDate = new Date(log.logged_at);

            return (
              <div key={log.id} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-[#d6b164]/0 via-[#d6b164]/5 to-[#d6b164]/0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className={`relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border transition-all ${
                  isOutOfRange ? 'border-red-400/30' : 'border-white/10 group-hover:border-[#d6b164]/30'
                }`}>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
                    {/* Date/Time */}
                    <div>
                      <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Date</span>
                      <p className="text-white/90 text-lg font-light">{format(logDate, 'MMM d')}</p>
                      <p className="text-white/40 text-sm">{format(logDate, 'HH:mm')}</p>
                    </div>

                    {/* Time of Day */}
                    <div>
                      <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Period</span>
                      <div className="px-3 py-1 rounded-full bg-[#4d647f]/20 border border-[#4d647f]/30 inline-block">
                        <span className="text-[#4d647f] text-sm tracking-wider">{log.time_of_day.toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Temperature */}
                    <div>
                      <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Reading</span>
                      <p className={`text-3xl font-light ${isOutOfRange ? 'text-red-400' : 'text-[#d6b164]'}`}>
                        {log.temperature}°C
                      </p>
                    </div>

                    {/* Notes */}
                    <div className="md:col-span-1">
                      <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Notes</span>
                      <p className="text-white/60 text-sm">{log.notes || '-'}</p>
                    </div>

                    {/* Status */}
                    <div>
                      {isOutOfRange ? (
                        <div className="px-3 py-1 rounded-full bg-red-400/10 border border-red-400/30 text-center">
                          <span className="text-red-400 text-xs tracking-wider">OUT OF RANGE</span>
                        </div>
                      ) : (
                        <div className="px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-center">
                          <span className="text-emerald-400 text-xs tracking-wider">GOOD</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Log Modal */}
      {showAddLog && (
        <AddFridgeTempModal
          onClose={() => setShowAddLog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries(['fridge-temps']);
            setShowAddLog(false);
          }}
        />
      )}
    </div>
  );
}

function AddFridgeTempModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    temperature: '',
    time_of_day: 'am',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const temp = parseFloat(formData.temperature);
      if (temp < 2 || temp > 8) {
        if (!confirm('Temperature is outside safe range (2-8°C). Are you sure this is correct?')) {
          setSaving(false);
          return;
        }
      }

      await api.entities.FridgeTemperature.create({
        temperature: temp,
        time_of_day: formData.time_of_day,
        notes: formData.notes,
        logged_at: new Date().toISOString(),
      });
      onSuccess();
    } catch (error) {
      console.error('Error logging temperature:', error);
      alert('Failed to log temperature');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-[#1a1f35] to-[#0a0e1a] rounded-3xl border border-white/10 max-w-lg w-full">
        <div className="p-8 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-light text-white/90 tracking-tight">Log Temperature</h2>
            <p className="text-white/40 text-sm mt-1">Safe range: 2-8°C</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          <div className="space-y-6">
            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Temperature (°C) *</label>
              <input
                type="number"
                required
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                className="w-full px-4 py-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 text-2xl placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
                placeholder="5.0"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Time of Day *</label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, time_of_day: 'am' })}
                  className={`flex-1 px-6 py-4 rounded-xl transition-all ${
                    formData.time_of_day === 'am'
                      ? 'bg-[#d6b164]/20 border border-[#d6b164]/30 text-[#d6b164]'
                      : 'bg-white/5 border border-white/10 text-white/40 hover:border-white/20'
                  }`}
                >
                  <span className="text-sm tracking-wider font-light">MORNING (AM)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, time_of_day: 'pm' })}
                  className={`flex-1 px-6 py-4 rounded-xl transition-all ${
                    formData.time_of_day === 'pm'
                      ? 'bg-[#d6b164]/20 border border-[#d6b164]/30 text-[#d6b164]'
                      : 'bg-white/5 border border-white/10 text-white/40 hover:border-white/20'
                  }`}
                >
                  <span className="text-sm tracking-wider font-light">AFTERNOON (PM)</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
                rows="3"
                placeholder="Any observations..."
              />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full text-white/60 hover:text-white/90 hover:border-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 rounded-full text-[#d6b164] hover:bg-[#d6b164]/30 transition-all disabled:opacity-50"
            >
              {saving ? 'Logging...' : 'Log Temperature'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EquipmentMaintenance() {
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const queryClient = useQueryClient();

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipment'],
    queryFn: async () => {
      return await api.entities.Equipment.list('-created_at');
    },
  });

  const overdueMaintenance = equipment.filter(eq => {
    if (!eq.next_service_date) return false;
    return new Date(eq.next_service_date) < new Date();
  });

  return (
    <div>
      {/* Alert */}
      {overdueMaintenance.length > 0 && (
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-red-400/20 to-transparent rounded-2xl blur-xl" />
          <div className="relative bg-red-400/10 backdrop-blur-xl rounded-2xl p-6 border border-red-400/30">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-red-400 font-light text-lg mb-1">Maintenance Overdue</h3>
                <p className="text-white/60 text-sm">
                  {overdueMaintenance.length} equipment item{overdueMaintenance.length > 1 ? 's' : ''} overdue for service
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-light text-white/90 mb-1">Equipment Register</h2>
          <p className="text-white/40 text-sm">Track maintenance and service records</p>
        </div>
        <button
          onClick={() => setShowAddEquipment(true)}
          className="px-6 py-3 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 rounded-full hover:bg-[#d6b164]/30 transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5 text-[#d6b164]" />
          <span className="text-[#d6b164] text-sm tracking-wider">ADD EQUIPMENT</span>
        </button>
      </div>

      {/* Equipment Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#d6b164]/30 border-t-[#d6b164] rounded-full animate-spin" />
        </div>
      ) : equipment.length === 0 ? (
        <div className="text-center py-20">
          <Wrench className="w-16 h-16 text-white/10 mx-auto mb-4" />
          <p className="text-white/30 text-lg">No equipment registered</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {equipment.map((eq) => {
            const daysUntilService = eq.next_service_date
              ? Math.floor((new Date(eq.next_service_date) - new Date()) / (1000 * 60 * 60 * 24))
              : null;
            const isOverdue = daysUntilService !== null && daysUntilService < 0;
            const isUpcoming = daysUntilService !== null && daysUntilService <= 30 && daysUntilService >= 0;

            return (
              <div key={eq.id} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-[#d6b164]/0 via-[#d6b164]/5 to-[#d6b164]/0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className={`relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border transition-all ${
                  isOverdue ? 'border-red-400/30' : 'border-white/10 group-hover:border-[#d6b164]/30'
                }`}>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
                    {/* Equipment Name */}
                    <div className="md:col-span-2">
                      <h3 className="text-white/90 text-lg font-light mb-1">{eq.name}</h3>
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1 rounded-full bg-[#4d647f]/20 border border-[#4d647f]/30">
                          <span className="text-[#4d647f] text-xs tracking-wider">{eq.type.toUpperCase()}</span>
                        </div>
                        {eq.serial_number && (
                          <span className="text-white/30 text-sm">S/N: {eq.serial_number}</span>
                        )}
                      </div>
                    </div>

                    {/* Last Service */}
                    <div>
                      <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Last Service</span>
                      <p className="text-white/90 text-sm">
                        {eq.last_service_date ? format(new Date(eq.last_service_date), 'dd/MM/yyyy') : '-'}
                      </p>
                    </div>

                    {/* Next Service */}
                    <div>
                      <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Next Service</span>
                      {eq.next_service_date ? (
                        <div>
                          <p className={`text-sm font-light ${isOverdue ? 'text-red-400' : isUpcoming ? 'text-amber-400' : 'text-white/90'}`}>
                            {format(new Date(eq.next_service_date), 'dd/MM/yyyy')}
                          </p>
                          {(isOverdue || isUpcoming) && (
                            <p className="text-xs text-white/40">
                              {isOverdue ? `${Math.abs(daysUntilService)}d overdue` : `in ${daysUntilService}d`}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-white/30">-</span>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      {isOverdue ? (
                        <div className="px-3 py-1 rounded-full bg-red-400/10 border border-red-400/30 text-center">
                          <span className="text-red-400 text-xs tracking-wider">OVERDUE</span>
                        </div>
                      ) : isUpcoming ? (
                        <div className="px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-center">
                          <span className="text-amber-400 text-xs tracking-wider">DUE SOON</span>
                        </div>
                      ) : (
                        <div className="px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-center">
                          <span className="text-emerald-400 text-xs tracking-wider">UP TO DATE</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddEquipment && (
        <AddEquipmentModal
          onClose={() => setShowAddEquipment(false)}
          onSuccess={() => {
            queryClient.invalidateQueries(['equipment']);
            setShowAddEquipment(false);
          }}
        />
      )}
    </div>
  );
}

function AddEquipmentModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'laser',
    serial_number: '',
    manufacturer: '',
    last_service_date: '',
    next_service_date: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.entities.Equipment.create({
        ...formData,
        created_at: new Date().toISOString(),
      });
      onSuccess();
    } catch (error) {
      console.error('Error creating equipment:', error);
      alert('Failed to create equipment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-[#1a1f35] to-[#0a0e1a] rounded-3xl border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-8 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-light text-white/90 tracking-tight">Add Equipment</h2>
            <p className="text-white/40 text-sm mt-1">Register new equipment for tracking</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Equipment Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Type *</label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              >
                <option value="laser">Laser</option>
                <option value="ultrasound">Ultrasound</option>
                <option value="autoclave">Autoclave</option>
                <option value="fridge">Fridge/Freezer</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Serial Number</label>
              <input
                type="text"
                value={formData.serial_number}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Manufacturer</label>
              <input
                type="text"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Last Service Date</label>
              <input
                type="date"
                value={formData.last_service_date}
                onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Next Service Date</label>
              <input
                type="date"
                value={formData.next_service_date}
                onChange={(e) => setFormData({ ...formData, next_service_date: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full text-white/60 hover:text-white/90 hover:border-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 rounded-full text-[#d6b164] hover:bg-[#d6b164]/30 transition-all disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
