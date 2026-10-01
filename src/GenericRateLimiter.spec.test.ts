/* tslint:disable:max-classes-per-file */

import type { FirebaseFunctionsRateLimiterConfiguration } from './FirebaseFunctionsRateLimiterConfiguration'
import { random } from 'es-toolkit'
import { GenericRateLimiter } from './GenericRateLimiter'
import { PersistenceProviderMock } from './persistence/PersistenceProviderMock'
import { TimestampProviderMock } from './timestamp/TimestampProviderMock.test'

const sampleConfiguration: FirebaseFunctionsRateLimiterConfiguration.ConfigurationFull = {
  name: 'rate_limiter_1',
  periodSeconds: 5 * 60,
  maxCalls: 1,
  debug: false,
}
const sampleQualifier = 'samplequalifier'

describe('GenericRateLimiter', () => {
  function mock(configChanges: object) {
    const persistenceProviderMock: PersistenceProviderMock = new PersistenceProviderMock()
    persistenceProviderMock.persistenceObject = {}
    const timestampProviderMock = new TimestampProviderMock()
    const genericRateLimiter = new GenericRateLimiter(
      { ...sampleConfiguration, ...configChanges },
      persistenceProviderMock,
      timestampProviderMock,
    )
    return { genericRateLimiter, timestampProviderMock, persistenceProviderMock }
  }

  describe('#isQuotaAlreadyExceededDoNotRecordCall', () => {
    it('Calls get on PersistenceProvider', async () => {
      const { genericRateLimiter, persistenceProviderMock } = mock({})
      const getSpy = vi.spyOn(persistenceProviderMock, 'get')

      await genericRateLimiter.isQuotaAlreadyExceededDoNotRecordCall(sampleQualifier)

      expect(getSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('#isQuotaExceededOrRecordCall', () => {
    it('Quota is not exceeded on first call when maxCalls=1', async () => {
      const { genericRateLimiter } = mock({ maxCalls: 1 })

      expect(await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)).toBe(false)
    })

    it('Does not fail on empty collection', async () => {
      const { genericRateLimiter } = mock({})

      await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
    })

    it('Calls updateAndGet on PersistenceProvider', async () => {
      const { genericRateLimiter, persistenceProviderMock } = mock({})
      const updateAndGetSpy = vi.spyOn(persistenceProviderMock, 'updateAndGet')

      await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)

      expect(updateAndGetSpy).toHaveBeenCalledTimes(1)
    })

    it('Puts new current timestamp when quota was not exceeded', async () => {
      const { genericRateLimiter, persistenceProviderMock, timestampProviderMock } = mock({})

      const sampleTimestamp = random(10, 5000)
      timestampProviderMock.setTimestampSeconds(sampleTimestamp)

      await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)

      expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).toContain(sampleTimestamp)
    })

    it('does not put current timestamp when quota was exceeded', async () => {
      const { genericRateLimiter, persistenceProviderMock, timestampProviderMock } = mock({
        maxCalls: 1,
        periodSeconds: 20,
      })

      const sampleTimestamp = random(10, 5000)
      timestampProviderMock.setTimestampSeconds(sampleTimestamp)
      const quotaExceeded1 = await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
      expect(quotaExceeded1).toBe(false)

      timestampProviderMock.setTimestampSeconds(sampleTimestamp + 1)
      const quotaExceeded2 = await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
      expect(quotaExceeded2).toBe(true)

      expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).toHaveLength(1)
    })

    describe('threshold tests', () => {
      const savedTimestamps: number[] = []
      const persistenceProviderMock: PersistenceProviderMock = new PersistenceProviderMock()

      beforeAll(async () => {
        const timestampProviderMock = new TimestampProviderMock()
        const periodSeconds = 5
        const maxCalls = 10
        const genericRateLimiter = new GenericRateLimiter(
          { ...sampleConfiguration, periodSeconds, maxCalls },
          persistenceProviderMock,
          timestampProviderMock,
        )

        let timestamp = random(10, 5000)

        for (let i = 0; i < 6; i++) {
          timestampProviderMock.setTimestampSeconds(timestamp)
          savedTimestamps.push(timestamp)
          await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
          timestamp += periodSeconds / 3 + 0.1 // remember: never push floats to the edges ;)
        }
      })

      it('saved record does not contain timestamps below threshold', () => {
        expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).toHaveLength(3)
        expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).toEqual(expect.arrayContaining(savedTimestamps.slice(-3)))
      })

      it('saved record contains all timestamps above or equal threshold', () => {
        expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).toHaveLength(3)
        expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).not.toContain(savedTimestamps[0])
        expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).not.toContain(savedTimestamps[1])
        expect(Object.values(persistenceProviderMock.persistenceObject)[0].u).not.toContain(savedTimestamps[2])
      })
    })

    it('updates or reads only single qualifier', async () => {
      const periodSeconds = 30
      const maxCalls = 3
      const { genericRateLimiter, timestampProviderMock } = mock({
        maxCalls,
        periodSeconds,
      })

      let timestamp = random(10, 5000)

      for (let i = 0; i < 5; i++) {
        timestampProviderMock.setTimestampSeconds(timestamp)
        await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
        timestamp += 1
      }

      timestampProviderMock.setTimestampSeconds(timestamp)
      expect(await genericRateLimiter.isQuotaExceededOrRecordCall('another_qualifier')).toBe(false)
    })
  })

  describe('check tests', () => {
    [
      {
        name: 'isQuotaExceededOrRecordCall',
        methodFactory(genericRateLimiter: GenericRateLimiter) {
          return genericRateLimiter.isQuotaExceededOrRecordCall.bind(genericRateLimiter)
        },
      },
      {
        name: 'isQuotaAlreadyExceededDoNotRecordCall',
        methodFactory(genericRateLimiter: GenericRateLimiter) {
          return genericRateLimiter.isQuotaAlreadyExceededDoNotRecordCall.bind(genericRateLimiter)
        },
      },
    ].forEach(testedMethod =>
      describe(`#${testedMethod.name}`, () => {
        it('returns true if there are more calls than maxCalls', async () => {
          const periodSeconds = 20
          const maxCalls = 3
          const { genericRateLimiter, timestampProviderMock } = mock({
            maxCalls,
            periodSeconds,
          })

          let timestamp = random(10, 5000)

          for (let i = 0; i < 6; i++) {
            timestampProviderMock.setTimestampSeconds(timestamp)
            await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
            timestamp += 1
          }
          const method = testedMethod.methodFactory(genericRateLimiter)
          expect(await method(sampleQualifier)).toBe(true)
        })

        it('returns false if there are exactly maxCalls calls in the period', async () => {
          const periodSeconds = 20
          const maxCalls = 3
          const { genericRateLimiter, timestampProviderMock } = mock({
            maxCalls,
            periodSeconds,
          })

          let timestamp = random(10, 5000)

          for (let i = 0; i < 2; i++) {
            timestampProviderMock.setTimestampSeconds(timestamp)
            await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
            timestamp += 1
          }
          // the following call is the third, should be passed
          const method = testedMethod.methodFactory(genericRateLimiter)
          expect(await method(sampleQualifier)).toBe(false)
        })

        it('returns false if there are no calls, maxCalls=1 ant this is the first call', async () => {
          const periodSeconds = 20
          const maxCalls = 1
          const { genericRateLimiter, timestampProviderMock } = mock({
            maxCalls,
            periodSeconds,
          })

          const timestamp = random(10, 5000)
          timestampProviderMock.setTimestampSeconds(timestamp)
          const method = testedMethod.methodFactory(genericRateLimiter)
          expect(await method(sampleQualifier)).toBe(false)
        })

        it('returns false if there are less calls than maxCalls', async () => {
          const periodSeconds = 20
          const maxCalls = 10
          const { genericRateLimiter, timestampProviderMock } = mock({
            maxCalls,
            periodSeconds,
          })

          let timestamp = random(10, 5000)

          for (let i = 0; i < 2; i++) {
            timestampProviderMock.setTimestampSeconds(timestamp)
            await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
            timestamp += 1
          }
          // the following call is the third, should be passed
          const method = testedMethod.methodFactory(genericRateLimiter)
          expect(await method(sampleQualifier)).toBe(false)
        })

        it('returns false if exceeding calls are out of the period', async () => {
          const periodSeconds = 20
          const maxCalls = 5
          const { genericRateLimiter, timestampProviderMock } = mock({
            maxCalls,
            periodSeconds,
          })

          let timestamp = random(10, 5000)

          for (let i = 0; i < 10; i++) {
            timestampProviderMock.setTimestampSeconds(timestamp)
            await genericRateLimiter.isQuotaExceededOrRecordCall(sampleQualifier)
            timestamp += 1
          }

          timestamp += 30
          timestampProviderMock.setTimestampSeconds(timestamp)

          const method = testedMethod.methodFactory(genericRateLimiter)
          expect(await method(sampleQualifier)).toBe(false)
        })
      }),
    )
  })
})
