# Translation Guide

Thank you for helping YumeShelf speak another language.

This guide is intentionally short. The goal is to let translators ship a pack with as little friction as possible.

## Quick Path

1. Copy [`language-packs/templates/en.sample.json`](language-packs/templates/en.sample.json) into a new file named after your language code.
2. Edit:
   - `code`
   - `englishName`
   - `nativeName`
   - `aliases`
   - `keywords`
   - `strings`
3. Keep the JSON shape exactly the same.
4. Translate the text values inside `strings`.
5. Leave placeholders like `{NAME}` or `{LANG}` exactly as they are.
6. Do not remove the `placeholders` array. Translate each line instead.
7. Open a pull request with:
   - your new pack file
   - one manifest entry in [`language-packs/manifest.json`](language-packs/manifest.json)

## Pack Format

Each language pack is a single JSON file.

Required top-level fields:

- `schemaVersion`
- `code`
- `englishName`
- `nativeName`
- `packVersion`
- `reviewedForAppVersion`
- `aliases`
- `keywords`
- `strings`

## Naming

- Use lowercase language codes when possible, like `vi`, `es`, `fr`.
- File name should match the code, for example `es.json`.

## Strings Rules

- Translate the value, not the key.
- Keep JSON valid.
- Keep placeholders unchanged:
  - `{LANG}`
  - `{NAME}`
- Keep punctuation if it affects tone.
- If you are unsure about slang or teasing lines, it is okay to soften them slightly as long as the playful voice remains.

## Minimal Contributor Checklist

- File loads as valid JSON.
- `strings.placeholders` is still an array.
- Core keys such as `title`, `settings`, `lang`, `welcome`, and `welcome_desc` are translated.
- Your language names are correct:
  - `englishName` is the English name
  - `nativeName` is how speakers of that language write it

## Manifest Step

Add one entry to [`language-packs/manifest.json`](language-packs/manifest.json):

- `code`
- `englishName`
- `nativeName`
- `packVersion`
- `minAppVersion`
- `reviewedForAppVersion`
- `aliases`
- `keywords`
- `downloadUrl`
- `sha256`

If you do not know how to generate `sha256`, you can still open the pull request and mention that the checksum needs to be filled in.

## Need Help?

If your language is not listed in the app yet, that is okay.

Open an issue or a pull request with your draft pack and say:

> New translation pack for `<your language>`

Even a partial translation is useful as a starting point.
