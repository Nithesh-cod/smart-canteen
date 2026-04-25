// ============================================================================
// THERMAL PRINTER + PDF BILL SERVICE
// ============================================================================
//
// PRINTER_TYPE modes (set in .env):
//
//  windows   → generate PDF + send directly to Windows print queue via
//               pdf-to-printer (uses the installed "POS-58-Series" driver).
//               This is the recommended mode when the printer has a Windows
//               driver. No COM port or serialport needed.
//
//  bluetooth → raw ESC/POS bytes over a Windows Bluetooth COM port via
//               serialport. Only works when the Bluetooth device is actively
//               connected and the virtual COM port supports GetCommState.
//
//  usb       → raw ESC/POS through a USB receipt printer using node-thermal-printer.
//
//  network   → raw ESC/POS over TCP (e.g. network-connected printer).
//
//  none      → always return PDF as base64 for the browser to download.
//
// ============================================================================

const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const PDFDocument = require('pdfkit');
const fs          = require('fs');
const os          = require('os');
const path        = require('path');
require('dotenv').config();

let printer              = null;
let bluetoothSerial      = null;
let isPrinterInitialized = false;

// ─── Canteen identity (from .env with sensible defaults) ──────────────────────
const CANTEEN_NAME    = process.env.CANTEEN_NAME    || 'Smart Canteen';
const CANTEEN_COLLEGE = process.env.CANTEEN_COLLEGE || 'Your College';
const CANTEEN_ADDRESS = process.env.CANTEEN_ADDRESS || 'College Road, City';
const CANTEEN_GSTIN   = process.env.CANTEEN_GSTIN   || '29XXXXXXXXXXXXX';
const CANTEEN_PHONE   = process.env.CANTEEN_PHONE   || '+91 XXXXX XXXXX';

// ============================================================================
// WINDOWS GDI PRINT  (pdf-to-printer → POS-58-Series driver)
// ============================================================================
/**
 * Print a PDF buffer to the Windows printer queue.
 * Requires PRINTER_NAME env var to match the installed printer name exactly,
 * e.g.  PRINTER_NAME=POS-58-Series (1)
 */
const printToWindowsPrinter = async (pdfBuffer) => {
  const printerName = process.env.PRINTER_NAME || '';
  const tmpFile     = path.join(os.tmpdir(), `receipt-${Date.now()}.pdf`);

  try {
    fs.writeFileSync(tmpFile, pdfBuffer);

    const ptp     = require('pdf-to-printer');
    // silent:true  → suppress SumatraPDF window
    // scale:'noscale' → print 1:1, no centering — prevents white space at top
    const options = {
      ...(printerName ? { printer: printerName } : {}),
      scale:  'noscale',
      silent: true,
    };
    await ptp.print(tmpFile, options);

    console.log(`✅ Printed to Windows printer: "${printerName || 'default'}"`);
    return true;
  } catch (err) {
    console.warn('⚠️  Windows GDI print failed:', err.message);
    return false;
  } finally {
    // Remove temp file after 15 s (give spooler time to read it)
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 15000);
  }
};

