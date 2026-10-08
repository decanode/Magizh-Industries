// Local testing only: wipes the Firestore emulator's business data and fills it with sample materials (with HSN and
// opening stock), customers (with bill-to/ship-to addresses and payment terms) and suppliers.
// Refuses to run unless FIRESTORE_EMULATOR_HOST and a demo-* GCLOUD_PROJECT are set, so it can never touch real data.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-magizh node utils/seedDummyData.js
if (!process.env.FIRESTORE_EMULATOR_HOST || !(process.env.GCLOUD_PROJECT || '').startsWith('demo-')) {
  console.error('Refusing to seed: set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT=demo-* first.');
  process.exit(1);
}

const { db } = require('../config/firebase');
const masterService = require('../services/masterService');
const stockEntryService = require('../services/stockEntryService');
const PartyService = require('../services/PartyService');

const SUPPLIERS = [
  ['Sri Murugan Metals', 'Ravi Kumar', '9841012345', 'Chennai', 'Tamil Nadu', '600032', '33AABCS1234F1Z5'],
  ['Kovai Fasteners', 'Anand S', '9894056789', 'Coimbatore', 'Tamil Nadu', '641001', '33AACCK5678G1Z2'],
  ['Bharat Packaging', 'Meena R', '9444098765', 'Madurai', 'Tamil Nadu', '625001', '33AAFCB2345H1Z8'],
  ['Deccan Polymers', 'Suresh Babu', '9900123456', 'Bengaluru', 'Karnataka', '560001', '29AABCD4321J1Z6'],
  ['Pioneer Electricals', 'Kavitha N', '9822234567', 'Pune', 'Maharashtra', '411001', '27AAECP8765K1Z3'],
  ['Southern Rubber Works', 'Joseph M', '9747045678', 'Kochi', 'Kerala', '682001', '32AAGCS3456L1Z9'],
  ['Ganesh Steel Traders', 'Mohan G', '9677056789', 'Salem', 'Tamil Nadu', '636001', '33AAHCG6543M1Z1'],
  ['Apex Paints & Coatings', 'Divya P', '9566067890', 'Hosur', 'Tamil Nadu', '635109', '33AAICA7654N1Z4']
];

const CUSTOMERS = [
  ['Lakshmi Engineering Works', 'Karthik V', '9843011122', 'Chennai', 'Tamil Nadu', '600058', '33AABCL1111A1Z5'],
  ['Vel Auto Components', 'Prakash T', '9894022233', 'Coimbatore', 'Tamil Nadu', '641014', '33AACCV2222B1Z6'],
  ['National Switchgear Ltd', 'Anita Rao', '9886033344', 'Bengaluru', 'Karnataka', '560058', '29AADCN3333C1Z7'],
  ['Sunrise Appliances', 'Imran Khan', '9820044455', 'Mumbai', 'Maharashtra', '400001', '27AAECS4444D1Z8'],
  ['Annapoorna Foods Equipment', 'Gopal R', '9442055566', 'Tiruchirappalli', 'Tamil Nadu', '620001', '33AAFCA5555E1Z9'],
  ['Metro Cables & Wires', 'Sandeep J', '9811066677', 'Hyderabad', 'Telangana', '500001', '36AAGCM6666F1Z1'],
  ['Pearl Fabrication', 'Rekha S', '9745077788', 'Thiruvananthapuram', 'Kerala', '695001', '32AAHCP7777G1Z2'],
  ['Orient Pumps & Motors', 'Balaji K', '9677088899', 'Erode', 'Tamil Nadu', '638001', '33AAICO8888H1Z3']
];

