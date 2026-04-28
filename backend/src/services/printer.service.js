// ============================================================================
// THERMAL PRINTER + PDF BILL SERVICE
// ============================================================================
// 1. If a Bluetooth/USB/Network printer is connected → print ESC/POS bill
// 2. If printer is not connected (or PRINTER_TYPE=none) → generate PDF bill
//    The PDF buffer is returned so the controller can send it to the browser
//    for automatic download.
// ============================================================================

const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const PDFDocument = require('pdfkit');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
require('dotenv').config();

const isWindows = process.platform === 'win32';

let printer            = null;
let bluetoothSerial    = null;
let isPrinterInitialized = false;

// ─── Canteen identity (from .env with sensible defaults) ──────────────────────
const CANTEEN_NAME    = process.env.CANTEEN_NAME    || 'Smart Canteen';
const CANTEEN_COLLEGE = process.env.CANTEEN_COLLEGE || 'Your College';
const CANTEEN_ADDRESS = process.env.CANTEEN_ADDRESS || 'College Road, City';
const CANTEEN_GSTIN   = process.env.CANTEEN_GSTIN   || '29XXXXXXXXXXXXX';
const CANTEEN_PHONE   = process.env.CANTEEN_PHONE   || '+91 XXXXX XXXXX';

// ============================================================================
// PRINTER INITIALIZATION
// ============================================================================

const initializePrinter = async () => {
  try {
    const printerType = (process.env.PRINTER_TYPE || 'bluetooth').toLowerCase();
    if (printerType === 'none')      return false;
    if (printerType === 'bluetooth') return await initializeBluetoothPrinter();
    if (printerType === 'usb')       return await initializeUSBPrinter();
    if (printerType === 'network')   return await initializeNetworkPrinter();
    console.warn('⚠️  Unknown PRINTER_TYPE:', printerType);
    return false;
  } catch (err) {
    console.error('❌ Printer initialization error:', err.message);
    return false;
  }
};

// ─── Bluetooth ────────────────────────────────────────────────────────────────
const initializeBluetoothPrinter = () => {
  return new Promise((resolve) => {
    try {
      const addr = process.env.PRINTER_ADDRESS;
      if (!addr) {
        console.warn('⚠️  PRINTER_ADDRESS not set — Bluetooth printer skipped');
        return resolve(false);
      }

      // Lazy-require so the server still starts even if the native module is absent
      let BluetoothSerialPort;
      try {
        BluetoothSerialPort = require('bluetooth-serial-port').BluetoothSerialPort;
      } catch {
        return resolve(false);
      }

      bluetoothSerial = new BluetoothSerialPort();
      console.log('🔍 Connecting to Bluetooth printer:', addr);

      bluetoothSerial.findSerialPortChannel(
        addr,
        (channel) => {
          bluetoothSerial.connect(addr, channel, () => {
            printer = new ThermalPrinter({
              type:                  PrinterTypes.EPSON,
              interface:             `bluetooth://${addr}`,
              characterSet:          'PC437_USA',
              removeSpecialCharacters: false,
              options:               { timeout: 5000 },
            });
            isPrinterInitialized = true;
            console.log('✅ Bluetooth printer connected');
            resolve(true);
          }, (err) => {
            console.warn('⚠️  BT connect failed:', err.message);
            resolve(false);
          });
        },
        (err) => {
          console.warn('⚠️  BT device not found:', err.message);
          resolve(false);
        }
      );
    } catch (err) {
      console.warn('⚠️  BT init error:', err.message);
      resolve(false);
    }
  });
};

// ─── USB ──────────────────────────────────────────────────────────────────────
const initializeUSBPrinter = async () => {
  try {
    printer = new ThermalPrinter({
      type:    PrinterTypes.EPSON,
      interface: 'printer:auto',
      characterSet: 'PC437_USA',
      options: { timeout: 5000 },
    });
    const connected = await printer.isPrinterConnected();
    if (connected) {
      isPrinterInitialized = true;
      console.log('✅ USB printer connected');
    } else {
      console.warn('⚠️  USB printer not detected');
    }
    return connected;
  } catch (err) {
    console.warn('⚠️  USB printer init failed:', err.message);
    return false;
  }
};

