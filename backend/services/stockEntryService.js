const { db } = require('../config/firebase');

class StockEntryService {
  constructor() {
    this.collection = db.collection('Stock_Entry');
  }

  async create(entryData) {
    try {
      const entryRef = this.collection.doc();
      const entry = {
        ...entryData,
        createdAt: new Date().toISOString(),
        id: entryRef.id
      };
      await entryRef.set(entry);
      return entry;
    } catch (error) {
      console.error('StockEntryService: Error creating entry:', error);
      throw error;
    }
  }

  async getAll() {
    try {
      const snapshot = await this.collection.orderBy('createdAt', 'desc').get();
      const entries = [];
      snapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() });
      });
      return entries;
    } catch (error) {
      console.error('StockEntryService: Error in getAll:', error);
      // If orderBy fails (missing index), try without ordering
      try {
        const snapshot = await this.collection.get();
        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        // Sort in memory
        entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return entries;
      } catch (fallbackError) {
        console.error('StockEntryService: Fallback also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  async getById(id) {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  async getByMaterialCode(materialCode) {
    try {
      const snapshot = await this.collection
        .where('materialCode', '==', materialCode)
        .orderBy('createdAt', 'desc')
        .get();

      const entries = [];
      snapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() });
      });
      return entries;
    } catch (error) {
      console.error('StockEntryService: Error in getByMaterialCode with orderBy:', error);
      // Fallback: query without orderBy if index is missing
      try {
        const snapshot = await this.collection
          .where('materialCode', '==', materialCode)
          .get();

        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        // Sort in memory
        entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return entries;
      } catch (fallbackError) {
        console.error('StockEntryService: Fallback getByMaterialCode failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  async getByEntryType(entryType) {
    try {
      const snapshot = await this.collection
        .where('entryType', '==', entryType)
        .orderBy('createdAt', 'desc')
        .get();

      const entries = [];
      snapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() });
      });
      return entries;
    } catch (error) {
      console.error('StockEntryService: Error in getByEntryType with orderBy:', error);
      // Fallback: query without orderBy if index is missing
      try {
        const snapshot = await this.collection
          .where('entryType', '==', entryType)
          .get();

        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        // Sort in memory
        entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return entries;
      } catch (fallbackError) {
        console.error('StockEntryService: Fallback getByEntryType failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  async search(filters) {
    try {
      let query = this.collection;

      if (filters.materialCode) {
        query = query.where('materialCode', '==', filters.materialCode);
      }
      if (filters.materialFlow) {
        query = query.where('materialFlow', '==', filters.materialFlow);
      }
      if (filters.entryType) {
        query = query.where('entryType', '==', filters.entryType);
      }
      if (filters.unit) {
        query = query.where('unit', '==', filters.unit);
      }

      // Try with orderBy first
      try {
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        return entries;
      } catch (orderByError) {
        console.error('StockEntryService: orderBy failed in search, trying without:', orderByError);
        // If orderBy fails (likely due to missing composite index), fetch without it
        const snapshot = await query.get();
        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        // Sort in memory
        entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return entries;
      }
    } catch (error) {
      console.error('StockEntryService: Error in search:', error);
      throw error;
    }
  }

  async update(id, updateData) {
    const entryRef = this.collection.doc(id);
    const doc = await entryRef.get();

    if (!doc.exists) {
      throw new Error('Stock entry not found');
    }
    if (doc.data().refType) {
      throw new Error('This entry was posted by a document (such as a sales order) and cannot be edited');
    }

    await entryRef.update({
      ...updateData,
      updatedAt: new Date().toISOString()
    });
  }

  async delete(id) {
    const entryRef = this.collection.doc(id);
    const doc = await entryRef.get();

    if (!doc.exists) {
      throw new Error('Stock entry not found');
    }
    if (doc.data().refType) {
      throw new Error('This entry was posted by a document (such as a sales order) and cannot be deleted');
    }

    await entryRef.delete();
  }

  async getStockBalance(materialCode) {
    const entries = await this.getByMaterialCode(materialCode);

    let totalCredit = 0;
    let totalDebit = 0;

    entries.forEach(entry => {
      const quantity = parseFloat(entry.quantity) || 0;
      if (entry.entryType === 'Credit') {
        totalCredit += quantity;
      } else if (entry.entryType === 'Debit') {
        totalDebit += quantity;
      }
    });

    return {
      materialCode,
      totalCredit,
      totalDebit,
      balance: totalCredit - totalDebit,
      lastEntry: entries[0] || null
    };
  }
}

module.exports = new StockEntryService();
