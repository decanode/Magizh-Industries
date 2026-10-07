const { db } = require('../config/firebase');

const docId = (employeeId, date) => `${employeeId}_${date}`;

class TimesheetService {
  constructor() {
    this.collection = db.collection('timesheetEntries');
  }

  // All entries saved for one calendar day, keyed by employeeId.
  async getDay(date) {
    const snapshot = await this.collection.where('date', '==', date).get();
    const entries = {};
    snapshot.forEach((doc) => {
      entries[doc.data().employeeId] = doc.data();
    });
    return entries;
  }

  // Overwrites the whole day in one batch. A day is always correctable - re-saving it replaces every row.
  async saveDay(date, entries, actorId) {
    const batch = db.batch();
    const now = new Date().toISOString();

    entries.forEach((entry) => {
      const ref = this.collection.doc(docId(entry.employeeId, date));
      const otHours = entry.otHours === undefined || entry.otHours === '' ? 0 : Number(entry.otHours);
      batch.set(ref, {
        employeeId: entry.employeeId,
        date,
        status: entry.status,
        otHours,
        note: entry.note ? String(entry.note).trim() : '',
        updatedAt: now,
        updatedBy: actorId
      });
    });

    await batch.commit();
    return this.getDay(date);
  }

  // Aggregates every entry in [year, month] by employee: day counts, OT hours, and the leave dates (for "leave history").
  async getMonthlySummary(year, month) {
    const pad = (n) => String(n).padStart(2, '0');
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${year}-${pad(month)}-01`;
    const endDate = `${year}-${pad(month)}-${pad(daysInMonth)}`;

    const snapshot = await this.collection.where('date', '>=', startDate).where('date', '<=', endDate).get();

    const byEmployee = {};
    const ensure = (employeeId) => {
      if (!byEmployee[employeeId]) {
        byEmployee[employeeId] = { employeeId, presentDays: 0, absentDays: 0, leaveDays: 0, otHours: 0, leaveEntries: [] };
      }
      return byEmployee[employeeId];
    };

    snapshot.forEach((doc) => {
      const entry = doc.data();
      const summary = ensure(entry.employeeId);
      if (entry.status === 'present') summary.presentDays += 1;
      else if (entry.status === 'absent') summary.absentDays += 1;
      else if (entry.status === 'leave') {
        summary.leaveDays += 1;
        summary.leaveEntries.push({ date: entry.date, note: entry.note || '' });
      }
      summary.otHours += Number(entry.otHours) || 0;
    });

    return byEmployee;
  }
}

module.exports = TimesheetService;
