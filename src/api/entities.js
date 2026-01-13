import { backend } from './backendClient';

// Export entities from backend client
export const Patient = backend.entities.Patient;
export const Practitioner = backend.entities.Practitioner;
export const TreatmentCatalog = backend.entities.TreatmentCatalog;
export const TreatmentEntry = backend.entities.TreatmentEntry;
export const Expense = backend.entities.Expense;
export const ExportHistory = backend.entities.ExportHistory;
export const Invoice = backend.entities.Invoice;
export const CompetitorPricing = backend.entities.CompetitorPricing;
export const TaxSettings = backend.entities.TaxSettings;
export const ChatHistory = backend.entities.ChatHistory;

// Auth SDK
export const User = backend.auth;