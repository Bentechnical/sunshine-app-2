-- Async task queue for background processing (notifications, deadline enforcement, cleanup)

CREATE TABLE task_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type       TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority        INT NOT NULL DEFAULT 0,
    scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    attempts        INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 3,
    last_error      TEXT,
    locked_until    TIMESTAMPTZ   -- heartbeat lease for in-flight tasks
);

-- Index for the worker's claim query: find the next runnable task
CREATE INDEX idx_task_queue_runnable
    ON task_queue (scheduled_at, priority DESC)
    WHERE status = 'pending';

-- Admin alert type: unfilled slot with empty waitlist
ALTER TYPE admin_alert_type ADD VALUE IF NOT EXISTS 'shift_slot_unfilled';
