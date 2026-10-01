import { HttpsError } from "firebase-functions/https";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

//#region src/LimiterConfig.ts
let LimiterConfig;
(function(_LimiterConfig) {
	_LimiterConfig.Defaults = (_LimiterConfig.Schema = z.object({
		name: z.string().min(1),
		periodSeconds: z.int().gt(0),
		maxCalls: z.int().gt(0),
		debug: z.boolean()
	})).parse({
		name: "rlimit",
		periodSeconds: 300,
		maxCalls: 5,
		debug: false
	});
})(LimiterConfig || (LimiterConfig = {}));

//#endregion
//#region src/GenericRateLimiter.ts
var GenericRateLimiter = class {
	configuration;
	persistenceProvider;
	timestampProvider;
	debugFn;
	constructor(configuration, persistenceProvider, timestampProvider, debugFn = (msg) => {}) {
		this.configuration = LimiterConfig.Schema.parse({
			...LimiterConfig.Defaults,
			...configuration
		});
		this.persistenceProvider = persistenceProvider;
		this.timestampProvider = timestampProvider;
		this.debugFn = debugFn;
	}
	async isQuotaExceededOrRecordCall(qualifier) {
		const resultHolder = { isQuotaExceeded: false };
		await this.persistenceProvider.updateAndGet(this.configuration.name, qualifier, (record) => {
			return this.runTransactionForAnswer(record, resultHolder);
		});
		return resultHolder.isQuotaExceeded;
	}
	async isQuotaAlreadyExceededDoNotRecordCall(qualifier) {
		const timestampsSeconds = this.getTimestampsSeconds();
		const record = await this.persistenceProvider.get(this.configuration.name, qualifier);
		const recentUsages = this.selectRecentUsages(record.u, timestampsSeconds.threshold);
		return this.isQuotaExceeded(recentUsages.length);
	}
	runTransactionForAnswer(input, resultHolder) {
		const timestampsSeconds = this.getTimestampsSeconds();
		this.debugFn(`Got record with usages ${input.u.length}`);
		const recentUsages = this.selectRecentUsages(input.u, timestampsSeconds.threshold);
		this.debugFn(`Of these usages there are${recentUsages.length} usages that count into period`);
		const result = this.isQuotaExceeded(recentUsages.length);
		resultHolder.isQuotaExceeded = result;
		this.debugFn(`The result is quotaExceeded=${result}`);
		if (!result) {
			this.debugFn(`Quota was not exceeded, so recording a usage at ${timestampsSeconds.current}`);
			recentUsages.push(timestampsSeconds.current);
		}
		return { u: recentUsages };
	}
	selectRecentUsages(allUsages, timestampThresholdSeconds) {
		const recentUsages = [];
		for (const usageTime of allUsages) if (usageTime > timestampThresholdSeconds) recentUsages.push(usageTime);
		return recentUsages;
	}
	isQuotaExceeded(numOfRecentUsages) {
		return numOfRecentUsages >= this.configuration.maxCalls;
	}
	getTimestampsSeconds() {
		const currentServerTimestampSeconds = this.timestampProvider.getTimestampSeconds();
		return {
			current: currentServerTimestampSeconds,
			threshold: currentServerTimestampSeconds - this.configuration.periodSeconds
		};
	}
};

//#endregion
//#region src/persistence/PersistenceRecord.ts
const PersistenceRecordSchema = z.object({ u: z.number().array() });

//#endregion
//#region src/persistence/FirestorePersistenceProvider.ts
var FirestorePersistenceProvider = class {
	firestore;
	debugFn;
	/* c8 ignore next (debugFn), because typescript injects if for default parameters */
	constructor(firestore, debugFn = (msg) => {}) {
		this.firestore = firestore;
		this.debugFn = debugFn;
	}
	async updateAndGet(collectionName, recordName, updaterFn) {
		let result;
		await this.runTransaction(async () => {
			const record = await this.getRecord(collectionName, recordName);
			const updatedRecord = updaterFn(record);
			if (this.hasRecordChanged(record, updatedRecord)) await this.saveRecord(collectionName, recordName, updatedRecord);
			result = updatedRecord;
		});
		/* c8 ignore next */
		if (!result) throw new Error("FirestorePersistenceProvider: Persistence record could not be updated");
		return result;
	}
	async get(collectionName, recordName) {
		return await this.getRecord(collectionName, recordName);
	}
	setDebugFn(debugFn) {
		this.debugFn = debugFn;
	}
	async runTransaction(asyncTransactionFn) {
		return await this.firestore.runTransaction(async (transaction) => {
			await asyncTransactionFn();
		});
	}
	async getRecord(collectionName, recordName) {
		const docSnapshot = await this.getDocumentRef(collectionName, recordName).get();
		this.debugFn(`Got record from collection=${collectionName}, document=${recordName}`);
		if (!docSnapshot.exists) return this.createEmptyRecord();
		return PersistenceRecordSchema.parse(docSnapshot.data());
	}
	async saveRecord(collectionName, recordName, record) {
		this.debugFn(`Save record collection=${collectionName}, document=${recordName}`);
		await this.getDocumentRef(collectionName, recordName).set(record);
	}
	getDocumentRef(collectionName, recordName) {
		return this.firestore.collection(collectionName).doc(recordName);
	}
	createEmptyRecord() {
		return { u: [] };
	}
	hasRecordChanged(oldRecord, newRecord) {
		if (oldRecord.u.length !== newRecord.u.length) return true;
		else {
			const a1 = oldRecord.u.concat().sort();
			const a2 = newRecord.u.concat().sort();
			for (let i = 0; i < a1.length; i++) if (a1[i] !== a2[i]) return true;
			return false;
		}
	}
};

