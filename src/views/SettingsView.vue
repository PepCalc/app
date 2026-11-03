<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { db } from '@/db'
import {
  backupFileName,
  BackupFormatError,
  exportBackup,
  exportBackupArchive,
  readBackupFile,
  restoreBackup,
} from '@/db/backup'
import { catalog, syringeCatalog } from '@/data'
import { ADULT_AGE } from '@/domain/body'
import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  type HeightUnit,
  type WeightUnit,
} from '@/domain/bodyUnits'
import type { A1cUnit, GlucoseUnit } from '@/domain/glucose'
import { roundTo } from '@/domain/units'
import { areValidLimits } from '@/domain/vialAge'
import {
  DEFAULT_CUSTOM_AGE_LIMITS,
  useSettingsStore,
  type ThemePreference,
  type VialAgeMode,
} from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import { useProtocolsStore } from '@/stores/protocols'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useNotifyStore } from '@/stores/notify'
import { useConfirmStore } from '@/stores/confirm'
import { useStoragePersistence } from '@/composables/useStoragePersistence'
import { useInstallPrompt, type InstallPlatform } from '@/composables/useInstallPrompt'
import androidChromeShot from '@/assets/install/android-chrome.webp'
import androidFirefoxShot from '@/assets/install/android-firefox.webp'
import iosChromeShot from '@/assets/install/ios-chrome.webp'
import iosSafariShot from '@/assets/install/ios-safari.webp'
import { saveFile } from '@/services/fileTransfer'
import { daysBetween, formatDateTime, systemClock } from '@/services/time'
import {
  mdiCellphoneArrowDown,
  mdiCheckCircleOutline,
  mdiCloudOffOutline,
  mdiDownload,
  mdiShieldLockOutline,
  mdiTrayArrowUp,
} from '@/plugins/icons'

const settings = useSettingsStore()
const shelf = useShelfStore()
const protocols = useProtocolsStore()
const journal = useJournalStore()
const photos = usePhotosStore()
const notify = useNotifyStore()
const confirm = useConfirmStore()
const theme = useTheme()
const storage = useStoragePersistence()
const install = useInstallPrompt()
// Android file providers often label a .json backup as a generic type, which would grey it out
// in the native picker; readBackupFile rejects anything that is not a backup.
const backupAccept = __NATIVE__ ? undefined : 'application/json,.json,application/zip,.zip'
const includePhotos = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

const version = __APP_VERSION__

const themeModel = computed({
  get: () => settings.theme,
  set: (value: ThemePreference) => {
    void settings.setTheme(value)
    theme.change(value)
  },
})

const syringeModel = computed({
  get: () => settings.defaultSyringeId,
  set: (id: string) => void settings.setDefaultSyringe(id),
})

const ageModeModel = computed({
  get: () => settings.vialAgeMode,
  set: (mode: VialAgeMode) => void settings.setVialAgeMode(mode),
})

// Text fields hold what the user is typing; only a valid pair reaches the store.
const ageForm = reactive({ nearing: '', past: '' })
watch(
  () => settings.customAgeLimits,
  (limits) => {
    ageForm.nearing = String(limits.nearingDays)
    ageForm.past = String(limits.pastDays)
  },
  { immediate: true },
)
const typedLimits = computed(() => ({
  nearingDays: Number(ageForm.nearing),
  pastDays: Number(ageForm.past),
}))
const ageFormError = computed(() =>
  areValidLimits(typedLimits.value) ? undefined : 'Use whole days, with "use soon" before "past".',
)
watch(typedLimits, (typed) => {
  const saved = settings.customAgeLimits
  if (typed.nearingDays === saved.nearingDays && typed.pastDays === saved.pastDays) return
  void settings.setCustomAgeLimits(typed)
})
function resetAgeLimits() {
  void settings.setCustomAgeLimits(DEFAULT_CUSTOM_AGE_LIMITS)
}

const weightUnitModel = computed({
  get: () => settings.weightUnit,
  set: (value: WeightUnit) => void settings.setWeightUnit(value),
})

const heightUnitModel = computed({
  get: () => settings.heightUnit,
  set: (value: HeightUnit) => void settings.setHeightUnit(value),
})

const glucoseUnitModel = computed({
  get: () => settings.glucoseUnit,
  set: (value: GlucoseUnit) => void settings.setGlucoseUnit(value),
})

