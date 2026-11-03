import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type PepcalcDb } from '@/db/database'
import { createRepository, type NewVial } from '@/db/repository'
import { strToU8, zipSync } from 'fflate'
import {
  exportBackup,
  exportBackupArchive,
  parseBackup,
  readBackupFile,
  restoreBackup,
  BackupFormatError,
} from '@/db/backup'

const fixedClock = () => new Date('2026-10-25T12:00:00.000Z')

const vialInput: NewVial = {
  peptideId: 'semaglutide',
  name: 'Semaglutide',
  kind: 'single',
  unit: 'mg',
  amount: 5,
  diluentMl: 2,
  components: null,
  typicalDose: { value: 0.25, unit: 'mg' },
  pkOverride: null,
  reconstitutedAt: '2026-10-20T08:00:00.000Z',
  status: 'active',
  notes: '',
}

let db: PepcalcDb
let counter = 0

beforeEach(async () => {
  db = createDatabase(`test-${++counter}`)
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('repository', () => {
  it('adds vials with ids and UTC timestamps', async () => {
    const repo = createRepository(db, fixedClock)
    const vial = await repo.addVial(vialInput)
    expect(vial.id).toMatch(/[0-9a-f-]{36}/)
    expect(vial.createdAt).toBe('2026-10-25T12:00:00.000Z')
    expect(await repo.listVials()).toHaveLength(1)
  })

  it('lists draws for one vial newest first and cascades on delete', async () => {
    const repo = createRepository(db, fixedClock)
    const a = await repo.addVial(vialInput)
    const b = await repo.addVial({ ...vialInput, name: 'Other' })
    const base = {
      dose: { value: 0.25, unit: 'mg' as const },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    }
    await repo.addDraw({ ...base, vialId: a.id, takenAt: '2026-10-21T08:00:00.000Z' })
    await repo.addDraw({ ...base, vialId: a.id, takenAt: '2026-10-24T08:00:00.000Z' })
    await repo.addDraw({ ...base, vialId: b.id, takenAt: '2026-10-22T08:00:00.000Z' })
    const draws = await repo.listDrawsForVial(a.id)
    expect(draws.map((d) => d.takenAt)).toEqual([
      '2026-10-24T08:00:00.000Z',
      '2026-10-21T08:00:00.000Z',
    ])
    await repo.deleteVial(a.id)
    expect(await repo.listDraws()).toHaveLength(1)
  })

  it('stores settings', async () => {
    const repo = createRepository(db, fixedClock)
    await repo.setSetting('defaultSyringeId', 'u100-0.5ml')
    expect(await repo.getSetting('defaultSyringeId')).toBe('u100-0.5ml')
  })
})

describe('backup', () => {
  it('round-trips through JSON and replaces existing data', async () => {
    const repo = createRepository(db, fixedClock)
    const vial = await repo.addVial(vialInput)
    await repo.addDraw({
      vialId: vial.id,
      takenAt: '2026-10-21T08:00:00.000Z',
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: 'first',
    })
    const text = JSON.stringify(await exportBackup(db, fixedClock))

    const other = createDatabase(`restore-${counter}`)
    await other.open()
    const otherRepo = createRepository(other, fixedClock)
    await otherRepo.addVial({ ...vialInput, name: 'Will be replaced' })
    await restoreBackup(other, parseBackup(text))
    const vials = await otherRepo.listVials()
    expect(vials.map((v) => v.name)).toEqual(['Semaglutide'])
    expect((await otherRepo.listDraws())[0]?.notes).toBe('first')
    await other.delete()
  })

  it('adds, updates and deletes protocols, and carries them through a backup', async () => {
    const repo = createRepository(db, fixedClock)
    const p = await repo.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      intervalHours: 168,
      notes: '',
    })
    expect(p.createdAt).toBe('2026-10-25T12:00:00.000Z')
    await repo.updateProtocol(p.id, { intervalHours: 24 })
    expect((await repo.listProtocols())[0]!.intervalHours).toBe(24)

    const text = JSON.stringify(await exportBackup(db, fixedClock))
    const other = createDatabase(`restore-protocols-${counter}`)
    await other.open()
    await restoreBackup(other, parseBackup(text))
    expect((await createRepository(other).listProtocols())[0]).toMatchObject({
      key: 'semaglutide',
      intervalHours: 24,
    })
    await other.delete()

    await repo.deleteProtocol(p.id)
    expect(await repo.listProtocols()).toEqual([])
  })

  it('carries a protocol to a renamed custom vial only once no vial keeps the old name', async () => {
    const repo = createRepository(db, fixedClock)
    const custom = { ...vialInput, peptideId: null, name: 'My Peptide' }
    const a = await repo.addVial(custom)
    const b = await repo.addVial(custom)
    await repo.addProtocol({
      key: 'name:my peptide',
      name: 'My Peptide',
      intervalHours: 24,
      notes: '',
    })

    await repo.updateVial(a.id, { name: 'Renamed' })
    expect((await repo.listProtocols())[0]!.key).toBe('name:my peptide')

    await repo.updateVial(b.id, { name: 'Renamed' })
    expect((await repo.listProtocols())[0]).toMatchObject({ key: 'name:renamed', name: 'Renamed' })
  })

  it('restores a version 3 backup, which predates protocols, with none', async () => {
    const repo = createRepository(db, fixedClock)
    await repo.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      intervalHours: 24,
      notes: '',
    })
    const { protocols: _p, ...rest } = await exportBackup(db, fixedClock)
    const parsed = parseBackup(JSON.stringify({ ...rest, version: 3 }))
    expect(parsed.protocols).toEqual([])
    await restoreBackup(db, parsed)
    expect(await repo.listProtocols()).toEqual([])
  })

  it('rejects a protocol without a positive interval', async () => {
    const repo = createRepository(db, fixedClock)
    await repo.addProtocol({
      key: 'semaglutide',
      name: 'Semaglutide',
      intervalHours: 24,
      notes: '',
    })
    const backup = await exportBackup(db, fixedClock)
    backup.protocols[0]!.intervalHours = 0
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/Protocol 1/)
  })

  it('rejects files that are not PepCalc backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupFormatError)
    expect(() => parseBackup('{"format":"other"}')).toThrow(BackupFormatError)
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'pepcalc-backup',
          version: 99,
          vials: [],
          draws: [],
          settings: [],
        }),
      ),
    ).toThrow(/newer version/)
  })

  it('rejects draws that point at a missing vial', () => {
    const bad = {
      format: 'pepcalc-backup',
      version: 1,
      vials: [],
      draws: [
        {
          id: 'd',
          vialId: 'nope',
          takenAt: '2026-10-21T08:00:00.000Z',
          dose: { value: 1, unit: 'mg' },
          volumeMl: 0.1,
        },
      ],
      settings: [],
    }
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(BackupFormatError)
  })

  it('rejects a draw whose unit cannot apply to its vial', () => {
    const backup = {
      format: 'pepcalc-backup',
      version: 1,
      vials: [
        {
          ...vialInput,
          unit: 'iu',
          id: 'v1',
          createdAt: '2026-10-20T08:00:00.000Z',
          typicalDose: null,
        },
      ],
      draws: [
        {
          id: 'd1',
          vialId: 'v1',
          takenAt: '2026-10-21T08:00:00.000Z',
          dose: { value: 1, unit: 'mg' },
          volumeMl: 0.1,
        },
      ],
      settings: [],
    }
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupFormatError)
  })

  it('rejects a non-positive user half-life', () => {
    const backup = {
      format: 'pepcalc-backup',
      version: 1,
      vials: [
        {
          ...vialInput,
          id: 'v1',
          createdAt: '2026-10-20T08:00:00.000Z',
          pkOverride: { halfLifeHours: 0, tmaxHours: 1 },
        },
      ],
      draws: [],
      settings: [],
    }
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupFormatError)
  })

  it('restores version 1 blend components as unlinked', () => {
    const backup = {
      format: 'pepcalc-backup',
      version: 1,
      vials: [
        {
          ...vialInput,
          id: 'v1',
          kind: 'blend',
          createdAt: '2026-10-20T08:00:00.000Z',
          components: [{ name: 'GHK-Cu', amountMg: 50 }],
        },
      ],
      draws: [],
      settings: [],
    }
    expect(parseBackup(JSON.stringify(backup)).vials[0]!.components).toEqual([
      { name: 'GHK-Cu', amountMg: 50, peptideId: null },
    ])
  })

  it('rejects blend components without a catalog id field', () => {
    const blendVial = (components: unknown) => ({
      format: 'pepcalc-backup',
      version: 2,
      vials: [
        {
          ...vialInput,
          id: 'v1',
          kind: 'blend',
          createdAt: '2026-10-20T08:00:00.000Z',
          components,
        },
      ],
      draws: [],
      settings: [],
    })
    const ghk = { name: 'GHK-Cu', amountMg: 50 }
    expect(() => parseBackup(JSON.stringify(blendVial([ghk])))).toThrow(BackupFormatError)
    expect(
      parseBackup(JSON.stringify(blendVial([{ ...ghk, peptideId: 'ghk-cu' }]))).vials,
    ).toHaveLength(1)
  })
})

