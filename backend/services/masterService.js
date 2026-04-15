const { db } = require('../config/firebase');

class MasterService {
  constructor() {
    this.collection = db.collection('Master_material');
    this.archiveCollection = db.collection('Material_Archive');
    this.requestTrackingCollection = db.collection('Request_tracking');
  }

  // Check if request was already processed (idempotency)
  async checkDuplicateRequest(idempotencyKey) {
    if (!idempotencyKey) return null;
    
    const doc = await this.requestTrackingCollection.doc(idempotencyKey).get();
    if (doc.exists) {
      return doc.data().result;
    }
    return null;
  }

  // Store request tracking for idempotency
  async recordRequest(idempotencyKey, result) {
    if (!idempotencyKey) return;
    
    await this.requestTrackingCollection.doc(idempotencyKey).set({
      result,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hour expiry
    });
  }

  // Check for duplicate master data based on unique attributes
  async checkDuplicateMaster(materialData) {
    const snapshot = await this.collection
      .where('class', '==', materialData.class)
      .where('category', '==', materialData.category)
      .where('materialName', '==', materialData.materialName)
      .where('status', '==', 'active')
      .get();

    if (!snapshot.empty) {
      // Check if same data already exists
      for (const doc of snapshot.docs) {
        const existing = doc.data();
        if (
          existing.materialFlow === materialData.materialFlow &&
          existing.supplierCode === (materialData.supplierCode || '')
        ) {
          return {
            isDuplicate: true,
            existingId: doc.id,
            existingData: { id: doc.id, ...existing }
          };
        }
      }
    }
    return { isDuplicate: false };
  }

  async generateMaterialCode(materialClass) {
    const classPrefixes = {
      'A': '1',
      'B': '2',
      'C': '3',
      'D': '4',
      'F': '5'
    };

    const prefix = classPrefixes[materialClass];
    if (!prefix) {
      throw new Error('Invalid material class');
    }

    const activeSnapshot = await this.collection
      .where('class', '==', materialClass)
      .get();

    const archiveSnapshot = await this.archiveCollection
      .where('class', '==', materialClass)
      .get();

    let maxCode = 0;

    activeSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.materialCode) {
        const code = parseInt(data.materialCode);
        if (!isNaN(code) && code > maxCode) {
          maxCode = code;
        }
      }
    });

    archiveSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.materialCode) {
        const code = parseInt(data.materialCode);
        if (!isNaN(code) && code > maxCode) {
          maxCode = code;
        }
      }
    });

    const newCode = maxCode === 0 ? parseInt(prefix + '0001') : maxCode + 1;
    return newCode.toString();
  }

  async create(materialData, idempotencyKey = null) {
    // Check if this request was already processed
    const existingResult = await this.checkDuplicateRequest(idempotencyKey);
    if (existingResult) {
      return existingResult;
    }

    // Check for duplicate master data
    const duplicateCheck = await this.checkDuplicateMaster(materialData);
    if (duplicateCheck.isDuplicate) {
      const result = {
        id: duplicateCheck.existingId,
        ...duplicateCheck.existingData,
        isDuplicate: true,
        message: 'This master data already exists'
      };
      await this.recordRequest(idempotencyKey, result);
      return result;
    }

    const materialCode = await this.generateMaterialCode(materialData.class);

    const masterDoc = {
      materialCode,
      materialFlow: materialData.materialFlow,
      class: materialData.class,
      category: materialData.category,
      materialName: materialData.materialName,
      catNo: materialData.catNo || '',
      supplierName: materialData.supplierName || '',
      supplierCode: materialData.supplierCode || '',
      cgst: materialData.cgst || '',
      igst: materialData.igst || '',
      sgst: materialData.sgst || '',
      costPerItem: materialData.costPerItem || '',
      unit: materialData.unit || 'EA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: materialData.createdBy || null,
      status: 'active'
    };

    const docRef = await this.collection.add(masterDoc);
    const result = { id: docRef.id, ...masterDoc };
    
    // Record this request for idempotency
    await this.recordRequest(idempotencyKey, result);
    
    return result;
  }

  async getAll() {
    const snapshot = await this.collection
      .where('status', '==', 'active')
      .get();

    const masters = [];
    snapshot.forEach(doc => {
      masters.push({ id: doc.id, ...doc.data() });
    });

    masters.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    return masters;
  }

  async getById(masterId) {
    const doc = await this.collection.doc(masterId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  async update(masterId, updateData) {
    const master = await this.getById(masterId);
    if (!master) {
      throw new Error('Material master not found');
    }

    await this.collection.doc(masterId).update({
      ...updateData,
      updatedAt: new Date().toISOString()
    });
  }

  async delete(masterId) {
    const master = await this.getById(masterId);
    if (!master) {
      throw new Error('Material master not found');
    }

    await this.collection.doc(masterId).update({
      status: 'deleted',
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  async archive(masterId) {
    const master = await this.getById(masterId);
    if (!master) {
      throw new Error('Material master not found');
    }

    await this.archiveCollection.doc(masterId).set({
      ...master,
      archivedAt: new Date().toISOString(),
      originalId: masterId
    });

    await this.collection.doc(masterId).delete();
  }

  async search(filters) {
    let query = this.collection.where('status', '==', 'active');

    if (filters.materialFlow) {
      query = query.where('materialFlow', '==', filters.materialFlow);
    }
    if (filters.class) {
      query = query.where('class', '==', filters.class);
    }
    if (filters.category) {
      query = query.where('category', '==', filters.category);
    }

    const snapshot = await query.get();
    const masters = [];
    snapshot.forEach(doc => {
      masters.push({ id: doc.id, ...doc.data() });
    });
    return masters;
  }
}

module.exports = new MasterService();