const a1cUnitModel = computed({
  get: () => settings.a1cUnit,
  set: (value: A1cUnit) => void settings.setA1cUnit(value),
})

/*
 * The profile form holds what the user is typing; Save writes only valid values. It is filled
 * from the store whenever the store or the height unit changes.
 */
const profileForm = reactive({
  cm: '',
  feet: '',
  inches: '',
})

function fillProfileForm() {
  const p = settings.profile
  profileForm.cm = p.heightCm ? String(roundTo(p.heightCm, 1)) : ''
  const fi = p.heightCm ? cmToFeetInches(p.heightCm) : null
  profileForm.feet = fi ? String(fi.feet) : ''
  profileForm.inches = fi ? String(fi.inches) : ''
}
watch(() => [settings.profile, settings.heightUnit, settings.loaded], fillProfileForm, {
  immediate: true,
})

const parsedProfile = computed(() => {
  const num = (t: string) => (t.trim() === '' ? null : Number(t))
  let heightCm: number | null = null
  let heightError: string | undefined
  if (settings.heightUnit === 'cm') {
    const cm = num(profileForm.cm)
    if (cm !== null) {
      if (cm >= 50 && cm <= 272) heightCm = cm
      else heightError = 'Between 50 and 272 cm'
    }
  } else {
    const ft = num(profileForm.feet)
    const inch = num(profileForm.inches) ?? 0
    if (ft !== null) {
      const cm = feetInchesToCm({ feet: ft, inches: inch })
      if (Number.isInteger(ft) && inch >= 0 && inch < 12 && cm >= 50 && cm <= 272) heightCm = cm
      else heightError = 'Feet as a whole number, inches 0 to 11.9'
    }
  }
  return { heightCm, heightError }
})

const profileValid = computed(() => !parsedProfile.value.heightError)

async function saveProfile() {
  if (!profileValid.value) return
  await settings.updateProfile({ heightCm: parsedProfile.value.heightCm })
  notify.show('Profile saved', 'success')
}

const backupAge = computed(() =>
  settings.lastBackupAt ? daysBetween(settings.lastBackupAt, systemClock()) : null,
)
const hasData = computed(
  () =>
    shelf.vials.length > 0 ||
    journal.measurements.length > 0 ||
    journal.symptoms.length > 0 ||
    journal.glucose.length > 0 ||
    photos.photos.length > 0,
)
const backupStale = computed(
  () => hasData.value && (backupAge.value === null || backupAge.value > 14),
)

async function exportData() {
  busy.value = true
  try {
    let result: Awaited<ReturnType<typeof saveFile>>
    let backup
    if (photos.photos.length && includePhotos.value) {
      const archive = await exportBackupArchive(db)
      backup = archive.backup
      result = await saveFile(
        backupFileName(backup.exportedAt, true),
        new Blob([archive.bytes as BlobPart], { type: 'application/zip' }),
      )
    } else {
      backup = await exportBackup(db)
      result = await saveFile(backupFileName(backup.exportedAt), JSON.stringify(backup, null, 2))
    }
    if (result !== 'cancelled') {
      await settings.markBackedUp(backup.exportedAt)
      notify.show('Backup saved', 'success')
    }
  } catch {
    notify.show("Couldn't save the backup. Your device may be out of space.", 'error')
  } finally {
    busy.value = false
  }
}

const plural = (n: number, noun: string, nouns = `${noun}s`) => `${n} ${n === 1 ? noun : nouns}`

/** "3 vials, 12 draws, 9 journal entries and 4 photos": what a restore replaces, on each side. */
function describe(counts: { vials: number; draws: number; entries: number; photos: number }) {
  const parts = [plural(counts.vials, 'vial'), plural(counts.draws, 'draw')]
  if (counts.entries) parts.push(plural(counts.entries, 'journal entry', 'journal entries'))
  if (counts.photos) parts.push(plural(counts.photos, 'photo'))
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]!
}

