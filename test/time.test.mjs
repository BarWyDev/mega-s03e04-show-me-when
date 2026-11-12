import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocal, dateOrder } from '../app/time.js';

const iso = '2026-11-12T03:03:00.000Z';

test('Berlin sees its own zone, day before month', () => {
  assert.equal(formatLocal(iso, 'de-DE', 'Europe/Berlin'), '12/11/2026, 04:03');
});
test('Auckland sees its own zone, day before month', () => {
  assert.match(formatLocal(iso, 'en-NZ', 'Pacific/Auckland'), /^12\/11\/2026, 04:03\s?pm$/i);
});
test('a US viewer keeps month before day', () => {
  assert.match(formatLocal(iso, 'en-US', 'America/Los_Angeles'), /^11\/11\/2026, 07:03\sPM$/);
});
test('the date rolls over with the zone', () => {
  assert.equal(formatLocal('2026-11-11T23:30:00.000Z', 'pl-PL', 'Europe/Warsaw'), '12/11/2026, 00:30');
});
test('order comes from the locale', () => {
  assert.equal(dateOrder('en-GB'), 'dmy');
  assert.equal(dateOrder('en-US'), 'mdy');
  assert.equal(dateOrder('ja-JP'), 'ymd');
});
test('a bad value is shown as it came', () => {
  assert.equal(formatLocal('not a date', 'en-GB'), 'not a date');
});
