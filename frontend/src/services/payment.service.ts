import api from './api';
import { ApiResponse } from '../types';
import { RAZORPAY_KEY_ID } from '../utils/constants';

export interface RazorpayOrderData {
  razorpay_order_id: string;
  amount: number;
  currency: string;
}

export interface VerifyPaymentData {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  order_id: number;
}

/**
 * Ask the backend to create a Razorpay order for the given canteen order.
 *
 * When `guestToken` is provided (returned by POST /orders for guest checkouts)
 * it is sent as a per-request Authorization header so the backend's
 * verifyTokenOrGuest middleware can prove ownership of this specific order.
 * It must NOT be written to localStorage — the kiosk's stored student token
 * would otherwise be overwritten by an order-scoped token.
 */
export const createPaymentOrder = async (
  orderId: number,
  guestToken?: string | null
): Promise<ApiResponse<RazorpayOrderData>> => {
  const config: any = {};
  if (guestToken) {
    config.skipAuth = true;
    config.headers  = { Authorization: `Bearer ${guestToken}` };
  }
  const response = await api.post<ApiResponse<RazorpayOrderData>>(
    '/payments/create',
    { order_id: orderId },
    config
  );
  return response.data;
};

export interface VerifyPaymentResponse {
  verified?: boolean;
  order?: any;
  points_earned?: number;
  points_used?: number;
  student_tier?: string;
  student_points?: number;
  /** true  → bill was sent to the thermal printer */
  bill_printed?: boolean;
  /** base64-encoded PDF — present only when printer is offline */
  bill_pdf?: string;
}

/**
 * Verify the Razorpay payment signature on the backend.
 * The response optionally includes a base64 PDF bill when no printer is connected.
 *
 * For guest checkouts, pass the per-order token returned by POST /orders so
 * the backend can authorise the verify call without a student login.
 */
export const verifyPayment = async (
  data: VerifyPaymentData,
  guestToken?: string | null
): Promise<ApiResponse<VerifyPaymentResponse>> => {
  const config: any = {};
  if (guestToken) {
    config.skipAuth = true;
    config.headers  = { Authorization: `Bearer ${guestToken}` };
  }
  const response = await api.post<ApiResponse<VerifyPaymentResponse>>(
    '/payments/verify',
    data,
    config
  );
  return response.data;
};

/**
 * Decode a base64 PDF string and trigger a browser download.
 * @param base64  base64 string from the verify-payment response
 * @param filename  e.g. "bill-OZ12345.pdf"
 */
export const downloadBillPDF = (base64: string, filename: string): void => {
  try {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Release the object URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error('PDF download failed:', err);
  }
};

// ─── Client-side Thermal Bill Generator ──────────────────────────────────────

export interface BillData {
  orderNumber: string;
  orderId: number;
  createdAt: string;
  studentName: string;
  studentRoll: string;
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  pointsUsed: number;
  pointsDiscount: number;
  totalAmount: number;
  paymentMethod: string;
  pointsEarned: number;
}

/**
 * Open a thermal-style 80mm bill in a new window and trigger browser print.
 * This generates a KFC-style receipt as HTML without any PDF library.
 */
