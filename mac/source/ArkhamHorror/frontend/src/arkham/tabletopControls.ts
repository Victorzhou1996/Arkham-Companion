import type { InjectionKey, Ref } from 'vue'
export const tabletopUndoKey: InjectionKey<{
  enabled: Readonly<Ref<boolean>>
  locked: Readonly<Ref<boolean>>
  run: () => Promise<void>
}> = Symbol('tabletop-undo')
