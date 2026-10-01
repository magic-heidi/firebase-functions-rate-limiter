# API reference

`FirebaseFunctionsRateLimiter` provides a small API around a persistence provider. The public methods are safe to call from Firebase HTTP, callable, event-driven, first-generation, or second-generation functions.

## Import

```ts
import { FirebaseFunctionsRateLimiter } from '@magic-heidi/firebase-functions-rate-limiter'
```

The package also provides a default export and CommonJS exports.

## Creating a limiter

Every factory accepts a partial `LimiterConfig` and returns a configured limiter. Configuration is validated when the limiter is created; invalid values throw immediately.

### `withRealtimeDbBackend(configuration, database)`

Creates a limiter backed by Firebase Realtime Database.

```ts
FirebaseFunctionsRateLimiter.withRealtimeDbBackend(
  {
    name: 'request_limits',
    periodSeconds: 60,
    maxCalls: 10,
  },
  getDatabase(),
)
```

Realtime Database stores each record below `/<name>/<qualifier>`. This backend uses a Realtime Database transaction, so concurrent calls for the same qualifier are serialized by the database.

### `withFirestoreBackend(configuration, firestore)`

Creates a limiter backed by Cloud Firestore.

```ts
FirebaseFunctionsRateLimiter.withFirestoreBackend(
  {
    name: 'request_limits',
    periodSeconds: 60,
    maxCalls: 10,
  },
  getFirestore(),
)
```

Firestore stores each record in the `/<name>/<qualifier>` collection/document path and updates it in a Firestore transaction. The library does not query across the collection, so it does not require a Firestore index.

### `mock(configuration?, persistenceProvider?)`

Creates a limiter using the in-memory persistence provider. This is intended for unit tests and local logic tests, not production traffic.

```ts
const limiter = FirebaseFunctionsRateLimiter.mock({
  periodSeconds: 60,
  maxCalls: 2,
})
```

The optional persistence provider is useful when testing a custom provider implementation. The mock factory defaults to a ten-second period and an effectively unlimited call count when no configuration is supplied.

## Configuration

The configuration input is a partial object. Defaults are applied before validation:

| Property | Type | Default | Constraints |
| --- | --- | ---: | --- |
| `name` | `string` | `rlimit` | Must not be empty. |
| `periodSeconds` | `number` | `300` | Must be a positive integer. |
| `maxCalls` | `number` | `5` | Must be a positive integer. |
| `debug` | `boolean` | `false` | Enables persistence debug logging. |

```ts
type LimiterConfigInput = {
  name?: string
  periodSeconds?: number
  maxCalls?: number
  debug?: boolean
}
```

`name` is shared by all qualifiers for a limiter. If two limiters use the same backend and name, they can address the same records, so use distinct names when their policies should be independent.

## Qualifiers

A qualifier identifies the subject whose calls should be counted. The limiter uses `default_qualifier` when no qualifier is supplied.

```ts
await limiter.isQuotaExceededOrRecordUsage(`user:${uid}`)
await limiter.isQuotaExceededOrRecordUsage(`api-key:${keyId}`)
```

Use a stable, deterministic string. Qualifiers are used as database path/document identifiers, so avoid empty values and avoid including untrusted path separators or characters that are invalid for your selected backend. Prefixing values by category helps prevent collisions, for example `user:123` and `organization:123`.

Each qualifier has its own counter. Calls made with different qualifiers do not contribute to each other’s limit.

## Methods

### `isQuotaExceededOrRecordUsage(qualifier?): Promise<boolean>`

Atomically checks the recent usage for the qualifier and records a new usage when the limit has not been reached.

- Resolves to `false` when the call is allowed and has been recorded.
- Resolves to `true` when the limit is already reached; no new usage is recorded.
- Removes usage timestamps older than `periodSeconds` during the update.
- Uses `default_qualifier` when `qualifier` is omitted, `undefined`, or an empty string.

```ts
const exceeded = await limiter.isQuotaExceededOrRecordUsage(`user:${uid}`)
if (exceeded) {
  // Reject or otherwise handle the request.
}
```

The check and record operation must remain one call. Splitting it into a separate check and write introduces a race between concurrent function invocations.

### `rejectOnQuotaExceededOrRecordUsage(qualifier?, errorFactory?): Promise<void>`

Performs the same atomic check-and-record operation as `isQuotaExceededOrRecordUsage()`.

- Resolves with `undefined` when the call is allowed.
- Throws a Firebase `HttpsError` with code `resource-exhausted` when the limit is exceeded.
- Does not record usage for a rejected call.
- Uses the supplied `errorFactory` instead of creating an `HttpsError` when one is provided.

The error factory receives the complete validated configuration:

```ts
await limiter.rejectOnQuotaExceededOrRecordUsage(`user:${uid}`, (config) => {
  return new Error(
    `Limit of ${config.maxCalls} calls per ${config.periodSeconds} seconds exceeded`,
  )
})
```

Use the default error for Firebase callable functions when clients should receive a standard Firebase error. Use `errorFactory` when an application-specific error type or message is required.

### `isQuotaAlreadyExceeded(qualifier?): Promise<boolean>`

Checks whether the qualifier is currently over its limit without recording a usage.

- Resolves to `true` when the limit is reached.
- Resolves to `false` when the limit is not reached.
- Does not modify the stored record.

This method is useful when the application needs to inspect quota state before deciding what to do. It is not a replacement for `isQuotaExceededOrRecordUsage()` when the current call should count.

### `getConfiguration(): LimiterConfig.Schema`

Returns the complete validated configuration, including defaults:

```ts
const config = limiter.getConfiguration()
// { name, periodSeconds, maxCalls, debug }
```

The returned object describes the limiter created at construction time. The configuration cannot be changed through the public API; create another limiter for a different policy.

## Deprecated methods

The following methods are retained for compatibility:

- `isQuotaExceeded(qualifier?)`: use `isQuotaExceededOrRecordUsage()`.
- `rejectOnQuotaExceeded(qualifier?)`: use `rejectOnQuotaExceededOrRecordUsage()`.

They delegate to the corresponding current methods and should not be used in new code.

## Persistence and failure behavior

The limiter depends on the selected Firebase client for connectivity, authentication, retries, and transaction behavior. Persistence or configuration errors are not converted into quota results; they reject the returned promise and should be handled according to the function’s error policy.

For production use:

- Create the limiter once at module scope so warm function instances can reuse it.
- Use a stable `name` and qualifier format across deployments.
- Keep the limiter’s backend in the same region or latency boundary as the functions when possible.
- Decide whether backend failures should fail closed or fail open for your application.