//#endregion
//#region src/persistence/PersistenceProviderMock.ts
var PersistenceProviderMock = class {
	persistenceObject = {};
	async updateAndGet(collectionName, recordName, updaterFn) {
		let result;
		await this.runTransaction(async () => {
			const updatedRecord = updaterFn(await this.getRecord(collectionName, recordName));
			await this.saveRecord(collectionName, recordName, updatedRecord);
			result = updatedRecord;
		});
		/* c8 ignore next */
		if (!result) throw new Error("PersistenceProviderMock: Persistence record could not be updated");
		return result;
	}
	async get(collectionName, recordName) {
		return await this.getRecord(collectionName, recordName);
	}
	setDebugFn(debugFn) {}
	async getRecord(collectionName, recordName) {
		await this.delay(2);
		const key = this.getKey(collectionName, recordName);
		return this.persistenceObject[key] || this.createEmptyRecord();
	}
	async runTransaction(asyncTransactionFn) {
		await asyncTransactionFn();
	}
	async saveRecord(collectionName, recordName, record) {
		await this.delay(2);
		const key = this.getKey(collectionName, recordName);
		this.persistenceObject[key] = record;
	}
	getKey(collectionName, recordName) {
		return `${collectionName}_${recordName}`;
	}
	createEmptyRecord() {
		return { u: [] };
	}
	delay(delayMs) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				resolve();
			}, delayMs);
		});
	}
};

//#endregion
//#region src/persistence/RealtimeDbPersistenceProvider.ts
var RealtimeDbPersistenceProvider = class {
	database;
	debugFn;
	/* c8 ignore next (debugFn), because typescript injects if for default parameters */
	constructor(database, debugFn = (msg) => {}) {
		this.database = database;
		this.debugFn = debugFn;
	}
	async updateAndGet(collectionName, recordName, updaterFn) {
		const { snapshot, committed } = await this.getDatabaseRef(collectionName, recordName).transaction((dataToUpdate) => this.wrapUpdaterFn(updaterFn)(dataToUpdate));
		/* c8 ignore next because this is not testable locally */
		if (!snapshot) throw new Error("RealtimeDbPersistenceProvider: realtime db didn't respond with data");
		/* c8 ignore next because this is not testable locally */
		if (!committed) throw new Error("RealtimeDbPersistenceProvider: could not save data");
		const data = snapshot.val();
		if (data === null) return this.createEmptyRecord();
		else return data;
	}
	async get(collectionName, recordName) {
		const data = (await this.getDatabaseRef(collectionName, recordName).once("value")).val();
		if (data === null) return this.createEmptyRecord();
		else return data;
	}
	setDebugFn(debugFn) {
		this.debugFn = debugFn;
	}
	wrapUpdaterFn(updaterFn) {
		return (data) => {
			this.debugFn(`RealtimeDbPersistenceProvider: updateFn called with data of type${typeof data}`);
			if (data === null) return updaterFn(this.createEmptyRecord());
			else return updaterFn(data);
		};
	}
	getDatabaseRef(collectionName, recordName) {
		const refName = `${collectionName}/${recordName}`;
		return this.database.ref(refName);
	}
	createEmptyRecord() {
		return { u: [] };
	}
};

//#endregion
//#region src/timestamp/FirebaseTimestampProvider.ts
var FirebaseTimestampProvider = class {
	getTimestampSeconds() {
		return Timestamp.now().seconds;
	}
};

