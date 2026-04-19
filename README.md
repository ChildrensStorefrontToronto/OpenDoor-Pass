# OpenDoor Pass

OpenDoor Pass is the companion PWA for OpenDoor kiosk logins.

## Purpose
- Let a family save a mobile version of their login QR.
- Open from a home-screen icon and show the QR immediately.

## Setup Flow
1. In the main OpenDoor app, staff opens the family cards/help page.
2. Family scans the phone-setup QR shown there.
3. OpenDoor Pass receives URL params and stores:
   - `v`
   - `centre_id`
   - `family_scan` (the kiosk token, for example `F|123|...`)
4. Pass displays the family QR for kiosk scanning.

## Local Development
This scaffold is static and can be served by any static server.

Examples:
- `python -m http.server 8080`
- `npx serve .`

Then open `http://localhost:8080`.

## Notes
- Data is stored in localStorage on-device.
- This scaffold uses client-side QR generation via `qrcode` browser library.
- Production hardening (pinning assets, CSP, tests, analytics, legal text) is still needed.

## Centre Branding
Place centre-specific assets under `branding/<centre_id>/`.

Example for Centre 1:
- `branding/1/branding.json`
- `branding/1/centre-logo.png`

`branding.json` fields:
- `centre_id` (number)
- `centre_name` (string)
- `centre_logo` (relative path)
- `opendoor_logo` (relative path)

The app reads `centre_id` from the setup URL/profile and then loads:
- `./branding/<centre_id>/branding.json`

Language parameters from setup URL:
- `lang` (current main-app language)
- `default_lang` (main-app default language)

Pass currently localizes the word "Family" for:
- `en-CA` -> `Family`
- `fr-CA` -> `Famille`

If `lang` is not supported, Pass falls back to `default_lang`, then `en-CA`.
