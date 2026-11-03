import type {
  DrawRow,
  GlucoseRow,
  MeasurementRow,
  PepcalcDb,
  PhotoBytesRow,
  PhotoRow,
  ProtocolRow,
  SymptomRow,
  VialRow,
} from './database'
import { sameProductKey } from '@/domain/listing'
import { protocolFollowingRename } from '@/domain/schedule'
import { nowIso, systemClock, type Clock } from '@/services/time'

export type NewVial = Omit<VialRow, 'id' | 'createdAt' | 'updatedAt'>
export type NewDraw = Omit<DrawRow, 'id' | 'createdAt'>
export type NewProtocol = Omit<ProtocolRow, 'id' | 'createdAt' | 'updatedAt'>
export type NewMeasurement = Omit<MeasurementRow, 'id' | 'createdAt'>
export type NewSymptom = Omit<SymptomRow, 'id' | 'createdAt'>
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewGlucose = DistributiveOmit<GlucoseRow, 'id' | 'createdAt'>
export type NewPhoto = Omit<PhotoRow, 'id' | 'createdAt'>
export type PhotoChanges = Partial<Pick<PhotoRow, 'takenAt' | 'pose' | 'notes'>>

/**
 * All reads and writes of user data. Views and stores call this, never Dexie tables directly,
 * so storage rules (ids, timestamps, cascade deletes) live in one place.
 */