// ============================================================================
// PRINTER INITIALIZATION  (ESC/POS modes only)
// ============================================================================
const initializePrinter = async () => {
  try {
    const printerType = (process.env.PRINTER_TYPE || 'none').toLowerCase();
    if (printerType === 'none' || printerType === 'windows') return false;
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

// ─── Bluetooth (raw ESC/POS via Windows Bluetooth COM port) ───────────────────
const initializeBluetoothPrinter = () => {
  return new Promise((resolve) => {
    try {
      const comPort = process.env.PRINTER_ADDRESS;
      if (!comPort) {
        console.warn('⚠️  PRINTER_ADDRESS not set — Bluetooth printer skipped');
        return resolve(false);
      }

      let SerialPort;
      try {
        ({ SerialPort } = require('serialport'));
      } catch {
        console.warn('⚠️  serialport not available — skipping BT printer');
        return resolve(false);
      }

      console.log(`🔍 Opening Bluetooth printer on ${comPort}...`);

      // Disable all hardware flow control — required for Bluetooth virtual COM
      // ports on Windows that fail GetCommState (ERROR_INVALID_FUNCTION).
      const baudRate = parseInt(process.env.PRINTER_BAUD || '9600', 10);
      bluetoothSerial = new SerialPort({
        path:     comPort,
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity:   'none',
        rtscts:   false,
        xon:      false,
        xoff:     false,
        xany:     false,
        hupcl:    false,
      });

      let settled = false;
      const settle = (val) => { if (!settled) { settled = true; resolve(val); } };

      const openTimer = setTimeout(() => {
        console.warn(`⚠️  Serial port ${comPort} open timeout`);
        settle(false);
      }, 6000);

      bluetoothSerial.on('open', () => {
        clearTimeout(openTimer);
        printer = new ThermalPrinter({
          type:                    PrinterTypes.EPSON,
          interface:               comPort,
          characterSet:            'PC437_USA',
          removeSpecialCharacters: false,
          options:                 { timeout: 5000 },
        });
        printer.printer.execute = async (buffer) => {
          await new Promise((res, rej) =>
            bluetoothSerial.write(buffer, (e) => (e ? rej(e) : res()))
          );
          await new Promise((res, rej) =>
            bluetoothSerial.drain((e) => (e ? rej(e) : res()))
          );
        };
        isPrinterInitialized = true;
        console.log(`✅ Bluetooth printer ready on ${comPort} @ ${baudRate} baud`);
        settle(true);
      });

      bluetoothSerial.on('error', (err) => {
        clearTimeout(openTimer);
        console.warn(`⚠️  SerialPort error on ${comPort}:`, err.message);
        isPrinterInitialized = false;
        settle(false);
      });

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
      type:         PrinterTypes.EPSON,
      interface:    'printer:auto',
      characterSet: 'PC437_USA',
      options:      { timeout: 5000 },
    });
    const connected = await printer.isPrinterConnected();
    if (connected) { isPrinterInitialized = true; console.log('✅ USB printer connected'); }
    else { console.warn('⚠️  USB printer not detected'); }
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
      type:      PrinterTypes.EPSON,
      interface: `tcp://${ip}:${port}`,
      options:   { timeout: 5000 },
    });
    const connected = await printer.isPrinterConnected();
    if (connected) { isPrinterInitialized = true; console.log(`✅ Network printer: ${ip}:${port}`); }
    else { console.warn(`⚠️  Network printer ${ip}:${port} not reachable`); }
    return connected;
  } catch (err) {
    console.warn('⚠️  Network printer init failed:', err.message);
    return false;
  }
};