export const printThermalBill = (bill: BillData): void => {
  const invoiceNo = `OZ${bill.orderId}`;
  const dateStr = new Date(bill.createdAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const itemRows = bill.items.map(item => {
    const unitPrice = parseFloat(item.price as unknown as string) || 0;
    const amt = item.qty * unitPrice;
    return `
      <tr>
        <td style="padding:2px 0;word-break:break-word;">${item.name} &times;${item.qty}</td>
        <td style="text-align:right;white-space:nowrap;">&#8377;${amt.toFixed(2)}</td>
      </tr>`;
  }).join('');

  // ── Receipt redesign (B/W only, same 58mm @page + 52mm body width) ──
  //
  // Constraints we deliberately did NOT touch:
  //   - @page size: 58mm auto, margins 2mm 3mm
  //   - Body width: 52mm
  //   - Pure black on pure white (thermal printer is monochrome)
  //   - Courier-family monospace (rasterises crisply on thermals)
  //
  // What changed:
  //   - Brand header set in a small caps display block with letter-spaced
  //     SMART CANTEEN wordmark plus three-dot dividers; the address lines
  //     drop to a lighter weight and tighter leading.
  //   - "RECEIPT" stamp under the address: bracketed banner so the
  //     document type reads in one glance instead of being implied.
  //   - Customer/Invoice block uses label : value rows with consistent
  //     8-char label column so colons line up perfectly down the receipt.
  //   - Items table gets a heading row in inverse (black on white text on
  //     a black band — common thermal idiom that prints fine because the
  //     printer just turns those pixels on).
  //   - Item rows pad qty as "×N" right after the name in a smaller font
  //     so the price column lines up cleanly even with mixed-length names.
  //   - Totals block: subtotal and discount in regular weight, TOTAL PAID
  //     in a single full-width bordered band so it reads as the final
  //     answer instead of yet another row.
  //   - Payment + reward block split into mini stats with bold value.
  //   - Footer gets the "thank you" message + a per-bill barcode-style
  //     line so the receipt actually looks like an invoice instead of a
  //     printer test page.
  const itemHeader = `
    <tr class="hdr"><td>Item</td><td style="text-align:right;">Amount</td></tr>
  `;
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt ${invoiceNo}</title>
<style>
  @page { size: 58mm auto; margin: 2mm 3mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9.5px;
    line-height: 1.32;
    color: #000;
    background: #fff;
    width: 52mm;
    -webkit-font-smoothing: antialiased;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .upper  { letter-spacing: 1.5px; text-transform: uppercase; }
  .mute   { color: #222; }
  .tiny   { font-size: 8.2px; }

  /* Brand block */
  .brand-mark {
    display: flex; align-items: center; justify-content: center;
    gap: 4px; margin-bottom: 1px;
  }
  .brand-mark .bar {
    flex: 1; height: 1px; background: #000;
    max-width: 6mm;
  }
  .brand-name {
    font-size: 13.5px; font-weight: 800;
    letter-spacing: 3.5px; padding: 0 2px;
  }
  .brand-addr { font-size: 8.5px; }

  /* Stamp banner */
  .stamp {
    display: inline-block;
    margin: 3px auto 1px;
    padding: 2px 8px;
    border: 1px solid #000;
    font-weight: 700;
    letter-spacing: 4px;
    font-size: 9px;
  }

  /* Dividers */
  .sep      { border-top: 1px dashed #000; margin: 3px 0; }
  .sep-solid{ border-top: 1px solid  #000; margin: 3px 0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  td    { padding: 1px 0; vertical-align: top; }

  /* Label : value rows */
  .kv td:first-child {
    width: 18mm; font-weight: 700; letter-spacing: 0.5px;
  }
  .kv td:last-child  { text-align: right; }

  /* Item table */
  .items .hdr td {
    background: #000; color: #fff;
    padding: 2px 4px; font-weight: 700;
    letter-spacing: 1px; text-transform: uppercase; font-size: 8.5px;
  }
  .items td { padding: 2px 0; }
  .items .qty {
    font-size: 8.5px; color: #000;
    margin-left: 2px; letter-spacing: 0.5px;
  }

  /* Totals — TOTAL PAID gets its own bordered band */
  .totals td { padding: 1px 0; }
  .total-row td {
    padding: 4px 4px; font-weight: 800; font-size: 12px;
    border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;
    letter-spacing: 1.5px;
  }

  /* Stats blocks (payment / reward) */
  .stat-row td { padding: 1px 0; font-size: 9px; }
  .stat-row td:last-child { font-weight: 700; }

  /* Reward — tiny boxed call-out */
  .reward {
    margin: 4px 0 2px;
    border: 1px dashed #000;
    padding: 3px 5px;
    text-align: center;
    font-size: 9px;
    letter-spacing: 1px;
    font-weight: 700;
  }

  /* Footer */
  .footer {
    margin-top: 6px; text-align: center;
    font-size: 9px; line-height: 1.4;
  }
  .footer .thanks {
    font-weight: 800; letter-spacing: 2px;
    text-transform: uppercase; font-size: 9.5px;
  }
  .barcode {
    margin-top: 4px;
    font-family: 'Libre Barcode 39', 'Courier New', monospace;
    font-size: 18px; letter-spacing: 1px;
  }
  /* Fallback "barcode" if the font isn't available — render alternating
     vertical strokes via Unicode "▌" so the receipt still ends in an
     unmistakable invoice-style band. */
  .barcode-fallback {
    font-family: 'Courier New', monospace;
    font-weight: 700; letter-spacing: 0;
    font-size: 14px; margin-top: 3px;
  }
  .invoice-no {
    font-size: 8.2px; letter-spacing: 1px; margin-top: 2px;
  }
</style>
</head>
<body>
  <!-- Brand block -->
  <div class="brand-mark">
    <span class="bar"></span>
    <span class="brand-name">SMART CANTEEN</span>
    <span class="bar"></span>
  </div>
  <div class="center brand-addr">Coimbatore Institute of Engineering &amp; Technology</div>
  <div class="center brand-addr mute">Thondamuthur Road · Coimbatore 641109</div>

  <div class="center"><span class="stamp">RECEIPT</span></div>

  <div class="sep"></div>

  <!-- Customer + invoice block -->
  <table class="kv">
    <tr><td>Invoice</td><td>${invoiceNo}</td></tr>
    <tr><td>Date</td><td>${dateStr}</td></tr>
    <tr><td>Customer</td><td>${bill.studentName || 'Guest'}</td></tr>
    ${bill.studentRoll ? `<tr><td>Roll No</td><td>${bill.studentRoll}</td></tr>` : ''}
  </table>

  <div class="sep"></div>

  <!-- Item lines with inverse-band header -->
  <table class="items">
    ${itemHeader}
    ${bill.items.map(item => {
      const unitPrice = parseFloat(item.price as unknown as string) || 0;
      const amt = item.qty * unitPrice;
      return `
        <tr>
          <td style="word-break:break-word;">${item.name} <span class="qty">×${item.qty}</span></td>
          <td style="text-align:right;white-space:nowrap;">&#8377;${amt.toFixed(2)}</td>
        </tr>`;
    }).join('')}
  </table>

  <div class="sep"></div>

  <!-- Totals -->
  <table class="totals">
    <tr><td>Subtotal</td><td class="right">&#8377;${bill.subtotal.toFixed(2)}</td></tr>
    ${bill.pointsUsed > 0
      ? `<tr><td>Points (${bill.pointsUsed} pts)</td><td class="right">- &#8377;${bill.pointsDiscount.toFixed(2)}</td></tr>`
      : ''}
  </table>
  <table class="totals">
    <tr class="total-row"><td>TOTAL PAID</td><td class="right">&#8377;${bill.totalAmount.toFixed(2)}</td></tr>
  </table>

  <!-- Payment + reward stats -->
  <table class="stat-row" style="margin-top:4px;">
    <tr><td>Paid via</td><td class="right">${bill.paymentMethod}</td></tr>
    <tr><td>Points earned</td><td class="right">+${bill.pointsEarned} pts</td></tr>
  </table>

  ${bill.pointsEarned > 0
    ? `<div class="reward">&#9733; +${bill.pointsEarned} POINTS BANKED &#9733;</div>`
    : ''}

  <div class="sep"></div>

  <!-- Footer -->
  <div class="footer">
    <div class="thanks">Thank you · Visit again</div>
    <div class="mute" style="font-size:8.2px;">Keep this receipt for your records</div>
    <div class="barcode-fallback">▌ ▌▌ ▌ ▌▌▌ ▌ ▌▌ ▌ ▌ ▌▌</div>
    <div class="invoice-no">#${invoiceNo}</div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=340,height=700,scrollbars=no');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    // Give the browser time to render before opening the print dialog
    setTimeout(() => {
      win.print();
      // Close the window after printing (or if user cancels)
      setTimeout(() => {
        try { win.close(); } catch { /* ignore */ }
      }, 1000);
    }, 500);
  }
};

/**
 * Ensure the Razorpay checkout script is available.
 * The script is already included in index.html, so this is just a safety fallback.
 */
export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export interface InitiatePaymentOptions {
  orderId: number;
  amount: number;
  studentName: string;
  studentPhone: string;
  /** Per-order token issued by POST /orders for guest checkouts. */
  guestToken?: string | null;
  onSuccess: (paymentData: any) => void;
  onFailure: (error: any) => void;
}

/**
 * Full Razorpay payment flow:
 * 1. Load script
 * 2. Create Razorpay order via backend
 * 3. Open Razorpay checkout modal
 * 4. On payment success, verify with backend, then call onSuccess/onFailure
 */
export const initiateRazorpayPayment = async (
  options: InitiatePaymentOptions
): Promise<void> => {
  const { orderId, amount, studentName, studentPhone, guestToken, onSuccess, onFailure } = options;

  const scriptLoaded = await loadRazorpayScript();
  if (!scriptLoaded) {
    onFailure(new Error('Failed to load Razorpay checkout script.'));
    return;
  }

  let razorpayOrderData: RazorpayOrderData;
  try {
    const createResponse = await createPaymentOrder(orderId, guestToken);
    if (!createResponse.success || !createResponse.data) {
      onFailure(new Error(createResponse.error ?? 'Failed to create payment order.'));
      return;
    }
    razorpayOrderData = createResponse.data;
  } catch (err) {
    onFailure(err);
    return;
  }

  const rzpOptions = {
    key: RAZORPAY_KEY_ID,
    amount: razorpayOrderData.amount,
    currency: razorpayOrderData.currency ?? 'INR',
    name: 'Smart Canteen',
    description: `Order #${orderId}`,
    order_id: razorpayOrderData.razorpay_order_id,
    prefill: {
      name: studentName,
      contact: studentPhone,
    },
    theme: {
      color: '#00ff88',
    },
    handler: async (response: any) => {
      try {
        const verifyResponse = await verifyPayment({
          razorpay_order_id:   response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature:  response.razorpay_signature,
          order_id:            orderId,
        }, guestToken);
        if (verifyResponse.success) {
          // Pass the full verify data (including bill_pdf if present)
          onSuccess({ ...response, ...verifyResponse.data });
        } else {
          onFailure(new Error(verifyResponse.error ?? 'Payment verification failed.'));
        }
      } catch (err) {
        onFailure(err);
      }
    },
    modal: {
      ondismiss: () => {
        onFailure(new Error('Payment cancelled by user.'));
      },
    },
  };

  const rzp = new (window as any).Razorpay(rzpOptions);
  rzp.open();
};
