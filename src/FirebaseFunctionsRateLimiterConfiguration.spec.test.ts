/* tslint:disable:max-classes-per-file */
import { LimiterConfig } from './LimiterConfig'

describe('LimiterConfig', () => {
  it('Default configuration passes validation', async () => {
    expect(() => LimiterConfig.Schema.parse(LimiterConfig.Defaults)).not.toThrow()
  })
})
