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
    const toPatientKey = (name) =>
      String(name || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    // Filter invoices based on selected filter
    let filtered = invoices;
    if (filter === 'outstanding') {
      filtered = invoices.filter(inv =>
        inv.status !== 'paid' && inv.status !== 'Paid'
      );
    }

    // Group invoices by patient
    const grouped = {};
    const ensureGroup = (name, contact) => {
      const key = toPatientKey(name);
      if (!key) return null;
      if (!grouped[key]) {
        grouped[key] = {
          key,
          patient_name: name,
          patient_contact: contact || '',
          invoices: [],
          customMessages: [],
          outstandingBalance: 0,
          outstandingCount: 0,
          lastActivity: null,
          contactSet: new Set(),
          contactUpdatedAt: null,
        };
      }
      if (contact) {
        grouped[key].contactSet.add(String(contact).trim());
      }
      return grouped[key];
    };

    filtered.forEach(invoice => {
      const group = ensureGroup(invoice.patient_name, invoice.patient_contact);
      if (!group) return;
      group.invoices.push(invoice);
      const contact = String(invoice.patient_contact || '').trim();
      const activityDate = new Date(invoice.updated_at || invoice.created_at || Date.now());
      if (
        contact &&
        (!group.contactUpdatedAt || activityDate >= group.contactUpdatedAt)
      ) {
        // Keep display contact aligned with most recent known activity.
        group.patient_contact = contact;
        group.contactUpdatedAt = activityDate;
      }

      // Calculate outstanding amounts
      if (invoice.status !== 'paid' && invoice.status !== 'Paid') {
        group.outstandingBalance += Number(invoice.amount || 0);
        group.outstandingCount += 1;
      }

      // Track most recent activity
      if (!group.lastActivity || activityDate > group.lastActivity) {
        group.lastActivity = activityDate;
      }
    });

    // Merge logged custom messages into same per-patient thread.
    for (const msg of customMessages || []) {
      const group = ensureGroup(msg.patient_name, msg.patient_contact);
      if (!group) continue;
      group.customMessages.push(msg);

      const activityDate = new Date(msg.created_at || msg.updated_at || Date.now());
      const contact = String(msg.patient_contact || '').trim();
      if (
        contact &&
        (!group.contactUpdatedAt || activityDate >= group.contactUpdatedAt)
      ) {
        group.patient_contact = contact;
        group.contactUpdatedAt = activityDate;
      }
      if (!group.lastActivity || activityDate > group.lastActivity) {
        group.lastActivity = activityDate;
      }
    }

    // Convert to array
    let conversations = Object.values(grouped).map((conv) => ({
      ...conv,
      contacts: Array.from(conv.contactSet || []),
    }));

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      conversations = conversations.filter(conv =>
        conv.patient_name.toLowerCase().includes(query) ||
        (conv.patient_contact || '').toLowerCase().includes(query) ||
        (conv.contacts || []).some((c) => String(c).toLowerCase().includes(query))
      );
    }

    // Sort by last activity (most recent first)
    conversations.sort((a, b) =>
      (b.lastActivity || 0) - (a.lastActivity || 0)
    );

    return conversations;
  }, [invoices, customMessages, filter, searchQuery]);
}