async function importData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const { backup, photoFiles } = readBackupFile(new Uint8Array(await file.arrayBuffer()))
    const mine = describe({
      vials: shelf.vials.length,
      draws: shelf.draws.length,
      entries: journal.measurements.length + journal.symptoms.length + journal.glucose.length,
      photos: photos.photos.length,
    })
    const theirs = describe({
      vials: backup.vials.length,
      draws: backup.draws.length,
      entries: backup.measurements.length + backup.symptoms.length + backup.glucose.length,
      photos: backup.photos.length,
    })
    const losesPhotos = photos.photos.length > 0 && backup.photos.length === 0
    const ok = await confirm.ask({
      title: 'Replace everything on this device?',
      text: `Your ${mine} will be replaced with ${theirs} from the backup.${losesPhotos ? ' This backup has no photos, so your photos will be deleted.' : ''}`,
      confirmText: 'Restore backup',
      destructive: true,
    })
    if (!ok) return
    await restoreBackup(db, backup, photoFiles)
    await Promise.all([
      shelf.load(),
      protocols.load(),
      journal.load(),
      photos.load(),
      settings.load(),
    ])
    theme.change(settings.theme)
    notify.show('Backup restored', 'success')
  } catch (e) {
    notify.show(e instanceof BackupFormatError ? e.message : "Couldn't read that file.", 'error')
  }
}

interface InstallScreenshot {
  src: string
  width: number
  height: number
  alt: string
}

const INSTALL_SCREENSHOTS: Partial<Record<InstallPlatform, InstallScreenshot>> = {
  'ios-safari': {
    src: iosSafariShot,
    width: 480,
    height: 666,
    alt: "Safari's Share menu with Add to Home Screen at the bottom of the list",
  },
  'ios-chrome': {
    src: iosChromeShot,
    width: 480,
    height: 842,
    alt: "Chrome's Share menu on iPhone with Add to Home Screen at the bottom of the list",
  },
  'android-chrome': {
    src: androidChromeShot,
    width: 480,
    height: 996,
    alt: "Chrome's menu on Android with Install and create shortcut highlighted",
  },
  'android-firefox': {
    src: androidFirefoxShot,
    width: 480,
    height: 999,
    alt: "Firefox's menu on Android with Add app to Home screen highlighted",
  },
}

const installShot = computed(() => INSTALL_SCREENSHOTS[install.state.platform])

async function promptInstall() {
  if (await install.actions.promptInstall()) notify.show('PepCalc installed', 'success')
}

const formatMb = (bytes: number | null) =>
  bytes === null ? '?' : `${(bytes / 1_048_576).toFixed(1)} MB`
</script>

