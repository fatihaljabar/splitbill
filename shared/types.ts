export type Lang = 'id' | 'en';
export type Theme = 'light' | 'dark';
export type SplitMethod = 'equal' | 'by_item' | 'custom' | 'percentage';
export type PrivacyMode = 'public' | 'private';
export type PaymentStatus = 'unpaid' | 'paid';

export interface Participant {
  id: string;
  name: string;
  isPayer: boolean;
  paymentStatus: PaymentStatus;
  customAmount?: number;
  percentage?: number;
}

export interface BillItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  participantIds: string[];
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface Bill {
  id: string;
  shortCode: string;
  eventName: string;
  storeName?: string;
  date?: string;
  participants: Participant[];
  items: BillItem[];
  tax: number;
  taxIsPercent: boolean;
  serviceCharge: number;
  serviceChargeIsPercent: boolean;
  discount: number;
  discountIsPercent: boolean;
  extraFees: number;
  notes: string;
  splitMethod: SplitMethod;
  privacyMode: PrivacyMode;
  hideParticipantNames: boolean;
  bankAccount: BankAccount;
  receiptImage?: string;
  createdAt: number;
  expiresAt: number;
  rounding: boolean;
  totalOverride?: number;
}

export interface OcrResult {
  storeName: string;
  date: string;
  items: Array<{ name: string; price: number; qty: number }>;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  /** Ongkir / admin / packing — mapped to bill.extraFees */
  extraFees: number;
  total: number;
  rawText: string;
}

export interface PersonBreakdown {
  participantId: string;
  name: string;
  items: Array<{ name: string; share: number; qty: number }>;
  itemsSubtotal: number;
  taxShare: number;
  serviceShare: number;
  discountShare: number;
  extraShare: number;
  total: number;
  paymentStatus: PaymentStatus;
  isPayer: boolean;
}

export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface CalculationResult {
  itemsSubtotal: number;
  taxAmount: number;
  serviceAmount: number;
  discountAmount: number;
  extraFees: number;
  grandTotal: number;
  perPerson: PersonBreakdown[];
  settlements: Settlement[];
  matchesReceipt: boolean | null;
  receiptTotal?: number;
  calculatedTotal: number;
}

export interface PublicBillResponse {
  mode: 'public';
  bill: Bill;
  calc: CalculationResult;
}

export interface PrivateBillResponse {
  mode: 'private';
  eventName: string;
  storeName?: string;
  date?: string;
  expiresAt: number;
  bankAccount: BankAccount;
  participants: Array<{ id: string; name: string }>;
  me?: PersonBreakdown;
}

export type BillResponse = PublicBillResponse | PrivateBillResponse;

export interface HistoryEntry {
  id: string;
  shortCode: string;
  eventName: string;
  createdAt: number;
  expiresAt: number;
  grandTotal: number;
  participantCount: number;
}
