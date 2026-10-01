import type * as firebaseTypes from 'firebase/app'

import type { FirestoreEquivalent } from './FirestoreEquivalent'
import type { RealtimeDbEquivalent } from './RealtimeDbEquivalent'

describe('Firebase equivalents', () => {
  // tslint:disable prefer-const
  let firestore!: firebaseTypes.firestore.Firestore
  let database!: firebaseTypes.database.Database

  describe('FirestoreEquivalent', () => {
    function acceptFirestoreEquivalent(firestoreEquivalent: FirestoreEquivalent) {
      return firestoreEquivalent
    }

    it('Matches firebase/app typings', () => {
      acceptFirestoreEquivalent(firestore)
    })
  })

  describe('RealtimeDbEquivalent', () => {
    function acceptRealtimeDbEquivalent(realtimeDbEquivalent: RealtimeDbEquivalent) {
      return realtimeDbEquivalent
    }

    it('Matches firebase/app typings', () => {
      acceptRealtimeDbEquivalent(database)
    })
  })
})
