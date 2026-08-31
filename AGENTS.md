# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Shipping — two paths, and how to tell which one you are on

`git push origin main` runs CI and, if it passes, publishes an **over-the-air
JavaScript update** (`.github/workflows/ci.yml`, `publish` job). Testers get it on
their next two app launches. No Xcode, no TestFlight, no Apple review.

**That covers JavaScript only.** Some changes cannot travel over the air and need a
local Xcode archive, a TestFlight upload, and every tester to reinstall. Nick's
default assumption is that pushing to main ships the change, so if it does not,
**say so explicitly in the same reply that makes the change** — a change that
quietly needs a rebuild looks shipped and is not.

## STOP and tell Nick before pushing if the change touches any of these

- **A new dependency with native code** — any `expo-*`, `react-native-*`, or
  package that requires `pod install`. Pure-JS deps are fine.
- **Removing a native dependency**, same reason.
- **Expo SDK or React Native version changes.**
- **`app.json` native keys**: `version`, `ios.*`, `android.*`, `plugins`, `scheme`,
  `icon`, `splash`, `orientation`, `userInterfaceStyle`, permissions, entitlements,
  anything under `updates`.
- **Anything that changes what `npx expo prebuild` generates.** If you are unsure,
  that is the test: if prebuild would write a different `ios/` project, it needs a
  rebuild.
- **New native permission prompts** (camera, location, notifications…). The Info.plist
  usage strings are native.

Everything else — screens, components, hooks, navigation, styling, copy, scoring
logic, Supabase queries, edge functions — ships on a push.

## Three rules that fail silently

1. **Never change `expo.version`** casually. `runtimeVersion` follows it
   (`{"policy": "appVersion"}`), and an update only lands on builds whose runtime
   version matches. Bumping it **strands every existing install** — no error, updates
   simply stop arriving. Bump `ios.buildNumber` instead when a new binary is needed,
   and treat a `version` change as a deliberate "everyone reinstalls" decision.
2. **A new `EXPO_PUBLIC_` var must be added in two places.** Local Xcode builds read
   `.env.local`; `eas update` reads EAS environment variables. Miss the second and
   OTA updates ship with the var missing while local builds keep working:
   `eas env:set --name X --value Y --environment production --visibility plaintext --scope project`
3. **`ios.buildNumber` must be unique per upload.** Apple rejects duplicates
   outright. Xcode's Distribute flow can also auto-increment behind your back, so
   confirm against App Store Connect rather than trusting `app.json`.

## The rebuild path, when it is unavoidable

`ios/` is gitignored and regenerated. `prebuild` **wipes `DEVELOPMENT_TEAM`**, which
is what causes the "Your team has no devices" provisioning failure — restore it after.

```
npx expo prebuild --platform ios --clean          # LANG=en_US.UTF-8 for CocoaPods
# restore DEVELOPMENT_TEAM = PD9A6Z3BV6 in ios/YapFantasy.xcodeproj/project.pbxproj
xcodebuild -workspace ios/YapFantasy.xcworkspace -scheme YapFantasy \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath <path>.xcarchive -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath <path>.xcarchive \
  -exportOptionsPlist <opts>.plist -exportPath <dir> -allowProvisioningUpdates
```

Copy the archive into `~/Library/Developer/Xcode/Archives/<date>/` or Xcode's
Organizer will not list it. Nick uploads from Organizer — that step needs his Apple
credentials and cannot be automated here.

Publishing an OTA update by hand (CI does this automatically on push):

```
eas update --branch production --message "..." --environment production --platform ios --non-interactive
```

`--platform ios` is load-bearing: `platform=all` static-renders web in Node, which
executes `src/lib/supabase.ts` and dies on missing env.

# Working two sessions at once

Two Claude sessions in this one checkout share one set of files. The second
write wins and the first session's edits vanish — no conflict, no warning,
because there is nothing to merge. It is one pile.

`npm run lane` gives each session its own git worktree and branch, then blends
them back through git and gates the result before it ships.

```
npm run lane -- new recap      # branch + worktree, node_modules cloned (~10s)
npm run lane -- list           # every lane and what it has waiting
npm run lane -- land           # merge all lanes into main, gate, ready to push
npm run lane -- land --push    # …and push when green
npm run lane -- drop recap     # remove a landed lane
```

Lanes live in `../yap-fantasy-lanes/<name>` — outside the repo deliberately, so
Metro does not walk them and find two copies of every package. `node_modules` is
an APFS copy-on-write clone, so it is seconds and costs almost no disk.
`.env.local` is symlinked, so a new `EXPO_PUBLIC_` var reaches every lane at once
(the EAS half of rule 2 above is still on you).

What `land` refuses to do, and why:

- **Dirty main, or a lane with uncommitted work.** It merges commits; anything
  uncommitted would be silently left out of the push.
- **Two migrations sharing a timestamp**, or a merged migration sorting before
  one already on `main`. Both lanes reach for the same slot on the same day, and
  the loser is shadowed with no error at `db push` time. Renumber and re-land.
- **A blend that fails `npm test`.** Git merging the text cleanly is not the same
  as the result working — each lane can pass alone and fail together. This is
  CI's `check` job run *before* the push, because a green push reaches testers'
  phones as an OTA update.

On conflict the merge is left in progress with the conflicted files named; open a
session in the main checkout and resolve it there.

**Lanes are for JavaScript.** `ios/` is not cloned. Anything on the STOP list
above still needs an Xcode archive from the main checkout.
