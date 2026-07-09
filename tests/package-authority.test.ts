import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readText = (path: string) => readFile(path, 'utf8');

// Extract the version declared inside the top-level module() call of MODULE.bazel.
// Scoped to the module() block so bazel_dep(..., version = ...) lines cannot match.
const extractModuleVersion = (moduleBazel: string): string => {
  const moduleBlock = moduleBazel.match(/module\(([\s\S]*?)\)/);
  if (!moduleBlock) {
    throw new Error('module() declaration not found in MODULE.bazel');
  }
  const version = moduleBlock[1].match(/version\s*=\s*"([^"]+)"/);
  if (!version) {
    throw new Error('version attribute not found in the module() declaration');
  }
  return version[1];
};

// Extract the version declared inside the npm_package() target of BUILD.bazel.
const extractNpmPackageVersion = (buildBazel: string): string => {
  const pkgBlock = buildBazel.match(/npm_package\(([\s\S]*?)\n\)/);
  if (!pkgBlock) {
    throw new Error('npm_package() target not found in BUILD.bazel');
  }
  const version = pkgBlock[1].match(/version\s*=\s*"([^"]+)"/);
  if (!version) {
    throw new Error('version attribute not found in the npm_package() target');
  }
  return version[1];
};

describe('package release authority', () => {
  it('keeps the packaged version aligned with the MODULE.bazel SSOT', async () => {
    const moduleBazel = await readText('MODULE.bazel');
    const buildBazel = await readText('BUILD.bazel');
    const packageJson = JSON.parse(await readText('package.json')) as { version?: string };

    const moduleVersion = extractModuleVersion(moduleBazel);
    const packagedVersion = extractNpmPackageVersion(buildBazel);

    // MODULE.bazel is the version authority. The npm_package() target and the
    // package.json manifest must both agree with it, or a release ships a
    // version that disagrees with the Bazel-registry SSOT and the git tag.
    expect(packagedVersion).toBe(moduleVersion);
    expect(packageJson.version).toBe(moduleVersion);
  });
});
