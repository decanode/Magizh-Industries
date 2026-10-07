const { db } = require('../config/firebase');

const pad2 = (n) => String(n).padStart(2, '0');
const docId = (employeeId, year, month) => `${employeeId}_${year}-${pad2(month)}`;

class PayslipService {
  constructor() {
    this.collection = db.collection('payslips');
  }

  async getById(id) {
    const snapshot = await this.collection.doc(id).get();
    if (!snapshot.exists) return null;
    return { id: snapshot.id, ...snapshot.data() };
  }

  async getForEmployeeMonth(employeeId, year, month) {
    return this.getById(docId(employeeId, year, month));
  }

  async list({ year, month, employeeId } = {}) {
    let query = this.collection;
    if (Number.isInteger(year)) query = query.where('year', '==', year);
    if (Number.isInteger(month)) query = query.where('month', '==', month);
    if (employeeId) query = query.where('employeeId', '==', employeeId);

    const snapshot = await query.get();
    const rows = [];
    snapshot.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
    return rows.sort((a, b) => Number(a.employeeCode) - Number(b.employeeCode));
  }

  // Creates the snapshot. A live ('generated') payslip for this employee+month blocks a second one -
  // void it first. A voided one can be overwritten, so "void then regenerate" actually works.
  // Runs in a transaction so two simultaneous generate requests can never both succeed.
  async create(data, actorId) {
    const id = docId(data.employeeId, data.year, data.month);
    const ref = this.collection.doc(id);
    const payslip = {
      ...data,
      status: 'generated',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      generatedBy: actorId,
      generatedAt: new Date().toISOString()
    };

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists && snapshot.data().status !== 'voided') {
        const duplicateError = new Error('A payslip already exists for this employee and month');
        duplicateError.code = 'PAYSLIP_EXISTS';
        throw duplicateError;
      }
      transaction.set(ref, payslip);
    });

    return { id, ...payslip };
  }

  async void(id, actorId, reason) {
    const ref = this.collection.doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;

    const updates = {
      status: 'voided',
      voidReason: reason,
      voidedBy: actorId,
      voidedAt: new Date().toISOString()
    };

    await ref.update(updates);
    return { id, ...snapshot.data(), ...updates };
  }
}

module.exports = PayslipService;
