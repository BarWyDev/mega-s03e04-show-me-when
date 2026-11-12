import { fetchIncidents, ack } from './api.js';
import { formatLocal } from './time.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const status = document.querySelector('.status');

/** Acked incidents by id: { ackedAt, receipt }. Rows are keyed, so a refresh never drops the mark. */
const acked = new Map();
/** Rows on screen by incident id. */
const rows = new Map();

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function markAcked(row, reply) {
  row.classList.add('is-acked');
  row.querySelector('[data-testid="ack"]')?.remove();
  if (row.querySelector('[data-testid="acked"]')) return;
  const mark = el('span', { 'data-testid': 'acked', class: 'acked', title: reply.ackedAt }, 'acked');
  row.querySelector('.act').append(mark);
}

/**
 * R2: Ack asks first, and the question names the incident. The list is live, so the row under the
 * pointer can change between aiming and clicking; the confirm says which incident the click picked.
 * It sits in a fixed place, so a new incident cannot move it. One confirm at a time.
 */
function askToConfirm(id, button) {
  document.querySelector('[data-testid="confirm"]')?.remove();
  const backdrop = el('div', { 'data-testid': 'confirm', class: 'confirm', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-title' });
  const box = el('div', { class: 'confirm-box' });
  const title = el('p', { id: 'confirm-title', class: 'confirm-title' });
  title.append('Ack ', el('strong', { class: 'confirm-id' }, id), '?');
  const what = el('p', { class: 'confirm-what' }, rows.get(id)?.querySelector('.what')?.textContent ?? '');
  const yes = el('button', { 'data-testid': 'confirm-ack', type: 'button', class: 'ack primary' }, `Ack ${id}`);
  const no = el('button', { 'data-testid': 'confirm-cancel', type: 'button', class: 'ack' }, 'Cancel');
  const actions = el('div', { class: 'confirm-actions' });
  actions.append(no, yes);
  box.append(title, what, actions);
  backdrop.append(box);
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  yes.addEventListener('click', () => {
    close();
    // the row may have been rebuilt or acked meanwhile; use the button that is in the row now
    const current = rows.get(id)?.querySelector('[data-testid="ack"]') ?? button;
    onAck(id, current);
  });
  no.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  no.focus(); // Enter must not ack by reflex
}

async function onAck(id, button) {
  button.disabled = true;
  button.textContent = 'Acking…';
  try {
    const reply = await ack(id); // R2
    acked.set(id, reply);
    const row = rows.get(id);
    if (row) markAcked(row, reply);
    setStatus('');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Ack';
    setStatus(`Ack of ${id} failed: ${error.message}`);
  }
}

function buildRow(i) {
  const row = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  row.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }),
    el('time'),
    el('span', { class: 'act' }),
  );
  const button = el('button', { 'data-testid': 'ack', type: 'button', class: 'ack' }, 'Ack');
  button.addEventListener('click', () => askToConfirm(i.id, button));
  row.querySelector('.act').append(button);
  return row;
}

function fillRow(row, i) {
  row.className = `row ${i.severity}${acked.has(i.id) ? ' is-acked' : ''}`;
  row.querySelector('.sev').textContent = i.severity;
  row.querySelector('.what').textContent = `${i.service} · ${i.region} · ${i.summary}`;
  const time = row.querySelector('time');
  if (time.getAttribute('datetime') !== i.openedAt) {
    time.setAttribute('datetime', i.openedAt); // full UTC value stays here (R5)
    time.textContent = formatLocal(i.openedAt);
    time.title = i.openedAt;
  }
}

/** Puts the list on screen, newest first (R1). Rows are reused by id: a refresh moves them, it does not rebuild them. */
function render(incidents) {
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const seen = new Set();
  sorted.forEach((i, index) => {
    seen.add(i.id);
    let row = rows.get(i.id);
    if (!row) {
      row = buildRow(i);
      rows.set(i.id, row);
    }
    fillRow(row, i);
    if (acked.has(i.id)) markAcked(row, acked.get(i.id));
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  });
  for (const [id, row] of rows) {
    if (!seen.has(id)) {
      row.remove();
      rows.delete(id);
    }
  }
  document.querySelector('[data-testid="loader"]')?.remove(); // R3: gone once incidents load
  let empty = document.querySelector('[data-testid="empty"]');
  if (sorted.length === 0 && !empty) {
    empty = el('p', { 'data-testid': 'empty', class: 'empty' }, 'No incidents tonight.');
    board.append(empty);
  } else if (sorted.length > 0 && empty) {
    empty.remove();
  }
}

function setStatus(text) {
  status.textContent = text;
  status.hidden = text === '';
}

let loading = false;
async function refresh() {
  if (loading) return; // a slow answer must not stack requests
  loading = true;
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    if (status.dataset.kind === 'load') setStatus('');
    status.dataset.kind = '';
  } catch (error) {
    status.dataset.kind = 'load';
    setStatus(`Could not load incidents (${error.message}). Retrying…`);
  } finally {
    loading = false;
  }
}

await refresh();
setInterval(refresh, REFRESH_MS);
