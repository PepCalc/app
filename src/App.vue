<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useShelfStore } from '@/stores/shelf'
import { useJournalStore } from '@/stores/journal'
import { usePhotosStore } from '@/stores/photos'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { useHideOnScroll } from '@/composables/useHideOnScroll'
import AppLogo from '@/components/common/AppLogo.vue'
import AppSnackbar from '@/components/common/AppSnackbar.vue'
import AppConfirm from '@/components/common/AppConfirm.vue'
import UpdatePrompt from '@/components/common/UpdatePrompt.vue'
import DisclaimerDialog from '@/components/common/DisclaimerDialog.vue'
import {
  mdiBookshelf,
  mdiCalculatorVariantOutline,
  mdiCellphoneArrowDown,
  mdiCogOutline,
  mdiHistory,
  mdiNotebookOutline,
} from '@/plugins/icons'

const settings = useSettingsStore()
const shelf = useShelfStore()
const journal = useJournalStore()
const photos = usePhotosStore()
const theme = useTheme()
const display = useDisplay()
const route = useRoute()
const router = useRouter()
const install = useInstallPrompt()

const NAV = [
  { name: 'calculator', title: 'Calculator', icon: mdiCalculatorVariantOutline },
  { name: 'shelf', title: 'Shelf', icon: mdiBookshelf },
  { name: 'journal', title: 'Journal', icon: mdiNotebookOutline },
  { name: 'history', title: 'History', icon: mdiHistory },
  { name: 'settings', title: 'Settings', icon: mdiCogOutline },
] as const

// Phones get bottom navigation within thumb reach; tablets and desktops a side rail.
const wide = computed(() => display.mdAndUp.value)

const activeNav = computed(() => (route.name === 'vial' ? 'shelf' : String(route.name ?? '')))

const bar = useHideOnScroll()

// A new page starts with its title bar in view.
watch(() => route.fullPath, bar.actions.reveal)

/*
 * A tap on a non-interactive part of the page brings the bar back, as tapping the screen does in
 * reading apps; taps on controls are left to the control.
 */
const INTERACTIVE = 'a, button, input, select, textarea, label, canvas, [role], .v-field, .v-chip'
function onContentTap(event: MouseEvent) {
  if (!bar.state.hidden) return
  if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return
  bar.actions.reveal()
}

/** Opens a tab; re-tapping the current one scrolls back to the top, as in iOS and Android tab bars. */
function selectTab(name: string) {
  if (route.name !== name) {
    void router.push({ name })
    return
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
  bar.actions.reveal()
}

/*
 * A tap that lands while the page is still coasting from a fling only stops the fling: Chrome on
 * Android sends pointerup but no click, so a tab that waits for the click ignores it. Touch and
 * pen therefore select on pointerup, and the click that usually follows is skipped. Mouse and
 * keyboard go through the tab's router link on click. A drag that began on a tab and ended off it
 * selects nothing.
 */
let selectedOnPointerUp = false

function onTabPointerDown() {
  selectedOnPointerUp = false
}

function onTabPointerUp(event: PointerEvent, name: string) {
  if (event.pointerType === 'mouse') return
  const tab = event.currentTarget
  if (!(tab instanceof Element)) return
  if (!tab.contains(document.elementFromPoint(event.clientX, event.clientY))) return
  selectedOnPointerUp = true
  selectTab(name)
}

function onTabClick(name: string) {
  if (selectedOnPointerUp) {
    selectedOnPointerUp = false
    return
  }
  if (route.name === name) selectTab(name)
}

const showInstallBanner = computed(
  () => settings.loaded && !settings.installHintDismissed && !install.state.standalone,
)

onMounted(async () => {
  await Promise.all([settings.load(), shelf.load(), journal.load(), photos.load()])
  theme.change(settings.theme)
})
</script>

<template>
  <v-app>
    <v-app-bar
      flat
      density="compact"
      :class="['app-bar', { 'pc-app-bar--hidden': bar.state.hidden }]"
      @click="bar.actions.reveal"
      @focusin="bar.actions.reveal"
    >
      <v-app-bar-title>
        <router-link :to="{ name: 'calculator' }" class="brand" aria-label="PepCalc, calculator">
          <AppLogo :size="30" />
        </router-link>
      </v-app-bar-title>
    </v-app-bar>

    <v-navigation-drawer v-if="wide" permanent rail rail-width="96">
      <v-list nav density="comfortable" class="pt-4">
        <v-list-item
          v-for="item in NAV"
          :key="item.name"
          :to="{ name: item.name }"
          :active="activeNav === item.name"
          class="rail-item"
          @pointerdown="onTabPointerDown"
          @pointerup="onTabPointerUp($event, item.name)"
          @click="onTabClick(item.name)"
        >
          <div class="d-flex flex-column align-center ga-1 py-1">
            <v-icon :icon="item.icon" />
            <span class="text-label-medium">{{ item.title }}</span>
          </div>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main @click="onContentTap">
      <v-banner
        v-if="showInstallBanner"
        :icon="mdiCellphoneArrowDown"
        density="compact"
        :lines="wide ? 'one' : undefined"
        :stacked="!wide"
        class="install-banner"
      >
        <v-banner-text> Add PepCalc to your Home Screen to use it offline. </v-banner-text>
        <template #actions>
          <v-btn :to="{ name: 'settings' }" variant="text">How</v-btn>
          <v-btn variant="text" @click="settings.dismissInstallHint()">Dismiss</v-btn>
        </template>
      </v-banner>
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </v-main>

    <v-bottom-navigation v-if="!wide" :model-value="activeNav" grow class="bottom-nav">
      <v-btn
        v-for="item in NAV"
        :key="item.name"
        :value="item.name"
        :to="{ name: item.name }"
        @pointerdown="onTabPointerDown"
        @pointerup="onTabPointerUp($event, item.name)"
        @click="onTabClick(item.name)"
      >
        <v-icon :icon="item.icon" />
        <span>{{ item.title }}</span>
      </v-btn>
    </v-bottom-navigation>

    <AppSnackbar />
    <AppConfirm />
    <UpdatePrompt />
    <DisclaimerDialog />
  </v-app>
</template>

<style scoped>
/*
 * The title's text line box (1.75rem line-height plus descender space below the baseline) is
 * taller than the logo, which then sits at its top, above the bar's center. Lay it out as flex
 * so the box is exactly the logo's height; visible overflow keeps the mark's shadow unclipped.
 */
.app-bar :deep(.v-toolbar-title__placeholder) {
  display: flex;
  align-items: center;
  overflow: visible;
}

.brand {
  display: inline-flex;
  text-decoration: none;
}

/*
 * Keep content clear of the notch and rounded corners when installed (viewport-fit=cover). The
 * Android app's WebView reports zero env() insets on older versions; Capacitor sets the
 * --safe-area-inset-* properties instead, so those win when present.
 */
.app-bar {
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top));
  padding-left: var(--safe-area-inset-left, env(safe-area-inset-left));
  padding-right: var(--safe-area-inset-right, env(safe-area-inset-right));
}

.bottom-nav {
  padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom));
  height: calc(64px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom))) !important;
}

/* Vuetify gives each item an 80px minimum; five tabs need 400px and overflow narrower phones. */
.bottom-nav .v-btn {
  min-width: 0;
  padding-inline: 0;
}

.rail-item {
  justify-content: center;
  min-height: 64px;
}

.install-banner {
  border-bottom: 1px solid var(--pc-divider);
}
</style>
