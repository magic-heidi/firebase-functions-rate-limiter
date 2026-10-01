import { z } from 'zod'

// "u" instead of "usages" to save data transfer
export const PersistenceRecordSchema = z.object({
  u: z.number().array(),
})

export type PersistenceRecord = z.infer<typeof PersistenceRecordSchema>
