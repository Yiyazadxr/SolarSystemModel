## Summary

<!-- What changed, and why? Link the issue if there is one. -->

## Type

- [ ] Bug fix
- [ ] Visual / rendering
- [ ] Simulation or astronomical data
- [ ] Teaching content
- [ ] Performance
- [ ] Docs / build
- [ ] Refactor

## Test plan

<!-- Paste the result of the check scripts. State which environments you actually tested. -->

- [ ] `node scripts/check-syntax.js`
- [ ] `node scripts/check-offline.js`
- [ ] `node scripts/check-es5.js` (if script code changed)
- [ ] `node scripts/check-teach-data.js` (if teaching data changed)
- [ ] `node scripts/check-assets.js` / `check-doc-counts.js` (if assets or layout changed)
- [ ] `file://` still opens and runs
- [ ] Verified in: <!-- browser · OS · quality tier · #seed= -->

## Safety

- [ ] ES5 only; per-frame code does not allocate
- [ ] No external asset, font or network call was added
- [ ] Generated files were rebuilt with the scripts, not hand-edited
- [ ] `assets/vendor/` was not modified

## Screenshots

<!-- Before / after for visual changes, with the seed, browser and quality tier. -->
