import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Entry, EntryKind } from '@/domain/entries'
import type { PreparedPhoto } from '@/services/photos/preparePhoto'

/** Where a new entry starts from: the medicine or vial it is for, or a day to log against. */
export interface LogContext {
  medicationId?: string
  vialId?: string
  /** Epoch ms the dialog's time field starts at; now when absent. */
  at?: number
  /** Prepared photo bytes and capture timestamp when starting a new photo. */
  prepared?: PreparedPhoto
  takenAt?: string
}

export type LogTarget =
  | { kind: EntryKind; id: null; context: LogContext }
  | { kind: EntryKind; id: string; context: LogContext }

/** What is being logged or edited right now. One sheet and one dialog at a time. */
export const useLogStore = defineStore('log', () => {
  const sheetOpen = ref(false)
  const sheetContext = ref<LogContext>({})
  const target = ref<LogTarget | null>(null)

  function openSheet(context: LogContext = {}) {
    sheetContext.value = context
    sheetOpen.value = true
  }

  function start(kind: EntryKind, context: LogContext = {}) {
    sheetOpen.value = false
    target.value = { kind, id: null, context }
  }

  function edit(entry: Pick<Entry, 'kind' | 'id'>) {
    sheetOpen.value = false
    target.value = { kind: entry.kind, id: entry.id, context: {} }
  }

  function close() {
    target.value = null
  }

  return { sheetOpen, sheetContext, target, openSheet, start, edit, close }
})
