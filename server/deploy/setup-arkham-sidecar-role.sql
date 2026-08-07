\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS pending_registrations (
  email varchar PRIMARY KEY,
  username varchar NOT NULL UNIQUE,
  password_digest varchar NOT NULL,
  code_digest char(64) NOT NULL,
  expires_at timestamp without time zone NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_sent_at timestamp without time zone NOT NULL DEFAULT now()
);

SELECT 'CREATE ROLE arkham_sidecar LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arkham_sidecar')
\gexec

ALTER ROLE arkham_sidecar PASSWORD :'sidecar_password';
GRANT CONNECT ON DATABASE "arkham-horror-backend" TO arkham_sidecar;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO arkham_sidecar;

GRANT SELECT ON TABLE
  users,
  password_resets,
  arkham_games,
  arkham_players,
  arkham_steps,
  arkham_log_entries,
  arkham_game_undo_floors,
  arkham_ml_decisions
TO arkham_sidecar;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pending_registrations TO arkham_sidecar;
GRANT INSERT ON TABLE users, password_resets, arkham_decks TO arkham_sidecar;
GRANT DELETE ON TABLE
  arkham_steps,
  arkham_log_entries,
  arkham_game_undo_floors,
  arkham_ml_decisions
TO arkham_sidecar;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO arkham_sidecar;
