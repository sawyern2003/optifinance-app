import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { Plus, Thermometer, Wrench, ClipboardCheck, AlertCircle, CheckCircle, Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

export default function Regulatory() {
  const [selectedTab, setSelectedTab] = useState('fridge');
  const [showAddLog, setShowAddLog] = useState(false);
  const queryClient = useQueryClient();

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #fafbfc 0%, #f5f6f8 100%)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1a2845] mb-2">Regulatory Compliance</h1>
          <p className="text-gray-600">Track temperatures, equipment maintenance, and regulatory requirements</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setSelectedTab('fridge')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all border-b-2 ${
                selectedTab === 'fridge'
                  ? 'border-[#1a2845] text-[#1a2845]'
                  : 'border-transparent text-gray-600 hover:text-[#1a2845]'
              }`}
            >
              <Thermometer className="w-5 h-5" />
              Fridge Temperatures
            </button>
            <button
              onClick={() => setSelectedTab('equipment')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all border-b-2 ${
                selectedTab === 'equipment'
                  ? 'border-[#1a2845] text-[#1a2845]'
                  : 'border-transparent text-gray-600 hover:text-[#1a2845]'
              }`}
            >
              <Wrench className="w-5 h-5" />
              Equipment Maintenance
            </button>
            <button
              onClick={() => setSelectedTab('checklists')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all border-b-2 ${
                selectedTab === 'checklists'
                  ? 'border-[#1a2845] text-[#1a2845]'
                  : 'border-transparent text-gray-600 hover:text-[#1a2845]'
              }`}
            >
              <ClipboardCheck className="w-5 h-5" />
              Daily Checklists
            </button>
          </div>
        </div>

        {/* Content */}
        {selectedTab === 'fridge' && <FridgeTemperatures showAddLog={showAddLog} setShowAddLog={setShowAddLog} />}
        {selectedTab === 'equipment' && <EquipmentMaintenance />}
        {selectedTab === 'checklists' && <DailyChecklists />}
      </div>
    </div>
  );
}

function FridgeTemperatures({ showAddLog, setShowAddLog }) {
  const queryClient = useQueryClient();
  const [selectedWeek, setSelectedWeek] = useState(new Date());

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['fridge-temps'],
    queryFn: async () => {
      return await api.entities.FridgeTemperature.list('-logged_at');
    },
  });

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Get today's logs
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLogs = logs.filter(log => format(new Date(log.logged_at), 'yyyy-MM-dd') === today);
  const hasAMLog = todayLogs.some(log => log.time_of_day === 'am');
  const hasPMLog = todayLogs.some(log => log.time_of_day === 'pm');

  // Check if any readings are out of range
  const outOfRangeLogs = logs.filter(log => log.temperature < 2 || log.temperature > 8);

  return (
    <div>
      {/* Alert for missing logs */}
      {(!hasAMLog || !hasPMLog) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Action Required</h3>
              <p className="text-sm text-amber-800">
                {!hasAMLog && !hasPMLog && "No temperature readings recorded today. Please log AM and PM readings."}
                {!hasAMLog && hasPMLog && "Morning (AM) temperature reading not recorded yet."}
                {hasAMLog && !hasPMLog && "Afternoon (PM) temperature reading not recorded yet."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Out of range alert */}
      {outOfRangeLogs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900 mb-1">Temperature Alert</h3>
              <p className="text-sm text-red-800">
                {outOfRangeLogs.length} reading{outOfRangeLogs.length > 1 ? 's' : ''} outside safe range (2-8°C). Action required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Log Button */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#1a2845]">Temperature Log</h2>
          <p className="text-sm text-gray-600">Record temperatures twice daily (AM & PM)</p>
        </div>
        <button
          onClick={() => setShowAddLog(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#1a2845] text-white rounded-lg hover:bg-[#2a3855] transition-all"
        >
          <Plus className="w-5 h-5" />
          Log Temperature
        </button>
      </div>

      {/* Weekly View */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#1a2845]">
              Week of {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedWeek(new Date(selectedWeek.setDate(selectedWeek.getDate() - 7)))}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Previous Week
              </button>
              <button
                onClick={() => setSelectedWeek(new Date())}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                This Week
              </button>
              <button
                onClick={() => setSelectedWeek(new Date(selectedWeek.setDate(selectedWeek.getDate() + 7)))}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Next Week
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AM Reading</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PM Reading</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {daysInWeek.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayLogs = logs.filter(log => format(new Date(log.logged_at), 'yyyy-MM-dd') === dateStr);
                const amLog = dayLogs.find(log => log.time_of_day === 'am');
                const pmLog = dayLogs.find(log => log.time_of_day === 'pm');
                const hasIssue = dayLogs.some(log => log.temperature < 2 || log.temperature > 8);
                const isComplete = amLog && pmLog;

                return (
                  <tr key={dateStr} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{format(day, 'EEE, MMM d')}</div>
                    </td>
                    <td className="px-6 py-4">
                      {amLog ? (
                        <div className={`font-medium ${amLog.temperature < 2 || amLog.temperature > 8 ? 'text-red-600' : 'text-gray-900'}`}>
                          {amLog.temperature}°C
                          <div className="text-xs text-gray-500">{format(new Date(amLog.logged_at), 'HH:mm')}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {pmLog ? (
                        <div className={`font-medium ${pmLog.temperature < 2 || pmLog.temperature > 8 ? 'text-red-600' : 'text-gray-900'}`}>
                          {pmLog.temperature}°C
                          <div className="text-xs text-gray-500">{format(new Date(pmLog.logged_at), 'HH:mm')}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {hasIssue ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          Out of Range
                        </span>
                      ) : isComplete ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Complete
                        </span>
                      ) : dayLogs.length > 0 ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                          Incomplete
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                          No Data
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {amLog?.notes || pmLog?.notes || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-[#1a2845]">Log Fridge Temperature</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°C) *</label>
              <input
                type="number"
                required
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent text-lg"
                placeholder="5.0"
              />
              <p className="text-xs text-gray-500 mt-1">Safe range: 2-8°C</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time of Day *</label>
              <select
                required
                value={formData.time_of_day}
                onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              >
                <option value="am">Morning (AM)</option>
                <option value="pm">Afternoon (PM)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
                rows="3"
                placeholder="Any issues or observations..."
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-[#1a2845] text-white rounded-lg hover:bg-[#2a3855] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log Temperature'}
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

  const upcomingMaintenance = equipment.filter(eq => {
    if (!eq.next_service_date) return false;
    const daysUntil = Math.floor((new Date(eq.next_service_date) - new Date()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 30 && daysUntil >= 0;
  });

  const overdueMaintenance = equipment.filter(eq => {
    if (!eq.next_service_date) return false;
    return new Date(eq.next_service_date) < new Date();
  });

  return (
    <div>
      {/* Alert for upcoming/overdue */}
      {(upcomingMaintenance.length > 0 || overdueMaintenance.length > 0) && (
        <div className={`${overdueMaintenance.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} border rounded-xl p-4 mb-6`}>
          <div className="flex items-start gap-3">
            <AlertCircle className={`w-5 h-5 ${overdueMaintenance.length > 0 ? 'text-red-600' : 'text-amber-600'} mt-0.5`} />
            <div>
              <h3 className={`font-semibold ${overdueMaintenance.length > 0 ? 'text-red-900' : 'text-amber-900'} mb-1`}>Maintenance Required</h3>
              {overdueMaintenance.length > 0 && (
                <p className="text-sm text-red-800 mb-1">
                  {overdueMaintenance.length} equipment item{overdueMaintenance.length > 1 ? 's' : ''} overdue for service
                </p>
              )}
              {upcomingMaintenance.length > 0 && (
                <p className={`text-sm ${overdueMaintenance.length > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                  {upcomingMaintenance.length} equipment item{upcomingMaintenance.length > 1 ? 's' : ''} due for service within 30 days
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#1a2845]">Equipment Register</h2>
          <p className="text-sm text-gray-600">Track maintenance, calibration, and service records</p>
        </div>
        <button
          onClick={() => setShowAddEquipment(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#1a2845] text-white rounded-lg hover:bg-[#2a3855] transition-all"
        >
          <Plus className="w-5 h-5" />
          Add Equipment
        </button>
      </div>

      {/* Equipment List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-[#1a2845] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading equipment...</p>
          </div>
        ) : equipment.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">No equipment registered</p>
            <button
              onClick={() => setShowAddEquipment(true)}
              className="mt-4 text-[#1a2845] hover:underline"
            >
              Add your first equipment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Equipment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {equipment.map((eq) => {
                  const daysUntilService = eq.next_service_date
                    ? Math.floor((new Date(eq.next_service_date) - new Date()) / (1000 * 60 * 60 * 24))
                    : null;
                  const isOverdue = daysUntilService !== null && daysUntilService < 0;
                  const isUpcoming = daysUntilService !== null && daysUntilService <= 30 && daysUntilService >= 0;

                  return (
                    <tr key={eq.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{eq.name}</div>
                        <div className="text-sm text-gray-500">{eq.type}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{eq.serial_number || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {eq.last_service_date ? format(new Date(eq.last_service_date), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {eq.next_service_date ? (
                          <div className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : isUpcoming ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
                            {format(new Date(eq.next_service_date), 'dd/MM/yyyy')}
                            {(isOverdue || isUpcoming) && (
                              <div className="text-xs">
                                {isOverdue ? `${Math.abs(daysUntilService)} days overdue` : `in ${daysUntilService} days`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isOverdue ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            Overdue
                          </span>
                        ) : isUpcoming ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                            Due Soon
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            Up to Date
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    service_interval_months: 12,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-[#1a2845]">Add Equipment</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              >
                <option value="laser">Laser</option>
                <option value="ultrasound">Ultrasound</option>
                <option value="autoclave">Autoclave</option>
                <option value="fridge">Fridge/Freezer</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
              <input
                type="text"
                value={formData.serial_number}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
              <input
                type="text"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Service Date</label>
              <input
                type="date"
                value={formData.last_service_date}
                onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Service Date</label>
              <input
                type="date"
                value={formData.next_service_date}
                onChange={(e) => setFormData({ ...formData, next_service_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-[#1a2845] text-white rounded-lg hover:bg-[#2a3855] disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DailyChecklists() {
  return (
    <div className="text-center py-12">
      <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Daily Checklists</h3>
      <p className="text-gray-600">Coming soon - Daily infection control and safety checklists</p>
    </div>
  );
}