// ─── Network ──────────────────────────────────────────────────────────────────
const initializeNetworkPrinter = async () => {
  try {
    const ip   = process.env.PRINTER_ADDRESS;
    const port = process.env.PRINTER_PORT || 9100;
    if (!ip) { console.warn('⚠️  PRINTER_ADDRESS (IP) not set'); return false; }
    printer = new ThermalPrinter({
      type:    PrinterTypes.EPSON,
      interface: `tcp://${ip}:${port}`,
      options: { timeout: 5000 },
    });
    const connected = await printer.isPrinterConnected();
    if (connected) {
      isPrinterInitialized = true;
      console.log(`✅ Network printer connected: ${ip}:${port}`);
    } else {
      console.warn(`⚠️  Network printer ${ip}:${port} not reachable`);
    }
    return connected;
  } catch (err) {
    console.warn('⚠️  Network printer init failed:', err.message);
    return false;
  }
};

// ============================================================================
// WINDOWS GDI PRINT  (pdf-to-printer → Windows print queue)
// ============================================================================

/**
 * Write pdfBuffer to a temp file and send it to the Windows printer.
 * Returns true on success, false on failure.
 */
const printToWindowsPrinter = async (pdfBuffer) => {
  if (!isWindows) return false;

  const printerName = process.env.PRINTER_NAME;
  if (!printerName) {
    console.warn('⚠️  PRINTER_NAME not set in .env — cannot print');
    return false;
  }

  let pdfToPrinter;
  try {
    pdfToPrinter = require('pdf-to-printer');
  } catch {
    console.warn('⚠️  pdf-to-printer not installed — run: npm install pdf-to-printer');
    return false;
  }

  const tmpFile = path.join(os.tmpdir(), `receipt_${Date.now()}.pdf`);
  try {
    fs.writeFileSync(tmpFile, pdfBuffer);
    await pdfToPrinter.print(tmpFile, {
      printer: printerName,
      scale:   'noscale',
      silent:  true,
    });
    return true;
  } catch (err) {
    console.warn('⚠️  pdf-to-printer error:', err.message);
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
};

// ============================================================================
// THERMAL PDF  (48 mm = 136 pt printable width — matches POS-58-Series driver)
// ============================================================================

/**
 * Generates a receipt PDF sized exactly for the POS-58-Series thermal printer.
 * PW = 136 pt (48 mm) — the physical printable area of the GDI driver.
 * Uses 'Rs.' instead of '₹' because Helvetica has no rupee glyph.
 */
const generateThermalPDF = (order) => {
  return new Promise((resolve, reject) => {
    const PW = 136, PH = 595.3;
    const ML = 8,  MR = 8;
    const CW = PW - ML - MR; // 120 pt

    const doc = new PDFDocument({
      size:          [PW, PH],
      margins:       { top: 10, bottom: 10, left: ML, right: MR },
      autoFirstPage: true,
    });

    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const resetX = () => { doc.x = ML; };

    const ctr = (text, opts = {}) => {
      doc.text(text, ML, doc.y, { width: CW, align: 'center', ...opts });
      resetX();
    };

    const kv = (left, right) => {
      const y = doc.y;
      const lw = Math.floor(CW * 0.62);
      const rw = CW - lw;
      doc.text(left,  ML,      y, { width: lw, lineBreak: false });
      doc.text(right, ML + lw, y, { width: rw, align: 'right', lineBreak: false });
      doc.moveDown(0.45);
      resetX();
    };

    const sep = () => {
      resetX();
      doc.moveDown(0.15)
         .moveTo(ML, doc.y).lineTo(PW - MR, doc.y)
         .strokeColor('#888').lineWidth(0.5).stroke()
         .moveDown(0.15);
      resetX();
    };

    // ── Header ────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9);
    ctr(CANTEEN_NAME.toUpperCase());
    doc.font('Helvetica').fontSize(6.5);
    ctr(CANTEEN_COLLEGE);
    ctr(CANTEEN_ADDRESS);
    ctr(`GSTIN: ${CANTEEN_GSTIN}`);
    ctr(`Tel: ${CANTEEN_PHONE}`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(7.5);
    ctr('** RECEIPT **');
    sep();

    // ── Order info ────────────────────────────────────────────────────────────
    const d = new Date(order.created_at);
    doc.font('Helvetica').fontSize(7);
    kv('Order:',  order.order_number);
    kv('Date:',   d.toLocaleDateString('en-GB'));
    kv('Time:',   d.toLocaleTimeString('en-GB', { hour12: false }));
    kv('Name:',   order.student_name || 'Guest');
    if (order.student_roll) kv('Roll:', order.student_roll);
    sep();

    // ── Items ─────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(7);
    kv('Item', 'Amt');
    doc.font('Helvetica').fontSize(7);
    (order.items || []).forEach(item => {
      const amt  = `Rs.${(item.price * item.quantity).toFixed(2)}`;
      const name = item.item_name.length > 15
        ? item.item_name.substring(0, 13) + '..'
        : item.item_name;
      kv(`${name} x${item.quantity}`, amt);
    });
    sep();

    // ── Totals ────────────────────────────────────────────────────────────────
    const orig  = parseFloat(order.original_amount || order.total_amount).toFixed(2);
    const total = parseFloat(order.total_amount).toFixed(2);
    doc.font('Helvetica').fontSize(7);
    kv('Subtotal:', `Rs.${orig}`);
    if (order.points_used > 0) {
      const disc = (order.points_used * 0.1).toFixed(2);
      kv(`Points (${order.points_used} pts):`, `-Rs.${disc}`);
    }
    doc.font('Helvetica-Bold').fontSize(7.5);
    kv('TOTAL PAID:', `Rs.${total}`);
    sep();

    // ── Payment ───────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7);
    kv('Via:', order.payment_method || 'Razorpay');
    if (order.razorpay_payment_id) {
      const ref = order.razorpay_payment_id.substring(0, 20);
      kv('Ref:', ref);
    }
    sep();

    // ── Points ────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(7);
    ctr(`Points earned: +${order.points_earned}`);
    doc.font('Helvetica').fontSize(6.5);
    ctr('1 pt = Rs.0.10 off next order');
    doc.moveDown(0.3);
    sep();

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7);
    ctr('Thank you!  Visit again :)');
    doc.moveDown(0.5);

    doc.end();
  });
};

// ============================================================================
// PRINT ESC/POS CUSTOMER BILL
// ============================================================================
/**
 * Attempt to print the thermal bill.
 * @param  {Object} order  Complete order with items + student info
 * @returns {{ printed: boolean }}
 */
const printBill = async (order) => {
  try {
    const printerType = (process.env.PRINTER_TYPE || 'bluetooth').toLowerCase();

    // ── Windows GDI path ──────────────────────────────────────────────────────
    if (printerType === 'windows') {
      if (!isWindows) return { printed: false };
      const pdfBuffer = await generateThermalPDF(order);
      const ok        = await printToWindowsPrinter(pdfBuffer);
      return { printed: ok };
    }

    // ── ESC/POS path (bluetooth / USB / network) ──────────────────────────────
    if (!isPrinterInitialized) {
      const ok = await initializePrinter();
      if (!ok) return { printed: false };
    }
    if (!printer) return { printed: false };

    printer.clear();

    // ── Header ──────────────────────────────────────────────────────────────
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(CANTEEN_NAME.toUpperCase());
    printer.bold(false);
    printer.setTextNormal();
    printer.println(CANTEEN_COLLEGE);
    printer.println(CANTEEN_ADDRESS);
    printer.println(`GSTIN: ${CANTEEN_GSTIN}`);
    printer.println(`Tel: ${CANTEEN_PHONE}`);
    printer.newLine();
    printer.bold(true);
    printer.println('*** INVOICE ***');
    printer.bold(false);
    printer.drawLine();

    // ── Order details ────────────────────────────────────────────────────────
    printer.alignLeft();
    const d = new Date(order.created_at);
    printer.println(`Order : ${order.order_number}`);
    printer.println(`Date  : ${d.toLocaleDateString('en-GB')}  ${d.toLocaleTimeString('en-US', { hour12: false })}`);
    printer.println(`Name  : ${order.student_name || 'Guest'}`);
    printer.println(`Roll  : ${order.student_roll || '-'}`);
    printer.drawLine();

    // ── Items ────────────────────────────────────────────────────────────────
    printer.bold(true);
    printer.println('Item                 Qty    Amt');
    printer.bold(false);
    (order.items || []).forEach((item) => {
      const amt  = (item.price * item.quantity).toFixed(2);
      const name = item.item_name.substring(0, 20).padEnd(21);
      printer.println(`${name}${String(item.quantity).padStart(3)}  ${amt.padStart(6)}`);
    });
    printer.drawLine();

    // ── Totals ───────────────────────────────────────────────────────────────
    const orig = parseFloat(order.original_amount || order.total_amount).toFixed(2);
    const total = parseFloat(order.total_amount).toFixed(2);
    printer.println(`Subtotal               ${String(orig).padStart(8)}`);
    if (order.points_used > 0) {
      const disc = (order.points_used * 0.1).toFixed(2);
      printer.println(`Points discount       -${String(disc).padStart(8)}`);
    }
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(`TOTAL                  ${String(total).padStart(8)}`);
    printer.setTextNormal();
    printer.bold(false);

    // ── Payment ──────────────────────────────────────────────────────────────
    printer.drawLine();
    printer.println(`Paid via: ${order.payment_method || 'Razorpay'}`);
    if (order.razorpay_payment_id) {
      printer.println(`Ref: ${order.razorpay_payment_id.substring(0, 22)}`);
    }

    // ── Loyalty points ───────────────────────────────────────────────────────
    printer.drawLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println(`Points earned: +${order.points_earned}`);
    printer.bold(false);

    // ── Footer ───────────────────────────────────────────────────────────────
    printer.newLine();
    printer.println('Thank you for your order!');
    printer.println('Visit us again :)');
    printer.newLine();
    printer.newLine();
    printer.cut();

    await printer.execute();
    console.log('✅ Bill printed for order', order.order_number);
    return { printed: true };

  } catch (err) {
    console.warn('⚠️  Thermal print failed:', err.message);
    return { printed: false };
  }
};

// ============================================================================
// GENERATE PDF BILL (fallback when printer is offline)
// ============================================================================
/**
 * Build a receipt-style PDF using PDFKit.
 * @param  {Object} order  Complete order object
 * @returns {Promise<Buffer>}  PDF as a Buffer
 */
const generateBillPDF = (order) => {
  return new Promise((resolve, reject) => {
    try {
      // 80 mm ≈ 226 pt — use slightly wider (300pt) for readability on screen/print
      const doc = new PDFDocument({
        size:    [300, 700],   // width × initial height (auto-expands)
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
        autoFirstPage: true,
      });

      const chunks = [];
      doc.on('data',  (c) => chunks.push(c));
      doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 260; // usable width

      // ── Helper: centred text ─────────────────────────────────────────────
      const center = (text, opts = {}) => {
        doc.text(text, 20, doc.y, { width: W, align: 'center', ...opts });
      };
      const line = () => {
        doc.moveDown(0.3)
           .moveTo(20, doc.y).lineTo(280, doc.y).strokeColor('#cccccc').stroke()
           .moveDown(0.3);
      };
      const row = (left, right) => {
        const y = doc.y;
        doc.text(left,  20,  y, { width: 180 });
        doc.text(right, 200, y, { width: 80, align: 'right' });
        doc.moveDown(0.5);
      };

      // ── Header ────────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(14);
      center(CANTEEN_NAME.toUpperCase());
      doc.font('Helvetica').fontSize(8);
      center(CANTEEN_COLLEGE);
      center(CANTEEN_ADDRESS);
      center(`GSTIN: ${CANTEEN_GSTIN}  |  Tel: ${CANTEEN_PHONE}`);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10);
      center('PAYMENT RECEIPT');
      line();

      // ── Order info ────────────────────────────────────────────────────────
      const d = new Date(order.created_at);
      doc.font('Helvetica').fontSize(9);
      row('Order No:', order.order_number);
      row('Date:', `${d.toLocaleDateString('en-GB')}  ${d.toLocaleTimeString('en-GB')}`);
      row('Customer:', order.student_name || 'Guest');
      if (order.student_roll) row('Roll No:', order.student_roll);
      line();

      // ── Items ─────────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(9);
      row('Item', 'Amount');
      doc.font('Helvetica').fontSize(9);
      (order.items || []).forEach((item) => {
        const amt = (item.price * item.quantity).toFixed(2);
        row(`${item.item_name} × ${item.quantity}`, `₹${amt}`);
      });
      line();

      // ── Totals ────────────────────────────────────────────────────────────
      const orig  = parseFloat(order.original_amount || order.total_amount).toFixed(2);
      const total = parseFloat(order.total_amount).toFixed(2);
      doc.font('Helvetica').fontSize(9);
      row('Subtotal:', `₹${orig}`);
      if (order.points_used > 0) {
        const disc = (order.points_used * 0.1).toFixed(2);
        row(`Points redeemed (${order.points_used} pts):`, `-₹${disc}`);
      }
      doc.font('Helvetica-Bold').fontSize(11);
      row('TOTAL PAID:', `₹${total}`);
      line();

      // ── Payment ───────────────────────────────────────────────────────────
      doc.font('Helvetica').fontSize(8);
      row('Payment method:', order.payment_method || 'Razorpay');
      if (order.razorpay_payment_id) {
        row('Transaction ref:', order.razorpay_payment_id.substring(0, 26));
      }
      row('Payment status:', '✓ PAID');
      line();

      // ── Loyalty ───────────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(9);
      center(`🎉  You earned +${order.points_earned} loyalty points!`);
      doc.font('Helvetica').fontSize(8);
      center('1 point = ₹0.10 off your next order');
      doc.moveDown(0.5);
      line();

      // ── Footer ────────────────────────────────────────────────────────────
      doc.font('Helvetica').fontSize(8);
      center('Thank you for ordering!');
      center('Keep this receipt for your records.');
      center(CANTEEN_COLLEGE);

      doc.end();

    } catch (err) {
      reject(err);
    }
  });
};

