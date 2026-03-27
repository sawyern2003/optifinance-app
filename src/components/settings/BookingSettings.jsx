import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingAPI } from '@/api/booking';
import { api } from '@/api/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Copy, Check, Link as LinkIcon, Code, ExternalLink } from 'lucide-react';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function BookingSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Fetch user profile for booking slug
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.auth.me(),
  });

  // Fetch availability settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['availability-settings'],
    queryFn: () => bookingAPI.getMyAvailabilitySettings(),
  });

  const [workingHours, setWorkingHours] = useState({});
  const [bufferTime, setBufferTime] = useState(15);
  const [defaultDuration, setDefaultDuration] = useState(30);

  useEffect(() => {
    if (settings) {
      setWorkingHours(settings.working_hours || {});
      setBufferTime(settings.buffer_time || 15);
      setDefaultDuration(settings.default_duration || 30);
    }
  }, [settings]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: (data) => bookingAPI.updateMyAvailabilitySettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['availability-settings']);
      toast({
        title: 'Settings saved',
        description: 'Your booking settings have been updated.',
        className: 'bg-green-50 border-green-200',
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      working_hours: workingHours,
      buffer_time: bufferTime,
      default_duration: defaultDuration,
    });
  };

  const handleToggleDay = (day) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day]?.enabled,
      },
    }));
  };

  const handleTimeChange = (day, field, value) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const bookingUrl = profile?.booking_slug
    ? `${window.location.origin}/book/${profile.booking_slug}`
    : '';

  const embedCode = bookingUrl
    ? `<iframe src="${bookingUrl}" width="100%" height="700px" frameborder="0"></iframe>`
    : '';

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2000);
    }
    toast({
      title: 'Copied!',
      description: `${type === 'url' ? 'Booking URL' : 'Embed code'} copied to clipboard.`,
    });
  };

  if (isLoading) {
    return <div>Loading booking settings...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Booking URL & Embed Code */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
          Online Booking
        </h2>

        <div className="space-y-4 bg-gray-50 rounded-xl p-6">
          {/* Booking URL */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <LinkIcon className="w-4 h-4" />
              Your Booking Page URL
            </Label>
            <div className="flex gap-2">
              <Input value={bookingUrl} readOnly className="font-mono text-sm bg-white" />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyToClipboard(bookingUrl, 'url')}
                className="shrink-0"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(bookingUrl, '_blank')}
                className="shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Share this link with your patients so they can book appointments online.
            </p>
          </div>

          {/* Embed Code */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Code className="w-4 h-4" />
              Embed Code for Your Website
            </Label>
            <div className="flex gap-2">
              <Input value={embedCode} readOnly className="font-mono text-xs bg-white" />
              <Button
                type="button"
                variant="outline"
                onClick={() => copyToClipboard(embedCode, 'embed')}
                className="shrink-0"
              >
                {copiedEmbed ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Copy this code and paste it into your website to embed the booking calendar.
            </p>
          </div>
        </div>
      </div>

      {/* Working Hours */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
          Working Hours
        </h2>

        <div className="space-y-3 bg-gray-50 rounded-xl p-6">
          {DAYS.map((day) => {
            const daySettings = workingHours[day] || {
              start: '09:00',
              end: '17:00',
              enabled: day !== 'saturday' && day !== 'sunday',
            };

            return (
              <div
                key={day}
                className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                  daySettings.enabled ? 'bg-white' : 'bg-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 w-32">
                  <Switch
                    checked={daySettings.enabled}
                    onCheckedChange={() => handleToggleDay(day)}
                  />
                  <span className="text-sm font-medium capitalize">{day}</span>
                </div>

                {daySettings.enabled && (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={daySettings.start}
                      onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                      className="w-32"
                    />
                    <span className="text-gray-500">to</span>
                    <Input
                      type="time"
                      value={daySettings.end}
                      onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}

                {!daySettings.enabled && (
                  <span className="text-sm text-gray-500">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Appointment Settings */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
          Appointment Settings
        </h2>

        <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-6">
          <div>
            <Label htmlFor="duration">Default Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              value={defaultDuration}
              onChange={(e) => setDefaultDuration(parseInt(e.target.value) || 30)}
              min="15"
              step="15"
              className="bg-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              How long does a typical appointment last?
            </p>
          </div>

          <div>
            <Label htmlFor="buffer">Buffer Time (minutes)</Label>
            <Input
              id="buffer"
              type="number"
              value={bufferTime}
              onChange={(e) => setBufferTime(parseInt(e.target.value) || 0)}
              min="0"
              step="5"
              className="bg-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              Time between appointments for cleaning/prep.
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="bg-[#1a2845] hover:bg-[#2C3E50]"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Booking Settings'}
        </Button>
      </div>
    </div>
  );
}
