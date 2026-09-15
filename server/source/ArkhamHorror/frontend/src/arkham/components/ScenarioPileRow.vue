<template>
  <div class="scenario-pile-row"><slot /></div>
</template>

<style scoped>
/* The legacy/mobile layout keeps the original children and ordering. */
.scenario-pile-row { display: contents; }
.scenario-pile-row :deep(.scenario-reference-slot:empty) { display: none; }
@media (min-width: 801px) {
  :global(#game.tabletop-game .scenario-pile-row) {
    display: flex;
    flex-flow: row wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    min-width: 0;
    /* Special deck, victory display and adventure reference share one row. */
    --card-width: clamp(18px, calc((100cqw - 62px) / 3), 96px);
    --card-height: calc(var(--card-width) * 1.4);
  }
  :global(#game.tabletop-game .scenario-pile-row:empty) { display: none; }
  .scenario-pile-row > :deep(*) { flex: 0 0 auto; min-width: 0; max-width: 100%; }
  .scenario-pile-row > :deep(.scenario-deck-area) { flex-wrap: wrap; justify-content: center; gap: 6px; }
  .scenario-pile-row > :deep(.victory-display) { margin: 0; }
  .scenario-pile-row > :deep(.scenario-reference-slot) { width: var(--card-width); }
  .scenario-pile-row :deep(.deck-label) { max-width: calc(100% - 4px); font-size: clamp(8px, calc(var(--card-width) * .14), 14px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
</style>