<template>
  <div class="pc-page settings">
    <header class="mb-4">
      <p class="pc-eyebrow">Preferences</p>
      <h1 class="pc-display text-headline-large">Settings</h1>
    </header>

    <div class="settings-grid">
      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Display</p>
          <v-card-title>Appearance and defaults</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <div>
            <p id="theme-label" class="pc-label">Theme</p>
            <v-btn-toggle
              v-model="themeModel"
              mandatory
              density="comfortable"
              aria-labelledby="theme-label"
            >
              <v-btn value="system">System</v-btn>
              <v-btn value="light">Light</v-btn>
              <v-btn value="dark">Dark</v-btn>
            </v-btn-toggle>
          </div>
          <v-select
            v-model="syringeModel"
            :items="syringeCatalog.syringes.map((s) => ({ title: s.label, value: s.id }))"
            label="Default syringe"
          />
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Journal</p>
          <v-card-title>Units</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <div>
            <p id="weight-unit-label" class="pc-label">Weight unit</p>
            <v-btn-toggle
              v-model="weightUnitModel"
              role="group"
              mandatory
              density="comfortable"
              aria-labelledby="weight-unit-label"
            >
              <v-btn value="kg">Kilograms</v-btn>
              <v-btn value="lb">Pounds</v-btn>
            </v-btn-toggle>
          </div>
          <div>
            <p id="height-unit-label" class="pc-label">Height unit</p>
            <v-btn-toggle
              v-model="heightUnitModel"
              role="group"
              mandatory
              density="comfortable"
              aria-labelledby="height-unit-label"
            >
              <v-btn value="cm">Centimetres</v-btn>
              <v-btn value="ftin">Feet and inches</v-btn>
            </v-btn-toggle>
          </div>
          <div>
            <p id="glucose-unit-label" class="pc-label">Blood glucose unit</p>
            <v-btn-toggle
              v-model="glucoseUnitModel"
              role="group"
              mandatory
              density="comfortable"
              aria-labelledby="glucose-unit-label"
            >
              <v-btn value="mg/dL">mg/dL</v-btn>
              <v-btn value="mmol/L">mmol/L</v-btn>
            </v-btn-toggle>
          </div>
          <div>
            <p id="a1c-unit-label" class="pc-label">HbA1c unit</p>
            <v-btn-toggle
              v-model="a1cUnitModel"
              role="group"
              mandatory
              density="comfortable"
              aria-labelledby="a1c-unit-label"
            >
              <v-btn value="%">Percent (%)</v-btn>
              <v-btn value="mmol/mol">mmol/mol</v-btn>
            </v-btn-toggle>
          </div>
          <p class="text-body-small pc-muted">
            Entries convert when you switch. Dose units are set on each vial.
          </p>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Journal</p>
          <v-card-title>Profile</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <p class="text-body-small pc-muted">Optional. Height gives your BMI.</p>
          <div v-if="settings.heightUnit === 'cm'">
            <v-text-field
              v-model="profileForm.cm"
              label="Height"
              suffix="cm"
              type="number"
              inputmode="decimal"
              :error-messages="parsedProfile.heightError"
            />
          </div>
          <div v-else class="d-flex ga-3 align-start">
            <v-text-field
              v-model="profileForm.feet"
              label="Height, feet"
              suffix="ft"
              type="number"
              inputmode="numeric"
              :error-messages="parsedProfile.heightError"
            />
            <v-text-field
              v-model="profileForm.inches"
              label="Inches"
              suffix="in"
              type="number"
              inputmode="decimal"
              :error="!!parsedProfile.heightError"
            />
          </div>
          <div class="pc-actions">
            <v-btn color="primary" variant="flat" :disabled="!profileValid" @click="saveProfile">
              Save profile
            </v-btn>
          </div>
          <p v-if="settings.profile.heightCm" class="text-body-small pc-faint">
            Saved height: {{ formatHeight(settings.profile.heightCm, settings.heightUnit) }}
          </p>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Shelf</p>
          <v-card-title>Vial age alerts</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <div>
            <p id="age-mode-label" class="pc-label">Mark a mixed vial by</p>
            <v-btn-toggle
              v-model="ageModeModel"
              mandatory
              density="comfortable"
              aria-labelledby="age-mode-label"
            >
              <v-btn value="sourced">Published limit</v-btn>
              <v-btn value="custom">My own days</v-btn>
            </v-btn-toggle>
          </div>
          <p v-if="settings.vialAgeMode === 'sourced'" class="text-body-medium pc-muted">
            {{ catalog.storage.inUse.days }} days after mixing, or less if a label says so. Vials
            show <em>use soon</em> near the end.
          </p>
          <template v-else>
            <div class="d-flex ga-3 align-start">
              <v-text-field
                v-model="ageForm.nearing"
                label="Use soon from day"
                type="number"
                inputmode="numeric"
                :error-messages="ageFormError"
              />
              <v-text-field
                v-model="ageForm.past"
                label="Past from day"
                type="number"
                inputmode="numeric"
                :error="!!ageFormError"
              />
            </div>
            <p class="text-body-medium pc-muted">Each vial still shows its published limit.</p>
            <div class="pc-actions">
              <v-btn variant="text" @click="resetAgeLimits">
                Reset to {{ DEFAULT_CUSTOM_AGE_LIMITS.nearingDays }} and
                {{ DEFAULT_CUSTOM_AGE_LIMITS.pastDays }} days
              </v-btn>
            </div>
          </template>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Your data</p>
          <v-card-title>Backup and restore</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <p>
            Your data is only on this device. Clearing site data or uninstalling deletes it. Back up
            regularly.
          </p>
          <v-alert v-if="backupStale" type="warning" variant="tonal" density="compact">
            {{
              settings.lastBackupAt
                ? `Last backup ${backupAge} days ago.`
                : "You haven't made a backup yet."
            }}
          </v-alert>
          <p v-else-if="settings.lastBackupAt" class="pc-muted">
            Last backup {{ formatDateTime(settings.lastBackupAt) }}
          </p>
          <div v-if="photos.photos.length" class="pc-stack pc-stack--tight">
            <v-switch
              v-model="includePhotos"
              :label="`Include ${plural(photos.photos.length, 'photo')}`"
              color="primary"
              hide-details
            />
            <p class="text-body-small pc-muted">Saved as a .zip file that includes your photos.</p>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              color="primary"
              variant="flat"
              :prepend-icon="mdiDownload"
              :loading="busy"
              @click="exportData"
            >
              Save a backup
            </v-btn>
            <v-btn variant="outlined" :prepend-icon="mdiTrayArrowUp" @click="fileInput?.click()">
              Restore from file
            </v-btn>
            <input
              ref="fileInput"
              type="file"
              :accept="backupAccept"
              class="d-none"
              aria-label="Backup file"
              @change="importData"
            />
          </div>
          <p class="text-body-small pc-muted">
            On iPhone and iPad, Safari and the Home Screen app store data separately. Use a backup
            to move between them.
          </p>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Install</p>
          <v-card-title>Add to Home Screen</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <p v-if="install.state.standalone" class="d-flex align-center ga-2">
            <v-icon :icon="mdiCheckCircleOutline" color="success" />
            Installed
          </p>
          <template v-else>
            <p>Install PepCalc to open it full screen and use it offline.</p>
            <v-btn
              v-if="install.canPrompt.value"
              color="primary"
              variant="flat"
              :prepend-icon="mdiCellphoneArrowDown"
              class="align-self-start"
              @click="promptInstall"
            >
              Install PepCalc
            </v-btn>
            <template v-else>
              <!-- Step wording matches the menu labels in each screenshot. -->
              <ol class="install-steps">
                <template v-if="install.state.platform === 'ios-safari'">
                  <li>Tap the <strong>Share</strong> button.</li>
                  <li>
                    Tap <strong>View More</strong> if needed, then choose
                    <strong>Add to Home Screen</strong>.
                  </li>
                  <li>Tap <strong>Add</strong>.</li>
                </template>
                <template v-else-if="install.state.platform === 'ios-chrome'">
                  <li>Tap the <strong>Share</strong> button in the address bar.</li>
                  <li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong>.</li>
                </template>
                <template v-else-if="install.state.platform === 'android-firefox'">
                  <li>Open the Firefox menu (<strong>⋮</strong>).</li>
                  <li>Choose <strong>Add app to Home screen</strong>, then confirm.</li>
                </template>
                <template v-else-if="install.state.platform === 'android-chrome'">
                  <li>Open the Chrome menu (<strong>⋮</strong>).</li>
                  <li>
                    Choose <strong>Install and create shortcut</strong> (or
                    <strong>Add to Home screen</strong>), then confirm.
                  </li>
                </template>
                <template v-else>
                  <li>Open the browser menu.</li>
                  <li>
                    Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </li>
                </template>
              </ol>
              <img
                v-if="installShot"
                class="install-shot"
                :src="installShot.src"
                :width="installShot.width"
                :height="installShot.height"
                :alt="installShot.alt"
                loading="lazy"
              />
            </template>
          </template>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">Privacy</p>
          <v-card-title>Nothing leaves this device</v-card-title>
        </v-card-item>
        <v-card-text class="pc-stack">
          <ul class="privacy-list">
            <li>
              <v-icon :icon="mdiShieldLockOutline" size="small" /> No account, server or analytics.
            </li>
            <li><v-icon :icon="mdiCloudOffOutline" size="small" /> Works offline.</li>
          </ul>
          <p class="text-body-small pc-muted">
            Storage:
            {{ storage.state.persisted ? 'protected' : 'not protected' }}
            <template v-if="storage.state.usageBytes !== null">
              · {{ formatMb(storage.state.usageBytes) }} used
            </template>
          </p>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-item>
          <p class="pc-eyebrow">About</p>
          <v-card-title>PepCalc {{ version }}</v-card-title>
        </v-card-item>
        <v-card-text class="about">
          <p>
            A reconstitution and draw calculator for peptide research. It shows sourced reference
            values but doesn't recommend doses and isn't medical advice.
          </p>
          <p>
            You must be {{ ADULT_AGE }} or older to use PepCalc, or the age of majority where you
            live if that is higher.
          </p>
          <p>
            Presets come from prescribing labels, clinical trials or community reports. Community
            amounts aren't clinically established. Level charts are estimates.
          </p>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
  align-items: start;
}

.install-steps {
  padding-left: 20px;
  margin: 0;
}

.install-steps li + li {
  margin-top: 4px;
}

.install-shot {
  display: block;
  width: 100%;
  max-width: 240px;
  height: auto;
  margin: 0 auto;
  border: 1px solid var(--pc-divider-strong);
  border-radius: var(--pc-radius-lg);
}

.privacy-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.about p + p {
  margin-top: 12px;
}
</style>
