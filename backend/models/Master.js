const MasterSchema = {
  materialCode: '',
  materialFlow: '',
  class: '',
  category: '',
  materialName: '',
  catNo: '',
  supplierName: '',
  supplierCode: '',
  cgst: '',
  igst: '',
  sgst: '',
  costPerItem: '',
  unit: '',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: null
};

module.exports = MasterSchema;
