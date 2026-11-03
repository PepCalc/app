import { onMounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'

export interface ChartColors {
  logged: string
  preview: string
  grid: string
  axis: string
  now: string
  /** Overlay series colours, in slot order. */
  series: string[]
  text: string
  surface: string
  font: string
}

function readColors(): ChartColors {
  const root = document.querySelector('.v-application') ?? document.documentElement
  const style = getComputedStyle(root)
  const read = (name: string) => style.getPropertyValue(name).trim()
  return {
    logged: read('--pc-chart-logged'),
    preview: read('--pc-chart-preview'),
    grid: read('--pc-chart-grid'),
    axis: read('--pc-chart-axis'),
    now: read('--pc-chart-now'),
    series: [1, 2, 3, 4].map((n) => read(`--pc-chart-series-${n}`)),
    text: read('--pc-text-1'),
    surface: read('--pc-surface'),
    font: read('--pc-font'),
  }
}

/**
 * Chart colours resolved from the active theme's CSS tokens, so ECharts (which paints to a
 * canvas and cannot read CSS variables) follows light and dark mode. Re-read after the DOM
 * update that swaps the theme class.
 */
export function useChartColors() {
  const theme = useTheme()
  const colors = ref<ChartColors>(readColors())
  const update = () => {
    colors.value = readColors()
  }
  watch(() => theme.global.name.value, update, { flush: 'post' })
  onMounted(update)
  return { colors }
}
