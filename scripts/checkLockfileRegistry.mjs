#!/usr/bin/env node
/**
 * Fails when a lockfile resolves tarballs from a registry other than the public one.
 *
 * `npm install` writes the registry host of the machine that generated the
 * lockfile into every `resolved` URL. When that machine points at a private
 * mirror (an internal Artifactory, say), every later install fetches from a host
 * nobody else can reach and hangs on connection resets. Regenerate the lockfile
 * against the public registry instead of editing host names by hand.
 */
import fs from 'node:fs';

const DEFAULT_LOCKFILE_PATHS = ['package-lock.json', 'website/package-lock.json'];
const ALLOWED_REGISTRY_HOSTS = ['registry.npmjs.org'];
const NETWORK_PROTOCOL = /^https?:\/\//;
const ALLOWED_TARBALL_PREFIXES = ALLOWED_REGISTRY_HOSTS.map((host) => `https://${host}/`);

const lockfilePaths = process.argv.slice(2);
const pathsToCheck = lockfilePaths.length > 0 ? lockfilePaths : DEFAULT_LOCKFILE_PATHS;

const failures = [];
let checkedCount = 0;

for (const lockfilePath of pathsToCheck) {
  if (!fs.existsSync(lockfilePath)) {
    continue;
  }
  const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  for (const [packagePath, packageEntry] of Object.entries(lockfile.packages ?? {})) {
    const resolved = packageEntry?.resolved;
    if (typeof resolved !== 'string' || !NETWORK_PROTOCOL.test(resolved)) {
      continue;
    }
    checkedCount += 1;
    if (!ALLOWED_TARBALL_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
      failures.push(`${lockfilePath}: ${packagePath || '(root)'} -> ${resolved}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Lockfiles resolve packages from a registry other than the public one:');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    `Expected every tarball to come from ${ALLOWED_REGISTRY_HOSTS.join(', ')}. ` +
      'Regenerate the lockfile with `npm install --registry https://registry.npmjs.org/` ' +
      'after clearing the private registry from your npm config.',
  );
  process.exit(1);
}

console.log(
  `checkLockfileRegistry: ${checkedCount} resolved tarballs all come from ${ALLOWED_REGISTRY_HOSTS.join(', ')}`,
);
