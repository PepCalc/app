<script setup lang="ts">
import { watch } from 'vue'
import { LOG_KINDS, type LogKind } from '@/logKinds'
import { useLogStore } from '@/stores/log'
import { useNotifyStore } from '@/stores/notify'
import LogButton from './LogButton.vue'
import LogSheet from './LogSheet.vue'

/**
 * Single host for the Log button, sheet, and every log dialog. Keeping each dialog mounted and
 * toggling its model-value ensures its open-watcher resets the form.
 */
const log = useLogStore()
const notify = useNotifyStore()

watch(
  () => log.target,
  (t) => {
    if (!t) return
    const entry = LOG_KINDS.find((k) => k.kind === t.kind)
    if (!entry || entry.props(t) === null) {
      log.close()
      notify.show('That entry is gone.', 'info')
    }
  },
  { immediate: true, flush: 'sync' },
)

function propsFor(k: LogKind): Record<string, unknown> {
  const t = log.target
  if (t?.kind === k.kind) {
    const resolved = k.props(t)
    if (resolved) return resolved
  }
  return k.props(null) ?? {}
}

function onToggle(k: LogKind, open: boolean) {
  if (!open && log.target?.kind === k.kind) log.close()
}
</script>

<template>
  <LogButton />
  <LogSheet />
  <component
    :is="k.dialog"
    v-for="k in LOG_KINDS"
    :key="k.kind"
    :model-value="log.target?.kind === k.kind"
    v-bind="propsFor(k)"
    @update:model-value="onToggle(k, $event)"
  />
</template>
