-- Extend work_orders.status CHECK constraint to include 'cancelled'.
-- cancelled is a terminal state set when a submitted/dispatched order is voided.
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check
  CHECK (status IN ('submitted', 'dispatched', 'in_progress', 'completed', 'closed', 'cancelled'));