// [flow, class, category, name, catNo, supplierName, supplierCode, gst%, cost, unit]
const MATERIALS = [
  ['BOM', 'A', 'Raw Metal', 'MS Sheet 2mm', '7208', 'Sri Murugan Metals', '101', 9, 68.5, 'KG'],
  ['BOM', 'A', 'Raw Metal', 'MS Sheet 3mm', '7208', 'Sri Murugan Metals', '101', 9, 66, 'KG'],
  ['BOM', 'A', 'Raw Metal', 'Aluminium Rod 12mm', '7604', 'Ganesh Steel Traders', '107', 9, 242, 'KG'],
  ['BOM', 'A', 'Raw Metal', 'Copper Wire 1.5mm', '7408', 'Ganesh Steel Traders', '107', 9, 735, 'KG'],
  ['BOM', 'A', 'Raw Metal', 'Stainless Steel Pipe 25mm', '7306', 'Sri Murugan Metals', '101', 9, 310, 'M'],
  ['BOM', 'B', 'Fasteners', 'Hex Bolt M8x40', '7318', 'Kovai Fasteners', '102', 9, 4.2, 'EA'],
  ['BOM', 'B', 'Fasteners', 'Hex Nut M8', '7318', 'Kovai Fasteners', '102', 9, 1.1, 'EA'],
  ['BOM', 'B', 'Fasteners', 'Spring Washer M8', '7318', 'Kovai Fasteners', '102', 9, 0.6, 'EA'],
  ['BOM', 'B', 'Fasteners', 'Self Tapping Screw 4x25', '7318', 'Kovai Fasteners', '102', 9, 0.9, 'EA'],
  ['BOM', 'B', 'Fasteners', 'Rivet 4mm', '7317', 'Kovai Fasteners', '102', 9, 0.45, 'EA'],
  ['BOM', 'C', 'Electrical', 'Copper Terminal Lug 6mm', '8536', 'Pioneer Electricals', '105', 9, 3.4, 'EA'],
  ['BOM', 'C', 'Electrical', 'PVC Insulated Cable 2.5 sqmm', '8544', 'Pioneer Electricals', '105', 9, 21, 'M'],
  ['BOM', 'C', 'Electrical', 'Toggle Switch 6A', '8536', 'Pioneer Electricals', '105', 9, 18, 'EA'],
  ['BOM', 'C', 'Electrical', 'Capacitor 25uF', '8532', 'Pioneer Electricals', '105', 9, 62, 'EA'],
  ['BOM', 'C', 'Electrical', 'Terminal Block 4 Way', '8536', 'Pioneer Electricals', '105', 9, 27, 'EA'],
  ['BOM', 'D', 'Rubber & Plastic', 'Rubber Gasket 50mm', '4016', 'Southern Rubber Works', '106', 9, 7.5, 'EA'],
  ['BOM', 'D', 'Rubber & Plastic', 'Nylon Bush 20mm', '3926', 'Deccan Polymers', '104', 9, 5.2, 'EA'],
  ['BOM', 'D', 'Rubber & Plastic', 'ABS Granules', '3903', 'Deccan Polymers', '104', 9, 118, 'KG'],
  ['BOM', 'D', 'Rubber & Plastic', 'Silicone Sealant Cartridge', '3214', 'Apex Paints & Coatings', '108', 9, 145, 'EA'],
  ['BOM', 'D', 'Packing', 'Corrugated Box 400x300', '4819', 'Bharat Packaging', '103', 6, 38, 'EA'],
  ['BOM', 'D', 'Packing', 'Bubble Wrap Roll', '3920', 'Bharat Packaging', '103', 9, 420, 'EA'],
  ['BOM', 'D', 'Paint', 'Powder Coat Grey', '3208', 'Apex Paints & Coatings', '108', 9, 310, 'KG'],
  ['FIN', 'F', 'Switchgear', 'Distribution Box 8 Way', '8537', '', '', 9, 1450, 'EA'],
  ['FIN', 'F', 'Switchgear', 'Control Panel 3 Phase', '8537', '', '', 9, 9800, 'EA'],
  ['FIN', 'F', 'Switchgear', 'Motor Starter DOL', '8536', '', '', 9, 2350, 'EA'],
  ['FIN', 'F', 'Enclosures', 'Metal Enclosure 400x300', '7326', '', '', 9, 1850, 'EA'],
  ['FIN', 'F', 'Enclosures', 'Weatherproof Junction Box', '8538', '', '', 9, 640, 'EA'],
  ['FIN', 'F', 'Assemblies', 'Wiring Harness Set A', '8544', '', '', 9, 780, 'ST'],
  ['FIN', 'F', 'Assemblies', 'Pump Controller Unit', '9032', '', '', 9, 4200, 'EA'],
  ['FIN', 'F', 'Assemblies', 'Mounting Bracket Kit', '7326', '', '', 9, 320, 'ST']
];

