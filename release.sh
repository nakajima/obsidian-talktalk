#!/usr/bin/env bash
#
# Release the plugin: bump manifest.json + package.json, test, build,
# commit, tag, and push. The tag push triggers .github/workflows/release.yml,
# which validates that tag == manifest version == package version and
# publishes the release assets.
#
# Usage: ./release.sh <version|patch|minor|major>   e.g. ./release.sh 0.6.0

set -euo pipefail
cd "$(dirname "$0")"

bump="${1:-}"
if [[ -z "$bump" ]]; then
  echo "usage: $0 <version|patch|minor|major>" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "working tree is not clean; commit or stash changes first" >&2
  exit 1
fi

current="$(node -p "require('./manifest.json').version")"

if [[ "$bump" =~ ^(patch|minor|major)$ ]]; then
  IFS=. read -r major minor patch <<< "$current"
  case "$bump" in
    major) version="$((major + 1)).0.0" ;;
    minor) version="$major.$((minor + 1)).0" ;;
    patch) version="$major.$minor.$((patch + 1))" ;;
  esac
else
  version="$bump"
fi

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "invalid version: $version (expected X.Y.Z)" >&2
  exit 1
fi

if [[ "$version" == "$current" ]]; then
  echo "version $version is already current" >&2
  exit 1
fi

if git rev-parse "$version" >/dev/null 2>&1; then
  echo "tag $version already exists" >&2
  exit 1
fi

echo "releasing $current -> $version"

npm test
npm run build

node -e '
  const fs = require("fs");
  const version = process.argv[1];
  for (const file of ["manifest.json", "package.json"]) {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.version = version;
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  }
' "$version"

git add manifest.json package.json
git commit -m "Release $version"
git tag "$version"

branch="$(git rev-parse --abbrev-ref HEAD)"
git push origin "$branch"
git push origin "$version"

echo "released $version; watch the workflow with: gh run watch"
