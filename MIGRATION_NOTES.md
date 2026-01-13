# Migration Notes: Base44 to Supabase

This document outlines the changes made when migrating from Base44 to Supabase backend.

## What Changed

### Backend Infrastructure
- **Database**: Migrated from Base44's managed database to Supabase PostgreSQL
- **Authentication**: Migrated from Base44 Auth to Supabase Auth
- **Storage**: Migrated from Base44 Storage to Supabase Storage
- **SDK**: Replaced `@base44/sdk` with `@supabase/supabase-js`

### What Stayed the Same
- **UI**: 100% unchanged - all React components remain identical
- **User Experience**: No changes to the app's functionality or appearance
- **Data Models**: Same entity structure (patients, treatments, expenses, etc.)
- **API Interface**: Backend client maintains the same interface as Base44 SDK

## Technical Changes

### 1. API Client (`src/api/backendClient.js`)
Created a new backend client that mimics the Base44 SDK interface:
- `backend.entities.*` - Entity CRUD operations (same interface)
- `backend.auth.*` - Authentication methods (same interface)
- `backend.integrations.*` - Integration methods (placeholders for now)
- `backend.functions.*` - Custom functions (placeholders for now)

### 2. Database Schema (`database/schema.sql`)
- Created PostgreSQL schema with all tables
- Implemented Row Level Security (RLS) for data isolation
- Added triggers for automatic `user_id` setting and timestamp updates
- Field names use snake_case (matching Base44 convention)

### 3. Package Dependencies
**Removed:**
- `@base44/sdk`

**Added:**
- `@supabase/supabase-js`
- `@tanstack/react-query` (was implicit in Base44, now explicit)

### 4. Configuration
- Added `.env` file for Supabase credentials
- Added `src/config/supabase.js` for Supabase client initialization

### 5. React Query Setup
- Added `QueryClientProvider` to `App.jsx` (Base44 may have provided this implicitly)

## Data Migration (If You Have Existing Data)

If you have existing data in Base44, you'll need to export and import it:

1. Export data from Base44 (if possible via their dashboard or API)
2. Transform data to match Supabase schema (field names should match)
3. Import into Supabase using SQL or Supabase dashboard
4. Update user IDs to match Supabase auth user IDs

## Integration Points That Need Implementation

The following are placeholders and need to be implemented:

### 1. LLM Integration (`InvokeLLM`)
**Current**: Returns placeholder text
**Need**: Integrate with OpenAI, Anthropic, or similar
**Location**: `src/api/backendClient.js` → `Integrations.InvokeLLM()`

### 2. Email Service (`SendEmail`)
**Current**: Console log only
**Need**: Integrate with Resend, SendGrid, or similar
**Location**: `src/api/backendClient.js` → `Integrations.SendEmail()`

### 3. SMS Service (`sendInvoiceSMS`)
**Current**: Placeholder
**Need**: Integrate with Twilio, AWS SNS, or similar
**Location**: `src/api/backendClient.js` → `Functions.invoke('sendInvoiceSMS')`

### 4. Consultant Chat (`consultantChat`)
**Current**: Placeholder
**Need**: Implement AI chat using LLM service
**Location**: `src/api/backendClient.js` → `Functions.invoke('consultantChat')`

### 5. Payment Processing (`createGoCardlessPayment`)
**Current**: Placeholder
**Need**: Integrate with GoCardless API or payment provider
**Location**: `src/api/backendClient.js` → `Functions.invoke('createGoCardlessPayment')`

## Authentication Flow Differences

### Base44
- Authentication handled externally by Base44
- User sessions managed by Base44
- No login UI in the app

### Supabase
- Uses Supabase Auth
- Can use Supabase Auth UI components
- Or build custom login/signup pages
- Sessions managed by Supabase

**Recommendation**: Add authentication UI or use Supabase Auth UI

## Storage Differences

### Base44
- Files stored in Base44 Storage
- Automatic URL generation

### Supabase
- Files stored in Supabase Storage buckets
- Need to create `files` bucket
- Public URLs or signed URLs based on bucket settings

## Row Level Security (RLS)

Supabase uses RLS policies to ensure users can only access their own data. This is implemented in the schema and matches Base44's behavior.

## Testing Checklist

After migration, test:
- [ ] User authentication (login/signup)
- [ ] Creating/editing/deleting entities (patients, treatments, etc.)
- [ ] File uploads
- [ ] Data filtering and sorting
- [ ] Dashboard charts and statistics
- [ ] Invoice generation
- [ ] Report exports
- [ ] All CRUD operations for each entity type

## Performance Considerations

- Supabase uses PostgreSQL which should be fast
- Consider adding database indexes for frequently queried fields
- File storage uses Supabase Storage (similar performance to Base44)
- RLS policies add minimal overhead

## Cost Comparison

- Base44: Paid service (acquired by Wix)
- Supabase: Free tier available, paid plans for higher usage
- Compare pricing based on your usage patterns

## Support & Documentation

- Supabase Docs: https://supabase.com/docs
- Supabase Community: https://github.com/supabase/supabase/discussions
- React Query Docs: https://tanstack.com/query/latest
