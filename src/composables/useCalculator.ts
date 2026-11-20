import { computed, reactive, watch } from 'vue'
import {
  comfortCaps,
  DEFAULT_PEPTIDE_ID,
  findPeptide,
  findSyringe,
  injectionSiteConcerns,
  solutionColorFor,
  syringeCatalog,
} from '@/data'
import type { CatalogPeptide, SolutionColor } from '@/domain/catalog'
import { blendTotalMg, splitBlendDose, type BlendComponent } from '@/domain/blend'
import { InvalidInputError, planDraw, type DrawPlan } from '@/domain/reconstitution'
import {
  readSyringe,
  scaleLabel,
  suggestSyringe,
  type SyringeReading,
  type SyringeSpec,
} from '@/domain/syringe'
import { gentleWaterMl, syringeTopUp } from '@/domain/diluent'
import {
  areCompatible,
  convert,
  doseUnitsFor,
  IncompatibleUnitsError,
  roundTo,
  type AmountUnit,
  type Quantity,
} from '@/domain/units'

export const CUSTOM_PEPTIDE = 'custom'

export interface CustomPeptideChoice {
  name: string
  vialUnit: AmountUnit
  vialAmount: number | null
}

export interface CustomBlendChoice {
  name: string
  components: BlendComponent[]
}

export interface CalculatorInput {
  peptideId: string
  customName: string
  vialAmount: number | null
  vialUnit: AmountUnit
  diluentMl: number | null
  doseValue: number | null
  doseUnit: AmountUnit
  syringeId: string
  components: BlendComponent[]
}

export interface CalculatorWarning {
  tone: 'notice' | 'alert'
  text: string
}

function defaultsFor(peptide: CatalogPeptide | undefined): Partial<CalculatorInput> {
  if (!peptide) return { vialUnit: 'mg', doseUnit: 'mg', components: [] }
  return {
    vialUnit: peptide.vialUnit,
    vialAmount: peptide.vialSizes.values[0] ?? null,
    diluentMl: peptide.diluentMl.values.includes(3) ? 3 : (peptide.diluentMl.values[0] ?? null),
    doseUnit: peptide.doses?.unit ?? peptide.defaultDoseUnit,
    doseValue: peptide.doses?.values[0] ?? null,
    components: peptide.components?.map((c) => ({ ...c })) ?? [],
  }
}

/**
 * Calculator state and every derived figure. Pure arithmetic lives in domain/; this composable
 * only wires inputs to it and turns domain errors into user-facing messages.
 */
