# authenticated-image

> A drop-in `<img>` for images behind `Authorization` headers.

[![npm](https://img.shields.io/npm/v/@gyeonghokim/authenticated-image)](https://www.npmjs.com/package/@gyeonghokim/authenticated-image)
[![bundle size](https://img.shields.io/bundlejs/size/@gyeonghokim/authenticated-image)](https://bundlejs.com/?q=@gyeonghokim/authenticated-image)
[![release](https://github.com/GyeongHoKim/authenticated-image/actions/workflows/release.yml/badge.svg)](https://github.com/GyeongHoKim/authenticated-image/actions/workflows/release.yml)
[![license](https://img.shields.io/npm/l/@gyeonghokim/authenticated-image)](LICENSE)

`<img src>` can't send an `Authorization` header. `<authenticated-image>` fetches the image with your token, displays it, and cleans up after itself. It is a Web Component, so it works in any framework, and it ships a React wrapper.

## Before / After

**Before:** fetch the image yourself and manage the object URL.

```js
const img = document.querySelector('img');

fetch('/api/avatar', { headers: { Authorization: `Bearer ${token}` } })
  .then((res) => {
    if (!res.ok) throw new Error(res.statusText);
    return res.blob();
  })
  .then((blob) => {
    img.src = URL.createObjectURL(blob);
  });

// Still to do: abort when src changes, revoke the URL on unmount,
// lazy-load, dedupe repeated images, show errors...
```

**After:** configure the token once and use the tag.

```js
import { configure } from '@gyeonghokim/authenticated-image';

configure({
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
});
```

```html
<authenticated-image src="/api/avatar" alt="Avatar"></authenticated-image>
```

## Install

```sh
npm install @gyeonghokim/authenticated-image
# or
pnpm add @gyeonghokim/authenticated-image
```

## Quick start

```js
// main.js: run once when your app starts
import { configure } from '@gyeonghokim/authenticated-image';

configure({
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});
```

```html
<authenticated-image src="/api/invoices/42/scan" alt="Invoice scan" loading="lazy" width="320" height="240">
  <span slot="loading">Loading…</span>
  <span slot="error">Could not load the image.</span>
</authenticated-image>
```

Importing the package registers the `<authenticated-image>` tag.

## Features

- Sends your `Authorization` header, or loads through your own HTTP client (axios, ky, …).
- Cancels stale requests when `src` changes and revokes object URLs when removed.
- `loading="lazy"`, starting 200px before the element enters the viewport.
- One request for an image shown many times on the page.
- `loading` and `error` slots, plus a `status` attribute for styling.
- Presigned URLs, refreshed once if they fail to load.
- Works in any framework, with a React wrapper included.

## Usage

### React

```tsx
'use client';

import { useRef } from 'react';
import {
  AuthenticatedImage,
  type AuthenticatedImageElement,
} from '@gyeonghokim/authenticated-image/react';

export function Avatar({ userId }: { userId: string }) {
  const ref = useRef<AuthenticatedImageElement>(null);

  return (
    <AuthenticatedImage
      ref={ref}
      src={`/api/users/${userId}/avatar`}
      alt="Avatar"
      loading="lazy"
      onError={(event) => console.warn(event.detail.error.status)}
    >
      <span slot="loading">Loading…</span>
      <button slot="error" type="button" onClick={() => ref.current?.reload()}>
        Retry
      </button>
    </AuthenticatedImage>
  );
}
```

`configure` and `clearCache` are also exported from `@gyeonghokim/authenticated-image/react`. Works with React 18 and 19.

With SSR, the server renders an empty `<authenticated-image>` tag, and the image loads in the browser after hydration.

### Reuse your HTTP client

Pass a `fetcher` to keep your interceptors, token refresh and retries.

```ts
import axios from 'axios';
import { configure } from '@gyeonghokim/authenticated-image';

const api = axios.create({ baseURL: '/api' }); // your client with auth interceptors

configure({
  fetcher: async (src, { signal }) => {
    const response = await api.get<Blob>(src, { responseType: 'blob', signal });
    return response.data;
  },
});
```

With [ky](https://github.com/sindresorhus/ky): `fetcher: (src, { signal }) => api.get(src, { signal }).blob()`.

### Presigned URLs

Return a string instead of a `Blob`, and it is used as `img.src` as-is.

```ts
configure({
  fetcher: async (src, { signal }) => {
    const response = await api.get<{ url: string }>(`${src}/presign`, { signal });
    return response.data.url;
  },
});
```

If a presigned URL fails to load, for example because it expired, the element asks your `fetcher` for a new one once.

### Loading and error states

Use the `loading` and `error` slots, or style the `status` attribute (`idle`, `loading`, `loaded`, `error`).

```css
authenticated-image[status="error"] {
  outline: 2px solid crimson;
}
```

### Styling

The inner `<img>` sizes itself like a normal `<img>`. To fill a fixed-size box:

```css
authenticated-image {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  --authenticated-image-object-fit: cover;
}

authenticated-image::part(img) {
  width: 100%;
  height: 100%;
}
```

The host is an `inline-grid` that stacks the image and the slots in one cell. If you change its `display`, use `grid` or `inline-grid`.

### Per-element settings

Set `fetcher` or `headers` on one element to override the global configuration. These elements don't use the shared cache.

```js
document.querySelector('#public-preview').headers = {};
```

Changing `fetcher` or `headers` doesn't refetch, so passing a new inline object on every React render is fine. The new value takes effect on the next load, when `src` changes. Call `reload()` to apply it immediately.

### Logging out

```js
import { clearCache } from '@gyeonghokim/authenticated-image';

await logout();
clearCache();
```

Images already on screen stay visible. New elements fetch again. Calling `configure()` also clears the cache.

## API

### Attributes

| Name              | Type                          | Default   | Description                                                             |
| ----------------- | ----------------------------- | --------- | ----------------------------------------------------------------------- |
| `src`             | `string`                      | `''`      | Image URL. Changing it cancels the current request.                     |
| `alt`             | `string`                      | `''`      | Alternative text for the inner `<img>`.                                 |
| `loading`         | `'eager' \| 'lazy'`           | `'eager'` | `lazy` starts the request 200px before the element enters the viewport. |
| `width`, `height` | `number`                      |           | Forwarded to the inner `<img>` to reserve space.                        |
| `decoding`        | `'async' \| 'sync' \| 'auto'` | `'async'` | Forwarded to the inner `<img>`.                                         |

### Properties

| Name       | Type                                         | Description                                             |
| ---------- | -------------------------------------------- | ------------------------------------------------------- |
| `fetcher`  | `Fetcher`                                    | Loads this element's image. Bypasses the cache.         |
| `headers`  | `HeadersProvider`                            | Headers for this element's request. Bypasses the cache. |
| `status`   | `'idle' \| 'loading' \| 'loaded' \| 'error'` | Read-only. Mirrored to the `status` attribute.          |
| `error`    | `AuthenticatedImageError \| undefined`       | Read-only. Why the last load failed.                    |
| `reload()` | `() => void`                                 | Loads the image again, skipping the cached copy.        |

### Events

| Name    | Type                                              | When                               |
| ------- | ------------------------------------------------- | ---------------------------------- |
| `load`  | `Event`                                           | The image is decoded and rendered. |
| `error` | `CustomEvent<{ error: AuthenticatedImageError }>` | The request or decoding failed.    |

### Slots, parts and custom properties

| Name                               | Kind            | Description                                        |
| ---------------------------------- | --------------- | -------------------------------------------------- |
| `loading`                          | slot            | Shown while loading or waiting to lazy-load.       |
| `error`                            | slot            | Shown after a failure.                             |
| `img`                              | part            | The inner `<img>`.                                 |
| `--authenticated-image-object-fit` | custom property | `object-fit` of the inner `<img>`. Default `fill`. |

### Functions

| Name                | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `configure(config)` | Replaces the global configuration and clears the cache. |
| `clearCache()`      | Clears the shared cache.                                |

```ts
type Fetcher = (src: string, context: { signal: AbortSignal }) => Promise<Blob | string>;
type HeadersProvider = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

interface AuthenticatedImageConfig {
  fetcher?: Fetcher; // takes precedence over headers
  headers?: HeadersProvider;
  cache?: { retainMs?: number }; // default 30000
}

class AuthenticatedImageError extends Error {
  readonly src: string;
  readonly status?: number; // HTTP status from the default fetch
  // `cause` holds the original error
}
```

Also exported: `AuthenticatedImageElement`, `AuthenticatedImageStatus`, `AuthenticatedImageErrorEvent` and `AuthenticatedImageErrorOptions`.

Precedence: element `fetcher` › element `headers` › global `fetcher` › global `headers`.

## Security

`configure({ headers })` sends your token to every `src`, including other origins. If `src` can come from untrusted input, use a `fetcher` that checks the origin:

```ts
configure({
  fetcher: async (src, { signal }) => {
    const url = new URL(src, location.href);
    if (url.origin !== location.origin) {
      throw new Error(`Refusing to send the token to ${url.origin}`);
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await getToken()}` },
      signal,
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return response.blob();
  },
});
```

A cross-origin API must allow the header through CORS: `Access-Control-Allow-Headers: Authorization`.

## Caching

Elements that use the global configuration share an in-memory cache keyed by `src`. An image stays in memory for `retainMs` (30 seconds by default) after the last element using it disconnects, so scrolling back or switching routes is instant. Nothing is written to disk. For caching across page loads, send `Cache-Control: private, max-age=…` from your server, and the browser HTTP cache handles it.

## Browser support

Chrome, Edge, Firefox and Safari released in the last two years. CI tests Chromium, Firefox and WebKit.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © GyeongHo Kim
