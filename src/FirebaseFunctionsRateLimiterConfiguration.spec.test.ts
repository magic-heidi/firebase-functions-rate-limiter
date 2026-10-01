/* tslint:disable:max-classes-per-file */
import { use as chaiUse } from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { FirebaseFunctionsRateLimiterConfiguration } from './FirebaseFunctionsRateLimiterConfiguration'

import 'mocha'

chaiUse(chaiAsPromised)

describe('FirebaseFunctionsRateLimiterConfiguration', () => {
  it('Default configuration passes validation', async () => {
    FirebaseFunctionsRateLimiterConfiguration.ConfigurationFull.validate(
      FirebaseFunctionsRateLimiterConfiguration.DEFAULT_CONFIGURATION,
    )
  })
})
