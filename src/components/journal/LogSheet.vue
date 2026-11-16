<script setup lang="ts">
import { ref, useId } from 'vue'
import { LOG_KINDS, type LogKind } from '@/logKinds'
import { PhotoReadError, preparePhoto } from '@/services/photos/preparePhoto'
import { nowIso, toIso } from '@/services/time'
import { useLogStore } from '@/stores/log'
import { useNotifyStore } from '@/stores/notify'

/** Bottom sheet listing every kind the user can log. */
const log = useLogStore()
const notify = useNotifyStore()
const titleId = useId()
const photoInput = ref<HTMLInputElement | null>(null)

function disabledFor(k: LogKind) {
  return k.disabled?.() ?? null
}

function choose(k: LogKind) {
  if (disabledFor(k)) return
  if (k.kind === 'photo') {
    log.sheetOpen = false
    photoInput.value?.click()
    return
  }
  log.start(k.kind, log.sheetContext)
}

async function onPhotoFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const prepared = await preparePhoto(file)
    const ctx = log.sheetContext
    const takenAt =
      ctx.at !== undefined ? toIso(ctx.at) : file.lastModified ? toIso(file.lastModified) : nowIso()
    log.start('photo', { ...ctx, prepared, takenAt })
  } catch (e) {
    notify.show(e instanceof PhotoReadError ? e.message : "Couldn't read that photo.", 'error')
  }
}
</script>

<template>
  <v-bottom-sheet v-model="log.sheetOpen" max-width="520" :aria-labelledby="titleId">
    <v-card>
      <v-card-item>
        <v-card-title :id="titleId">Log</v-card-title>
      </v-card-item>
      <v-list class="sheet-list bg-transparent" density="comfortable">
        <div v-for="k in LOG_KINDS" :key="k.kind" role="listitem" class="sheet-row">
          <v-list-item
            tag="button"
            type="button"
            role="button"
            class="sheet-item"
            :prepend-icon="k.icon"
            :title="k.title"
            :subtitle="disabledFor(k)?.hint"
            :disabled="Boolean(disabledFor(k))"
            :aria-disabled="Boolean(disabledFor(k)) || undefined"
            min-height="56"
            @click="choose(k)"
          />
          <v-btn
            v-if="disabledFor(k)?.to"
            :to="disabledFor(k)!.to"
            variant="text"
            class="sheet-action"
            @click="log.sheetOpen = false"
          >
            Calculator
          </v-btn>
        </div>
      </v-list>
    </v-card>
  </v-bottom-sheet>
  <input
    ref="photoInput"
    type="file"
    accept="image/*"
    class="d-none"
    aria-label="Add a photo"
    @change="onPhotoFile"
  />
</template>

<style scoped>
.sheet-list {
  padding-bottom: calc(8px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
}

.sheet-row {
  display: flex;
  align-items: center;
}

.sheet-item {
  flex: 1 1 auto;
  text-align: start;
}

.sheet-action {
  flex: 0 0 auto;
  margin-inline-end: 8px;
}
</style>
