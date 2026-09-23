#!/usr/bin/env bash
# Emit the native schema plus guarded upstream upgrades for fresh and existing saves.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cat "$ROOT/setup.sql"
for name in arkham_game_undo_floors arkham_custom_cards arkham_deck_overlay \
  arkham_custom_card_sets arkham_published_card_sets \
  arkham_published_card_set_likes add_last_used_at_to_decks add_phase_transition_notifications_to_users; do
  printf "\nSELECT NOT EXISTS (SELECT 1 FROM public.arkham_schema_migrations WHERE name = '%s') AS apply_native_upgrade \\gset\n" "$name"
  printf '\\if :apply_native_upgrade\n'
  # Keep each migration and its receipt in one transaction. The official files
  # each have one BEGIN/COMMIT pair; the receipt precedes that COMMIT.
  awk -v name="$name" '
    /^COMMIT;/ {
      printf "INSERT INTO public.arkham_schema_migrations (name) VALUES (%c%s%c) ON CONFLICT DO NOTHING;\n", 39, name, 39
    }
    { print }
  ' "$ROOT/migrations/deploy/$name.sql"
  printf '\\endif\n'
done
