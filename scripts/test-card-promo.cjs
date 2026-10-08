const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the pure predicate without importing the server database dependencies.
const source = fs.readFileSync(path.join(__dirname, '../lib/card-promo-state.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exportsObject = {};
new Function('exports', compiled)(exportsObject);
const { promoActive } = exportsObject;
const now = Date.parse('2026-10-08T00:00:00Z');
const campaign = {
  enabled: true, tier: 'max', note: 'Test campaign',
  start: '2026-10-01T00:00:00Z', end: '2026-12-31T00:00:00Z',
};
const cases = [
  ['active', campaign, now, true],
  ['disabled', { ...campaign, enabled: false }, now, false],
  ['scheduled', campaign, Date.parse('2026-09-30T00:00:00Z'), false],
  ['start boundary', campaign, Date.parse(campaign.start), true],
  ['end boundary', campaign, Date.parse(campaign.end), false],
  ['expired', campaign, Date.parse('2027-01-01T00:00:00Z'), false],
  ['no end', { ...campaign, end: '' }, now, false],
  ['no start', { ...campaign, start: '' }, now, true],
  ['invalid end', { ...campaign, end: 'invalid' }, now, false],
];
for (const [name, promo, time, expected] of cases) {
  assert.equal(promoActive(promo, time), expected, name);
}
console.log(`Passed ${cases.length} campaign timing checks.`);
