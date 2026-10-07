const { db } = require('../config/firebase');

// Employee numbers start at 960001 and increment by 1 for every new employee, regardless of who leaves.
// A departed employee's number is never reused.
const FIRST_EMPLOYEE_CODE = 960001;

class EmployeeService {
  constructor() {
    this.collection = db.collection('employees');
    this.counters = db.collection('counters');
  }

  // Allocates the next employee number inside a transaction so concurrent creates never share one.
  async nextEmployeeCode() {
    const counterRef = this.counters.doc('employee');

    const sequence = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const next = snapshot.exists ? snapshot.data().next : FIRST_EMPLOYEE_CODE;
      transaction.set(counterRef, { next: next + 1 });
      return next;
    });

    return String(sequence);
  }

  async create(data, actorId) {
    const now = new Date().toISOString();

    const employee = {
      ...data,
      status: 'active',
      exitReason: null,
      exitDate: null,
      employeeCode: await this.nextEmployeeCode(),
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId
    };

    const docRef = await this.collection.add(employee);
    return { id: docRef.id, ...employee };
  }

  async getById(id) {
    const snapshot = await this.collection.doc(id).get();
    if (!snapshot.exists) return null;
    return { id: snapshot.id, ...snapshot.data() };
  }

  // Firestore cannot do substring search, so search is applied in memory. This is fine for the expected staff size.
  async list({ search = '', status = 'all' } = {}) {
    let query = this.collection;
    if (status !== 'all') {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    const employees = [];
    snapshot.forEach((doc) => employees.push({ id: doc.id, ...doc.data() }));

    const term = search.trim().toLowerCase();
    const matching = term
      ? employees.filter((employee) =>
          [employee.employeeCode, employee.firstName, employee.lastName, employee.designation]
            .some((value) => String(value || '').toLowerCase().includes(term))
        )
      : employees;

    return matching.sort((a, b) => Number(a.employeeCode) - Number(b.employeeCode));
  }

  // The general-purpose update. Blocked while the employee has left - see deactivate/reactivate below,
  // which are the only two ways to change status, and bypass this block on purpose.
  async update(id, changes, actorId) {
    const ref = this.collection.doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;

    const current = snapshot.data();
    if (current.status === 'inactive') {
      const error = new Error('This employee has left the company. Reactivate before making changes.');
      error.code = 'EMPLOYEE_INACTIVE';
      throw error;
    }

    const updates = {
      ...changes,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };

    await ref.update(updates);
    return { id, ...current, ...updates };
  }

  // Marks the employee as having left the company. A reason is required by the controller before this is called.
  // The record and its history are kept - nothing is deleted, and the employee number is never reused.
  async deactivate(id, actorId, reason) {
    const ref = this.collection.doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;

    const updates = {
      status: 'inactive',
      exitReason: reason,
      exitDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };

    await ref.update(updates);
    return { id, ...snapshot.data(), ...updates };
  }

  // Rejoining clears the exit fields and re-allows edits. Past payslips are untouched - they're independent records.
  async reactivate(id, actorId) {
    const ref = this.collection.doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;

    const updates = {
      status: 'active',
      exitReason: null,
      exitDate: null,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };

    await ref.update(updates);
    return { id, ...snapshot.data(), ...updates };
  }
}

module.exports = EmployeeService;
