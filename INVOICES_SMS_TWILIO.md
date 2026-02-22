# Invoices, PDFs, and SMS (Twilio)

## 1. PDF invoice generation and sending to patients

**How it works now**

- **Instant real PDFs**: The **generate-invoice-pdf** Edge Function creates a **real PDF** (using pdf-lib) with clinic name, invoice number, dates, patient, treatment, amount, bank details, and notes. It uploads the PDF to Supabase Storage and saves the public URL on the invoice. No HTML—actual PDF file that opens in any viewer and can be downloaded.
- **Sending to patients**:
  - **Invoices** → **Send**: The app calls **generate-invoice-pdf** first if the invoice doesn’t have a PDF yet, then **send-invoice** (SMS and/or email). SMS includes the PDF link; email (when Resend is configured) includes a “View and download your PDF invoice” link.
  - **Records / QuickAdd** → “Send payment link via SMS”: creates the invoice, then you can trigger **send-invoice** with `sendVia: 'sms'` so the patient gets an SMS with the amount and, once the PDF exists, the link. For “instant” PDF before SMS, call **generate-invoice-pdf** after creating the invoice, then send (the current flow from Invoices does this; from Records/QuickAdd the SMS goes out with whatever URL exists, so generate PDF first if you want the link in that SMS).
- **Email**: Set **RESEND_API_KEY** (and optionally **FROM_EMAIL**) in Supabase Edge Function secrets. Then “Send” with email or “both” sends a real email with the PDF link via Resend.

---

## 2. Twilio and SMS

**Where Twilio is used**

- **send-invoice** Edge Function: when sending an invoice via SMS (`sendVia === 'sms'` or `'both'`), it uses the Twilio API to send the SMS (invoice number, amount, and view-invoice link if present).
- **send-payment-reminder** Edge Function: sends a payment reminder SMS via Twilio (e.g. “Thank you for visiting [Clinic]. Please send £X to [bank details]…”). Used when you click “Send payment reminder” on the Invoices page.

**Required setup**

- In **Supabase** → your project → **Edge Functions** → **Secrets** (or via CLI), set:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER` (the number that sends the SMS; must be a Twilio number)
- Deploy the functions that use Twilio:
  ```bash
  supabase functions deploy send-invoice
  supabase functions deploy send-payment-reminder
  ```

**“Send SMS after treatment”**

- **QuickAdd** and **Records** “Send payment link via SMS” / “Create invoice + Send SMS” now call **sendInvoiceSMS** with the **new invoice id**. The backend then calls the **send-invoice** Edge Function with that id and `sendVia: 'sms'`, so Twilio is used for those flows. Patients receive the same style of message (invoice number, amount, link if available).

**Patient phone numbers**

- Twilio expects numbers in **E.164** (e.g. `+447700900123`). If you store numbers in another format, you may need to normalize them in the Edge Function or in the app before sending.

---

## 3. Does Twilio work for all clinics using the software?

**Current design: one Twilio account for the whole app**

- The Edge Functions read **one** set of Twilio credentials from Supabase secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
- So **all** clinics (all users of the app) send SMS from the **same** Twilio account and the **same** “From” number. That works for:
  - A single business (e.g. one practice with multiple clinics) or
  - A SaaS where you, as the platform, send all messages and are fine with one sender identity.

**If each clinic must have its own number / identity**

- You’d need **per-clinic** Twilio credentials (or at least per-clinic “From” numbers):
  - Store Twilio credentials (or just `TWILIO_PHONE_NUMBER` and optionally SID/Token) per clinic, e.g. in `profiles` or a `clinic_settings` table.
  - In **send-invoice** and **send-payment-reminder**, look up the current user’s clinic and use that clinic’s Twilio settings when calling the Twilio API.
- That would require code changes in those Edge Functions and a way for clinics to enter and save their Twilio details (e.g. in Settings).

**Summary**

- **One Twilio account**: Yes, it works for all clinics; every SMS is sent from the same number/account.
- **One number per clinic**: Not implemented yet; would require storing and using Twilio credentials per clinic.

For full setup steps (deploy, secrets, etc.), see **DEPLOYMENT.md**.
