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
 */
export const createPaymentOrder = async (
  orderId: number
): Promise<ApiResponse<RazorpayOrderData>> => {
  const response = await api.post<ApiResponse<RazorpayOrderData>>(
    '/payments/create',
    { order_id: orderId }
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
 */
export const verifyPayment = async (
  data: VerifyPaymentData
): Promise<ApiResponse<VerifyPaymentResponse>> => {
  const response = await api.post<ApiResponse<VerifyPaymentResponse>>(
    '/payments/verify',
    data
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
  const sgst = bill.totalAmount * 0.025;
  const cgst = bill.totalAmount * 0.025;
  const baseAmount = bill.totalAmount - sgst - cgst;
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
        <td style="padding:2px 0;">${item.name}</td>
        <td style="text-align:center;">${item.qty}</td>
        <td style="text-align:right;">₹${unitPrice.toFixed(2)}</td>
        <td style="text-align:right;">-</td>
        <td style="text-align:right;">₹${amt.toFixed(2)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Bill ${invoiceNo}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #000;
    background: #fff;
    width: 72mm;
    padding: 4px;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: 14px; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .total-row td { font-weight: bold; border-top: 1px solid #000; padding-top: 3px; }
  .grand-total td { font-size: 13px; font-weight: bold; border-top: 2px solid #000; padding-top: 4px; }
  .footer { margin-top: 8px; text-align: center; font-size: 10px; }
</style>
</head>
<body>
<div class="center bold big">SMART CANTEEN</div>
<div class="center" style="font-size:10px;">NITTE University Campus, Mangalore</div>
<div class="center" style="font-size:10px;">GSTIN: 29AABCC1234D1Z5</div>
<div class="sep"></div>
<table>
  <tr><td class="bold">INVOICE #</td><td style="text-align:right;">${invoiceNo}</td></tr>
  <tr><td class="bold">DATE</td><td style="text-align:right;">${dateStr}</td></tr>
  <tr><td class="bold">STUDENT</td><td style="text-align:right;">${bill.studentName}</td></tr>
  <tr><td class="bold">ROLL NO</td><td style="text-align:right;">${bill.studentRoll}</td></tr>
</table>
<div class="sep"></div>
<table>
  <thead>
    <tr>
      <th style="text-align:left;">Desc</th>
      <th style="text-align:center;">Qty</th>
      <th style="text-align:right;">Price</th>
      <th style="text-align:right;">Disc</th>
      <th style="text-align:right;">Amt</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>
<div class="sep"></div>
<table>
  <tr><td>Base Amount</td><td style="text-align:right;">₹${baseAmount.toFixed(2)}</td></tr>
  <tr><td>SGST @2.5%</td><td style="text-align:right;">₹${sgst.toFixed(2)}</td></tr>
  <tr><td>CGST @2.5%</td><td style="text-align:right;">₹${cgst.toFixed(2)}</td></tr>
  ${bill.pointsUsed > 0 ? `<tr><td>Points Redeemed (${bill.pointsUsed} pts)</td><td style="text-align:right;">-₹${bill.pointsDiscount.toFixed(2)}</td></tr>` : ''}
  <tr class="grand-total"><td>TOTAL</td><td style="text-align:right;">₹${bill.totalAmount.toFixed(2)}</td></tr>
</table>
<div class="sep"></div>
<table>
  <tr><td>Payment Method</td><td style="text-align:right;">${bill.paymentMethod}</td></tr>
  <tr><td>Points Earned</td><td style="text-align:right;">+${bill.pointsEarned} pts 💎</td></tr>
</table>
<div class="sep"></div>
<div class="footer">
  <div class="bold">Thank you for dining with us!</div>
  <div>Please come again 😊</div>
  <div style="margin-top:4px;">Smart Canteen · Powered by OZone</div>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=320,height=600,scrollbars=yes');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    // Slight delay for rendering before print dialog
    setTimeout(() => {
      win.print();
    }, 400);
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
  const { orderId, amount, studentName, studentPhone, onSuccess, onFailure } = options;

  const scriptLoaded = await loadRazorpayScript();
  if (!scriptLoaded) {
    onFailure(new Error('Failed to load Razorpay checkout script.'));
    return;
  }

  let razorpayOrderData: RazorpayOrderData;
  try {
    const createResponse = await createPaymentOrder(orderId);
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
      color: '#00f5ff',
    },
    handler: async (response: any) => {
      try {
        const verifyResponse = await verifyPayment({
          razorpay_order_id:   response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature:  response.razorpay_signature,
          order_id:            orderId,
        });
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
