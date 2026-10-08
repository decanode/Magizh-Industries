const { db } = require('../config/firebase');

// Shared by the customer and supplier masters. Codes are plain numbers (customers from 50001, suppliers from
// 60001), allocated from a counter and never reused, even after a record is archived.
class PartyService {
  constructor({ collectionName, archiveCollectionName, counterName, firstNumber }) {
    this.collection = db.collection(collectionName);
    this.archiveCollection = db.collection(archiveCollectionName);
    this.counterRef = db.collection('counters').doc(counterName);
    this.firstNumber = firstNumber;
  }

  async nextCode() {
    const sequence = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.counterRef);
      // An older counter that is still below the starting number jumps up to it.
      const next = Math.max(snapshot.exists ? snapshot.data().next : 0, this.firstNumber);
      transaction.set(this.counterRef, { next: next + 1 });
      return next;
    });

    return String(sequence);
  }

  async create(data, actorId) {
    const now = new Date().toISOString();
    const party = {
      ...data,
      code: await this.nextCode(),
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId
    };

    const docRef = await this.collection.add(party);
    return { id: docRef.id, ...party };
  }

  // An archived record is still returned (flagged `archived`) so documents that refer to it - orders, deliveries,
  // invoices - keep opening after the customer or supplier is archived.
  async getById(id) {
    const snapshot = await this.collection.doc(id).get();
    if (snapshot.exists) return { id: snapshot.id, ...snapshot.data() };

    const archived = await this.archiveCollection.doc(id).get();
    return archived.exists ? { id: archived.id, ...archived.data(), archived: true } : null;
  }

  // Firestore cannot do substring search, so search is applied in memory.
  async list({ search = '', archived = false } = {}) {
    const snapshot = await (archived ? this.archiveCollection : this.collection).get();
    const parties = [];
    snapshot.forEach((doc) => parties.push({ id: doc.id, ...doc.data() }));

    const term = search.trim().toLowerCase();
    const matching = term
      ? parties.filter((party) =>
          [party.code, party.name, party.contactPerson, party.city, party.gstin]
            .some((value) => String(value || '').toLowerCase().includes(term))
        )
      : parties;

    return matching.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  }

  async update(id, changes, actorId) {
    const ref = this.collection.doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;

    const updates = { ...changes, updatedAt: new Date().toISOString(), updatedBy: actorId };
    await ref.update(updates);
    return { id, ...snapshot.data(), ...updates };
  }

  // "Delete" never destroys data: the record moves to the archive collection and can be restored.
  async archive(id, actorId) {
    const snapshot = await this.collection.doc(id).get();
    if (!snapshot.exists) return false;

    const now = new Date().toISOString();
    await this.archiveCollection.doc(id).set({
      ...snapshot.data(),
      archivedAt: now,
      archivedBy: actorId,
      originalId: id
    });
    await this.collection.doc(id).delete();
    return true;
  }

  async restore(id, actorId) {
    const snapshot = await this.archiveCollection.doc(id).get();
    if (!snapshot.exists) return false;

    const { archivedAt, archivedBy, originalId, ...party } = snapshot.data();
    await this.collection.doc(id).set({
      ...party,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    });
    await this.archiveCollection.doc(id).delete();
    return true;
  }
}

module.exports = PartyService;
