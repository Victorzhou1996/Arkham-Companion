--
-- PostgreSQL database dump
--

-- Dumped from database version 14.15 (Homebrew)
-- Dumped by pg_dump version 14.15 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: check_no_higher_step_exists(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_no_higher_step_exists() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if the game still exists
    IF EXISTS (
        SELECT 1
        FROM arkham_games
        WHERE id = OLD.arkham_game_id
    ) THEN
        -- If the game exists, check if there is any step with a higher step number for the same game
        IF EXISTS (
            SELECT 1
            FROM arkham_steps
            WHERE arkham_game_id = OLD.arkham_game_id
              AND step > OLD.step
        ) THEN
            RAISE EXCEPTION 'Cannot delete step % because a higher step exists for the same game.', OLD.step;
        END IF;
    END IF;
    
    RETURN OLD;
END;
$$;


--
-- Name: enforce_step_order_per_game(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_step_order_per_game() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Step 0 always starts a chain.
    IF NEW.step = 0 THEN
        RETURN NEW;
    END IF;

    -- Normal case: the immediately preceding step exists.
    IF EXISTS (
        SELECT 1 FROM arkham_steps
        WHERE arkham_game_id = NEW.arkham_game_id
          AND step = NEW.step - 1
    ) THEN
        RETURN NEW;
    END IF;

    -- Recovery case: the game has no recorded steps at all (its undo history
    -- was pruned or never persisted). Allow this insert to start a fresh
    -- contiguous chain from the game's current step instead of wedging the
    -- game so no action can ever be taken again.
    IF NOT EXISTS (
        SELECT 1 FROM arkham_steps
        WHERE arkham_game_id = NEW.arkham_game_id
    ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Cannot insert step % for game % without step %', NEW.step, NEW.arkham_game_id, NEW.step - 1;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: arkham_decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arkham_decks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id bigint NOT NULL,
    name text NOT NULL,
    investigator_name text NOT NULL,
    list jsonb NOT NULL,
    url text
);


--
-- Name: arkham_decks_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arkham_decks_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arkham_decks_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arkham_decks_user_id_seq OWNED BY public.arkham_decks.user_id;


--
-- Name: arkham_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arkham_games (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    current_data jsonb NOT NULL,
    multiplayer_variant text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    step integer
);


--
-- Name: arkham_log_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arkham_log_entries (
    id bigint NOT NULL,
    body text NOT NULL,
    arkham_game_id uuid NOT NULL,
    step integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: arkham_log_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arkham_log_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arkham_log_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arkham_log_entries_id_seq OWNED BY public.arkham_log_entries.id;


--
-- Name: arkham_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arkham_players (
    arkham_game_id uuid NOT NULL,
    user_id bigint NOT NULL,
    investigator_id text NOT NULL,
    id uuid DEFAULT public.uuid_generate_v4()
);


--
-- Name: arkham_players_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arkham_players_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arkham_players_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arkham_players_user_id_seq OWNED BY public.arkham_players.user_id;


--
-- Name: arkham_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arkham_steps (
    id uuid DEFAULT public.uuid_generate_v4(),
    arkham_game_id uuid NOT NULL,
    choice jsonb NOT NULL,
    step integer NOT NULL,
    action_diff jsonb NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    body text,
    created_at timestamp without time zone
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    id uuid DEFAULT public.uuid_generate_v1mc() NOT NULL,
    user_id bigint NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: password_resets_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_resets_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_resets_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_resets_user_id_seq OWNED BY public.password_resets.user_id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    username character varying NOT NULL,
    email character varying NOT NULL,
    password_digest character varying NOT NULL,
    beta boolean DEFAULT false NOT NULL,
    dev boolean DEFAULT false NOT NULL,
    admin boolean DEFAULT false
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: arkham_decks user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_decks ALTER COLUMN user_id SET DEFAULT nextval('public.arkham_decks_user_id_seq'::regclass);


--
-- Name: arkham_log_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_log_entries ALTER COLUMN id SET DEFAULT nextval('public.arkham_log_entries_id_seq'::regclass);


--
-- Name: arkham_players user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_players ALTER COLUMN user_id SET DEFAULT nextval('public.arkham_players_user_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: password_resets user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets ALTER COLUMN user_id SET DEFAULT nextval('public.password_resets_user_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

ALTER TABLE ONLY public.arkham_steps
    ADD CONSTRAINT arkham_steps_pkey PRIMARY KEY (id);

--
-- Name: arkham_decks arkham_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_decks
    ADD CONSTRAINT arkham_decks_pkey PRIMARY KEY (id);


--
-- Name: arkham_games arkham_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_games
    ADD CONSTRAINT arkham_games_pkey PRIMARY KEY (id);


--
-- Name: arkham_log_entries arkham_log_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_log_entries
    ADD CONSTRAINT arkham_log_entries_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: arkham_decks_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX arkham_decks_user_id_idx ON public.arkham_decks USING btree (user_id);


--
-- Name: log_entries_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX log_entries_game_id ON public.arkham_log_entries USING btree (arkham_game_id);


--
-- Name: steps_game_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX steps_game_step_idx ON public.arkham_steps USING btree (arkham_game_id, step);


--
-- Name: arkham_steps enforce_step_order_per_game; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_step_order_per_game BEFORE INSERT ON public.arkham_steps FOR EACH ROW EXECUTE FUNCTION public.enforce_step_order_per_game();


--
-- Name: arkham_decks arkham_decks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_decks
    ADD CONSTRAINT arkham_decks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: arkham_log_entries arkham_log_entries_arkham_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_log_entries
    ADD CONSTRAINT arkham_log_entries_arkham_game_id_fkey FOREIGN KEY (arkham_game_id) REFERENCES public.arkham_games(id) ON DELETE CASCADE;


--
-- Name: arkham_players arkham_players_arkham_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_players
    ADD CONSTRAINT arkham_players_arkham_game_id_fkey FOREIGN KEY (arkham_game_id) REFERENCES public.arkham_games(id) ON DELETE CASCADE;


--
-- Name: arkham_players arkham_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_players
    ADD CONSTRAINT arkham_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: arkham_steps arkham_steps_arkham_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arkham_steps
    ADD CONSTRAINT arkham_steps_arkham_game_id_fkey FOREIGN KEY (arkham_game_id) REFERENCES public.arkham_games(id) ON DELETE CASCADE;


--
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

-- Added locally: official arkham_epic migration for fresh offline installs.

SET search_path = public, pg_catalog;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dev boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phase_transition_notifications boolean NOT NULL DEFAULT false;

BEGIN;

CREATE TABLE IF NOT EXISTS arkham_epic_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  organizer_user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  scenario_id text,
  campaign_id text,
  difficulty text NOT NULL,
  shared_state jsonb NOT NULL,
  total_investigators integer NOT NULL,
  step integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS arkham_epic_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  arkham_epic_event_id uuid REFERENCES arkham_epic_events (id) ON DELETE CASCADE NOT NULL,
  ordinal integer NOT NULL,
  arkham_game_id uuid REFERENCES arkham_games (id) ON DELETE CASCADE,
  name text NOT NULL,
  seat_count integer NOT NULL,
  UNIQUE (arkham_epic_event_id, ordinal)
);

CREATE TABLE IF NOT EXISTS arkham_epic_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  arkham_epic_event_id uuid REFERENCES arkham_epic_events (id) ON DELETE CASCADE NOT NULL,
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  group_ordinal integer,
  UNIQUE (arkham_epic_event_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS arkham_epic_steps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  arkham_epic_event_id uuid REFERENCES arkham_epic_events (id) ON DELETE CASCADE NOT NULL,
  step integer NOT NULL,
  arkham_game_id uuid,
  game_step integer,
  delta jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS arkham_epic_groups_event_idx ON arkham_epic_groups (arkham_epic_event_id);
CREATE INDEX IF NOT EXISTS arkham_epic_groups_game_idx ON arkham_epic_groups (arkham_game_id);
CREATE INDEX IF NOT EXISTS arkham_epic_members_event_idx ON arkham_epic_members (arkham_epic_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS arkham_epic_steps_event_step_idx ON arkham_epic_steps (arkham_epic_event_id, step);

COMMIT;

-- Added locally: official arkham_achievements migration for fresh offline installs.

BEGIN;

CREATE TABLE IF NOT EXISTS arkham_achievements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  achievement varchar NOT NULL,
  earned_at timestamptz,
  arkham_game_id uuid REFERENCES arkham_games (id) ON DELETE SET NULL,
  progress jsonb NOT NULL,
  CONSTRAINT unique_user_achievement UNIQUE (user_id, achievement)
);

CREATE INDEX IF NOT EXISTS idx_arkham_achievements_game
  ON arkham_achievements (arkham_game_id);

COMMIT;

--
-- Schema baseline for upgrade.sh (generated by scripts/gen-schema-baseline.sh)
-- Records which migrations this dump already contains so upgrade.sh applies
-- only newer ones. Regenerate this block whenever setup.sql is regenerated.
--
CREATE TABLE IF NOT EXISTS public.arkham_schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.arkham_schema_migrations (name) VALUES ('users') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_games') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_players') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_decks') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_created_at_to_arkham_games') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_url_to_decks') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_beta_to_users') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_steps') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('create_log_entries') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('create_password_resets') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_action_diff_to_arkham_steps') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_cascades') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('change_player_id_to_uuid') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('change_deck_url_to_nullable') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_step_constraint') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_epic') ON CONFLICT DO NOTHING;
INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_achievements') ON CONFLICT DO NOTHING;

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'arkham_game_undo_floors') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:arkham_game_undo_floors to pg
-- requires: arkham_games

