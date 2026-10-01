# Getting started

## Requirements and compatibility

- Node.js 22 or newer.
- `firebase-admin` 13 or 14.
- `firebase-functions` 6 or 7.

The package uses modular Firebase Admin SDK entry points. The limiter works with both first-generation and second-generation functions. The function generation is selected by the imports and deployment configuration in your application.

## Installation

```bash
npm install firebase-functions-rate-limiter firebase-admin firebase-functions
```

The package provides ESM and CommonJS exports:

```ts
import { FirebaseFunctionsRateLimiter } from 'firebase-functions-rate-limiter'
```

```js
const { FirebaseFunctionsRateLimiter } = require('firebase-functions-rate-limiter')
```

Use one module style per application. Initialize the Admin SDK once at module scope:

```ts
import { initializeApp } from 'firebase-admin/app'

initializeApp()
```

## Choosing a backend

### Realtime Database

```ts
import { getDatabase } from 'firebase-admin/database'

const limiter = FirebaseFunctionsRateLimiter.withRealtimeDbBackend(
  configuration,
  getDatabase(),
)
```

Records are stored below `/<name>/<qualifier>`. Realtime Database transactions serialize concurrent updates for the same qualifier.

### Firestore

```ts
import { getFirestore } from 'firebase-admin/firestore'

const limiter = FirebaseFunctionsRateLimiter.withFirestoreBackend(
  configuration,
  getFirestore(),
)
```

Records are stored in the `/<name>/<qualifier>` collection/document path and updated in a Firestore transaction. The library does not query across the collection, so no Firestore index is required.

### Mock backend

Use the in-memory backend for unit tests:

```ts
const limiter = FirebaseFunctionsRateLimiter.mock({
  maxCalls: 2,
  periodSeconds: 60,
})
```

## Per-user callable functions

Pass a stable qualifier to maintain independent usage for each user:

```ts
import { HttpsError, onCall } from 'firebase-functions/v1/https'

export const limitedCallable = onCall(async (_data, context) => {
  const uid = context.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required')
  }

  const exceeded = await limiter.isQuotaExceededOrRecordUsage(`user:${uid}`)
  if (exceeded) {
    throw new HttpsError('resource-exhausted', 'Try again later')
  }

  return { result: 'Request accepted' }
})
```

Qualifiers can represent users, organizations, API keys, routes, or any other independently limited resource. Prefixing them by category, such as `user:123` or `organization:123`, prevents accidental collisions.

## Configuration

All configuration fields are optional. Defaults are applied and validated when the limiter is created.

| Option | Type | Default | Description |
| --- | --- | ---: | --- |
| `name` | `string` | `rlimit` | Collection or Realtime Database path for limiter records. |
| `periodSeconds` | `number` | `300` | Rate-limit window in seconds. Must be a positive integer. |
| `maxCalls` | `number` | `5` | Maximum calls allowed in the window. Must be a positive integer. |
| `debug` | `boolean` | `false` | Enables persistence debug logging. |

```ts
const configuration = {
  name: 'my_limiter',
  periodSeconds: 60,
  maxCalls: 10,
  debug: false,
}
```

Each qualifier has its own counter. Limiters that share a backend and `name` can address the same records, so use distinct names when policies should be independent.

## Testing

The mock backend avoids Firebase services in unit tests:

```ts
const limiter = FirebaseFunctionsRateLimiter.mock({
  maxCalls: 2,
  periodSeconds: 60,
})

expect(await limiter.isQuotaExceededOrRecordUsage('test-user')).toBe(false)
```

The repository’s integration tests use the Firebase Local Emulator Suite for Realtime Database and Firestore.

## Firebase configuration and security

The library has no separate Firebase configuration. Initialize the Admin SDK according to the deployment environment, then pass the database client to a factory. The library only accesses the configured collection or path and does not search the database.

Configure Firebase security rules, credentials, and deployment settings according to your application and runtime needs.

## Operational guidance

- Create the limiter once at module scope so warm function instances can reuse it.
- Keep names and qualifier formats stable across deployments.
- Keep the persistence backend near the functions’ region when possible.
- Decide whether backend failures should fail closed or fail open for your application.
- Keep the check-and-record method as one operation; splitting it into separate checks and writes introduces a race between concurrent invocations.