describe('journal', () => {
  async function seed() {
    const repo = createRepository(db, fixedClock)
    const vial = await repo.addVial(vialInput)
    await repo.addDraw({
      vialId: vial.id,
      takenAt: '2026-10-01T08:00:00.000Z',
      dose: { value: 0.25, unit: 'mg' },
      volumeMl: 0.1,
      syringeId: 'u100-1ml',
      notes: '',
    })
    await repo.addMeasurements([
      {
        metric: 'weight',
        measuredAt: '2026-10-01T07:00:00.000Z',
        value: 95.2,
        enteredUnit: 'kg',
        notes: '',
      },
    ])
    await repo.addSymptoms([
      {
        occurredAt: '2026-10-02T09:00:00.000Z',
        symptom: 'nausea',
        otherText: '',
        severity: 'mild',
        notes: '',
      },
    ])
    await repo.addGlucose({
      kind: 'a1c',
      measuredAt: '2026-09-30T09:00:00.000Z',
      value: 7.4,
      enteredUnit: '%',
      context: null,
      notes: '',
    })
    await repo.setSetting('profile', { heightCm: 170 })
    return repo
  }

  it('keeps measurements unrounded, lists them newest first, and logs several at once', async () => {
    const repo = createRepository(db, fixedClock)
    await repo.addMeasurements([
      {
        metric: 'weight',
        measuredAt: '2026-10-01T07:00:00.000Z',
        value: 90.718474,
        enteredUnit: 'lb',
        notes: '',
      },
    ])
    const [a, b] = await repo.addMeasurements([
      {
        metric: 'weight',
        measuredAt: '2026-10-08T07:00:00.000Z',
        value: 89.5,
        enteredUnit: 'kg',
        notes: '',
      },
      {
        metric: 'weight',
        measuredAt: '2026-10-08T07:00:00.000Z',
        value: 89.6,
        enteredUnit: 'kg',
        notes: '',
      },
    ])
    expect(a!.id).not.toBe(b!.id)
    expect(a!.createdAt).toBe('2026-10-25T12:00:00.000Z')
    const values = (await repo.listMeasurements()).map((m) => m.value)
    expect(values.slice(-1)).toEqual([90.718474])
    await repo.deleteMeasurement(a!.id)
    expect(await repo.listMeasurements()).toHaveLength(2)
  })

  it('round-trips everything through a backup file', async () => {
    await seed()
    const parsed = parseBackup(JSON.stringify(await exportBackup(db, fixedClock)))
    expect(parsed.version).toBe(4)
    expect(parsed.measurements).toHaveLength(1)
    expect(parsed.symptoms).toHaveLength(1)
    expect(parsed.glucose).toHaveLength(1)

    const other = createDatabase(`test-${++counter}`)
    await other.open()
    await restoreBackup(other, parsed)
    const restored = createRepository(other)
    expect((await restored.listDraws())[0]!.dose.value).toBe(0.25)
    expect((await restored.listMeasurements())[0]!.value).toBe(95.2)
    expect((await restored.listSymptoms())[0]!.symptom).toBe('nausea')
    expect((await restored.listGlucose())[0]!.value).toBe(7.4)
    expect(await restored.getSetting('profile')).toMatchObject({ heightCm: 170 })
    await other.delete()
  })

  it('restores a version 2 backup, which predates the journal, and clears the journal', async () => {
    await seed()
    const current = await exportBackup(db, fixedClock)
    const { measurements: _m, symptoms: _s, glucose: _g, photos: _p, ...rest } = current
    const parsed = parseBackup(JSON.stringify({ ...rest, version: 2 }))
    expect(parsed.measurements).toEqual([])
    expect(parsed.photos).toEqual([])
    await restoreBackup(db, parsed)
    const repo = createRepository(db)
    expect(await repo.listMeasurements()).toEqual([])
    expect(await repo.listSymptoms()).toEqual([])
    expect(await repo.listVials()).toHaveLength(1)
  })

  it('rejects invalid measurements, side effects and blood sugar readings', async () => {
    await seed()
    const backup = await exportBackup(db, fixedClock)
    const m = backup.measurements[0]!
    for (const bad of [
      { ...m, value: -1 },
      { ...m, enteredUnit: 'cm' },
      { ...m, metric: 'height' },
    ]) {
      expect(() => parseBackup(JSON.stringify({ ...backup, measurements: [bad] }))).toThrow(
        /Measurement 1/,
      )
    }
    const badSymptom = { ...backup, symptoms: [{ ...backup.symptoms[0]!, severity: 'awful' }] }
    expect(() => parseBackup(JSON.stringify(badSymptom))).toThrow(/Side effect 1/)
    const badUnit = { ...backup, glucose: [{ ...backup.glucose[0]!, enteredUnit: 'mg/dL' }] }
    expect(() => parseBackup(JSON.stringify(badUnit))).toThrow(/Blood sugar reading 1/)
    const incomplete = { ...backup, measurements: undefined }
    expect(() => parseBackup(JSON.stringify(incomplete))).toThrow(/incomplete/)
  })

  const bytes = (...values: number[]) => new Uint8Array(values).buffer
  const one = () => new Uint8Array([1])

  async function seedPhoto() {
    return createRepository(db, fixedClock).addPhoto(
      { takenAt: '2026-10-01T07:05:00.000Z', pose: 'front', notes: '', width: 1200, height: 1600 },
      bytes(1, 2, 3),
      bytes(4, 5),
    )
  }

  it('round-trips photos through a zip backup', async () => {
    await seed()
    const photo = await seedPhoto()
    const { bytes: zip } = await exportBackupArchive(db, fixedClock)
    const { backup, photoFiles } = readBackupFile(zip)
    expect(backup.photos).toHaveLength(1)
    expect(backup.draws).toHaveLength(1)

    const other = createDatabase(`test-${++counter}`)
    await other.open()
    await restoreBackup(other, backup, photoFiles)
    const restored = createRepository(other)
    expect((await restored.listPhotos())[0]!.pose).toBe('front')
    expect(new Uint8Array((await restored.getPhotoImage(photo.id))!)).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(new Uint8Array((await restored.listPhotoThumbs())[0]!.bytes)).toEqual(
      new Uint8Array([4, 5]),
    )
    await other.delete()
  })

  it('still reads a .json backup, which carries no photos', async () => {
    await seed()
    await seedPhoto()
    const json = JSON.stringify(await exportBackup(db, fixedClock))
    const { backup, photoFiles } = readBackupFile(strToU8(json))
    expect(backup.photos).toEqual([])
    expect(photoFiles).toEqual([])
    await restoreBackup(db, backup)
    expect(await createRepository(db).listPhotos()).toEqual([])
    expect(await createRepository(db).listPhotoThumbs()).toEqual([])
  })

  it('refuses a .json that lists photos, and a zip with missing or unexpected files', async () => {
    await seed()
    const photo = await seedPhoto()
    const withPhotos = JSON.stringify(await exportBackup(db, fixedClock, true))
    expect(() => readBackupFile(strToU8(withPhotos))).toThrow(/Restore the .zip/)

    const data = strToU8(withPhotos)
    const missing = zipSync({ 'pepcalc-backup.json': data, [`photos/${photo.id}.jpg`]: one() })
    expect(() => readBackupFile(missing)).toThrow(/Photo 1 is missing/)
    const stray = zipSync({ 'pepcalc-backup.json': data, 'notes.txt': strToU8('hi') })
    expect(() => readBackupFile(stray)).toThrow(/not a PepCalc backup/)
    const unlisted = zipSync({
      'pepcalc-backup.json': data,
      [`photos/${photo.id}.jpg`]: one(),
      [`thumbs/${photo.id}.jpg`]: one(),
      'photos/other.jpg': one(),
    })
    expect(() => readBackupFile(unlisted)).toThrow(/does not list/)
  })

  it('deletes a photo with its image and thumbnail', async () => {
    const photo = await seedPhoto()
    const repo = createRepository(db)
    await repo.deletePhoto(photo.id)
    expect(await repo.listPhotos()).toEqual([])
    expect(await repo.getPhotoImage(photo.id)).toBeUndefined()
    expect(await repo.listPhotoThumbs()).toEqual([])
  })
})