export function useCalculator(initial: Partial<CalculatorInput> = {}) {
  const firstPeptide = initial.peptideId ?? DEFAULT_PEPTIDE_ID
  const state = reactive<CalculatorInput>({
    peptideId: firstPeptide,
    customName: '',
    vialAmount: null,
    vialUnit: 'mg',
    diluentMl: null,
    doseValue: null,
    doseUnit: 'mg',
    syringeId: syringeCatalog.defaultSyringeId,
    components: [],
    ...defaultsFor(findPeptide(firstPeptide)),
    ...initial,
  })

  const peptide = computed(() => findPeptide(state.peptideId))
  const isBlend = computed(() => peptide.value?.kind === 'blend' || state.components.length > 1)
  const solutionColor = computed<SolutionColor>(() =>
    solutionColorFor(peptide.value, state.components),
  )
  const doseUnits = computed(() => doseUnitsFor(state.vialUnit))
  const syringe = computed(() => findSyringe(state.syringeId))

  /**
   * The user switched between mg and mcg: convert the number so the dose itself never changes
   * by 1000x. Programmatic unit changes (switching peptide) set value and unit together instead.
   */
  function setDoseUnit(to: AmountUnit) {
    const from = state.doseUnit
    if (state.doseValue !== null && from !== to && areCompatible(from, to)) {
      state.doseValue = roundTo(convert({ value: state.doseValue, unit: from }, to).value, 6)
    }
    state.doseUnit = to
  }

  function selectPeptide(id: string) {
    state.peptideId = id
    Object.assign(state, defaultsFor(findPeptide(id)))
    if (id === CUSTOM_PEPTIDE) {
      state.vialAmount = null
      state.doseValue = null
    }
  }

  function selectCustom(choice: CustomPeptideChoice) {
    state.peptideId = CUSTOM_PEPTIDE
    state.customName = choice.name.trim()
    state.components = []
    state.vialUnit = choice.vialUnit
    state.vialAmount = choice.vialAmount
    state.diluentMl = state.diluentMl ?? 3
    state.doseUnit = choice.vialUnit === 'iu' ? 'iu' : 'mg'
    state.doseValue = null
  }

  function selectCustomBlend(choice: CustomBlendChoice) {
    const components = choice.components.map((c) => ({
      name: c.name.trim(),
      amountMg: c.amountMg,
      peptideId: c.peptideId,
    }))
    state.peptideId = CUSTOM_PEPTIDE
    state.customName = choice.name.trim()
    state.vialUnit = 'mg'
    state.components = components
    state.vialAmount = blendTotalMg(components)
    state.diluentMl = solutionColorFor(undefined, components) === 'blue' ? 5 : 3
    state.doseUnit = 'mg'
    state.doseValue = null
  }

  // A blend's vial amount is the sum of its components, so editing composition updates it.
  watch(
    () => state.components.map((c) => c.amountMg),
    () => {
      if (state.components.length > 1) state.vialAmount = blendTotalMg(state.components)
    },
  )

  // Keep the dose unit valid when the vial unit changes between mass and IU.
  watch(
    () => state.vialUnit,
    () => {
      if (!doseUnits.value.includes(state.doseUnit)) state.doseUnit = doseUnits.value[0]!
    },
  )

  const vial = computed<Quantity | null>(() =>
    state.vialAmount ? { value: state.vialAmount, unit: state.vialUnit } : null,
  )
  const dose = computed<Quantity | null>(() =>
    state.doseValue ? { value: state.doseValue, unit: state.doseUnit } : null,
  )

  const result = computed<{ plan: DrawPlan } | { error: string } | null>(() => {
    if (!vial.value || !state.diluentMl || !dose.value) return null
    try {
      return { plan: planDraw(vial.value, state.diluentMl, dose.value) }
    } catch (e) {
      if (e instanceof InvalidInputError || e instanceof IncompatibleUnitsError) {
        return { error: e.message }
      }
      throw e
    }
  })

  const plan = computed(() => (result.value && 'plan' in result.value ? result.value.plan : null))
  const error = computed(() =>
    result.value && 'error' in result.value ? result.value.error : null,
  )

  const reading = computed<SyringeReading | null>(() =>
    plan.value ? readSyringe(plan.value.volumeMl, syringe.value) : null,
  )

  const allReadings = computed<SyringeReading[]>(() =>
    plan.value ? syringeCatalog.syringes.map((s) => readSyringe(plan.value!.volumeMl, s)) : [],
  )

  /** A finer syringe of the same scale (U-100, U-40, mL) when one measures this draw better. */
  const betterSyringe = computed(() => {
    if (!plan.value) return null
    const family = syringeCatalog.syringes.filter((s) => s.unitsPerMl === syringe.value.unitsPerMl)
    const best = suggestSyringe(plan.value.volumeMl, family)
    return best && best.tickMl < syringe.value.tickMl ? best : null
  })

  const componentDoses = computed(() =>
    isBlend.value && dose.value && state.vialUnit !== 'iu'
      ? splitBlendDose(dose.value, state.components, 'mcg')
      : [],
  )

  /**
   * The strongest capped ingredient decides whether this mix may sting. When it does, say how
   * to dilute the dose in the syringe, which works without remixing the vial.
   */
  function comfortWarning(drawMl: number, syringe: SyringeSpec): CalculatorWarning | null {
    const caps = comfortCaps(injectionSiteConcerns(peptide.value, state.components, vial.value))
    const gentleMinMl = gentleWaterMl(caps)
    const waterMl = state.diluentMl
    if (gentleMinMl === null || !waterMl || waterMl >= gentleMinMl - 1e-9) return null
    const cap = caps.find((c) => c.amountMg / c.maxMgPerMl >= gentleMinMl - 1e-9)!
    const topUp = syringeTopUp(drawMl, waterMl, gentleMinMl, syringe)
    const remedy = topUp
      ? `To reduce stinging, draw the dose, then pull bacteriostatic water into the same syringe up to ${scaleLabel(topUp)}.`
      : 'More water may sting less.'
    return {
      tone: 'notice',
      text: `${cap.name} at ${roundTo(cap.amountMg / waterMl, 1)} mg/mL is stronger than ${cap.maxMgPerMl} mg/mL, above which users report stinging. ${remedy}`,
    }
  }

  const warnings = computed<CalculatorWarning[]>(() => {
    const list: CalculatorWarning[] = []
    const r = reading.value
    const p = plan.value
    if (!r || !p) return list
    if (p.volumeMl > (state.diluentMl ?? 0) + 1e-9) {
      list.push({ tone: 'alert', text: 'This dose is more than the vial contains.' })
    }
    if (!r.fits) {
      list.push({
        tone: 'alert',
        text: `Needs ${r.fillsNeeded} full draws of this syringe. Use a larger syringe or less water.`,
      })
    } else if (r.belowResolution) {
      list.push({
        tone: 'alert',
        text: 'Too small to measure on this syringe. Use a finer syringe or more water.',
      })
    }
    const comfort = comfortWarning(p.volumeMl, r.syringe)
    if (comfort) list.push(comfort)
    if (r.syringe.unitsPerMl === 40) {
      list.push({
        tone: 'notice',
        text: 'U-40 units differ from U-100 units. Check the syringe label.',
      })
    }
    return list
  })

  return {
    state,
    peptide,
    isBlend,
    solutionColor,
    doseUnits,
    syringe,
    vial,
    dose,
    plan,
    error,
    reading,
    allReadings,
    betterSyringe,
    componentDoses,
    warnings,
    actions: { selectPeptide, selectCustom, selectCustomBlend, setDoseUnit },
  }
}