// ============================================================================
// GENERATE PDF BILL
// ============================================================================
// Page: 48 mm × 210 mm  (136 × 595.3 pt)
//
// WHY 48 mm, not 58 mm?
//   The POS-58-Series Windows GDI driver exposes a printable area of 48 mm
//   (136 pt).  If the PDF is 58 mm wide, SumatraPDF noscale clips the right
//   10 mm → amounts and right-column text disappear.  Setting the PDF to
//   exactly 48 mm means a 1-to-1 pixel mapping with zero clipping.
//
// Cursor discipline:
//   PDFKit's doc.x shifts whenever lineBreak:false is used.  Every helper
//   resets doc.x = ML before returning so the next call always starts from
//   the left margin.
// ============================================================================
const generateBillPDF = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const items = order.items || [];

      // 48 mm printable width = 136.06 pt  (1 pt = 25.4/72 mm)
      // 210 mm page height    = 595.28 pt
      const PW = 136;
      const PH = 595.3;
      const ML = 5, MR = 5, MT = 4, MB = 4;
      const CW = PW - ML - MR;     // 126 pt ≈ 44.5 mm usable

      const doc = new PDFDocument({
        size:    [PW, PH],
        margins: { top: MT, bottom: MB, left: ML, right: MR },
        autoFirstPage: true,
        bufferPages:   false,
      });

      const chunks = [];
      doc.on('data',  (c) => chunks.push(c));
      doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Helpers ─────────────────────────────────────────────────────────────

      // Always pass explicit x / width so doc.x drift doesn't affect layout.
      const ctr = (text, size, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
        doc.text(text, ML, doc.y, { width: CW, align: 'center', lineBreak: true });
        doc.x = ML;
      };

      // Dashed separator — resets cursor before and after
      const sep = () => {
        doc.x = ML;
        doc.moveDown(0.2);
        const y = doc.y;
        doc.moveTo(ML, y).lineTo(PW - MR, y)
           .strokeColor('#888888').dash(2, { space: 2 }).stroke().undash();
        doc.x = ML;
        doc.moveDown(0.2);
      };

      // Two-column row: label (left), value (right-aligned)
      // lf = fraction of CW allocated to the label column (default 0.55)
      const kv = (label, value, size = 8, bold = false, lf = 0.55) => {
        const y  = doc.y;
        const lw = Math.floor(CW * lf);
        const rw = CW - lw;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
        doc.text(label, ML,        y, { width: lw, lineBreak: false });
        doc.text(value, ML + lw,   y, { width: rw, align: 'right', lineBreak: false });
        doc.x = ML;
        doc.y = y + size * 1.45;  // manual line advance
      };

      // Full-width inline: "Label: value" — value wraps if too long
      const kvWrap = (label, value, size = 7.5) => {
        doc.x = ML;
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(size);
        doc.text(label + ' ', ML, y, { lineBreak: false });
        const xAfterLabel = doc.x;
        doc.font('Helvetica').fontSize(size);
        doc.text(value, xAfterLabel, y, {
          width:     ML + CW - xAfterLabel,
          lineBreak: true,
        });
        doc.x = ML;
      };

      // ── Header ──────────────────────────────────────────────────────────────
      ctr(CANTEEN_NAME.toUpperCase(), 11, true);
      doc.moveDown(0.1);
      ctr(CANTEEN_COLLEGE, 6.5);
      ctr(CANTEEN_ADDRESS, 6.5);
      ctr(`GSTIN: ${CANTEEN_GSTIN}`, 6);
      ctr(`Tel: ${CANTEEN_PHONE}`, 6);
      doc.moveDown(0.2);
      ctr('PAYMENT RECEIPT', 9, true);
      sep();

      // ── Order info ──────────────────────────────────────────────────────────
      const d = new Date(order.created_at);
      const dateStr = `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit',
      })}`;

      kvWrap('Order #', order.order_number);
      kvWrap('Date   :', dateStr);
      kvWrap('Name   :', order.student_name || 'Guest');
      if (order.student_roll) kvWrap('Roll No:', order.student_roll);
      sep();

      // ── Items ───────────────────────────────────────────────────────────────
      kv('ITEM', 'AMOUNT', 7.5, true, 0.62);
      items.forEach((item) => {
        const amt  = `Rs.${(item.price * item.quantity).toFixed(2)}`;
        const name = `${item.item_name} x${item.quantity}`;
        kv(name, amt, 7.5, false, 0.62);
      });
      sep();

      // ── Totals ──────────────────────────────────────────────────────────────
      const orig  = parseFloat(order.original_amount || order.total_amount).toFixed(2);
      const total = parseFloat(order.total_amount).toFixed(2);
      kv('Subtotal', `Rs.${orig}`, 8);
      if (order.points_used > 0) {
        const disc = (order.points_used * 0.1).toFixed(2);
        kv(`Points (${order.points_used} pts)`, `-Rs.${disc}`, 7.5);
      }
      kv('TOTAL PAID', `Rs.${total}`, 10, true);
      sep();

      // ── Payment ─────────────────────────────────────────────────────────────
      kvWrap('Method :', order.payment_method || 'Razorpay');
      if (order.razorpay_payment_id) {
        kvWrap('Ref    :', order.razorpay_payment_id.substring(0, 20));
      }
      kvWrap('Status :', 'PAID');
      sep();

      // ── Loyalty ─────────────────────────────────────────────────────────────
      ctr(`+${order.points_earned || 0} loyalty points earned!`, 7.5, true);
      ctr('1 pt = Rs.0.10 off your next order', 6.5);
      doc.moveDown(0.3);
      sep();

      // ── Footer ──────────────────────────────────────────────────────────────
      ctr('Thank you for ordering!', 8, true);
      ctr('Please visit again :)', 7);

      doc.end();

    } catch (err) {
      reject(err);
    }
  });
};

// ============================================================================
// PRINT CUSTOMER BILL
// ============================================================================
/**
 * Route the print job based on PRINTER_TYPE:
 *   windows   → generate PDF → Windows print queue  (returns { printed: true })
 *   bluetooth/usb/network → raw ESC/POS            (returns { printed: true })
 *   none      → returns { printed: false }          (caller generates PDF)
 */
