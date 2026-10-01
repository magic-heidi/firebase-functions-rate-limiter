import { z } from "zod";
import { Firestore } from "firebase-admin/firestore";
import { Database } from "firebase-admin/database";

//#region src/types/FirestoreEquivalent.d.ts
interface FirestoreEquivalent {
  runTransaction(tCallback: (transaction: any) => Promise<void>): Promise<void>;
  collection(name: string): {
    doc(name: string): FirestoreEquivalent.DocumentReferenceEquivalent;
  };
}
declare namespace FirestoreEquivalent {
  interface DocumentReferenceEquivalent {
    get(): Promise<{
      exists: boolean;
      data(): object | undefined;
    }>;
    set(record: object): Promise<any>;
  }
}
//#endregion
//#region src/types/RealtimeDbEquivalent.d.ts
interface RealtimeDbEquivalent {
  ref(path?: string | any | undefined): RealtimeDbEquivalent.Reference;
}
declare namespace RealtimeDbEquivalent {
  interface Reference {
    transaction(updateFn: (data: any) => any, completeFn?: any): Promise<{
      committed: boolean;
      snapshot: DataSnapshot | null;
    }>;
    once(eventType: 'value'): Promise<DataSnapshot>;
  }
  interface DataSnapshot {
    val(): any;
    exists(): boolean;
  }
}
//#endregion
//#region src/LimiterConfig.d.ts
declare namespace LimiterConfig {
  const Schema: z.ZodObject<{
    name: z.ZodString;
    periodSeconds: z.ZodInt;
    maxCalls: z.ZodInt;
    debug: z.ZodBoolean;
  }, z.core.$strip>;
  type Schema = z.infer<typeof Schema>;
  type Input = Partial<Schema>;
  const Defaults: Schema;
}
//#endregion
//#region src/persistence/PersistenceRecord.d.ts
declare const PersistenceRecordSchema: z.ZodObject<{
  u: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type PersistenceRecord = z.infer<typeof PersistenceRecordSchema>;
//#endregion
//#region src/persistence/PersistenceProvider.d.ts
interface PersistenceProvider {
  updateAndGet(collectionName: string, recordName: string, updater: (record: PersistenceRecord) => PersistenceRecord): Promise<PersistenceRecord>;
  get(collectionName: string, recordName: string): Promise<PersistenceRecord>;
  setDebugFn(debugFn: (msg: string) => void): void;
}
//#endregion
//#region src/persistence/PersistenceProviderMock.d.ts
declare class PersistenceProviderMock implements PersistenceProvider {
  persistenceObject: {
    [x: string]: PersistenceRecord;
  };
  updateAndGet(collectionName: string, recordName: string, updaterFn: (record: PersistenceRecord) => PersistenceRecord): Promise<PersistenceRecord>;
  get(collectionName: string, recordName: string): Promise<PersistenceRecord>;
  setDebugFn(debugFn: (msg: string) => void): void;
  getRecord(collectionName: string, recordName: string): Promise<PersistenceRecord>;
  private runTransaction;
  private saveRecord;
  private getKey;
  private createEmptyRecord;
  private delay;
}
//#endregion
//#region src/FirebaseFunctionsRateLimiter.d.ts
declare class FirebaseFunctionsRateLimiter {
  static DEFAULT_QUALIFIER: string;
  static withFirestoreBackend(configuration: LimiterConfig.Input, firestore: Firestore | FirestoreEquivalent): FirebaseFunctionsRateLimiter;
  static withRealtimeDbBackend(configuration: LimiterConfig.Input, realtimeDb: Database | RealtimeDbEquivalent): FirebaseFunctionsRateLimiter;
  static mock(configuration?: LimiterConfig.Input, persistenceProviderMock?: PersistenceProviderMock): FirebaseFunctionsRateLimiter;
  private configurationFull;
  private genericRateLimiter;
  private debugFn;
  private constructor();
  /**
   * Checks if quota is exceeded. If not — records usage time in the backend database.
   * The method is deprecated as it was renamed to isQuotaExceededOrRecordUsage
   *
   * @param qualifier — a string that identifies the limited resource accessor (for example the user id)
   * @deprecated
   */
  isQuotaExceeded(qualifier?: string): Promise<boolean>;
  /**
   * Checks if quota is exceeded. If not — records usage time in the backend database.
   *
   * @param qualifier — a string that identifies the limited resource accessor (for example the user id)
   * @deprecated
   */
  isQuotaExceededOrRecordUsage(qualifier?: string): Promise<boolean>;
  /**
   * Checks if quota is exceeded. If not — records usage time in the backend database and then
   * is rejected with functions.https.HttpsError (this is the type of error that can be caught when
   * firebase function is called directly: see https://firebase.google.com/docs/functions/callable)
   * The method is deprecated as it was renamed to rejectOnQuotaExceededOrRecordUsage
   *
   * @param qualifier  — a string that identifies the limited resource accessor (for example the user id)
   * @deprecated
   */
  rejectOnQuotaExceeded(qualifier?: string): Promise<void>;
  /**
   * Checks if quota is exceeded. If not — records usage time in the backend database and then
   * is rejected with functions.https.HttpsError (this is the type of error that can be caught when
   * firebase function is called directly: see https://firebase.google.com/docs/functions/callable)
   *
   * @param qualifier (optional) — a string that identifies the limited resource accessor (for example the user id)
   * @param errorFactory (optional) — when errorFactory is provided, it is used to obtain
   *                                  error that is thrown in case of exceeded limit.
   */
  rejectOnQuotaExceededOrRecordUsage(qualifier?: string, errorFactory?: (config: LimiterConfig.Schema) => Error): Promise<void>;
  /**
   * Checks if quota is exceeded. If not — DOES NOT RECORD USAGE. It only checks if limit was
   * previously exceeded or not.
   * @param qualifier — a string that identifies the limited resource accessor (for example the user id)
   */
  isQuotaAlreadyExceeded(qualifier?: string): Promise<boolean>;
  /**
   * Returns this rate limiter configuration
   */
  getConfiguration(): LimiterConfig.Schema;
  private constructRejectionError;
  private constructDebugFn;
}
//#endregion
export { FirebaseFunctionsRateLimiter, FirebaseFunctionsRateLimiter as default, type FirestoreEquivalent, LimiterConfig, type RealtimeDbEquivalent };