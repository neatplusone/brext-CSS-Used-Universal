#!/usr/bin/env node
// Builds dist/, which loads in both browsers, then a copy for each browser
// with the manifest keys only the other browser reads removed.
//
//   node build.js [firefox] [chrome] [--package]
//
// dist-firefox/, dist-chrome/ and with --package web-ext-artifacts/*.zip
import { execFileSync } from 'child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DIST = join(ROOT, 'dist')
const ARTIFACTS = join(ROOT, 'web-ext-artifacts')

const TRANSFORMS = {
  firefox(manifest) {
    delete manifest.minimum_chrome_version
    delete manifest.background.service_worker
  },
  chrome(manifest) {
    delete manifest.browser_specific_settings
    delete manifest.background.scripts
  },
}

const args = process.argv.slice(2)
const doPackage = args.includes('--package')
const targets = args.filter((arg) => arg !== '--package')
for (const target of targets) {
  if (!TRANSFORMS[target]) {
    console.error(`Unknown argument: ${target}`)
    process.exit(1)
  }
}
if (targets.length === 0) {
  targets.push('firefox', 'chrome')
}

function run(command, commandArgs) {
  execFileSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    // vite.config.content.js needs LANG to be set
    env: { LANG: 'C.UTF-8', ...process.env },
  })
}

function buildTarget(target) {
  const out = join(ROOT, `dist-${target}`)
  rmSync(out, { recursive: true, force: true })
  cpSync(DIST, out, { recursive: true })

  const manifestPath = join(out, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  TRANSFORMS[target](manifest)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`-> dist-${target}/`)

  if (doPackage) {
    if (target === 'firefox') {
      run('npx', ['web-ext', 'lint', '-s', out])
    }
    const filename = `css-used-universal-${manifest.version}-${target}.zip`
    run('npx', [
      'web-ext',
      'build',
      '-s',
      out,
      '-a',
      ARTIFACTS,
      '-n',
      filename,
      '--overwrite-dest',
    ])
    console.log(`-> web-ext-artifacts/${filename}`)
  }
}

run('npm', ['run', 'build:dist'])
targets.forEach(buildTarget)
