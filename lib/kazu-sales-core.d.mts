export type KazuRange = {
  ok: true;
  from: string;
  to: string;
  days: number;
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
};
export type KazuFail = { ok: false; status: number; error: string };

export function checkKey(configured: string | undefined, authorization: string | null | undefined): { ok: true } | KazuFail;
export function parseRange(from: string | null | undefined, to: string | null | undefined, now?: Date): KazuRange | KazuFail;
export function buildReport(input: {
  range: KazuRange;
  now: Date;
  orderRows: Record<string, unknown>[];
  products: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  priorUserIds: Set<string>;
}): Record<string, unknown>;
