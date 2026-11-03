import { defineStore } from 'pinia'
import { ref } from 'vue'
import { OVERLAY_MAX, assignSlots } from '@/domain/overlay'

/** Slot 0's colour is the body-measure line's, so a peptide gets it only when the rest are taken. */
const SLOT_ORDER = [1, 2, 3, 0]

/**
 * The peptides chosen for charts that show several at once (the Protocols overlay and the trend
 * card's dose rows and level strip), and the colour slot of each. One choice serves both, so a
 * peptide keeps its colour from screen to screen. It lasts while the app is open and is not
 * stored: it is a view choice, not data.
 */
export const useLevelPickStore = defineStore('levelPick', () => {
  /** Null until the user picks, so the default follows the newest doses. */
  const chosen = ref<string[] | null>(null)
  const slots = ref(new Map<string, number>())

  /**
   * The chosen peptides among `available` (newest first), at most OVERLAY_MAX. Before any pick,
   * or when none of the picked ones is available here, the newest ones are shown.
   */
  function picked(available: readonly string[]): string[] {
    const defaults = available.slice(0, OVERLAY_MAX)
    if (chosen.value === null) return defaults
    if (chosen.value.length === 0) return []
    const kept = chosen.value.filter((k) => available.includes(k)).slice(0, OVERLAY_MAX)
    return kept.length ? kept : defaults
  }

  function choose(keys: readonly string[]) {
    chosen.value = keys.slice(0, OVERLAY_MAX)
  }

  /** Gives each shown peptide a slot (see SLOT_ORDER); one that had a slot keeps it. */
  function assign(keys: readonly string[]) {
    slots.value = assignSlots(keys, slots.value, OVERLAY_MAX, SLOT_ORDER)
  }

  return { slots, picked, choose, assign }
})