const printBill = async (order) => {
  const printerType = (process.env.PRINTER_TYPE || 'none').toLowerCase();

  // ── Windows GDI path ────────────────────────────────────────────────────────
  if (printerType === 'windows') {
    try {
      const pdfBuffer = await generateBillPDF(order);
      const ok        = await printToWindowsPrinter(pdfBuffer);
      if (ok) {
        console.log('✅ Bill sent to Windows printer for order', order.order_number);
      }
      return { printed: ok };
    } catch (err) {
      console.warn('⚠️  Windows bill print error:', err.message);
      return { printed: false };
    }
  }

  // ── ESC/POS path (bluetooth / usb / network) ─────────────────────────────
  if (printerType === 'none') return { printed: false };

  try {
    if (!isPrinterInitialized) {
      const ok = await initializePrinter();
      if (!ok) return { printed: false };
    }
    if (!printer) return { printed: false };

    printer.clear();

    // ── Header ────────────────────────────────────────────────────────────
    // 58 mm paper = 32 chars per line at normal font
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(CANTEEN_NAME.toUpperCase().substring(0, 32));
    printer.setTextNormal();
    printer.bold(false);
    // Word-wrap long college name at 32 chars
    const college = CANTEEN_COLLEGE;
    if (college.length <= 32) {
      printer.println(college);
    } else {
      const mid = college.lastIndexOf(' ', 32);
      printer.println(college.substring(0, mid > 0 ? mid : 32));
      if (mid > 0) printer.println(college.substring(mid + 1).substring(0, 32));
    }
    printer.println(CANTEEN_ADDRESS.substring(0, 32));
    printer.println(`GSTIN: ${CANTEEN_GSTIN}`.substring(0, 32));
    printer.println(`Tel: ${CANTEEN_PHONE}`.substring(0, 32));
    printer.newLine();
    printer.bold(true);
    printer.println('------ INVOICE ------');
    printer.bold(false);
    printer.drawLine();

    // ── Order details ──────────────────────────────────────────────────────
    printer.alignLeft();
    const d = new Date(order.created_at);
    printer.println(`Order: ${order.order_number}`.substring(0, 32));
    printer.println(`${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-US', { hour12: false })}`);
    printer.println(`Customer: ${(order.student_name || 'Guest').substring(0, 22)}`);
    if (order.student_roll) {
      printer.println(`Roll: ${order.student_roll}`.substring(0, 32));
    }
    printer.drawLine();

    // ── Items  (32 chars: name[16] qty[4] amt[12]) ─────────────────────────
    printer.bold(true);
    printer.println('Item             Qty        Amt');
    printer.bold(false);
    (order.items || []).forEach((item) => {
      const amt  = `Rs${(item.price * item.quantity).toFixed(2)}`;
      const qty  = `x${item.quantity}`.padStart(4);
      const name = item.item_name.substring(0, 16).padEnd(17);
      printer.println(`${name}${qty}${amt.padStart(11)}`);
    });
    printer.drawLine();

    // ── Totals  (label[20] amount[12]) ─────────────────────────────────────
    const orig  = `Rs${parseFloat(order.original_amount || order.total_amount).toFixed(2)}`;
    const total = `Rs${parseFloat(order.total_amount).toFixed(2)}`;
    printer.println(`${'Subtotal'.padEnd(20)}${orig.padStart(12)}`);
    if (order.points_used > 0) {
      const disc = `Rs${(order.points_used * 0.1).toFixed(2)}`;
      printer.println(`${'Pts discount'.padEnd(20)}-${disc.padStart(11)}`);
    }
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(`TOTAL: ${total}`);
    printer.setTextNormal();
    printer.bold(false);

    // ── Payment ───────────────────────────────────────────────────────────
    printer.drawLine();
    printer.println(`Method: ${order.payment_method || 'Razorpay'}`.substring(0, 32));
    if (order.razorpay_payment_id) {
      printer.println(`Ref: ${order.razorpay_payment_id.substring(0, 27)}`);
    }
    printer.println('Status: PAID');

    // ── Loyalty ───────────────────────────────────────────────────────────
    printer.drawLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println(`+${order.points_earned} points earned!`);
    printer.bold(false);
    printer.println('1 pt = Rs0.10 off next order');

    // ── Footer ────────────────────────────────────────────────────────────
    printer.newLine();
    printer.println('Thank you! Visit again :)');
    printer.newLine();
    printer.newLine();
    printer.cut();

    await printer.execute();
    console.log('✅ ESC/POS bill printed for order', order.order_number);
    return { printed: true };

  } catch (err) {
    console.warn('⚠️  ESC/POS print failed:', err.message);
    isPrinterInitialized = false;
    return { printed: false };
  }
};