export function createRepository(db: PepcalcDb, clock: Clock = systemClock) {
  return {
    async listVials(): Promise<VialRow[]> {
      return db.vials.orderBy('createdAt').reverse().toArray()
    },

    async getVial(id: string): Promise<VialRow | undefined> {
      return db.vials.get(id)
    },

    async addVial(input: NewVial): Promise<VialRow> {
      const now = nowIso(clock)
      const row: VialRow = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      await db.vials.add(row)
      return row
    },

    /**
     * Updates the vial. A rename that moves the last vial of a peptide to a new name takes its
     * protocol along (see protocolFollowingRename), in the same transaction.
     */
    async updateVial(id: string, changes: Partial<NewVial>): Promise<void> {
      await db.transaction('rw', db.vials, db.protocols, async () => {
        const before = await db.vials.get(id)
        const now = nowIso(clock)
        await db.vials.update(id, { ...changes, updatedAt: now })
        if (!before) return
        const after = { ...before, ...changes }
        const others = (await db.vials.toArray()).filter((v) => v.id !== id)
        const protocolId = protocolFollowingRename(
          sameProductKey(before),
          sameProductKey(after),
          others,
          await db.protocols.toArray(),
        )
        if (protocolId) {
          await db.protocols.update(protocolId, {
            key: sameProductKey(after),
            name: after.name.trim(),
            updatedAt: now,
          })
        }
      })
    },

    /** Deletes the vial and its draw history in one transaction. */
    async deleteVial(id: string): Promise<void> {
      await db.transaction('rw', db.vials, db.draws, async () => {
        await db.draws.where('vialId').equals(id).delete()
        await db.vials.delete(id)
      })
    },

    async listDraws(): Promise<DrawRow[]> {
      return db.draws.orderBy('takenAt').reverse().toArray()
    },

    async listDrawsForVial(vialId: string): Promise<DrawRow[]> {
      return db.draws
        .where('[vialId+takenAt]')
        .between([vialId, ''], [vialId, '￿'])
        .reverse()
        .toArray()
    },

    async addDraw(input: NewDraw): Promise<DrawRow> {
      const row: DrawRow = { ...input, id: crypto.randomUUID(), createdAt: nowIso(clock) }
      await db.draws.add(row)
      return row
    },

    async deleteDraw(id: string): Promise<void> {
      await db.draws.delete(id)
    },

    async listProtocols(): Promise<ProtocolRow[]> {
      return db.protocols.orderBy('key').toArray()
    },

    async addProtocol(input: NewProtocol): Promise<ProtocolRow> {
      const now = nowIso(clock)
      const row: ProtocolRow = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      await db.protocols.add(row)
      return row
    },

    async updateProtocol(id: string, changes: Partial<NewProtocol>): Promise<void> {
      await db.protocols.update(id, { ...changes, updatedAt: nowIso(clock) })
    },

    async deleteProtocol(id: string): Promise<void> {
      await db.protocols.delete(id)
    },

    async listMeasurements(): Promise<MeasurementRow[]> {
      return db.measurements.orderBy('measuredAt').reverse().toArray()
    },

    /**
     * Logs measurements taken at one time (a weigh-in, or a scale's several readings), one row
     * each, in one transaction.
     */
    async addMeasurements(inputs: NewMeasurement[]): Promise<MeasurementRow[]> {
      const createdAt = nowIso(clock)
      const rows = inputs.map((input) => ({ ...input, id: crypto.randomUUID(), createdAt }))
      await db.measurements.bulkAdd(rows)
      return rows
    },

    async updateMeasurement(id: string, changes: Partial<NewMeasurement>): Promise<void> {
      await db.measurements.update(id, changes)
    },

    async deleteMeasurement(id: string): Promise<void> {
      await db.measurements.delete(id)
    },

    async listSymptoms(): Promise<SymptomRow[]> {
      return db.symptoms.orderBy('occurredAt').reverse().toArray()
    },

    /** Logs several side effects felt at one time, one row each, in one transaction. */
    async addSymptoms(inputs: NewSymptom[]): Promise<SymptomRow[]> {
      const createdAt = nowIso(clock)
      const rows = inputs.map((input) => ({ ...input, id: crypto.randomUUID(), createdAt }))
      await db.symptoms.bulkAdd(rows)
      return rows
    },

    async updateSymptom(id: string, changes: Partial<NewSymptom>): Promise<void> {
      await db.symptoms.update(id, changes)
    },

    async deleteSymptom(id: string): Promise<void> {
      await db.symptoms.delete(id)
    },

    async listGlucose(): Promise<GlucoseRow[]> {
      return db.glucose.orderBy('measuredAt').reverse().toArray()
    },

    async addGlucose(input: NewGlucose): Promise<GlucoseRow> {
      const row = { ...input, id: crypto.randomUUID(), createdAt: nowIso(clock) } as GlucoseRow
      await db.glucose.add(row)
      return row
    },

    async updateGlucose(id: string, changes: NewGlucose): Promise<void> {
      await db.glucose.update(id, changes)
    },

    async deleteGlucose(id: string): Promise<void> {
      await db.glucose.delete(id)
    },

    async listPhotos(): Promise<PhotoRow[]> {
      return db.photos.orderBy('takenAt').reverse().toArray()
    },

    async listPhotoThumbs(): Promise<PhotoBytesRow[]> {
      return db.photoThumbs.toArray()
    },

    async getPhotoImage(id: string): Promise<ArrayBuffer | undefined> {
      return (await db.photoImages.get(id))?.bytes
    },

    /** Stores a photo's details, image and thumbnail together, or none of them. */
    async addPhoto(input: NewPhoto, image: ArrayBuffer, thumb: ArrayBuffer): Promise<PhotoRow> {
      const row: PhotoRow = { ...input, id: crypto.randomUUID(), createdAt: nowIso(clock) }
      await db.transaction('rw', db.photos, db.photoImages, db.photoThumbs, async () => {
        await db.photos.add(row)
        await db.photoImages.add({ id: row.id, bytes: image })
        await db.photoThumbs.add({ id: row.id, bytes: thumb })
      })
      return row
    },

    async updatePhoto(id: string, changes: PhotoChanges): Promise<void> {
      await db.photos.update(id, changes)
    },

    async deletePhoto(id: string): Promise<void> {
      await db.transaction('rw', db.photos, db.photoImages, db.photoThumbs, async () => {
        await db.photos.delete(id)
        await db.photoImages.delete(id)
        await db.photoThumbs.delete(id)
      })
    },

    async getSetting<T>(key: string): Promise<T | undefined> {
      const row = await db.settings.get(key)
      return row?.value as T | undefined
    },

    async setSetting(key: string, value: unknown): Promise<void> {
      await db.settings.put({ key, value })
    },
  }
}
