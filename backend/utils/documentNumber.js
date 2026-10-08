// Document numbers look like MI/SO-0001/26-27: fixed prefix, type, a sequence that restarts every financial year
// (April to March, India Standard Time), and the financial year.
const COMPANY_PREFIX = 'MI';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Sequence width per document type.
const DOCUMENT_TYPES = {
  SO: { width: 4 },
  DC: { width: 4 },
  INV: { width: 3 }
};

// Every financial year starts at 1, except where earlier documents were raised outside this system. Invoices for
// 26-27 continue from 039 because 38 invoices already exist; 27-28 starts again at 001.
const FIRST_NUMBER_OVERRIDES = { 'INV-26-27': 39 };
const firstNumberFor = (type, financialYear) => FIRST_NUMBER_OVERRIDES[`${type}-${financialYear}`] ?? 1;

// "26-27" for any date from 1 April 2026 to 31 March 2027 (in IST). Takes a Date or ISO string.
const financialYearOf = (input = new Date()) => {
  const ist = new Date(new Date(input).getTime() + IST_OFFSET_MS);
  const startYear = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  const two = (year) => String(year % 100).padStart(2, '0');
  return `${two(startYear)}-${two(startYear + 1)}`;
};

// Today's date in IST as YYYY-MM-DD.
const todayIst = (now = new Date()) => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const formatDocumentNumber = (type, sequence, financialYear) => {
  const config = DOCUMENT_TYPES[type];
  if (!config) throw new Error(`Unknown document type ${type}`);
  return `${COMPANY_PREFIX}/${type}-${String(sequence).padStart(config.width, '0')}/${financialYear}`;
};

// Allocates the next number inside the caller's Firestore transaction, so a failed save never burns a number.
// Firestore requires every read before any write, so call this before the transaction's first write.
const allocateDocumentNumber = async (db, transaction, type, financialYear) => {
  const config = DOCUMENT_TYPES[type];
  if (!config) throw new Error(`Unknown document type ${type}`);

  const counterRef = db.collection('counters').doc(`${type}-${financialYear}`);
  const snapshot = await transaction.get(counterRef);
  const sequence = Math.max(snapshot.exists ? snapshot.data().next : 0, firstNumberFor(type, financialYear));

  return {
    documentNumber: formatDocumentNumber(type, sequence, financialYear),
    // The caller writes this once its own reads are done
    commit: () => transaction.set(counterRef, { next: sequence + 1 })
  };
};

module.exports = { DOCUMENT_TYPES, firstNumberFor, financialYearOf, todayIst, formatDocumentNumber, allocateDocumentNumber };