//#endregion
//#region src/FirebaseFunctionsRateLimiter.ts
var FirebaseFunctionsRateLimiter = class FirebaseFunctionsRateLimiter {
	static DEFAULT_QUALIFIER = "default_qualifier";
	static withFirestoreBackend(configuration, firestore) {
		return new FirebaseFunctionsRateLimiter(configuration, new FirestorePersistenceProvider(firestore));
	}
	static withRealtimeDbBackend(configuration, realtimeDb) {
		return new FirebaseFunctionsRateLimiter(configuration, new RealtimeDbPersistenceProvider(realtimeDb));
	}
	static mock(configuration, persistenceProviderMock) {
		const defaultConfig = {
			periodSeconds: 10,
			maxCalls: Number.MAX_SAFE_INTEGER
		};
		/* c8 ignore next */
		const provider = persistenceProviderMock || new PersistenceProviderMock();
		/* c8 ignore next */
		return new FirebaseFunctionsRateLimiter(configuration || defaultConfig, provider);
	}
	configurationFull;
	genericRateLimiter;
	debugFn;
	constructor(configuration, persistenceProvider) {
		this.configurationFull = LimiterConfig.Schema.parse({
			...LimiterConfig.Defaults,
			...configuration
		});
		this.debugFn = this.constructDebugFn(this.configurationFull);
		persistenceProvider.setDebugFn(this.debugFn);
		const timestampProvider = new FirebaseTimestampProvider();
		this.genericRateLimiter = new GenericRateLimiter(this.configurationFull, persistenceProvider, timestampProvider, this.debugFn);
	}
	/* c8 ignore next because this method was renamed and is now deprecated */
	/**
	* Checks if quota is exceeded. If not — records usage time in the backend database.
	* The method is deprecated as it was renamed to isQuotaExceededOrRecordUsage
	*
	* @param qualifier — a string that identifies the limited resource accessor (for example the user id)
	* @deprecated
	*/
	async isQuotaExceeded(qualifier) {
		return this.isQuotaExceededOrRecordUsage(qualifier);
	}
	/* c8 ignore next because this method was renamed and is now deprecated */
	/**
	* Checks if quota is exceeded. If not — records usage time in the backend database.
	*
	* @param qualifier — a string that identifies the limited resource accessor (for example the user id)
	* @deprecated
	*/
	async isQuotaExceededOrRecordUsage(qualifier) {
		return await this.genericRateLimiter.isQuotaExceededOrRecordCall(qualifier || FirebaseFunctionsRateLimiter.DEFAULT_QUALIFIER);
	}
	/* c8 ignore next because this method was renamed and is now deprecated */
	/**
	* Checks if quota is exceeded. If not — records usage time in the backend database and then
	* is rejected with functions.https.HttpsError (this is the type of error that can be caught when
	* firebase function is called directly: see https://firebase.google.com/docs/functions/callable)
	* The method is deprecated as it was renamed to rejectOnQuotaExceededOrRecordUsage
	*
	* @param qualifier  — a string that identifies the limited resource accessor (for example the user id)
	* @deprecated
	*/
	async rejectOnQuotaExceeded(qualifier) {
		await this.rejectOnQuotaExceededOrRecordUsage(qualifier);
	}
	/**
	* Checks if quota is exceeded. If not — records usage time in the backend database and then
	* is rejected with functions.https.HttpsError (this is the type of error that can be caught when
	* firebase function is called directly: see https://firebase.google.com/docs/functions/callable)
	*
	* @param qualifier (optional) — a string that identifies the limited resource accessor (for example the user id)
	* @param errorFactory (optional) — when errorFactory is provided, it is used to obtain
	*                                  error that is thrown in case of exceeded limit.
	*/
	async rejectOnQuotaExceededOrRecordUsage(qualifier, errorFactory) {
		if (await this.genericRateLimiter.isQuotaExceededOrRecordCall(qualifier || FirebaseFunctionsRateLimiter.DEFAULT_QUALIFIER)) if (errorFactory) throw errorFactory(this.getConfiguration());
		else throw this.constructRejectionError(qualifier);
	}
	/**
	* Checks if quota is exceeded. If not — DOES NOT RECORD USAGE. It only checks if limit was
	* previously exceeded or not.
	* @param qualifier — a string that identifies the limited resource accessor (for example the user id)
	*/
	async isQuotaAlreadyExceeded(qualifier) {
		return await this.genericRateLimiter.isQuotaAlreadyExceededDoNotRecordCall(qualifier || FirebaseFunctionsRateLimiter.DEFAULT_QUALIFIER);
	}
	/**
	* Returns this rate limiter configuration
	*/
	getConfiguration() {
		return this.configurationFull;
	}
	constructRejectionError(qualifier) {
		const c = this.configurationFull;
		return new HttpsError("resource-exhausted", `FirebaseFunctionsRateLimiter error: Limit of ${c.maxCalls} calls per ${c.periodSeconds} seconds exceeded for ${qualifier ? "specified qualifier in " : ""}limiter ${c.name}`);
	}
	constructDebugFn(config) {
		/* c8 ignore if */
		if (config.debug) return (msg) => console.log(msg);
		else return (msg) => {};
	}
};

//#endregion
//#region src/index.ts
var src_default = FirebaseFunctionsRateLimiter;

//#endregion
export { FirebaseFunctionsRateLimiter, LimiterConfig, src_default as default };