export type BudgetLine = {
  code: string; name: string; category: string; nature: string; unitLabel: string;
  unit: number | null; quantity: number | null; fees: number | null; taxMode: string;
  vatMethod?: string; vatRate?: number | null; vat?: number | null; quote: string;
  quoteDate?: string; payDate?: string; refundDue?: string; allocationMonths?: number | null;
  reviewUnit?: number | null; reviewDate?: string; reviewSource?: string; reviewBasis?: string;
  remainingEstimate?: number | null;
};
export type FinancePlan = {
  lines: BudgetLine[]; start: string; weeks: { in: number | null; out: number | null }[];
  opening: number | null; reserve: number | null; price: number | null; variable: number | null;
  fixed: number | null; days: number | null; guests: number | null;
};
export type FinanceTransaction = {
  code: string; category: string; amount: number; bucket: 'paid' | 'committed' | 'pending' | 'refund';
  refundKind?: string;
};
export const BUDGET_NATURES: readonly string[];
export const TAX_MODES: readonly string[];
export function parseVndInput(value: string): number | null;
export function formatVndInput(value: number | null): string;
export function lineTotal(line: BudgetLine): number | null;
export function budgetTotal(lines: BudgetLine[]): number | null;
export function newFinancePlan(start: string): FinancePlan;
export function validateFinance(plan: FinancePlan): void;
export function validateBudgetApproval(lines: BudgetLine[]): void;
export function sameBudgetLines(left: BudgetLine[], right: BudgetLine[]): boolean;
export function upsertBudgetLine(plan: FinancePlan, originalCode: string | null, line: BudgetLine): FinancePlan;
export function projectBudgetControl(lines: BudgetLine[], baseline: BudgetLine[] | undefined,
  transactions: FinanceTransaction[], cap: number, today: string): {
  rows: { code: string; name: string; nature: string; planned: number | null; budgetUnit: number | null;
    reviewUnit: number | null; netPaid: number; waiting: number; pending: number; returned: number;
    remaining: number | null; forecast: number | null; variance: number | null; deposit: number; flags: string[];
    allocation: { monthly: number | null } }[];
  alerts: { level: string; text: string }[];
  paid: number; returned: number; waiting: number; pending: number; used: number;
  draftTotal: number | null; knownDraftTotal: number; forecastTotal: number | null;
  depositOutstanding: number; unmatched: FinanceTransaction[];
};
export function breakEven(plan: FinancePlan): {
  margin: number | null; dailyGuests: number | null; monthlyGuests: number | null;
  revenue: number | bigint | null; result: number | bigint | null;
};
export function forecast(plan: FinancePlan): {
  start: string; opening: number | null; balance: number | null; belowReserve: boolean;
}[];
export function fnbBudgetTemplate(): BudgetLine[];
export function guidedRentLines(input: {
  monthly: number | null; months: number | null; payment: string; taxMode: string;
  rate: number | null; deposit: number | null;
}, sequence: number): BudgetLine[];
export function reconcileBudget(lines: BudgetLine[], cash: FinanceTransaction[]): {
  category: string; planned: number | null; paid: number; committed: number; pending: number; remaining: number | null;
}[];