// ============================================================================
// PRINT KITCHEN RECEIPT
// ============================================================================
const printKitchenReceipt = async (order) => {
  try {
    if (!isPrinterInitialized) {
      const ok = await initializePrinter();
      if (!ok) return { printed: false };
    }
    if (!printer) return { printed: false };

    printer.clear();
    printer.alignCenter();
    printer.setTextSize(2, 2);
    printer.bold(true);
    printer.println(`ORDER #${order.order_number.slice(-6)}`);
    printer.setTextNormal();
    printer.bold(false);
    printer.println(new Date().toLocaleTimeString());
    printer.drawLine();
    printer.alignLeft();
    printer.newLine();
    (order.items || []).forEach((item) => {
      printer.setTextSize(1, 2);
      printer.bold(true);
      printer.println(`${item.quantity}x ${item.item_name}`);
      printer.setTextNormal();
      printer.bold(false);
    });
    printer.newLine();
    printer.newLine();
    printer.cut();
    await printer.execute();
    return { printed: true };
  } catch (err) {
    console.warn('⚠️  Kitchen print failed:', err.message);
    return { printed: false };
  }
};

// ============================================================================
// TEST PRINT
// ============================================================================
const testPrint = async () => {
  try {
    const ok = await initializePrinter();
    if (!ok) { console.log('❌ Printer not available for test'); return false; }
    printer.clear();
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println('TEST PRINT');
    printer.setTextNormal();
    printer.bold(false);
    printer.println(CANTEEN_NAME);
    printer.println(new Date().toLocaleString());
    printer.newLine();
    printer.println('Printer is working!');
    printer.newLine();
    printer.drawLine();
    printer.println(`Type: ${process.env.PRINTER_TYPE || 'bluetooth'}`);
    printer.newLine();
    printer.newLine();
    printer.cut();
    await printer.execute();
    console.log('✅ Test print successful');
    return true;
  } catch (err) {
    console.error('❌ Test print failed:', err.message);
    return false;
  }
};

// ============================================================================
// STATUS CHECK
// ============================================================================
const checkPrinterStatus = async () => {
  try {
    if (!printer) return false;
    return await printer.isPrinterConnected();
  } catch { return false; }
};

const disconnectPrinter = () => {
  try {
    if (bluetoothSerial) { bluetoothSerial.close(); }
    printer             = null;
    isPrinterInitialized = false;
    console.log('✅ Printer disconnected');
  } catch (err) {
    console.error('❌ Printer disconnect error:', err.message);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  initializePrinter,
  printBill,
  printKitchenReceipt,
  generateBillPDF,
  generateThermalPDF,
  printToWindowsPrinter,
  testPrint,
  checkPrinterStatus,
  disconnectPrinter,
};
