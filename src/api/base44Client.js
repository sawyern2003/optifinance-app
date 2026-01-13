// Re-export backend client as base44 for compatibility
// This allows existing code to continue working without changes
import { backend } from './backendClient';

export const base44 = backend;
