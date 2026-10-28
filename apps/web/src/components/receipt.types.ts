export interface ReceiptItem {
  description: string;
  sku?: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  taxAmount: string;
  total: string;
}
export interface ReceiptPayment {
  method: string;
  amount: string;
  tip?: string;
  received?: string | null;
  change?: string | null;
  reference?: string | null;
}
export interface ReceiptSnapshot {
  version: number;
  number: string;
  date: string;
  copy: boolean;
  currency: string;
  logoUrl?: string | null;
  store: {
    id: string;
    name: string;
    legalName?: string | null;
    taxId?: string | null;
    address: string;
    city: string;
    phone: string;
    email: string;
  };
  branch?: { name: string } | null;
  register?: { name: string } | null;
  cashier?: { name: string } | null;
  customer?: { name: string; taxId?: string | null } | null;
  items: ReceiptItem[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  tip: string;
  paid: string;
  balance: string;
  payments: ReceiptPayment[];
  notes?: string | null;
  fiscal: { electronic: boolean; legend: string };
  footer: string;
}
