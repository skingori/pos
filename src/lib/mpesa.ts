import { prisma } from "./prisma";

function configured() {
  return Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_SHORTCODE &&
      process.env.MPESA_PASSKEY
  );
}

async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY!;
  const secret = process.env.MPESA_CONSUMER_SECRET!;
  const env = process.env.MPESA_ENV === "production" ? "api" : "sandbox";
  const url = `https://${env}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`;
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error("Failed to get M-Pesa token");
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function initiateStkPush(opts: {
  phone: string;
  amount: number;
  accountRef: string;
  paymentId: string;
}) {
  const phone = opts.phone.replace(/\D/g, "").replace(/^0/, "254");
  if (!configured()) {
    const mockId = `MOCK-${Date.now()}`;
    await prisma.payment.update({
      where: { id: opts.paymentId },
      data: {
        status: "PAID",
        mpesaCheckoutId: mockId,
        mpesaReceipt: `MOCK${Math.floor(Math.random() * 1e8)}`,
        mpesaPhone: phone,
      },
    });
    return { mock: true, checkoutRequestId: mockId };
  }

  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
  const env = process.env.MPESA_ENV === "production" ? "api" : "sandbox";
  const url = `https://${env}.safaricom.co.ke/mpesa/stkpush/v1/processrequest`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(opts.amount),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: opts.accountRef.slice(0, 12),
      TransactionDesc: "POS Sale",
    }),
  });

  const data = (await res.json()) as {
    CheckoutRequestID?: string;
    errorMessage?: string;
    ResponseDescription?: string;
  };

  if (!res.ok || !data.CheckoutRequestID) {
    await prisma.payment.update({
      where: { id: opts.paymentId },
      data: { status: "FAILED", mpesaPhone: phone },
    });
    throw new Error(data.errorMessage || data.ResponseDescription || "STK push failed");
  }

  await prisma.payment.update({
    where: { id: opts.paymentId },
    data: {
      status: "PENDING",
      mpesaCheckoutId: data.CheckoutRequestID,
      mpesaPhone: phone,
    },
  });

  return { mock: false, checkoutRequestId: data.CheckoutRequestID };
}

export function isMpesaConfigured() {
  return configured();
}
