/* tslint:disable:max-classes-per-file */
import { FirebaseFunctionsRateLimiterConfiguration } from './FirebaseFunctionsRateLimiterConfiguration'

describe('FirebaseFunctionsRateLimiterConfiguration', () => {
  it('Default configuration passes validation', async () => {
    FirebaseFunctionsRateLimiterConfiguration.ConfigurationFull.validate(
      FirebaseFunctionsRateLimiterConfiguration.DEFAULT_CONFIGURATION,
    )
  })
})
