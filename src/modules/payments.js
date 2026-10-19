// بوابة الدفع: صفحة دفع مستضافة لدى المزود (مدى، فيزا، Apple Pay، STC Pay)، ونتحقق من الحالة من خادمه لا من رابط العودة
import { config } from '../config.js';
import { token } from '../lib/ids.js';

const P = config.payments;
const mockPaid = new Map(); // وضع التجربة فقط

export const paymentDriver = () => P.driver;

async function moyasar(method, path, body) {
  const res = await fetch(`https://api.moyasar.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${P.moyasarSecret}:`).toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Moyasar ${res.status}: ${data.message || 'خطأ'}`);
  return data;
}

// ينشئ فاتورة دفع ويعيد رابط صفحة الدفع
export async function createCheckout({ amount, description, returnUrl, callbackUrl, metadata }) {
  if (P.driver === 'moyasar') {
    const inv = await moyasar('POST', '/invoices', {
      amount: Math.round(amount * 100), currency: 'SAR', description,
      success_url: returnUrl, back_url: returnUrl, callback_url: callbackUrl, metadata,
    });
    return { id: inv.id, url: inv.url };
  }
  const id = `mock_${token(9)}`;
  return { id, url: `${config.publicUrl}/pay/mock/${id}?back=${encodeURIComponent(returnUrl)}&amount=${amount}` };
}

// الحالة الموثوقة: paid أو pending أو failed، مع المبلغ المدفوع بالريال
export async function checkoutStatus(id) {
  if (P.driver === 'moyasar') {
    const inv = await moyasar('GET', `/invoices/${encodeURIComponent(id)}`);
    const status = inv.status === 'paid' ? 'paid' : ['failed', 'canceled', 'expired', 'voided'].includes(inv.status) ? 'failed' : 'pending';
    return { status, amount: (inv.amount || 0) / 100, currency: inv.currency };
  }
  const m = mockPaid.get(id);
  return { status: m ? 'paid' : 'pending', amount: m?.amount || 0, currency: 'SAR' };
}

export function mockPay(id, amount) {
  if (P.driver !== 'mock' || config.production) return false;
  mockPaid.set(id, { amount: Number(amount) });
  return true;
}
