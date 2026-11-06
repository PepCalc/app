<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { ProtocolRow } from '@/db/database'
import type { NewProtocol } from '@/db/repository'
import { intervalText } from '@/domain/schedule'
import { unitLabel } from '@/domain/units'
import { useProtocolsStore, type ProtocolProduct } from '@/stores/protocols'
import ProjectionPanel from '@/components/charts/ProjectionPanel.vue'

/**
 * Add or edit a protocol: which peptide, and how often the user takes it. Nothing is pre-filled
 * from the catalog, so an interval is always the user's own and never reads as a suggestion.
 */
const props = defineProps<{
  /** The protocol being edited, or null to add one. */
  protocol: ProtocolRow | null
  /** Peptides on the shelf that can get a new protocol. */
  products: ProtocolProduct[]
  /** The edited protocol's peptide name. */
  name?: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ save: [input: NewProtocol]; delete: [protocol: ProtocolRow] }>()

const PRESETS = [
  { title: 'Twice daily', value: 12 },
  { title: 'Daily', value: 24 },
  { title: 'Every other day', value: 48 },
  { title: 'Weekly', value: 168 },
  { title: 'Other', value: 0 },
] as const

interface Form {
  key: string | null
  preset: number
  every: string
  unit: 'hours' | 'days'
  notes: string
}

const form = reactive<Form>({ key: null, preset: 24, every: '', unit: 'days', notes: '' })

// Reset from the protocol each time the dialog opens, discarding abandoned edits.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const p = props.protocol
    const hours = p?.intervalHours ?? 24
    const preset = PRESETS.some((x) => x.value === hours) ? hours : 0
    const inDays = hours % 24 === 0
    Object.assign(form, {
      key: p?.key ?? (props.products.length === 1 ? props.products[0]!.key : null),
      preset,
      every: preset ? '' : String(inDays ? hours / 24 : hours),
      unit: inDays ? 'days' : 'hours',
      notes: p?.notes ?? '',
    } satisfies Form)
  },
  { immediate: true },
)

const intervalHours = computed(() => {
  if (form.preset) return form.preset
  const n = Number.parseFloat(form.every)
  if (!Number.isFinite(n) || n <= 0) return null
  return form.unit === 'days' ? n * 24 : n
})

const everyError = computed(() =>
  !form.preset && form.every && intervalHours.value === null
    ? 'Enter a number greater than 0'
    : undefined,
)

const valid = computed(() => form.key !== null && intervalHours.value !== null)

const protocols = useProtocolsStore()
const levels = computed(() => (form.key ? protocols.levelsOf(form.key) : null))

function save() {
  if (!valid.value) return
  const key = form.key!
  emit('save', {
    key,
    name: props.products.find((p) => p.key === key)?.name ?? props.name ?? key,
    intervalHours: intervalHours.value!,
    notes: form.notes.trim(),
  })
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <v-card>
      <v-card-item>
        <v-card-title>{{ protocol ? `Protocol for ${name}` : 'Add a protocol' }}</v-card-title>
      </v-card-item>
      <v-card-text>
        <v-form class="pc-stack" @submit.prevent="save">
          <v-select
            v-if="!protocol"
            v-model="form.key"
            label="Peptide"
            :items="products"
            item-title="name"
            item-value="key"
          />
          <v-select v-model="form.preset" label="How often" :items="PRESETS" />
          <div v-if="!form.preset" class="d-flex ga-3 align-start">
            <v-text-field
              v-model="form.every"
              label="Every"
              type="number"
              inputmode="decimal"
              :error-messages="everyError"
            />
            <v-select
              v-model="form.unit"
              label="Unit"
              :items="['hours', 'days']"
              class="protocol-dialog__unit"
            />
          </div>
          <p class="text-body-small pc-muted">Used to show when your next dose is due.</p>
          <v-expand-transition>
            <ProjectionPanel
              v-if="levels && intervalHours !== null"
              :peptide="levels.peptide"
              :override="levels.pk?.userSupplied ? levels.pk.params : null"
              :interval-hours="intervalHours"
              :interval-label="intervalText(intervalHours)"
              :amount="levels.amount"
              :history="levels.history"
              :unit-label="unitLabel(levels.unit)"
            />
          </v-expand-transition>
          <v-text-field v-model="form.notes" label="Notes (optional)" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn v-if="protocol" color="error" variant="text" @click="emit('delete', protocol)">
          Delete
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!valid" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.protocol-dialog__unit {
  flex: 0 0 132px;
}
</style>
