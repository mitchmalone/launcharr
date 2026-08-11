import releaseJson from './release.json'

/**
 * Release facts flow FROM the app repo: `release.json` is written by
 * `launcharr/scripts/release.sh` and must never be hand-edited. Everything the
 * site says about versions, artifacts, and install methods derives from it.
 */
export interface ReleaseArtifact {
  url: string
  sha256: string
}

export interface Release {
  version: string
  date: string
  signed: boolean
  artifacts: { zip: ReleaseArtifact; dmg: ReleaseArtifact } | null
}

export const RELEASE = releaseJson as Release
export const VERSION = `v${RELEASE.version}`
export const GITHUB_URL = 'https://github.com/mitchmalone/launcharr'
export const RELEASES_URL = `${GITHUB_URL}/releases`

export const BREW_COMMAND = 'brew install mitchmalone/tap/launcharr'

export const SOURCE_INSTALL_COMMANDS = [
  'git clone git@github.com:mitchmalone/launcharr.git',
  'cd launcharr',
  'pnpm install',
  'pnpm tauri build',
  'cp -R src-tauri/target/release/bundle/macos/launcharr.app /Applications/',
  'open /Applications/launcharr.app',
]
