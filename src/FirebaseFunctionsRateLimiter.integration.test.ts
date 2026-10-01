import type { LimiterConfig } from './LimiterConfig'
import type { PersistenceRecord } from './persistence/PersistenceRecord'

/* tslint:disable:max-classes-per-file no-console */
import { randomUUID } from 'node:crypto'
import * as firebase from '@firebase/testing'
import { HttpsError } from 'firebase-functions/https'
import { FirebaseFunctionsRateLimiter } from './FirebaseFunctionsRateLimiter'
import { mock } from './FirebaseFunctionsRateLimiter.mock.integration.test'
import { delayMs } from './utils.test'

describe('FirebaseFunctionsRateLimiter', () => {
  //
  beforeAll(async () => {
    const { firestore, database } = mock('firestore', {})
    await firestore
      .collection('a')
      .doc('a')
      .get()
    await database.ref('a').set({ a: 'a' })
  })

  afterEach(async () => {
    try {
      await Promise.all(firebase.apps().map(app => app.delete()))
    }
    catch (error) {
      console.warn(`Warning: Error in firebase shutdown ${error}`)
    }
  });

  [
    {
      name: 'with qualifier',
      qualifierFactory() {
        return `q${randomUUID()}`
      },
    },
    {
      name: 'without qualifier',
      qualifierFactory() {
        return undefined
      },
    },
  ].forEach(test =>
    describe(test.name, () => {
      const backends = ['firestore', 'realtimedb', 'mock'] as const
      backends.forEach((backend: 'firestore' | 'realtimedb' | 'mock') =>
        describe(`Backend ${backend}`, () => {
          describe('isQuotaExceededOrRecordUsage', () => {
            it('Uses qualifier to identify document in the collection', async () => {
              const { rateLimiter, uniqueCollectionName, getDocument } = mock(backend, {})
              const qualifier = test.qualifierFactory()
              await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)

              const doc = await getDocument(
                uniqueCollectionName,
                qualifier || FirebaseFunctionsRateLimiter.DEFAULT_QUALIFIER,
              )

              const record = doc as PersistenceRecord
              expect(record.u).toHaveLength(1)
            })

            it('Increments counter when limit is not exceeded', async () => {
              const { rateLimiter, getDocument, uniqueCollectionName } = mock(backend, {
                maxCalls: 10,
              })
              const qualifier = test.qualifierFactory()

              const noOfTestCalls = 5
              for (let i = 0; i < noOfTestCalls; i++) {
                await delayMs(5)
                await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
              }

              const doc = await getDocument(
                uniqueCollectionName,
                qualifier || FirebaseFunctionsRateLimiter.DEFAULT_QUALIFIER,
              )

              const record = doc as PersistenceRecord
              expect(record.u).toHaveLength(noOfTestCalls)
            })

            it('Does not increment counter when limit is exceeded', async () => {
              const maxCalls = 5
              const noOfTestCalls = 10

              const { rateLimiter, getDocument, uniqueCollectionName } = mock(backend, {
                maxCalls,
              })
              const qualifier = test.qualifierFactory()

              for (let i = 0; i < noOfTestCalls; i++) {
                await delayMs(5)
                await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
              }

              const doc = await getDocument(
                uniqueCollectionName,
                qualifier || FirebaseFunctionsRateLimiter.DEFAULT_QUALIFIER,
              )

              const record = doc as PersistenceRecord
              expect(record.u).toHaveLength(maxCalls)
            })

            it('Calls older than period are removed from the database', async () => {
              const maxCalls = 2
              const periodSeconds = 1

              const { rateLimiter, uniqueCollectionName, getDocument } = mock(backend, {
                maxCalls,
                periodSeconds,
              })
              const qualifier = test.qualifierFactory()

              await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
              await delayMs(periodSeconds * 1000 + 200)
              await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
              await delayMs(200)

              const doc = await getDocument(
                uniqueCollectionName,
                qualifier || FirebaseFunctionsRateLimiter.DEFAULT_QUALIFIER,
              )
              const record = doc as PersistenceRecord
              expect(record.u).toHaveLength(1)
            })
          })

          describe('rejectOnQuotaExceededOrRecordUsage', () => {
            it('throws functions.https.HttpsException when limit is exceeded', async () => {
              const maxCalls = 1
              const noOfTestCalls = 2

              const { rateLimiter } = mock(backend, {
                maxCalls,
              })
              const qualifier = test.qualifierFactory()

              for (let i = 0; i < noOfTestCalls; i++) {
                await delayMs(5)
                await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
              }

              await expect(rateLimiter.rejectOnQuotaExceededOrRecordUsage(qualifier)).rejects.toBeInstanceOf(HttpsError)
            })

            it('Is fulfilled when limit is not exceeded', async () => {
              const maxCalls = 10
              const noOfTestCalls = 2

              const { rateLimiter } = mock(backend, {
                maxCalls,
              })
              const qualifier = test.qualifierFactory()

              for (let i = 0; i < noOfTestCalls; i++) {
                await delayMs(5)
                await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
              }

              await expect(rateLimiter.rejectOnQuotaExceededOrRecordUsage(qualifier)).resolves.toBeUndefined()
            })

            it('When error factory is provided, uses it to throw the error', async () => {
              const { rateLimiter } = mock(backend, {
                maxCalls: 1,
              })
              const qualifier = test.qualifierFactory()
              await rateLimiter.rejectOnQuotaExceededOrRecordUsage(qualifier)

              const errorFactory = () => new Error('error-from-factory')
              await expect(rateLimiter.rejectOnQuotaExceededOrRecordUsage(qualifier, errorFactory)).rejects.toThrow(/error-from-factory/)
            })

            it('Provides valid configuration to error factory', async () => {
              const { rateLimiter, config } = mock(backend, {
                maxCalls: 1,
              })
              const qualifier = test.qualifierFactory()
              await rateLimiter.rejectOnQuotaExceededOrRecordUsage(qualifier)

              const errorFactory = (configInErrorFactory: LimiterConfig.Schema) => {
                expect(configInErrorFactory).toEqual(expect.objectContaining(config))
                return new Error('error-from-factory')
              }

              await expect(rateLimiter.rejectOnQuotaExceededOrRecordUsage(qualifier, errorFactory)).rejects.toThrow(/error-from-factory/)
            })
          });

          [
            {
              name: 'isQuotaExceededOrRecordUsage',
              methodFactory(rateLimiter: FirebaseFunctionsRateLimiter) {
                return rateLimiter.isQuotaExceededOrRecordUsage.bind(rateLimiter)
              },
            },
            {
              name: 'isQuotaAlreadyExceeded',
              methodFactory(rateLimiter: FirebaseFunctionsRateLimiter) {
                return rateLimiter.isQuotaAlreadyExceeded.bind(rateLimiter)
              },
            },
          ].forEach(testedMethod =>
            describe(`#${testedMethod.name}`, () => {
              it('Limit is exceeded if too much calls in specified period', async () => {
                const maxCalls = 5
                const noOfTestCalls = 10

                const { rateLimiter } = mock(backend, {
                  maxCalls,
                })
                const qualifier = test.qualifierFactory()

                for (let i = 0; i < noOfTestCalls; i++) {
                  await delayMs(5)
                  await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
                }

                const method = testedMethod.methodFactory(rateLimiter)
                expect(await method(qualifier)).toBe(true)
              })

              it('Limit is not exceeded if too much calls not in specified period', async () => {
                const maxCalls = 2
                const periodSeconds = 1

                const { rateLimiter } = mock(backend, {
                  maxCalls,
                  periodSeconds,
                })
                const qualifier = test.qualifierFactory()

                await rateLimiter.isQuotaExceededOrRecordUsage(qualifier)
                await delayMs(periodSeconds * 1000 + 200)

                const method = testedMethod.methodFactory(rateLimiter)
                expect(await method(qualifier)).toBe(false)
              })
            }),
          )
        }),
      )

      describe('Firestore backend specific tests', () => {
        it('Writes to specified collection', async () => {
          const { rateLimiter, firestore, uniqueCollectionName } = mock('firestore', {})
          await rateLimiter.isQuotaExceededOrRecordUsage()

          const collection = await firestore.collection(uniqueCollectionName).get()
          expect(collection.size).toBe(1)
        })
      })

      describe('Realtimedb backend specific tests', () => {
        it('Writes to specified key', async () => {
          const { rateLimiter, database, uniqueCollectionName } = mock('realtimedb', {})
          await rateLimiter.isQuotaExceededOrRecordUsage()

          const collection = (await database.ref(`${uniqueCollectionName}`).once('value')).val()
          expect(Object.keys(collection)).toHaveLength(1)
        })
      })

      describe('getConfiguration', () => {
        it('Returns correct configuration', () => {
          const { rateLimiter, config } = mock('firestore', { maxCalls: 5 })
          expect(rateLimiter.getConfiguration()).toEqual(expect.objectContaining(config))
        })
      })
    }),
  )
})
