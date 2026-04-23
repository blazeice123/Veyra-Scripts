# GravyPvP

Tampermonkey userscript for `demonicscans.org` PvP automation.

## Features

- Auto joins PvP matches when tokens are available
- Auto targets the lowest-HP enemy
- Auto uses your preferred skill with a fallback if it is unavailable
- Visible in-page control panel for toggles and class selection
- Optional animated class avatars and spell/attack effects
- Safe watchdog reload if the page appears stuck

## Supported Pages

- `https://demonicscans.org/pvp.php`
- `https://demonicscans.org/pvp_battle.php*`

## Files

- `auto-pvp.user.js`: the Tampermonkey userscript

## Install

1. Install the Tampermonkey browser extension.
2. Open the raw GitHub file URL in your browser:
   `https://raw.githubusercontent.com/blazeice123/Veyra-Scripts/main/auto-pvp.user.js`
3. Tampermonkey should open the install or update prompt automatically.
4. If it does not, open Tampermonkey Dashboard and import the script manually.

## Notes

- The script stores its settings in browser `localStorage`.
- If class auto-detection guesses wrong, use the in-page `Class` selector.
- For personal use, a private GitHub repository is usually the safer option.
