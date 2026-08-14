import type { Bill, BillResponse, PaymentStatus } from '../../shared/types.ts';

async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (body && typeof body.error === 'string') return body.error;
  return res.status === 410 ? 'expired' : res.status === 404 ? 'not_found' : 'request_failed';
}

export async function createBill(bill: Bill): Promise<{ shortCode: string; expiresAt: number }> {
  const res = await fetch('/api/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bill),
  });
  if (!res.ok) throw new Error(await errorFrom(res));
  return res.json();
}

export async function fetchBill(code: string, participantId?: string): Promise<BillResponse> {
  const url = participantId
    ? `/api/bills/${code}?p=${encodeURIComponent(participantId)}`
    : `/api/bills/${code}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await errorFrom(res));
  return res.json();
}

export async function markPaid(
  code: string,
  participantId: string,
  status: PaymentStatus,
): Promise<void> {
  const res = await fetch(`/api/bills/${code}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId, status }),
  });
  if (!res.ok) throw new Error(await errorFrom(res));
}
