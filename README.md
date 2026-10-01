# Firebase Functions Rate Limiter

[![npm](https://img.shields.io/npm/v/%40magic-heidi%2Ffirebase-functions-rate-limiter.svg?style=flat-square)](https://www.npmjs.com/package/@magic-heidi/firebase-functions-rate-limiter)
[![Code coverage](https://img.shields.io/codecov/c/gh/magic-heidi/firebase-functions-rate-limiter?style=flat-square)](https://codecov.io/gh/magic-heidi/firebase-functions-rate-limiter)
[![License](https://img.shields.io/github/license/magic-heidi/firebase-functions-rate-limiter.svg?style=flat-square)](https://github.com/magic-heidi/firebase-functions-rate-limiter/blob/main/LICENSE)

Rate-limit Firebase Cloud Functions by user, resource, or any other qualifier. Usage records are stored in Realtime Database or Firestore and updated atomically.

## Quick start

Install the package and Firebase SDKs if they are not already present in your Functions project:

```bash
npm install @magic-heidi/firebase-functions-rate-limiter firebase-admin firebase-functions
```

Create one limiter at module scope and call it from your function:

```ts
import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { FirebaseFunctionsRateLimiter } from '@magic-heidi/firebase-functions-rate-limiter'
import { onRequest } from 'firebase-functions/v1/https'

initializeApp()

const limiter = FirebaseFunctionsRateLimiter.withRealtimeDbBackend(
  {
    name: 'http_rate_limit',
    maxCalls: 10,
    periodSeconds: 60,
  },
  getDatabase(),
)

export const limitedEndpoint = onRequest(async (_request, response) => {
  await limiter.rejectOnQuotaExceededOrRecordUsage()
  response.send('Request accepted')
})
```

`rejectOnQuotaExceededOrRecordUsage()` throws a Firebase `HttpsError` with code `resource-exhausted` when the limit is exceeded. Pass a qualifier, such as `user:${uid}`, to maintain an independent limit for each user or resource.

## Documentation

- [Getting started](docs/GETTING_STARTED.md): requirements, installation, backend selection, configuration, testing, and security.
- [API reference](docs/API.md): factories, methods, qualifiers, return values, errors, and persistence behavior.

## Credits

- Original project: [Jędrzej Lewandowski](https://github.com/Jblew/firebase-functions-rate-limiter)
- Updated fork: [Omgovich](https://github.com/omgovich/firebase-functions-rate-limiter)
- Current fork and maintenance: [Fahadul Islam](https://github.com/DaPotatoMan), under [Magic Heidi](https://github.com/magic-heidi)

## License

[MIT](https://github.com/magic-heidi/firebase-functions-rate-limiter/blob/main/LICENSE)