// ============================================================================
// PRINT KITCHEN RECEIPT  (58 mm)
// ============================================================================
const printKitchenReceipt = async (order) => {
  const printerType = (process.env.PRINTER_TYPE || 'none').toLowerCase();

  // Windows GDI path — kitchen receipt is a simple text-only PDF
  if (printerType === 'windows') {
    try {
      const items      = order.items || [];
      const pageHeight = Math.max(200, 100 + items.length * 30);
      const PW = 136;   // 48 mm printable width — same as generateBillPDF

      const doc = new PDFDocument({
        size:    [PW, pageHeight],
        margins: { top: 6, bottom: 6, left: 6, right: 6 },
      });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      await new Promise((res, rej) => {
        doc.on('end', res);
        doc.on('error', rej);

        doc.font('Helvetica-Bold').fontSize(14);
        doc.text(`ORDER #${order.order_number.slice(-6)}`, { align: 'center' });
        doc.font('Helvetica').fontSize(9);
        doc.text(new Date().toLocaleTimeString(), { align: 'center' });
        doc.moveDown(0.4);
        doc.moveTo(6, doc.y).lineTo(PW - 6, doc.y).strokeColor('#000').stroke();
        doc.moveDown(0.4);

        items.forEach((item) => {
          doc.font('Helvetica-Bold').fontSize(13);
          doc.text(`${item.quantity}× ${item.item_name}`, { align: 'left' });
        });
        doc.end();
      });

      const pdfBuffer = Buffer.concat(chunks);
      const ok        = await printToWindowsPrinter(pdfBuffer);
      return { printed: ok };
    } catch (err) {
      console.warn('⚠️  Windows kitchen receipt failed:', err.message);
      return { printed: false };
    }
  }

  // ESC/POS path
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
    console.log('✅ Kitchen receipt printed for order', order.order_number);
    return { printed: true };
  } catch (err) {
    console.warn('⚠️  Kitchen print failed:', err.message);
    isPrinterInitialized = false;
    return { printed: false };
  }
};

// ============================================================================
// TEST PRINT
// ============================================================================
const testPrint = async () => {
  const printerType = (process.env.PRINTER_TYPE || 'none').toLowerCase();

  if (printerType === 'windows') {
    try {
      const testOrder = {
        order_number:   'TEST-PRINT',
        created_at:     new Date().toISOString(),
        student_name:   'Test User',
        student_roll:   null,
        items:          [{ item_name: 'Test Item', quantity: 1, price: 10 }],
        original_amount: 10, total_amount: 10,
        points_used:    0,   points_earned: 1,
        payment_method: 'Test',
        razorpay_payment_id: null,
      };
      const pdfBuffer = await generateBillPDF(testOrder);
      return await printToWindowsPrinter(pdfBuffer);
    } catch (err) {
      console.error('❌ Windows test print failed:', err.message);
      return false;
    }
  }

  try {
    const ok = await initializePrinter();
    if (!ok) { console.log('❌ ESC/POS printer not available for test'); return false; }

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
    printer.println(`Type   : ${process.env.PRINTER_TYPE || 'none'}`);
    printer.println(`Address: ${process.env.PRINTER_ADDRESS || '-'}`);
    printer.newLine();
    printer.newLine();
    printer.cut();
    await printer.execute();
    console.log('✅ ESC/POS test print successful');
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
  const printerType = (process.env.PRINTER_TYPE || 'none').toLowerCase();
  if (printerType === 'windows') {
    // Check if pdf-to-printer is available
    try { require('pdf-to-printer'); return true; } catch { return false; }
  }
  try {
    if (!printer) return false;
    if (bluetoothSerial) return bluetoothSerial.isOpen;
    return await printer.isPrinterConnected();
  } catch { return false; }
};

// ============================================================================
// DISCONNECT
// ============================================================================
const disconnectPrinter = () => {
  try {
    if (bluetoothSerial?.isOpen) {
      bluetoothSerial.close(() => console.log('✅ Serial port closed'));
    }
    printer              = null;
    bluetoothSerial      = null;
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
  printToWindowsPrinter,
  testPrint,
  checkPrinterStatus,
  disconnectPrinter,
};