BEGIN;

-- Per-game undo floor: the lowest step a game may be undone back to. One row
-- per game (enforced by the unique constraint).
CREATE TABLE IF NOT EXISTS arkham_game_undo_floors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  arkham_game_id uuid REFERENCES arkham_games (id) ON DELETE CASCADE NOT NULL,
  floor_step integer NOT NULL,
  UNIQUE (arkham_game_id)
);

INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_game_undo_floors') ON CONFLICT DO NOTHING;
COMMIT;
\endif

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'arkham_custom_cards') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:arkham_custom_cards to pg
-- requires: users

BEGIN;

-- Cards built in the card builder, kept against their author's account so they
-- outlive any one game. card_code is the code minted when the card was first
-- created and is what games refer to it by, so saving an edit replaces the row
-- rather than adding one. art is a URL or an inlined data URI, kept apart from
-- def so listing a library does not have to carry it.

CREATE TABLE IF NOT EXISTS arkham_custom_cards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  card_code varchar NOT NULL,
  def jsonb NOT NULL,
  art text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT unique_user_custom_card UNIQUE (user_id, card_code)
);

INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_custom_cards') ON CONFLICT DO NOTHING;
COMMIT;
\endif

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'arkham_deck_overlay') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:arkham_deck_overlay to pg
-- requires: arkham_decks

