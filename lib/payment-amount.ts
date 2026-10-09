export function matchesPaymentAmount(received: unknown, expected: unknown): boolean {
  const parse = (value: unknown) => {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    if (typeof value === 'string' && !/^\d+$/.test(value)) return NaN;
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : NaN;
  };
  return parse(received) === parse(expected);
}
