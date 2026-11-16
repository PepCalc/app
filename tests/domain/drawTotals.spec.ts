import { describe, expect, it } from 'vitest'
import { totalsByUnit } from '@/domain/drawTotals'

describe('totalsByUnit', () => {
  it('sums mass across mg and mcg in the first unit seen and keeps IU apart', () => {
    expect(
      totalsByUnit([
        { value: 250, unit: 'mcg' },
        { value: 0.5, unit: 'mg' },
        { value: 2, unit: 'iu' },
        { value: 3, unit: 'iu' },
      ]),
    ).toEqual([
      { value: 750, unit: 'mcg' },
      { value: 5, unit: 'iu' },
    ])
  })

  it('does not change the doses it is given', () => {
    const doses = [
      { value: 1, unit: 'mg' as const },
      { value: 1, unit: 'mg' as const },
    ]
    totalsByUnit(doses)
    expect(doses[0]!.value).toBe(1)
  })
})