BEGIN;

-- A deck's overlay: the custom investigator and card changes laid over the
-- decklist. Kept beside the list rather than folded into it, so the original
-- deck stays intact and the overlay can be lifted again.

ALTER TABLE arkham_decks ADD COLUMN IF NOT EXISTS overlay jsonb;

INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_deck_overlay') ON CONFLICT DO NOTHING;
COMMIT;
\endif

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'arkham_custom_card_sets') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:arkham_custom_card_sets to pg
-- requires: users
-- requires: arkham_custom_cards

BEGIN;

-- Named collections that own custom cards: the unit you build, export, and hand
-- to someone else. Grouping used to be a string each card carried in its own
-- def, which meant a set existed only as far as every one of its cards agreed
-- on the spelling, and throwing one away meant deleting its cards one at a
-- time.
--
-- source_code is the id of the pack an imported set came from (arkham.build
-- gives one), so importing that pack again replaces this set rather than making
-- a second copy of it. A set built here has none.

CREATE TABLE IF NOT EXISTS arkham_custom_card_sets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  name varchar NOT NULL,
  source_code varchar,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT unique_user_custom_card_set_name UNIQUE (user_id, name)
);

ALTER TABLE arkham_custom_cards
  ADD COLUMN IF NOT EXISTS custom_card_set_id uuid
  REFERENCES arkham_custom_card_sets (id) ON DELETE CASCADE;

