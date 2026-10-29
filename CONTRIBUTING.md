# Contributing

## Setup

Requires Node 24 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm exec playwright install chromium
```

To run the WebKit tests too, install the browser with its system dependencies: `pnpm exec playwright install --with-deps` (or `sudo pnpm exec playwright install-deps` if the browsers are already installed).

## Scripts

| Command               | What it does                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm dev`            | Starts the demo page with a mock image API. The photos come from picsum.photos.                  |
| `pnpm test`           | Runs the tests in a real browser (Chromium). Set `BROWSERS=chromium,firefox,webkit` to run more. |
| `pnpm typecheck`      | Type-checks with TypeScript 7.                                                                   |
| `pnpm check`          | Lints and checks formatting with Biome. `pnpm format` fixes what it can.                         |
| `pnpm build`          | Builds `dist/` with tsdown.                                                                      |
| `pnpm typecheck:dist` | Type-checks the built `.d.mts` files in `dist/`. Run after `pnpm build`.                         |
| `pnpm lint:package`   | Checks the package's `exports` and published files with publint.                                 |

## Code style

Files loaded as config (`vite.config.ts`, `vitest.config.ts`, `dev/*.ts`) import with explicit `.ts` extensions, and `tsconfig.json` enables `allowImportingTsExtensions` for that. Imports in `src/` are extensionless.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/). Git hooks check formatting and the message before each commit.

```text
feat: add srcset support
fix(cache): revoke detached entries on release
docs: clarify presigned URL retries
```

`feat` releases a minor version, `fix` and `perf` a patch, and `feat!` or a `BREAKING CHANGE:` footer a major version.

## Releases

Merging into `main` runs [semantic-release](https://semantic-release.gitbook.io/). It picks the version from the commit messages, publishes to npm, updates `CHANGELOG.md` and creates a GitHub release. Don't bump the version by hand.
