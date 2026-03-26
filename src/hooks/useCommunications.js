import { useMemo } from 'react';

/**
 * Groups invoices by patient and provides communication analytics
 * @param {Array} invoices - List of invoices from API
 * @param {Array} customMessages - List of logged custom communication messages
 * @param {string} filter - 'outstanding' or 'all'
 * @param {string} searchQuery - Search term for patient names
 * @returns {Array} Patient conversations with grouped invoices
 */
export function useCommunications(invoices, customMessages = [], filter = 'all', searchQuery = '') {
  return useMemo(() => {
    // Filter invoices based on selected filter
    let filtered = invoices;
    if (filter === 'outstanding') {
      filtered = invoices.filter(inv =>
        inv.status !== 'paid' && inv.status !== 'Paid'
      );
    }

    // Group invoices by patient
    const grouped = {};
    filtered.forEach(invoice => {
      // Create unique key combining name and contact
      const normalizedContact = (invoice.patient_contact || '').trim().toLowerCase();
      const key = `${invoice.patient_name}::${normalizedContact}`;

      if (!grouped[key]) {
        grouped[key] = {
          key,
          patient_name: invoice.patient_name,
          patient_contact: invoice.patient_contact,
          invoices: [],
          customMessages: [],
          outstandingBalance: 0,
          outstandingCount: 0,
          lastActivity: null,
        };
      }

      grouped[key].invoices.push(invoice);

      // Calculate outstanding amounts
      if (invoice.status !== 'paid' && invoice.status !== 'Paid') {
        grouped[key].outstandingBalance += Number(invoice.amount || 0);
        grouped[key].outstandingCount += 1;
      }

      // Track most recent activity
      const activityDate = new Date(invoice.updated_at || invoice.created_at);
      if (!grouped[key].lastActivity || activityDate > grouped[key].lastActivity) {
        grouped[key].lastActivity = activityDate;
      }
    });

    // Convert to array
    for (const msg of customMessages || []) {
      const normalizedContact = (msg.patient_contact || '').trim().toLowerCase();
      const key = `${msg.patient_name}::${normalizedContact}`;
      if (!grouped[key]) {
        grouped[key] = {
          key,
          patient_name: msg.patient_name,
          patient_contact: msg.patient_contact,
          invoices: [],
          customMessages: [],
          outstandingBalance: 0,
          outstandingCount: 0,
          lastActivity: null,
        };
      }
      grouped[key].customMessages.push(msg);

      const activityDate = new Date(msg.created_at || msg.updated_at || Date.now());
      if (!grouped[key].lastActivity || activityDate > grouped[key].lastActivity) {
        grouped[key].lastActivity = activityDate;
      }
    }

    // Convert to array
    let conversations = Object.values(grouped);

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      conversations = conversations.filter(conv =>
        conv.patient_name.toLowerCase().includes(query) ||
        (conv.patient_contact || '').toLowerCase().includes(query)
      );
    }

    // Sort by last activity (most recent first)
    conversations.sort((a, b) =>
      (b.lastActivity || 0) - (a.lastActivity || 0)
    );

    return conversations;
  }, [invoices, customMessages, filter, searchQuery]);
}