-- Cards that predate sets are put into one named after whatever they were
-- claiming for themselves, so nobody's library arrives here ungrouped.
INSERT INTO arkham_custom_card_sets (user_id, name, created_at, updated_at)
SELECT DISTINCT
    c.user_id,
    COALESCE(NULLIF(TRIM(c.def -> 'meta' ->> 'set'), ''), 'Imported cards'),
    now(),
    now()
  FROM arkham_custom_cards c
ON CONFLICT ON CONSTRAINT unique_user_custom_card_set_name DO NOTHING;

UPDATE arkham_custom_cards c
   SET custom_card_set_id = s.id
  FROM arkham_custom_card_sets s
 WHERE s.user_id = c.user_id
   AND s.name = COALESCE(NULLIF(TRIM(c.def -> 'meta' ->> 'set'), ''), 'Imported cards')
   AND c.custom_card_set_id IS NULL;

-- The name a card carries is only a copy of the set's, but it is the one
-- anything looking at a def alone reads, so every card is given the name of the
-- set it was just filed under -- including the ones whose own spelling of it
-- (untrimmed, or absent entirely) is what put them there.
UPDATE arkham_custom_cards c
   SET def = jsonb_set(
         jsonb_set(c.def, '{meta}', COALESCE(c.def -> 'meta', '{}'::jsonb), true),
         '{meta,set}',
         to_jsonb(s.name),
         true
       )
  FROM arkham_custom_card_sets s
 WHERE s.id = c.custom_card_set_id;

-- Every card belongs to a set, now that every card has one.
ALTER TABLE arkham_custom_cards
  ALTER COLUMN custom_card_set_id SET NOT NULL;

-- Listing, counting and emptying a set all go by this.
CREATE INDEX IF NOT EXISTS idx_arkham_custom_cards_set
  ON arkham_custom_cards (custom_card_set_id);

INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_custom_card_sets') ON CONFLICT DO NOTHING;
COMMIT;
\endif

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'arkham_published_card_sets') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:arkham_published_card_sets to pg
-- requires: users
-- requires: arkham_custom_card_sets

BEGIN;

-- A set its author has put in the marketplace. One row per published set, not
-- per version: this is the listing, and the versions hang off it.
--
-- custom_card_set_id is the author's own working copy, kept so publishing again
-- knows which listing to add a version to. It goes null rather than taking the
-- listing with it if the author deletes their copy -- people who subscribed to
-- it still have something to read.
CREATE TABLE IF NOT EXISTS arkham_published_card_sets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  custom_card_set_id uuid REFERENCES arkham_custom_card_sets (id) ON DELETE SET NULL,
  name varchar NOT NULL,
  latest_version int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

-- One row per published version, holding that version's cards outright.
--
-- The cards are snapshotted rather than read back off the author's set, because
-- a version has to stay importable exactly as published: a subscriber who edits
-- their copy and wants the published one back has to be able to take it again,
-- and the author has meanwhile moved on.
CREATE TABLE IF NOT EXISTS arkham_published_card_set_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  published_card_set_id uuid REFERENCES arkham_published_card_sets (id) ON DELETE CASCADE NOT NULL,
  version int NOT NULL,
  note varchar,
  name varchar NOT NULL,
  cards jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT unique_published_card_set_version UNIQUE (published_card_set_id, version)
);

