import { z } from 'zod'

export namespace LimiterConfig {
  export const Schema = z.object({
    name: z.string().min(1),
    periodSeconds: z.int().gt(0),
    maxCalls: z.int().gt(0),
    debug: z.boolean(),
  })

  export type Schema = z.infer<typeof Schema>
  export type Input = Partial<Schema>

  export const Defaults: Schema = Schema.parse({
    name: 'rlimit',
    periodSeconds: 5 * 60,
    maxCalls: 5,
    debug: false,
  })
}
