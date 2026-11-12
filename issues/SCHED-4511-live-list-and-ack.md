---
id: SCHED-4511
title: Live list with Ack per row
status: ready
plan: R1, R2
---

On-call needs to see new incidents the moment they come in and take one with a click.

- New incidents appear at the top of the list as they arrive, newest first (R1).
- Each row gets an **Ack** button (`data-testid="ack"`). Clicking it calls `api.ack(id)` and marks the row
  acked (`data-testid="acked"`) (R2).

Acceptance: a new incident shows at the top without a reload; Ack on a row acks that incident.

---

**Change after product's review (2026-11-12).** Shown in the step-one recording at 00:22: a new incident moved
the rows and a click meant for INC-7562 acked INC-5442. Product's decision: new incidents stay live at the top,
Ack stays on the row, but Ack asks to confirm and the confirm names the incident id.

- Ack opens a confirm (`data-testid="confirm"`) that names the incident id.
- `confirm-ack` sends the ack and marks the row acked; `confirm-cancel` (or Escape) closes it and sends nothing.

Acceptance: when the click lands on another row, the confirm names that other incident and on-call can cancel;
no ack goes out without a confirm that names its incident.