-- One of your sets following a published one, and which version it is on.
--
-- Its own table rather than two columns on arkham_custom_card_sets, because that
-- table is referenced by arkham_published_card_sets: pointing back the other way
-- would make the two entity modules import each other.
--
-- A row here is deleted, not updated, when the set is edited: what is in the set
-- is then no longer what was published, so it is no longer subscribed.
CREATE TABLE IF NOT EXISTS arkham_card_set_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  custom_card_set_id uuid REFERENCES arkham_custom_card_sets (id) ON DELETE CASCADE NOT NULL,
  published_card_set_id uuid REFERENCES arkham_published_card_sets (id) ON DELETE CASCADE NOT NULL,
  version int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT unique_card_set_subscription UNIQUE (custom_card_set_id)
);

-- The listing is read newest-first, and a subscriber's set looks up its source.
CREATE INDEX IF NOT EXISTS idx_arkham_published_card_sets_updated
  ON arkham_published_card_sets (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_arkham_card_set_subscriptions_published
  ON arkham_card_set_subscriptions (published_card_set_id);

INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_published_card_sets') ON CONFLICT DO NOTHING;
COMMIT;
\endif

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'arkham_published_card_set_likes') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:arkham_published_card_set_likes to pg
-- requires: users
-- requires: arkham_published_card_sets

BEGIN;

-- One person saying they liked a published set. A row is the like; deleting it is
-- taking it back, so there is no state to keep in step and no way to like twice.
CREATE TABLE IF NOT EXISTS arkham_published_card_set_likes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  published_card_set_id uuid REFERENCES arkham_published_card_sets (id) ON DELETE CASCADE NOT NULL,
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT unique_published_card_set_like UNIQUE (published_card_set_id, user_id)
);

-- Counting a set's likes, and ordering the marketplace by them.
CREATE INDEX IF NOT EXISTS idx_arkham_published_card_set_likes_set
  ON arkham_published_card_set_likes (published_card_set_id);

INSERT INTO public.arkham_schema_migrations (name) VALUES ('arkham_published_card_set_likes') ON CONFLICT DO NOTHING;
COMMIT;
\endif

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'add_last_used_at_to_decks') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:add_last_used_at_to_decks to pg
-- requires: arkham_decks
-- requires: arkham_players

BEGIN;

-- When the deck was last taken into a game. Stamped where a deck is chosen for
-- a seat (and where a campaign upgrade rewrites it), so the decks page can put
-- what you are actually playing at the top. Null means never used.

ALTER TABLE arkham_decks ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- Backfill an approximation for decks that predate the column: the newest game
-- in which this deck's owner sat as this deck's investigator. Deck choices were
-- never recorded, so a game's updated_at (last played) stands in for the moment
-- the deck was picked, and an owner with two decks for the same investigator
-- gets the same time on both. Only ever a starting order -- every use from here
-- writes the real timestamp over it.
UPDATE arkham_decks d
SET last_used_at = sub.used_at
FROM (
  -- arkham_games.updated_at predates the timestamptz convention and holds UTC
  -- wall-clock in a bare timestamp, so say so rather than leaning on the
  -- server's timezone to read it.
  SELECT p.user_id, p.investigator_id, MAX(g.updated_at) AT TIME ZONE 'UTC' AS used_at
  FROM arkham_players p
  JOIN arkham_games g ON g.id = p.arkham_game_id
  WHERE p.investigator_id <> '00000'
  GROUP BY p.user_id, p.investigator_id
) sub
WHERE d.user_id = sub.user_id
  AND d.list->>'investigator_code' = sub.investigator_id;

-- The decks page orders a single owner's decks by this.
CREATE INDEX IF NOT EXISTS idx_arkham_decks_user_last_used
  ON arkham_decks (user_id, last_used_at DESC);

INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_last_used_at_to_decks') ON CONFLICT DO NOTHING;
COMMIT;
\endif

SELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = 'add_phase_transition_notifications_to_users') AS apply_native_upgrade \gset
\if :apply_native_upgrade
-- Deploy arkham-horror-backend:add_phase_transition_notifications_to_users to pg
-- requires: users

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS phase_transition_notifications BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO public.arkham_schema_migrations (name) VALUES ('add_phase_transition_notifications_to_users') ON CONFLICT DO NOTHING;
COMMIT;
\endif
