import { backend } from './backendClient';

// Export functions from backend client
// These can be called directly or wrapped for compatibility
export const sendInvoiceSMS = async (payload) => {
  return backend.functions.invoke('sendInvoiceSMS', payload);
};

export const verifySubscription = async (payload) => {
  return backend.functions.invoke('verifySubscription', payload);
};

export const consultantChat = async (payload) => {
  return backend.functions.invoke('consultantChat', payload);
};

