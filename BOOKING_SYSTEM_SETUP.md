# Online Booking System Setup

## Overview

OptiFinance now includes a full Calendly-style online booking system that allows clinic owners to accept patient appointments online.

## Features

### For Clinic Owners
- **Calendly-style Week View Calendar** - Professional calendar interface showing appointments
- **Online Booking Page** - Shareable public URL for patients to book
- **Embeddable Widget** - Copy-paste code to embed booking on your website
- **Availability Management** - Set working hours, breaks, buffer times
- **Voice Command Integration** - "Book Sarah for Botox tomorrow at 2pm"

### For Patients
- **Easy Online Booking** - No login required
- **Visual Date Selection** - Week view with available time slots
- **Treatment Selection** - Choose from available treatments
- **Instant Confirmation** - Confirmation shown immediately after booking

## Database Setup

**IMPORTANT:** Run this SQL in your Supabase SQL Editor before using the booking system:

1. Go to your Supabase project
2. Navigate to SQL Editor
3. Open `SUPABASE_BOOKING_SYSTEM.sql` from the repository
4. Copy the entire SQL script
5. Click "Run"

This script will:
- Add `booking_slug` and `booking_enabled` columns to profiles table
- Create `availability_settings` table with RLS policies
- Add patient contact fields to appointments table
- Auto-generate unique booking slugs from clinic names
- Set up default working hours (Mon-Fri 9am-5pm)

## How It Works

### 1. Automatic Setup
When a clinic owner first logs in:
- A unique booking slug is auto-generated from their clinic name
- Default availability settings are created (Mon-Fri 9am-5pm)
- Booking is automatically enabled

### 2. Clinic Owner Configuration
In Settings > Online Booking:
- **View Booking URL**: `https://yourdomain.com/book/your-clinic-slug`
- **Copy Embed Code**: iframe code to paste on their website
- **Set Working Hours**: Configure availability for each day
- **Set Duration & Buffer**: Default appointment duration and buffer time

### 3. Patient Booking Flow

**Step 1: Select Date & Time**
- Patient visits booking URL
- Sees clinic name and branding
- Selects a date from the week view
- Chooses from available time slots

**Step 2: Enter Details**
- Selects treatment type
- Enters name, email, phone
- Adds optional notes

**Step 3: Confirmation**
- Booking is created instantly
- Confirmation screen shown
- Appointment appears in clinic owner's calendar

### 4. Appointment Management
Clinic owners can:
- View all appointments in week grid
- Click time slots to add manual appointments
- Edit/delete appointments
- See patient contact details
- Track booking source (manual, online, voice)

## URLs and Routes

### Public Routes (No Login Required)
- `/book/[clinic-slug]` - Public booking page for patients

### Protected Routes (Login Required)
- `/Calendar` - Week view calendar for clinic owners
- `/Settings` - Booking settings and embed code

## Components

### Calendar Pages
- `CalendarWeek.jsx` - Main calendar with week grid view
- `PublicBooking.jsx` - Public-facing booking page

### Settings
- `BookingSettings.jsx` - Availability settings, URL, embed code

### API
- `booking.js` - Booking operations (public and authenticated)

## Embedding on External Website

### Copy Embed Code from Settings
1. Go to Settings > Online Booking
2. Copy the embed code
3. Paste into your website HTML

### Example HTML
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Book Your Appointment</h1>
  <iframe
    src="https://optifinance.app/book/dr-smith-aesthetics"
    width="100%"
    height="700px"
    frameborder="0"
  ></iframe>
</body>
</html>
```

### WordPress
1. Add "Custom HTML" block
2. Paste embed code
3. Publish page

### Squarespace/Wix
1. Add "Embed" or "Code" element
2. Paste embed code
3. Set height to 700px

## Availability Rules

### Working Hours
- Set start and end time for each day
- Toggle days on/off (e.g., closed weekends)
- Different hours per day supported

### Buffer Time
- Time between appointments for cleanup/prep
- Example: 15 minutes buffer means appointments can't be back-to-back

### Default Duration
- How long a typical appointment lasts
- Used for slot calculations
- Can be overridden per treatment

### Min Booking Notice
- Minimum advance notice required
- Default: 60 minutes
- Prevents last-minute bookings

### Max Booking Advance
- How far in advance patients can book
- Default: 60 days
- Prevents bookings too far out

## Voice Commands

Clinic owners can use voice commands to manage appointments:

```
"Book Sarah Thompson for Botox tomorrow at 2pm"
"What's my schedule today"
"Show me my calendar"
```

The voice assistant will:
- Create the appointment
- Navigate to the calendar
- Show confirmation

## Marketing Your Booking Page

### Share Your Link
- Add to Instagram bio
- Share on social media
- Include in email signature
- Print on business cards

### SEO-Friendly URL
Your booking slug is auto-generated from your clinic name:
- `dr-smith-aesthetics`
- `london-skin-clinic`
- `beauty-bar-manchester`

## Color Coding

Appointments are color-coded by treatment type:
- **Purple** - Botox
- **Pink** - Fillers
- **Blue** - Laser treatments
- **Green** - Facials
- **Amber** - Other treatments

## Mobile Responsive

The booking system is fully responsive:
- Week view on desktop
- Responsive grid on tablet
- Single-column on mobile
- Touch-friendly time slot selection

## Future Enhancements

Planned features:
- ✅ Basic booking system
- ✅ Embeddable widget
- ✅ Availability settings
- ⏳ Email/SMS confirmations
- ⏳ Cancellation/rescheduling
- ⏳ Payment collection at booking
- ⏳ Recurring appointments
- ⏳ Multi-practitioner support
- ⏳ Waitlist functionality

## Support

If you encounter issues:
1. Check that you've run the SQL setup script
2. Verify your booking slug in Settings
3. Test the booking URL in an incognito window
4. Check Supabase logs for errors

## Examples

### Example Booking URL
`https://optifinance.app/book/dr-smith-aesthetics`

### Example Embed Code
```html
<iframe
  src="https://optifinance.app/book/dr-smith-aesthetics"
  width="100%"
  height="700px"
  frameborder="0"
></iframe>
```

### Example Working Hours Setup
- Monday-Friday: 9:00 AM - 5:00 PM
- Saturday: Closed
- Sunday: Closed
- Buffer time: 15 minutes
- Default appointment: 30 minutes

---

**Ready to start accepting online bookings?**

1. Run the SQL setup script
2. Go to Settings > Online Booking
3. Configure your availability
4. Share your booking URL!