const seedParties = async (service, rows, actor, { withAddresses = false } = {}) => {
  for (const [index, [name, contactPerson, phone, city, state, pincode, gstin]] of rows.entries()) {
    const party = { name, contactPerson, phone, email: '', gstin, address: '', city, state, pincode };

    if (withAddresses) {
      party.paymentTermsDays = index % 2 === 0 ? 45 : 30;
      party.addresses = [
        { id: `bill-${index}`, type: 'billing', label: 'Head office', line1: `${10 + index}, Main Road`, line2: '', city, state, pincode },
        { id: `ship-${index}-a`, type: 'shipping', label: 'Factory', line1: `Plot ${20 + index}, Industrial Estate`, line2: '', city, state, pincode },
        // A second delivery address in another state, to try IGST orders and multiple ship-to choices
        { id: `ship-${index}-b`, type: 'shipping', label: 'Warehouse', name: 'Venkateswara Suppliers Pvt. Ltd.', gstin: '33AAACV7795C1Z8', line1: `${5 + index}, Logistics Park`, line2: '', city: 'Bengaluru', state: 'Karnataka', pincode: '560100' }
      ];
    }
    await service.create(party, actor);
  }
};

// Every collection the app writes business data into, so the script always starts from a known state
const COLLECTIONS_TO_WIPE = [
  'Master_material', 'Material_Archive', 'customers', 'customers_archive', 'suppliers', 'suppliers_archive',
  'Stock_Entry', 'sales_orders', 'deliveries', 'invoices', 'counters', 'Request_tracking'
];

const wipe = async () => {
  for (const name of COLLECTIONS_TO_WIPE) {
    const snapshot = await db.collection(name).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
};

const seed = async () => {
  const actor = 'seed';
  await wipe();

  // Materials go through the real service so codes (1xxxx for class A ... 5xxxx for F) are generated normally.
  for (const [flow, cls, category, name, catNo, supplierName, supplierCode, gst, cost, unit] of MATERIALS) {
    const created = await masterService.create(
      {
        materialFlow: flow,
        class: cls,
        category,
        materialName: name,
        catNo,
        hsnCode: `${catNo}00`,
        supplierName,
        supplierCode,
        cgst: String(gst / 2),
        sgst: String(gst / 2),
        igst: '',
        costPerItem: String(cost),
        unit,
        createdBy: actor
      },
      `seed-${name}`
    );

    // Opening stock so orders can be tried straight away (finished goods get less, so shortages are easy to hit)
    await stockEntryService.create({
      materialCode: created.materialCode,
      materialName: name,
      supplierCode,
      materialFlow: flow,
      quantity: flow === 'FIN' ? 25 : 500,
      unit,
      entryType: 'Credit',
      createdBy: actor,
      userFirstName: 'Seed'
    });
  }

  await seedParties(
    new PartyService({ collectionName: 'suppliers', archiveCollectionName: 'suppliers_archive', counterName: 'supplier', firstNumber: 60001 }),
    SUPPLIERS,
    actor
  );
  await seedParties(
    new PartyService({ collectionName: 'customers', archiveCollectionName: 'customers_archive', counterName: 'customer', firstNumber: 50001 }),
    CUSTOMERS,
    actor,
    { withAddresses: true }
  );

  console.log(`Seeded ${MATERIALS.length} materials with stock, ${SUPPLIERS.length} suppliers, ${CUSTOMERS.length} customers.`);
};

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
