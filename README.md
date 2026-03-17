# YouTube Music

Standalone third-party data source plugin for Compass Music.

## Plugin ID

`com.compass.youtube-music`

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## Loading in Compass Music

Build the plugin so `dist/index.js` exists, then load or install this directory in Compass Music as an external plugin.
## Private SDK dependency

This plugin depends on `@uchi-box/compass-plugin-sdk` from GitHub Packages.

Set `GITHUB_PACKAGES_TOKEN` before installing dependencies:

```bash
export GITHUB_PACKAGES_TOKEN=<token-with-read-packages>
pnpm install
```

