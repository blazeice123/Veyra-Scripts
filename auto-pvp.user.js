// ==UserScript==
// @name         GravyPvP
// @namespace    https://github.com/blazeice123/Veyra-Scripts
// @version      3.12
// @description  Auto joins PvP matches, decorates classes with avatars, and adds animated attack effects.
// @author       SkuLexX
// @match        https://demonicscans.org/pvp_battle.php*
// @match        https://demonicscans.org/pvp.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=demonicscans.org
// @homepageURL  https://github.com/blazeice123/Veyra-Scripts/tree/main
// @updateURL    https://raw.githubusercontent.com/blazeice123/Veyra-Scripts/main/auto-pvp.user.js
// @downloadURL  https://raw.githubusercontent.com/blazeice123/Veyra-Scripts/main/auto-pvp.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    "use strict";

    const PANEL_ID = "gravy-pvp-panel";
    const STYLE_ID = "gravy-pvp-style";
    const STAGE_ID = "gravy-pvp-stage";
    const WORKER_HOST_ID = "gravy-pvp-worker-host";
    const SETTINGS_KEY = "gravy_pvp_settings_v1";
    const STATS_KEY = "gravy_pvp_stats_v1";
    const WORKER_REPORT_KEY = "gravy_pvp_worker_report_v1";
    const WORKER_SESSION_KEY = "gravy_pvp_worker_session_v1";
    const WORKER_COMMAND_KEY = "gravy_pvp_worker_command_v1";
    const CLASS_KEYS = ["auto", "warrior", "mage", "ranger", "rogue", "healer", "paladin", "necromancer", "monk", "berserker", "shadow"];
    const LAUNCH_FLAGS = parseLaunchFlags();
    const WORKER_MODE = LAUNCH_FLAGS.worker === "1";
    const WORKER_SESSION_ID = String(LAUNCH_FLAGS.session || "").trim();
    const SCRIPT_VERSION = "3.12";
    const CONFIG = {
        tickMs: 1200,
        actionCooldownMs: 1000,
        joinCooldownMs: 4000,
        lobbyMonitorReloadMs: 45000,
        readyTokenCount: 30,
        staleReloadMs: 180000,
        workerHeartbeatMs: 1500,
        workerStaleMs: 12000,
        defaults: {
            enabled: true,
            autoFight: true,
            autoReload: true,
            battleVisuals: true,
            skillNumber: 2,
            playerClass: "auto",
            skillPriorities: {},
            skillDisabled: {},
            expanded: true
        }
    };
    const ENEMY_CONTAINER_SELECTORS = [
        "#topTeamCard",
        "[id*='topTeam']",
        ".enemy-team",
        ".team-enemy"
    ];
    const ALLY_CONTAINER_SELECTORS = [
        "#bottomTeamCard",
        "[id*='bottomTeam']",
        ".ally-team",
        ".team-ally"
    ];
    const CLASS_PROFILES = {
        adventurer: {
            label: "Adventurer",
            effect: "slash",
            colors: ["#83b8ff", "#e7f1ff"]
        },
        warrior: {
            label: "Warrior",
            effect: "slash",
            colors: ["#ff7d55", "#ffd166"]
        },
        mage: {
            label: "Mage",
            effect: "arcane-burst",
            colors: ["#4fc3ff", "#a57cff"]
        },
        ranger: {
            label: "Ranger",
            effect: "arrow-shot",
            colors: ["#67d77e", "#d4ff7a"]
        },
        rogue: {
            label: "Rogue",
            effect: "shadow-reap",
            colors: ["#7bd8ff", "#9fb7ff"]
        },
        healer: {
            label: "Healer",
            effect: "heal",
            colors: ["#7fffd4", "#f7ffbc"]
        },
        paladin: {
            label: "Paladin",
            effect: "holy-smite",
            colors: ["#ffd76b", "#fff5bf"]
        },
        necromancer: {
            label: "Necromancer",
            effect: "shadow-reap",
            colors: ["#b77dff", "#56d69f"]
        },
        monk: {
            label: "Monk",
            effect: "martial-impact",
            colors: ["#ffbf72", "#ffe99e"]
        },
        berserker: {
            label: "Berserker",
            effect: "power-slash",
            colors: ["#ff5d68", "#ffb56b"]
        },
        shadow: {
            label: "Shadow",
            effect: "shadow-reap",
            colors: ["#7f86a7", "#c0a6ff"]
        }
    };
    const SKILL_EFFECT_PATTERNS = [
        { effect: "arcane-sacrifice", test: /\b(arcane|mana|soul|blood)\s+sacrifice\b|\bsacrifice\b/ },
        { effect: "power-slash", test: /\b(power|heavy|brutal|fatal|mighty|wild|great)\s+(slash|strike|cleave)\b|\bcleave\b|\brend\b|\bcrusher\b|\bexecution\b/ },
        { effect: "fireball", test: /\bfireball\b|\bflame\s+orb\b|\bember\s+ball\b|\bfire\s+blast\b/ },
        { effect: "meteor", test: /\bmeteor\b|\binferno\b|\bcataclysm\b|\bstarfall\b/ },
        { effect: "frost-spike", test: /\b(frost|ice|blizzard|glacier|freeze|icy)\b/ },
        { effect: "heal", test: /\b(heal|mend|recover|renew|restore|regen|cure|rejuven|recovery|revive)\b/ },
        { effect: "holy-smite", test: /\b(holy|smite|judg|light|divine|radiant|sanct|blessing)\b/ },
        { effect: "poison-dart", test: /\b(poison|venom|toxic|acid|plague)\b/ },
        { effect: "shadow-reap", test: /\b(shadow|void|curse|doom|drain|reap|phantom|dark|soul)\b/ },
        { effect: "arrow-volley", test: /\b(volley|barrage|multishot|multi-shot|rain of arrows)\b/ },
        { effect: "arrow-shot", test: /\b(arrow|shot|snipe|pierce|bolt|throw|dart)\b/ },
        { effect: "martial-impact", test: /\b(combo|punch|kick|fist|palm|jab|uppercut|roundhouse|chi)\b/ },
        { effect: "arcane-burst", test: /\b(arcane|magic|mana|spell|blast|burst|orb|missile)\b/ },
        { effect: "slash", test: /\b(slash|strike|stab|cut|slice|lunge)\b/ }
    ];
    const SETTING_HELP = {
        autoReload: "If the hidden worker page looks stuck for a few minutes, reload only that worker page to recover.",
        battleVisuals: "Show the little class characters and spell effects inside the panel preview.",
        skillNumber: "Fallback skill slot to use when no saved skill priority matches.",
        playerClass: "Pick your class manually, or leave it on Auto so GravyPvP guesses from the page."
    };

    let settings = loadSettings();
    let battleStats = loadBattleStats();
    let busy = false;
    let scheduledTick = 0;
    let scheduledVisualRefresh = 0;
    let lastProgressAt = Date.now();
    let lastJoinAt = 0;
    let statusText = "Starting...";
    let lastError = "";
    let observer = null;
    let lastTargetSlot = null;
    let hooksInstalled = false;
    let lobbyPageEnteredAt = isLobbyPage() ? Date.now() : 0;
    let battlePageEnteredAt = isBattlePage() ? Date.now() : 0;
    let workerFrame = null;
    let workerSession = !WORKER_MODE ? String(localStorage.getItem(WORKER_SESSION_KEY) || "").trim() : WORKER_SESSION_ID;
    let previewState = buildPreviewState();
    let battleNoTargetLoops = 0;
    let battleOutcomeHandled = false;
    let lastEnemyPreviewAt = 0;
    let lastEnemyPreviewKey = "";
    let scheduledEnemyPreviewTimer = 0;
    let forceStartNow = false;

    window.addEventListener("error", (event) => {
        if (!shouldCaptureGlobalError(event?.error, event?.filename, event?.message)) {
            return;
        }

        const message = event?.error?.message || event?.message || "Unknown script error";
        rememberError(message);
    });

    window.addEventListener("unhandledrejection", (event) => {
        if (!shouldCaptureGlobalError(event?.reason, "", event?.reason?.message || event?.reason)) {
            return;
        }

        const reason = event?.reason?.message || String(event?.reason || "Unhandled rejection");
        rememberError(reason);
    });

    window.addEventListener("beforeunload", () => {
        if (WORKER_MODE) {
            publishWorkerReport("navigating", statusText || "Navigating");
        }
    });

    onReady(() => {
        if (!WORKER_MODE) {
            installStyles();
            renderPanel();
            installInteractionHooks();
            window.addEventListener("resize", () => scheduleVisualRefresh(80));
        }
        observePage();
        tick();
        window.setInterval(tick, CONFIG.tickMs);
        window.setInterval(runWatchdog, 5000);
        if (WORKER_MODE) {
            publishWorkerReport("starting", "Background worker ready");
        }
    });

    function onReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }
        callback();
    }

    function loadSettings() {
        try {
            const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
            return normalizeSettings({ ...CONFIG.defaults, ...stored });
        } catch (error) {
            console.warn("GravyPvP: failed to read settings", error);
            return normalizeSettings({ ...CONFIG.defaults });
        }
    }

    function saveSettings() {
        settings = normalizeSettings(settings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function normalizeSettings(input) {
        const normalized = { ...CONFIG.defaults, ...input };
        normalized.enabled = !!normalized.enabled;
        normalized.autoFight = true;
        normalized.autoJoin = true;
        normalized.autoReload = true;
        normalized.playerClass = normalizeClassKey(normalized.playerClass);
        normalized.skillNumber = clampSkillNumber(normalized.skillNumber);
        normalized.skillPriorities = normalizeSkillNameMap(normalized.skillPriorities);
        normalized.skillDisabled = normalizeSkillNameMap(normalized.skillDisabled);
        return normalized;
    }

    function normalizeSkillNameMap(skillMap) {
        if (!skillMap || typeof skillMap !== "object") {
            return {};
        }

        const normalized = {};
        for (const [classKey, values] of Object.entries(skillMap)) {
            if (!Array.isArray(values)) {
                continue;
            }

            const safeClassKey = normalizeClassKey(classKey);
            normalized[safeClassKey] = uniqueSkillNames(values);
        }

        return normalized;
    }

    function loadBattleStats() {
        try {
            const stored = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
            return normalizeBattleStats(stored);
        } catch (error) {
            console.warn("GravyPvP: failed to read battle stats", error);
            return normalizeBattleStats({});
        }
    }

    function normalizeBattleStats(input) {
        const wins = toNonNegativeInt(input?.wins);
        const losses = toNonNegativeInt(input?.losses);
        const updatedAt = toNonNegativeInt(input?.updatedAt);
        const lastOutcome = input?.lastOutcome === "win" || input?.lastOutcome === "loss" ? input.lastOutcome : "";
        return {
            wins,
            losses,
            updatedAt,
            lastOutcome
        };
    }

    function toNonNegativeInt(value) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function saveBattleStats() {
        battleStats = normalizeBattleStats(battleStats);
        localStorage.setItem(STATS_KEY, JSON.stringify(battleStats));
    }

    function getBattleStats() {
        battleStats = loadBattleStats();
        return battleStats;
    }

    function recordBattleOutcome(outcome) {
        if (battleOutcomeHandled) {
            return;
        }

        if (outcome !== "win" && outcome !== "loss") {
            return;
        }

        battleOutcomeHandled = true;
        battleStats = getBattleStats();

        if (outcome === "win") {
            battleStats.wins += 1;
        } else {
            battleStats.losses += 1;
        }

        battleStats.lastOutcome = outcome;
        battleStats.updatedAt = Date.now();
        saveBattleStats();
    }

    function shouldCaptureGlobalError(errorLike, filename = "", fallbackMessage = "") {
        const parts = [
            String(filename || ""),
            String(fallbackMessage || ""),
            String(errorLike?.message || ""),
            String(errorLike?.stack || "")
        ].join("\n");

        return /auto-pvp\.user\.js|gravypvp/i.test(parts);
    }

    function installStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID} {
                position: fixed;
                right: 8px;
                bottom: 8px;
                width: min(360px, calc(100vw - 16px));
                max-height: calc(100vh - 16px);
                box-sizing: border-box;
                z-index: 2147483647;
                color: #f2f5f7;
                background: rgba(18, 23, 29, 0.96);
                border: 1px solid #384451;
                border-radius: 12px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
                font: 13px/1.4 Verdana, sans-serif;
                overflow-x: hidden;
                overflow-y: auto;
                transition: width 0.18s ease, max-height 0.18s ease, border-radius 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
            }

            #${PANEL_ID}.collapsed {
                width: 52px;
                max-width: 52px;
                max-height: 52px;
                overflow: hidden;
                border: 0;
                border-radius: 999px;
                background: transparent;
                box-shadow: none;
            }

            #${PANEL_ID} .apvp-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 10px 12px;
                background: linear-gradient(135deg, #1f2933, #111820);
                border-bottom: 1px solid #2b3642;
            }

            #${PANEL_ID} .apvp-title {
                font-weight: 700;
                letter-spacing: 0.02em;
                min-width: 0;
            }

            #${PANEL_ID} .apvp-body {
                display: grid;
                gap: 8px;
                padding: 12px;
            }

            #${PANEL_ID}.collapsed .apvp-body {
                display: none;
            }

            #${PANEL_ID}.collapsed .apvp-header {
                width: 52px;
                height: 52px;
                padding: 0;
                border-bottom: 0;
                background: none;
            }

            #${PANEL_ID}.collapsed .apvp-title {
                display: none;
            }

            #${PANEL_ID} .apvp-row {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                align-items: start;
                gap: 10px;
            }

            #${PANEL_ID} .apvp-row.apvp-row-single {
                grid-template-columns: 1fr;
            }

            #${PANEL_ID} label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                min-width: 0;
            }

            #${PANEL_ID} label[title] {
                text-decoration: underline dotted rgba(255, 255, 255, 0.16);
                text-underline-offset: 3px;
            }

            #${PANEL_ID} input[type="checkbox"] {
                width: 14px;
                height: 14px;
                margin: 0;
            }

            #${PANEL_ID} input[type="number"] {
                width: 62px;
                padding: 4px 6px;
                color: #f2f5f7;
                background: #0f1419;
                border: 1px solid #425061;
                border-radius: 6px;
            }

            #${PANEL_ID} select {
                min-width: 0;
                width: 100%;
                padding: 4px 6px;
                color: #f2f5f7;
                background: #0f1419;
                border: 1px solid #425061;
                border-radius: 6px;
                font: inherit;
            }

            #${PANEL_ID} button {
                color: #f2f5f7;
                background: #1d6f42;
                border: 1px solid #2f8e59;
                border-radius: 7px;
                padding: 5px 10px;
                cursor: pointer;
                font: inherit;
                white-space: nowrap;
                flex-shrink: 0;
            }

            #${PANEL_ID} button[data-action="start-worker"][data-running="1"] {
                color: #f7fff7;
                background: linear-gradient(135deg, #1f8f4b, #35ba67);
                border-color: #6bd98d;
                box-shadow: 0 0 0 0 rgba(86, 225, 128, 0.28);
                animation: apvp-monitor-pulse 1.4s ease-in-out infinite;
            }

            #${PANEL_ID} button[data-action="start-worker"][data-running="1"]:disabled {
                opacity: 1;
                cursor: default;
                filter: none;
            }

            #${PANEL_ID} button[data-action="start-now"] {
                background: linear-gradient(135deg, #6f4b18, #b67729);
                border-color: #d7a04c;
            }

            #${PANEL_ID} button[data-action="start-now"][data-armed="1"] {
                background: linear-gradient(135deg, #8c5a18, #d3922b);
                border-color: #f0be6d;
                box-shadow: 0 0 0 0 rgba(240, 190, 109, 0.26);
                animation: apvp-monitor-pulse 1.4s ease-in-out infinite;
            }

            #${PANEL_ID} .apvp-row > * {
                min-width: 0;
            }

            #${PANEL_ID} button:hover {
                filter: brightness(1.08);
            }

            #${PANEL_ID} button[data-action="toggle-panel"] {
                background: #223140;
                border-color: #405163;
            }

            #${PANEL_ID} .apvp-toggle-label {
                display: inline;
            }

            #${PANEL_ID} .apvp-toggle-icon {
                display: none;
            }

            #${PANEL_ID}.collapsed button[data-action="toggle-panel"] {
                position: relative;
                width: 52px;
                height: 52px;
                min-width: 52px;
                min-height: 52px;
                padding: 0;
                border: 0;
                border-radius: 999px;
                background: transparent;
                box-shadow: none;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #${PANEL_ID}.collapsed button[data-action="toggle-panel"]:hover {
                filter: none;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-label {
                display: none;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-icon {
                position: relative;
                display: flex;
                width: 52px;
                height: 52px;
                align-items: center;
                justify-content: center;
                pointer-events: none;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-orb {
                position: absolute;
                inset: 5px;
                border-radius: 999px;
                background:
                    radial-gradient(circle at 34% 26%, rgba(255, 162, 162, 0.28) 0%, rgba(143, 33, 46, 0.18) 18%, rgba(57, 11, 18, 0.94) 54%, rgba(15, 4, 8, 1) 100%);
                box-shadow:
                    inset 0 1px 0 rgba(255, 235, 235, 0.18),
                    inset 0 -8px 16px rgba(18, 1, 6, 0.58),
                    0 0 0 1px rgba(255, 255, 255, 0.06),
                    0 10px 22px rgba(0, 0, 0, 0.28);
                animation: apvp-toggle-orb-pulse 1.8s ease-in-out infinite;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-sword {
                position: relative;
                z-index: 2;
                width: 24px;
                height: 24px;
                filter: drop-shadow(0 0 4px rgba(255, 247, 240, 0.18)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.44));
            }

            #${PANEL_ID}.collapsed .apvp-toggle-sword::before {
                content: "";
                position: absolute;
                left: 10px;
                top: 1px;
                width: 4px;
                height: 15px;
                background: linear-gradient(180deg, #fff6f1 0%, #dee8ec 24%, #b9c4ca 62%, #7e878d 100%);
                clip-path: polygon(50% 0, 100% 18%, 100% 78%, 50% 100%, 0 78%, 0 18%);
                border-radius: 2px 2px 1px 1px;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-sword::after {
                content: "";
                position: absolute;
                left: 6px;
                top: 13px;
                width: 12px;
                height: 4px;
                border-radius: 999px;
                background: linear-gradient(180deg, #f7d18f 0%, #b07135 100%);
                box-shadow: 0 0 3px rgba(255, 198, 106, 0.28);
            }

            #${PANEL_ID}.collapsed .apvp-toggle-hilt {
                position: absolute;
                z-index: 2;
                left: 24px;
                top: 30px;
                width: 4px;
                height: 8px;
                border-radius: 0 0 3px 3px;
                background: linear-gradient(180deg, #60351b 0%, #2b120a 100%);
                transform: translateX(-50%);
            }

            #${PANEL_ID}.collapsed .apvp-toggle-hilt::after {
                content: "";
                position: absolute;
                left: -2px;
                bottom: -3px;
                width: 8px;
                height: 4px;
                border-radius: 999px;
                background: radial-gradient(circle at 50% 35%, #ffcf88 0%, #a0612d 64%, #6f3419 100%);
            }

            #${PANEL_ID}.collapsed .apvp-toggle-blood {
                position: absolute;
                z-index: 1;
                left: 24px;
                top: 18px;
                width: 4px;
                height: 12px;
                border-radius: 999px 999px 72% 72%;
                background: radial-gradient(circle at 35% 25%, #ff9198 0%, #d72938 48%, #710b17 100%);
                transform: translateX(-50%);
                transform-origin: top center;
                animation: apvp-blood-drip-main 1.45s ease-in-out infinite;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-blood::before,
            #${PANEL_ID}.collapsed .apvp-toggle-blood::after {
                content: "";
                position: absolute;
                border-radius: 999px 999px 72% 72%;
                background: radial-gradient(circle at 35% 25%, #ff9198 0%, #d72938 48%, #710b17 100%);
                transform-origin: top center;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-blood::before {
                left: -5px;
                top: 2px;
                width: 3px;
                height: 8px;
                animation: apvp-blood-drip-side 1.15s ease-in-out infinite 0.12s;
            }

            #${PANEL_ID}.collapsed .apvp-toggle-blood::after {
                left: 5px;
                top: 1px;
                width: 3px;
                height: 9px;
                animation: apvp-blood-drip-side 1.28s ease-in-out infinite 0.3s;
            }

            #${PANEL_ID} .apvp-status {
                padding: 8px 10px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.07);
                border-radius: 8px;
                min-height: 34px;
            }

            #${PANEL_ID} .apvp-error {
                padding: 8px 10px;
                color: #ffd7d7;
                background: rgba(154, 36, 36, 0.25);
                border: 1px solid rgba(209, 80, 80, 0.45);
                border-radius: 8px;
                word-break: break-word;
            }

            #${PANEL_ID} .apvp-muted {
                color: #aeb9c4;
                font-size: 12px;
            }

            #${PANEL_ID} .apvp-footer {
                display: flex;
                justify-content: flex-end;
                align-items: center;
                margin-top: 2px;
            }

            #${PANEL_ID} .apvp-version {
                color: #7c8b9b;
                font-size: 11px;
                letter-spacing: 0.02em;
            }

            #${PANEL_ID} .apvp-worker {
                padding: 8px 10px;
                color: #c9d8e7;
                background: rgba(88, 132, 255, 0.10);
                border: 1px solid rgba(111, 144, 255, 0.24);
                border-radius: 8px;
                font-size: 12px;
            }

            #${PANEL_ID} .apvp-stats {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
            }

            #${PANEL_ID} .apvp-stat {
                padding: 8px 10px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
            }

            #${PANEL_ID} .apvp-stat-label {
                display: block;
                color: #9db0c4;
                font-size: 11px;
                letter-spacing: 0.02em;
                text-transform: uppercase;
            }

            #${PANEL_ID} .apvp-stat-value {
                display: block;
                margin-top: 2px;
                color: #f6fbff;
                font-size: 18px;
                font-weight: 700;
            }

            #${PANEL_ID} .apvp-preview {
                position: relative;
                padding: 10px;
                background: linear-gradient(180deg, rgba(18, 24, 38, 0.94), rgba(10, 14, 24, 0.96));
                border: 1px solid rgba(108, 132, 184, 0.22);
                border-radius: 10px;
                overflow: hidden;
            }

            #${PANEL_ID}.apvp-no-fx .apvp-preview {
                display: none;
            }

            #${PANEL_ID} .apvp-preview::before {
                content: "";
                position: absolute;
                inset: auto -20% -34% -20%;
                height: 58px;
                background: radial-gradient(circle, rgba(74, 110, 186, 0.30), transparent 70%);
                pointer-events: none;
            }

            #${PANEL_ID} .apvp-preview-stage {
                position: relative;
                display: grid;
                grid-template-columns: minmax(0, 1fr) 90px minmax(0, 1fr);
                align-items: end;
                gap: 8px;
                min-height: 110px;
            }

            #${PANEL_ID} .apvp-preview-side {
                position: relative;
                display: flex;
                align-items: end;
                justify-content: center;
                min-height: 86px;
                overflow: visible;
                z-index: 2;
            }

            #${PANEL_ID} .apvp-preview-side .apvp-slot-visual {
                position: relative;
                left: auto;
                right: auto;
                bottom: auto;
                width: 52px;
                height: 62px;
                overflow: visible;
                animation-duration: 1.8s;
            }

            #${PANEL_ID} .apvp-preview-side .apvp-badge {
                bottom: -14px;
                font-size: 8px;
            }

            #${PANEL_ID} .apvp-preview-side.enemy .apvp-avatar {
                transform: scaleX(-1);
            }

            #${PANEL_ID} .apvp-preview-side.apvp-preview-cast .apvp-slot-visual {
                animation: apvp-cast 0.52s ease-out;
            }

            #${PANEL_ID} .apvp-preview-side.apvp-preview-hit .apvp-slot-visual {
                animation: apvp-hit-shake 0.40s ease-out;
            }

            #${PANEL_ID} .apvp-preview-center {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 86px;
                z-index: 1;
            }

            #${PANEL_ID} .apvp-preview-effect {
                position: relative;
                width: 90px;
                height: 54px;
                pointer-events: none;
            }

            #${PANEL_ID} .apvp-preview-effect::before,
            #${PANEL_ID} .apvp-preview-effect::after {
                content: "";
                position: absolute;
                opacity: 0;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="slash"]::before {
                left: 2px;
                top: 22px;
                width: 84px;
                height: 8px;
                border-radius: 999px;
                background: linear-gradient(90deg, transparent, #ff8d6a 24%, #ffe183 54%, transparent);
                box-shadow: 0 0 14px rgba(255, 190, 106, 0.45);
                animation: apvp-slash 0.44s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="power-slash"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="power-slash"]::after {
                border-radius: 999px;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="power-slash"]::before {
                left: -2px;
                top: 17px;
                width: 96px;
                height: 12px;
                background: linear-gradient(90deg, transparent, #ff6d55 16%, #ffe78b 54%, transparent);
                box-shadow: 0 0 18px rgba(255, 142, 96, 0.6);
                animation: apvp-power-slash-main 0.5s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="power-slash"]::after {
                left: 18px;
                top: 29px;
                width: 68px;
                height: 8px;
                background: linear-gradient(90deg, transparent, rgba(255, 197, 112, 0.95) 36%, transparent);
                box-shadow: 0 0 12px rgba(255, 190, 106, 0.45);
                animation: apvp-power-slash-trail 0.52s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-shot"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="projectile"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane-burst"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="fireball"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="fire"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="frost-spike"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="ice"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow-reap"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="holy-smite"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="holy"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="meteor"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="poison-dart"]::before {
                left: 0;
                top: 24px;
                width: 90px;
                height: 6px;
                border-radius: 999px;
                background: linear-gradient(90deg, transparent, #84b7ff 22%, #f3fbff 50%, transparent);
                box-shadow: 0 0 14px rgba(132, 183, 255, 0.55);
                animation: apvp-beam 0.52s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane-burst"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane"]::before {
                background: linear-gradient(90deg, transparent, #8c8bff 22%, #f7fbff 50%, transparent);
                box-shadow: 0 0 14px rgba(149, 122, 255, 0.55);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="fireball"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="fire"]::before {
                left: 8px;
                top: 15px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: radial-gradient(circle, #fff0cd 0 16%, #ffbf63 17% 42%, #ff6a45 43% 70%, rgba(255, 106, 69, 0.08) 71%);
                box-shadow: 0 0 18px rgba(255, 129, 79, 0.58);
                animation: apvp-fireball-flight 0.54s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="frost-spike"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="ice"]::before {
                background: linear-gradient(90deg, transparent, #6cd9ff 22%, #f0ffff 50%, transparent);
                box-shadow: 0 0 14px rgba(108, 217, 255, 0.55);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow-reap"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow"]::before {
                background: linear-gradient(90deg, transparent, #7b73ff 22%, #6fe2bb 50%, transparent);
                box-shadow: 0 0 14px rgba(123, 115, 255, 0.55);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="holy-smite"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="holy"]::before {
                background: linear-gradient(90deg, transparent, #ffd86b 22%, #fff7d1 50%, transparent);
                box-shadow: 0 0 14px rgba(255, 216, 107, 0.55);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-shot"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="projectile"]::before {
                top: 25px;
                height: 4px;
                background: linear-gradient(90deg, transparent, #82f79f 18%, #f6ffcf 46%, transparent);
                box-shadow: 0 0 12px rgba(130, 247, 159, 0.48);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="poison-dart"]::before {
                top: 25px;
                height: 4px;
                background: linear-gradient(90deg, transparent, #3fd871 16%, #d8ff7a 44%, transparent);
                box-shadow: 0 0 12px rgba(63, 216, 113, 0.48);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane-sacrifice"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane-sacrifice"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="fireball"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="fire"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="meteor"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="frost-spike"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="ice"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow-reap"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="holy-smite"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="holy"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-shot"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="projectile"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-volley"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-volley"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="martial-impact"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="martial-impact"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="poison-dart"]::after {
                opacity: 0;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="heal"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="heal"]::after {
                border-radius: 50%;
                animation: apvp-pop 0.66s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="heal"]::before {
                left: 10px;
                top: 10px;
                width: 32px;
                height: 32px;
                border: 2px solid #7fffd4;
                box-shadow: 0 0 16px rgba(127, 255, 212, 0.45);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="heal"]::after {
                left: 18px;
                top: 18px;
                width: 16px;
                height: 16px;
                background: radial-gradient(circle, #fffed2 0 28%, #7fffd4 29% 70%, transparent 74%);
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="martial-impact"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="martial-impact"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="impact"]::before {
                border-radius: 50%;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="martial-impact"]::before {
                left: 30px;
                top: 7px;
                width: 28px;
                height: 28px;
                background: radial-gradient(circle, #fff4e1 0 24%, #ffb55f 25% 52%, rgba(255, 181, 95, 0.18) 53% 76%, transparent 77%);
                box-shadow: 0 0 18px rgba(255, 181, 95, 0.45);
                animation: apvp-impact-burst 0.48s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="martial-impact"]::after {
                left: 20px;
                top: 15px;
                width: 50px;
                height: 12px;
                background: linear-gradient(90deg, transparent, rgba(255, 201, 120, 0.9) 42%, transparent);
                animation: apvp-impact-wave 0.46s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="impact"]::before {
                left: 34px;
                top: 10px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: radial-gradient(circle, #fff3d8 0 30%, #ffb45a 31% 68%, transparent 72%);
                box-shadow: 0 0 16px rgba(255, 180, 90, 0.45);
                animation: apvp-pop 0.46s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="fireball"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="fire"]::after {
                left: 62px;
                top: 12px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: radial-gradient(circle, #fff2cb 0 20%, #ff9b4a 21% 52%, rgba(255, 104, 54, 0.9) 53% 70%, transparent 72%);
                box-shadow: 0 0 18px rgba(255, 137, 75, 0.52);
                animation: apvp-fireball-burst 0.55s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="meteor"]::before {
                top: 10px;
                height: 8px;
                background: linear-gradient(90deg, transparent, #ff7a49 18%, #ffe07c 46%, transparent);
                box-shadow: 0 0 18px rgba(255, 128, 90, 0.62);
                animation: apvp-meteor-flight 0.58s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="meteor"]::after {
                left: 60px;
                top: 6px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: radial-gradient(circle, #fff5d4 0 18%, #ffb150 19% 46%, rgba(255, 82, 52, 0.9) 47% 70%, transparent 72%);
                box-shadow: 0 0 22px rgba(255, 112, 72, 0.55);
                animation: apvp-fireball-burst 0.62s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="frost-spike"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="ice"]::after {
                left: 66px;
                top: 10px;
                width: 18px;
                height: 32px;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(109, 219, 255, 0.95));
                clip-path: polygon(50% 0, 100% 34%, 76% 100%, 24% 100%, 0 34%);
                box-shadow: 0 0 18px rgba(111, 222, 255, 0.4);
                animation: apvp-frost-spike 0.56s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow-reap"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="shadow"]::after {
                left: 44px;
                top: 5px;
                width: 32px;
                height: 32px;
                border: 4px solid rgba(149, 124, 255, 0.95);
                border-right-color: transparent;
                border-bottom-color: transparent;
                border-radius: 50%;
                box-shadow: 0 0 18px rgba(149, 124, 255, 0.38);
                transform: rotate(-20deg);
                animation: apvp-shadow-sickle 0.6s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="holy-smite"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="holy"]::after {
                left: 67px;
                top: 2px;
                width: 14px;
                height: 46px;
                border-radius: 999px;
                background: linear-gradient(180deg, rgba(255, 250, 212, 0), rgba(255, 229, 132, 0.92) 22%, rgba(255, 244, 200, 0.98) 48%, rgba(255, 218, 95, 0) 100%);
                box-shadow: 0 0 18px rgba(255, 220, 125, 0.48);
                animation: apvp-smite-column 0.58s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane-burst"]::after {
                left: 64px;
                top: 13px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: radial-gradient(circle, #f6fbff 0 16%, #a488ff 17% 46%, rgba(113, 166, 255, 0.72) 47% 66%, transparent 68%);
                box-shadow: 0 0 18px rgba(141, 132, 255, 0.48);
                animation: apvp-arcane-burst 0.56s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane-sacrifice"]::before {
                left: 4px;
                top: 8px;
                width: 32px;
                height: 32px;
                border: 2px solid rgba(177, 135, 255, 0.9);
                border-radius: 50%;
                box-shadow: inset 0 0 10px rgba(111, 205, 255, 0.2), 0 0 16px rgba(177, 135, 255, 0.42);
                animation: apvp-sacrifice-rune 0.76s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arcane-sacrifice"]::after {
                left: 26px;
                top: 15px;
                width: 54px;
                height: 22px;
                border-radius: 999px;
                background: linear-gradient(90deg, rgba(255, 111, 160, 0), rgba(255, 111, 160, 0.84) 26%, rgba(140, 117, 255, 0.98) 54%, rgba(99, 214, 255, 0.12) 88%, transparent);
                box-shadow: 0 0 20px rgba(167, 112, 255, 0.48);
                animation: apvp-sacrifice-burst 0.68s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-shot"]::after,
            #${PANEL_ID} .apvp-preview-effect[data-effect="projectile"]::after {
                left: 68px;
                top: 20px;
                width: 12px;
                height: 12px;
                background: linear-gradient(135deg, transparent 0 36%, #ecffdc 37% 62%, transparent 63%);
                transform: rotate(45deg);
                filter: drop-shadow(0 0 8px rgba(236, 255, 220, 0.35));
                animation: apvp-arrow-tip 0.5s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-volley"]::before,
            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-volley"]::after {
                left: 4px;
                width: 82px;
                height: 4px;
                border-radius: 999px;
                background: linear-gradient(90deg, transparent, #84f0a1 18%, #f6ffd2 44%, transparent);
                box-shadow: 0 0 12px rgba(132, 240, 161, 0.42);
                animation: apvp-volley 0.54s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-volley"]::before {
                top: 18px;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="arrow-volley"]::after {
                top: 30px;
                animation-delay: 0.06s;
            }

            #${PANEL_ID} .apvp-preview-effect[data-effect="poison-dart"]::after {
                left: 61px;
                top: 11px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: radial-gradient(circle, #f3ffd8 0 16%, #87ff72 17% 42%, rgba(44, 194, 82, 0.82) 43% 66%, transparent 68%);
                box-shadow: 0 0 18px rgba(76, 221, 109, 0.45);
                animation: apvp-poison-burst 0.6s ease-out forwards;
            }

            #${PANEL_ID} .apvp-preview-label {
                margin-top: 8px;
                text-align: center;
                color: #d7e4f2;
                font-size: 12px;
                min-height: 18px;
            }

            #${PANEL_ID} .apvp-priority {
                display: grid;
                gap: 8px;
                padding: 8px 10px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.07);
                border-radius: 8px;
            }

            #${PANEL_ID} .apvp-priority-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
                font-size: 12px;
                color: #cbd5df;
            }

            #${PANEL_ID} .apvp-priority-list {
                display: grid;
                gap: 6px;
            }

            #${PANEL_ID} .apvp-priority-item {
                display: grid;
                grid-template-columns: 20px minmax(0, 1fr) auto;
                align-items: center;
                gap: 8px;
                padding: 6px 7px;
                background: rgba(0, 0, 0, 0.18);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
            }

            #${PANEL_ID} .apvp-priority-item.apvp-skill-disabled {
                opacity: 0.62;
                border-color: rgba(255, 122, 122, 0.22);
                background: rgba(70, 18, 18, 0.16);
            }

            #${PANEL_ID} .apvp-priority-rank {
                color: #95a8bc;
                font-size: 12px;
                text-align: center;
            }

            #${PANEL_ID} .apvp-priority-name {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #${PANEL_ID} .apvp-priority-name small {
                margin-left: 6px;
                color: #ffb7b7;
                font-size: 10px;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }

            #${PANEL_ID} .apvp-priority-actions {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 4px;
            }

            #${PANEL_ID} .apvp-priority-actions button,
            #${PANEL_ID} .apvp-priority-head button {
                min-width: 28px;
                padding: 4px 7px;
                background: #223140;
                border-color: #405163;
            }

            #${PANEL_ID} .apvp-priority-actions button[data-action="toggle-skill-enabled"] {
                min-width: 34px;
                background: #3f6332;
                border-color: #5f8a4e;
            }

            #${PANEL_ID} .apvp-priority-actions button[data-action="toggle-skill-enabled"][data-disabled="1"] {
                background: #6b2b2b;
                border-color: #944848;
            }

            #${PANEL_ID} .apvp-priority-empty {
                color: #aeb9c4;
                font-size: 12px;
            }

            @media (max-width: 360px) {
                #${PANEL_ID} .apvp-row {
                    grid-template-columns: 1fr;
                }
            }

            #${STAGE_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483000;
                pointer-events: none;
                overflow: hidden;
            }

            .apvp-slot-visual {
                position: absolute;
                left: 4px;
                bottom: 2px;
                width: 44px;
                height: 54px;
                z-index: 20;
                overflow: visible;
                pointer-events: none;
                transform-origin: center bottom;
                animation: apvp-bob 2.2s ease-in-out infinite;
            }

            .apvp-slot-visual[data-team="enemy"] {
                left: auto;
                right: 4px;
            }

            .apvp-slot-visual[data-team="enemy"] .apvp-avatar {
                transform: scaleX(-1);
            }

            .apvp-fx-shell {
                position: absolute;
                left: 0;
                top: 0;
                pointer-events: none;
                transform-origin: left center;
            }

            .apvp-slot-visual.apvp-casting {
                animation: apvp-cast 0.5s ease-out;
            }

            .apvp-slot-visual.apvp-hit {
                animation: apvp-hit-shake 0.38s ease-out;
            }

            .apvp-avatar {
                position: absolute;
                inset: 0;
                filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.38));
                --apvp-primary: #83b8ff;
                --apvp-secondary: #e7f1ff;
                --apvp-glow: rgba(131, 184, 255, 0.45);
                --apvp-dark: #1b2330;
                --apvp-skin: #ffd2b8;
            }

            .apvp-avatar.apvp-avatar-art {
                display: block;
                overflow: visible;
                object-fit: contain;
                object-position: center bottom;
            }

            .apvp-avatar.apvp-avatar-art[alt=""] {
                color: transparent;
            }

            .apvp-avatar .apvp-aura {
                position: absolute;
                left: 7px;
                bottom: 8px;
                width: 30px;
                height: 14px;
                border-radius: 50%;
                background: radial-gradient(circle, var(--apvp-glow), transparent 70%);
                animation: apvp-pulse 1.8s ease-in-out infinite;
            }

            .apvp-avatar .apvp-head {
                position: absolute;
                left: 13px;
                top: 7px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: radial-gradient(circle at 35% 35%, #fff3eb 0 15%, var(--apvp-skin) 16% 68%, #db9c7f 100%);
                border: 2px solid rgba(11, 14, 17, 0.6);
            }

            .apvp-avatar .apvp-body {
                position: absolute;
                left: 11px;
                top: 23px;
                width: 22px;
                height: 22px;
                border-radius: 10px 10px 7px 7px;
                background: linear-gradient(180deg, var(--apvp-secondary), var(--apvp-primary));
                border: 2px solid rgba(11, 14, 17, 0.6);
            }

            #${PANEL_ID} .apvp-avatar .apvp-body {
                display: block;
                gap: 0;
                padding: 0;
            }

            .apvp-avatar .apvp-body::before,
            .apvp-avatar .apvp-body::after {
                content: "";
                position: absolute;
                bottom: -8px;
                width: 5px;
                height: 11px;
                border-radius: 4px;
                background: var(--apvp-dark);
            }

            .apvp-avatar .apvp-body::before {
                left: 4px;
            }

            .apvp-avatar .apvp-body::after {
                right: 4px;
            }

            .apvp-avatar .apvp-weapon,
            .apvp-avatar .apvp-accent,
            .apvp-avatar .apvp-hat {
                position: absolute;
            }

            .apvp-avatar .apvp-weapon {
                right: 3px;
                top: 23px;
                width: 18px;
                height: 4px;
                border-radius: 999px;
                background: linear-gradient(90deg, var(--apvp-secondary), var(--apvp-primary));
                box-shadow: 0 0 10px var(--apvp-glow);
                transform: rotate(-25deg);
            }

            .apvp-avatar .apvp-accent {
                left: 4px;
                top: 23px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: radial-gradient(circle, var(--apvp-secondary), transparent 75%);
                opacity: 0.8;
            }

            .apvp-avatar .apvp-hat {
                left: 10px;
                top: 0;
                width: 24px;
                height: 12px;
                border-radius: 14px 14px 6px 6px;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), var(--apvp-primary));
                opacity: 0;
            }

            .apvp-slot-visual .apvp-badge {
                position: absolute;
                left: -2px;
                right: -2px;
                bottom: -12px;
                padding: 1px 4px;
                border-radius: 999px;
                color: #eff4f9;
                background: rgba(6, 10, 16, 0.72);
                border: 1px solid rgba(255, 255, 255, 0.12);
                font-size: 9px;
                font-weight: 700;
                text-align: center;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                white-space: nowrap;
            }

            .apvp-slot-visual[data-class="warrior"] .apvp-avatar {
                --apvp-primary: #c8502f;
                --apvp-secondary: #ffd37d;
                --apvp-glow: rgba(255, 157, 94, 0.42);
                --apvp-dark: #4b1f18;
            }

            .apvp-slot-visual[data-class="warrior"] .apvp-weapon {
                width: 21px;
                height: 5px;
                transform: rotate(-36deg);
            }

            .apvp-slot-visual[data-class="warrior"] .apvp-accent {
                left: 0;
                top: 28px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                border: 3px solid #d7dde7;
                background: rgba(31, 39, 51, 0.65);
            }

            .apvp-slot-visual[data-class="mage"] .apvp-avatar {
                --apvp-primary: #4fc3ff;
                --apvp-secondary: #a57cff;
                --apvp-glow: rgba(113, 163, 255, 0.48);
                --apvp-dark: #1f1d40;
            }

            .apvp-slot-visual[data-class="mage"] .apvp-hat {
                opacity: 1;
                clip-path: polygon(50% 0, 100% 100%, 0 100%);
                background: linear-gradient(180deg, #d9f0ff, #4f79ff);
            }

            .apvp-slot-visual[data-class="mage"] .apvp-weapon {
                width: 4px;
                height: 22px;
                right: 9px;
                top: 18px;
                transform: rotate(10deg);
            }

            .apvp-slot-visual[data-class="mage"] .apvp-accent {
                left: 1px;
                top: 17px;
                width: 13px;
                height: 13px;
                background: radial-gradient(circle, #f5ffff 0 20%, rgba(165, 124, 255, 0.9) 21% 55%, transparent 75%);
            }

            .apvp-slot-visual[data-class="ranger"] .apvp-avatar {
                --apvp-primary: #4fbf65;
                --apvp-secondary: #d6ff7f;
                --apvp-glow: rgba(102, 215, 126, 0.45);
                --apvp-dark: #1e3526;
            }

            .apvp-slot-visual[data-class="ranger"] .apvp-weapon {
                width: 16px;
                height: 18px;
                right: 3px;
                top: 18px;
                border: 3px solid #d7f7d1;
                border-left: 0;
                background: transparent;
                box-shadow: none;
                transform: rotate(0);
                border-radius: 0 12px 12px 0;
            }

            .apvp-slot-visual[data-class="ranger"] .apvp-accent {
                left: 5px;
                top: 25px;
                width: 14px;
                height: 3px;
                border-radius: 999px;
                background: linear-gradient(90deg, transparent, #efffc4, transparent);
                transform: rotate(-20deg);
            }

            .apvp-slot-visual[data-class="rogue"] .apvp-avatar {
                --apvp-primary: #3b516f;
                --apvp-secondary: #8fd5ff;
                --apvp-glow: rgba(120, 205, 255, 0.4);
                --apvp-dark: #101823;
            }

            .apvp-slot-visual[data-class="rogue"] .apvp-hat {
                opacity: 1;
                left: 8px;
                width: 27px;
                height: 15px;
                border-radius: 18px 18px 10px 10px;
                background: linear-gradient(180deg, #9ad6ff, #1b2f43);
            }

            .apvp-slot-visual[data-class="rogue"] .apvp-weapon {
                width: 16px;
                height: 3px;
                top: 18px;
                transform: rotate(-58deg);
            }

            .apvp-slot-visual[data-class="healer"] .apvp-avatar {
                --apvp-primary: #68d8b5;
                --apvp-secondary: #fffcc5;
                --apvp-glow: rgba(143, 255, 223, 0.48);
                --apvp-dark: #20403a;
            }

            .apvp-slot-visual[data-class="healer"] .apvp-hat {
                opacity: 1;
                left: 14px;
                top: 2px;
                width: 16px;
                height: 7px;
                border-radius: 999px;
                background: linear-gradient(90deg, transparent, #fffce6 20% 80%, transparent);
            }

            .apvp-slot-visual[data-class="healer"] .apvp-accent {
                left: 4px;
                top: 21px;
                width: 11px;
                height: 11px;
                background: none;
                border-radius: 0;
            }

            .apvp-slot-visual[data-class="healer"] .apvp-accent::before,
            .apvp-slot-visual[data-class="healer"] .apvp-accent::after {
                content: "";
                position: absolute;
                left: 4px;
                top: 0;
                width: 3px;
                height: 11px;
                border-radius: 999px;
                background: #f6fff0;
                box-shadow: 0 0 10px rgba(127, 255, 212, 0.65);
            }

            .apvp-slot-visual[data-class="healer"] .apvp-accent::after {
                transform: rotate(90deg);
            }

            .apvp-slot-visual[data-class="paladin"] .apvp-avatar {
                --apvp-primary: #f0b83f;
                --apvp-secondary: #fff5bb;
                --apvp-glow: rgba(255, 224, 112, 0.5);
                --apvp-dark: #4f3920;
            }

            .apvp-slot-visual[data-class="paladin"] .apvp-accent {
                left: 0;
                top: 27px;
                width: 14px;
                height: 16px;
                border-radius: 6px;
                background: linear-gradient(180deg, #fff6cf, #e4a829);
            }

            .apvp-slot-visual[data-class="paladin"] .apvp-weapon {
                width: 6px;
                height: 22px;
                right: 7px;
                top: 18px;
                transform: rotate(10deg);
            }

            .apvp-slot-visual[data-class="necromancer"] .apvp-avatar {
                --apvp-primary: #6a47d4;
                --apvp-secondary: #70f0b5;
                --apvp-glow: rgba(150, 108, 255, 0.48);
                --apvp-dark: #1c1030;
            }

            .apvp-slot-visual[data-class="necromancer"] .apvp-hat {
                opacity: 1;
                left: 9px;
                width: 25px;
                height: 15px;
                border-radius: 12px 12px 5px 5px;
                background: linear-gradient(180deg, #d9d1ff, #34135b);
            }

            .apvp-slot-visual[data-class="necromancer"] .apvp-accent {
                left: 3px;
                top: 18px;
                width: 13px;
                height: 13px;
                background: radial-gradient(circle, #f8fffb 0 18%, rgba(112, 240, 181, 0.85) 19% 45%, rgba(106, 71, 212, 0.9) 46% 70%, transparent 75%);
            }

            .apvp-slot-visual[data-class="monk"] .apvp-avatar {
                --apvp-primary: #ffb257;
                --apvp-secondary: #ffe39b;
                --apvp-glow: rgba(255, 199, 118, 0.42);
                --apvp-dark: #50331b;
            }

            .apvp-slot-visual[data-class="monk"] .apvp-weapon {
                width: 12px;
                height: 12px;
                right: 2px;
                top: 25px;
                border-radius: 50%;
                background: radial-gradient(circle, #fff5d3 0 30%, #ffb257 31% 70%, transparent 75%);
                transform: none;
            }

            .apvp-slot-visual[data-class="berserker"] .apvp-avatar {
                --apvp-primary: #ff4f63;
                --apvp-secondary: #ffb55d;
                --apvp-glow: rgba(255, 92, 116, 0.45);
                --apvp-dark: #4a1822;
            }

            .apvp-slot-visual[data-class="berserker"] .apvp-weapon {
                width: 20px;
                height: 6px;
                top: 18px;
                transform: rotate(-50deg);
            }

            .apvp-slot-visual[data-class="shadow"] .apvp-avatar {
                --apvp-primary: #505575;
                --apvp-secondary: #b59af8;
                --apvp-glow: rgba(141, 146, 210, 0.42);
                --apvp-dark: #0e1320;
                --apvp-skin: #c8bfd8;
            }

            .apvp-slot-visual[data-class="shadow"] .apvp-hat {
                opacity: 1;
                left: 8px;
                width: 28px;
                height: 16px;
                border-radius: 14px 14px 10px 10px;
                background: linear-gradient(180deg, #c2b7ff, #252845);
            }

            .apvp-fx {
                position: absolute;
                left: 0;
                top: 0;
                transform-origin: left center;
                opacity: 0;
                will-change: transform, opacity;
            }

            .apvp-fx.apvp-beam {
                height: 6px;
                border-radius: 999px;
                box-shadow: 0 0 14px rgba(255, 255, 255, 0.55);
                animation: apvp-beam 0.5s ease-out forwards;
            }

            .apvp-fx.apvp-slash {
                width: 98px;
                height: 10px;
                border-radius: 999px;
                box-shadow: 0 0 12px rgba(255, 255, 255, 0.45);
                animation: apvp-slash 0.42s ease-out forwards;
            }

            .apvp-fx.apvp-ring,
            .apvp-fx.apvp-orb,
            .apvp-fx.apvp-impact {
                border-radius: 50%;
                animation: apvp-pop 0.6s ease-out forwards;
            }

            .apvp-fx.apvp-impact {
                animation-duration: 0.46s;
            }

            .apvp-fx.apvp-rune {
                width: 54px;
                height: 54px;
                border-radius: 50%;
                border: 2px solid rgba(255, 255, 255, 0.55);
                animation: apvp-rune 0.8s ease-out forwards;
            }

            .apvp-fx.apvp-particle {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                animation: apvp-particle 0.75s ease-out forwards;
            }

            @keyframes apvp-bob {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-3px); }
            }

            @keyframes apvp-cast {
                0% { transform: translateY(0) scale(1); }
                30% { transform: translateY(-5px) scale(1.06); }
                100% { transform: translateY(0) scale(1); }
            }

            @keyframes apvp-hit-shake {
                0% { transform: translateX(0); }
                25% { transform: translateX(-4px); }
                50% { transform: translateX(4px); }
                75% { transform: translateX(-3px); }
                100% { transform: translateX(0); }
            }

            @keyframes apvp-pulse {
                0%, 100% { transform: scale(0.88); opacity: 0.5; }
                50% { transform: scale(1.12); opacity: 0.95; }
            }

            @keyframes apvp-beam {
                0% { opacity: 0; transform: scaleX(0.15); }
                20% { opacity: 1; }
                100% { opacity: 0; transform: scaleX(1); }
            }

            @keyframes apvp-slash {
                0% { opacity: 0; transform: translateX(-18px) scaleX(0.7) rotate(-20deg); }
                25% { opacity: 1; }
                100% { opacity: 0; transform: translateX(18px) scaleX(1.1) rotate(-20deg); }
            }

            @keyframes apvp-power-slash-main {
                0% { opacity: 0; transform: translateX(-24px) scaleX(0.62) rotate(-24deg); }
                24% { opacity: 1; }
                100% { opacity: 0; transform: translateX(20px) scaleX(1.18) rotate(-24deg); }
            }

            @keyframes apvp-power-slash-trail {
                0% { opacity: 0; transform: translateX(-8px) scaleX(0.5) rotate(-24deg); }
                36% { opacity: 0.92; }
                100% { opacity: 0; transform: translateX(16px) scaleX(1.08) rotate(-24deg); }
            }

            @keyframes apvp-pop {
                0% { opacity: 0; transform: scale(0.3); }
                20% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.6); }
            }

            @keyframes apvp-rune {
                0% { opacity: 0; transform: scale(0.4) rotate(0deg); }
                20% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.5) rotate(120deg); }
            }

            @keyframes apvp-particle {
                0% { opacity: 0; transform: scale(0.3) translateY(0); }
                25% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.25) translateY(-18px); }
            }

            @keyframes apvp-fireball-burst {
                0% { opacity: 0; transform: scale(0.25); }
                28% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.45); }
            }

            @keyframes apvp-fireball-flight {
                0% { opacity: 0; transform: translateX(-6px) scale(0.55); }
                18% { opacity: 1; }
                100% { opacity: 0; transform: translateX(56px) scale(1.08); }
            }

            @keyframes apvp-meteor-flight {
                0% { opacity: 0; transform: translate(-12px, -10px) scaleX(0.45) rotate(-20deg); }
                22% { opacity: 1; }
                100% { opacity: 0; transform: translate(8px, 10px) scaleX(1.08) rotate(-20deg); }
            }

            @keyframes apvp-frost-spike {
                0% { opacity: 0; transform: translateX(-10px) scaleY(0.55); }
                24% { opacity: 1; }
                100% { opacity: 0; transform: translateX(4px) scaleY(1.18); }
            }

            @keyframes apvp-shadow-sickle {
                0% { opacity: 0; transform: rotate(-60deg) scale(0.45); }
                25% { opacity: 0.95; }
                100% { opacity: 0; transform: rotate(55deg) scale(1.14); }
            }

            @keyframes apvp-smite-column {
                0% { opacity: 0; transform: scaleY(0.3); }
                24% { opacity: 1; }
                100% { opacity: 0; transform: scaleY(1.12); }
            }

            @keyframes apvp-arcane-burst {
                0% { opacity: 0; transform: scale(0.24); }
                22% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.3); }
            }

            @keyframes apvp-sacrifice-rune {
                0% { opacity: 0; transform: scale(0.5) rotate(0deg); }
                25% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.3) rotate(150deg); }
            }

            @keyframes apvp-sacrifice-burst {
                0% { opacity: 0; transform: scaleX(0.22); }
                24% { opacity: 1; }
                100% { opacity: 0; transform: scaleX(1.08); }
            }

            @keyframes apvp-arrow-tip {
                0% { opacity: 0; transform: translateX(-26px) rotate(45deg) scale(0.65); }
                20% { opacity: 1; }
                100% { opacity: 0; transform: translateX(8px) rotate(45deg) scale(1.05); }
            }

            @keyframes apvp-volley {
                0% { opacity: 0; transform: translateX(-18px) scaleX(0.55) rotate(-8deg); }
                22% { opacity: 1; }
                100% { opacity: 0; transform: translateX(12px) scaleX(1.05) rotate(-8deg); }
            }

            @keyframes apvp-poison-burst {
                0% { opacity: 0; transform: scale(0.25); }
                24% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.35); }
            }

            @keyframes apvp-impact-burst {
                0% { opacity: 0; transform: scale(0.28); }
                22% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.35); }
            }

            @keyframes apvp-impact-wave {
                0% { opacity: 0; transform: scaleX(0.3); }
                20% { opacity: 0.92; }
                100% { opacity: 0; transform: scaleX(1.18); }
            }

            @keyframes apvp-toggle-orb-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.04); }
            }

            @keyframes apvp-monitor-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(86, 225, 128, 0.26); transform: translateY(0); }
                50% { box-shadow: 0 0 0 8px rgba(86, 225, 128, 0); transform: translateY(-1px); }
            }

            @keyframes apvp-blood-drip-main {
                0%, 100% { transform: translateX(-50%) scaleY(0.72); opacity: 0.8; }
                45% { transform: translateX(-50%) translateY(4px) scaleY(1); opacity: 1; }
                80% { transform: translateX(-50%) translateY(8px) scaleY(0.82); opacity: 0.88; }
            }

            @keyframes apvp-blood-drip-side {
                0%, 100% { transform: translateY(0) scaleY(0.7); opacity: 0.76; }
                50% { transform: translateY(4px) scaleY(1); opacity: 1; }
                82% { transform: translateY(7px) scaleY(0.86); opacity: 0.84; }
            }
        `;

        document.head.appendChild(style);
    }

    function buildCheckboxField(settingName, labelText) {
        const helpText = escapeHtml(SETTING_HELP[settingName] || labelText);
        return `<label title="${helpText}"><input type="checkbox" data-setting="${settingName}" title="${helpText}">${labelText}</label>`;
    }

    function buildHintTitle(key) {
        return escapeHtml(SETTING_HELP[key] || "");
    }

    function renderPanel() {
        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement("div");
            panel.id = PANEL_ID;
            panel.addEventListener("change", handlePanelChange);
            panel.addEventListener("click", handlePanelClick);
            (document.body || document.documentElement).appendChild(panel);
            panel.innerHTML = `
                <div class="apvp-header">
                    <div class="apvp-title">GravyPvP</div>
                    <button type="button" data-action="toggle-panel" title="Collapse GravyPvP" aria-label="Collapse GravyPvP">
                        <span class="apvp-toggle-label">Hide</span>
                        <span class="apvp-toggle-icon" aria-hidden="true">
                            <span class="apvp-toggle-orb"></span>
                            <span class="apvp-toggle-sword"></span>
                            <span class="apvp-toggle-hilt"></span>
                            <span class="apvp-toggle-blood"></span>
                        </span>
                    </button>
                </div>
                <div class="apvp-body">
                    <div class="apvp-row">
                        <button type="button" data-action="start-worker" title="Start the hidden PvP worker so the visible page stays idle.">Start</button>
                        <button type="button" data-action="stop-worker" title="Stop the hidden PvP worker and leave the visible page alone.">Stop</button>
                    </div>
                    <div class="apvp-worker"></div>
                    <div class="apvp-row apvp-row-single apvp-start-now-row">
                        <button type="button" data-action="start-now" title="Override token banking and start with the current tokens for this run.">Start now</button>
                    </div>
                    <div class="apvp-stats">
                        <div class="apvp-stat">
                            <span class="apvp-stat-label">Wins</span>
                            <span class="apvp-stat-value" data-stat="wins">0</span>
                        </div>
                        <div class="apvp-stat">
                            <span class="apvp-stat-label">Losses</span>
                            <span class="apvp-stat-value" data-stat="losses">0</span>
                        </div>
                    </div>
                    <div class="apvp-preview"></div>
                    <div class="apvp-row">
                        ${buildCheckboxField("battleVisuals", "Visual FX")}
                    </div>
                    <div class="apvp-row">
                        <label title="${buildHintTitle("skillNumber")}">Fallback slot <input type="number" min="1" max="9" step="1" data-setting="skillNumber" title="${buildHintTitle("skillNumber")}"></label>
                        <label title="${buildHintTitle("playerClass")}">Class ${buildClassSelect()}</label>
                    </div>
                    <div class="apvp-priority"></div>
                    <div class="apvp-status"></div>
                    <div class="apvp-error" hidden></div>
                    <div class="apvp-muted"></div>
                    <div class="apvp-footer"><span class="apvp-version">v${SCRIPT_VERSION}</span></div>
                </div>
            `;
        }

        syncPanelState();
    }

    function syncPanelState() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) {
            return;
        }

        panel.classList.toggle("collapsed", !settings.expanded);
        panel.classList.toggle("apvp-no-fx", !settings.battleVisuals);

        syncCheckbox(panel, "battleVisuals", settings.battleVisuals);

        const skillInput = panel.querySelector('input[data-setting="skillNumber"]');
        if (skillInput instanceof HTMLInputElement && skillInput.value !== String(settings.skillNumber)) {
            skillInput.value = String(settings.skillNumber);
        }

        const classSelect = panel.querySelector('select[data-setting="playerClass"]');
        if (classSelect instanceof HTMLSelectElement && classSelect.value !== settings.playerClass) {
            classSelect.value = settings.playerClass;
        }
        if (classSelect instanceof HTMLSelectElement) {
            classSelect.title = SETTING_HELP.playerClass;
        }

        const toggleButton = panel.querySelector('button[data-action="toggle-panel"]');
        if (toggleButton instanceof HTMLButtonElement) {
            const toggleLabel = toggleButton.querySelector(".apvp-toggle-label");
            if (toggleLabel) {
                toggleLabel.textContent = settings.expanded ? "Hide" : "Show";
            }
            const buttonLabel = settings.expanded ? "Collapse GravyPvP" : "Open GravyPvP";
            toggleButton.title = buttonLabel;
            toggleButton.setAttribute("aria-label", buttonLabel);
        }

        const currentStats = getBattleStats();
        const winsNode = panel.querySelector('[data-stat="wins"]');
        if (winsNode) {
            winsNode.textContent = String(currentStats.wins);
        }

        const lossesNode = panel.querySelector('[data-stat="losses"]');
        if (lossesNode) {
            lossesNode.textContent = String(currentStats.losses);
        }

        const statusNode = panel.querySelector(".apvp-status");
        if (statusNode) {
            statusNode.textContent = statusText;
        }

        const workerNode = panel.querySelector(".apvp-worker");
        const workerState = getCurrentWorkerState();
        if (workerNode) {
            workerNode.textContent = workerState.text;
        }

        const startNowRow = panel.querySelector(".apvp-start-now-row");
        if (startNowRow instanceof HTMLElement) {
            startNowRow.hidden = !workerState.showStartNow;
        }

        if (settings.battleVisuals) {
            syncPreviewPanel(panel);
        }

        const startWorkerButton = panel.querySelector('button[data-action="start-worker"]');
        if (startWorkerButton instanceof HTMLButtonElement) {
            startWorkerButton.disabled = workerState.active;
            startWorkerButton.dataset.running = workerState.active ? "1" : "0";
            startWorkerButton.textContent = workerState.active ? "Monitoring" : "Start";
            startWorkerButton.title = workerState.active
                ? "Hidden PvP worker is running and monitoring tokens in the background."
                : "Start the hidden PvP worker so the visible page stays idle.";
        }

        const startNowButton = panel.querySelector('button[data-action="start-now"]');
        if (startNowButton instanceof HTMLButtonElement) {
            startNowButton.disabled = !workerState.active || workerState.forceStartNow;
            startNowButton.dataset.armed = workerState.forceStartNow ? "1" : "0";
            startNowButton.textContent = workerState.forceStartNow ? "Start now armed" : "Start now";
            startNowButton.title = !workerState.active
                ? "Start the hidden worker first."
                : workerState.forceStartNow
                    ? "Immediate start override is armed for this run."
                    : "Override token banking and start with the current tokens for this run.";
        }

        const stopWorkerButton = panel.querySelector('button[data-action="stop-worker"]');
        if (stopWorkerButton instanceof HTMLButtonElement) {
            stopWorkerButton.disabled = !workerState.active;
        }

        const errorNode = panel.querySelector(".apvp-error");
        if (errorNode) {
            errorNode.textContent = lastError;
            errorNode.hidden = !lastError;
        }

        const pathNode = panel.querySelector(".apvp-muted");
        if (pathNode) {
            pathNode.textContent = location.pathname;
        }

        renderSkillPriorityPanel(panel);
    }

    function syncCheckbox(panel, settingName, value) {
        const checkbox = panel.querySelector(`input[type="checkbox"][data-setting="${settingName}"]`);
        if (checkbox instanceof HTMLInputElement) {
            checkbox.checked = !!value;
        }
    }

    function buildPreviewState(overrides = {}) {
        const selectedClass = getSelectedPlayerClassKey() || "adventurer";
        return {
            allyClass: selectedClass,
            enemyClass: "shadow",
            effectType: "",
            actionText: "Standing by",
            phase: "idle",
            eventId: 0,
            ...overrides
        };
    }

    function getCurrentPreviewState() {
        if (!WORKER_MODE && hasBackgroundWorkerSession()) {
            const report = readWorkerReport();
            const sessionId = String(workerSession || localStorage.getItem(WORKER_SESSION_KEY) || "").trim();
            if (report?.sessionId === sessionId && report.preview) {
                return buildPreviewState(report.preview);
            }
        }

        return buildPreviewState(previewState);
    }

    function syncPreviewPanel(panel) {
        const container = panel.querySelector(".apvp-preview");
        if (!container) {
            return;
        }

        const preview = getCurrentPreviewState();
        if (!container.querySelector(".apvp-preview-stage")) {
            container.innerHTML = buildPreviewMarkup(preview);
        }

        const allySide = container.querySelector(".apvp-preview-side.ally");
        const enemySide = container.querySelector(".apvp-preview-side.enemy");
        const allyVisual = allySide?.querySelector(".apvp-slot-visual");
        const enemyVisual = enemySide?.querySelector(".apvp-slot-visual");
        const labelNode = container.querySelector(".apvp-preview-label");
        const phase = String(preview.phase || "idle");

        syncPreviewAvatar(allyVisual, preview.allyClass, "ally");
        syncPreviewAvatar(enemyVisual, preview.enemyClass || "shadow", "enemy");
        syncPreviewPhase(allySide, "apvp-preview-cast", phase === "action" || phase === "cast" || phase === "ally-action" || phase === "ally-cast", preview.eventId);
        syncPreviewPhase(allySide, "apvp-preview-hit", phase === "enemy-action" || phase === "enemy-hit" || phase === "enemy-cast", preview.eventId);
        syncPreviewPhase(enemySide, "apvp-preview-cast", phase === "enemy-action" || phase === "enemy-cast", preview.eventId);
        syncPreviewPhase(enemySide, "apvp-preview-hit", phase === "action" || phase === "hit" || phase === "cast" || phase === "ally-action" || phase === "ally-cast", preview.eventId);
        syncPreviewEffect(container, preview);

        if (labelNode) {
            labelNode.textContent = preview.actionText || "Standing by";
        }
    }

    function buildPreviewMarkup(preview) {
        const allyProfile = getClassProfile(preview.allyClass);
        const enemyProfile = getClassProfile(preview.enemyClass || "shadow");

        return `
            <div class="apvp-preview-stage">
                <div class="apvp-preview-side ally">
                    <div class="apvp-slot-visual" data-class="${escapeHtml(preview.allyClass)}" data-team="ally">${buildAvatarMarkup(allyProfile.label, preview.allyClass)}</div>
                </div>
                <div class="apvp-preview-center">
                    <div class="apvp-preview-effect" data-effect="${escapeHtml(preview.effectType || "")}" data-event="${escapeHtml(preview.eventId || 0)}"></div>
                </div>
                <div class="apvp-preview-side enemy">
                    <div class="apvp-slot-visual" data-class="${escapeHtml(preview.enemyClass || "shadow")}" data-team="enemy">${buildAvatarMarkup(enemyProfile.label, preview.enemyClass || "shadow")}</div>
                </div>
            </div>
            <div class="apvp-preview-label">${escapeHtml(preview.actionText || "Standing by")}</div>
        `;
    }

    function syncPreviewAvatar(node, classKey, team) {
        if (!(node instanceof HTMLElement)) {
            return;
        }

        const rawClass = String(classKey || "").trim().toLowerCase();
        const normalizedClass = rawClass && rawClass !== "auto" ? rawClass : "adventurer";
        const profile = getClassProfile(normalizedClass);
        if (node.dataset.class !== normalizedClass || node.dataset.team !== team || !node.firstElementChild) {
            node.dataset.class = normalizedClass;
            node.dataset.team = team;
            node.innerHTML = buildAvatarMarkup(profile.label, normalizedClass);
        }
    }

    function syncPreviewPhase(node, className, active, eventId) {
        if (!(node instanceof HTMLElement)) {
            return;
        }

        const eventKey = String(eventId || 0);
        const phaseKey = `${className}:${eventKey}`;
        const phaseStoreKey = `phase${className.replace(/[^a-z0-9]+/gi, "")}`;
        if (!active) {
            node.classList.remove(className);
            delete node.dataset[phaseStoreKey];
            return;
        }

        if (node.dataset[phaseStoreKey] === phaseKey && node.classList.contains(className)) {
            return;
        }

        node.dataset[phaseStoreKey] = phaseKey;
        node.classList.remove(className);
        void node.offsetWidth;
        node.classList.add(className);
    }

    function syncPreviewEffect(container, preview) {
        const center = container.querySelector(".apvp-preview-center");
        if (!(center instanceof HTMLElement)) {
            return;
        }

        const effectKey = `${preview.effectType || ""}:${preview.eventId || 0}`;
        if (center.dataset.effectKey === effectKey) {
            return;
        }

        center.dataset.effectKey = effectKey;
        const effectNode = document.createElement("div");
        effectNode.className = "apvp-preview-effect";
        effectNode.dataset.effect = preview.effectType || "";
        effectNode.dataset.event = String(preview.eventId || 0);

        const oldNode = center.querySelector(".apvp-preview-effect");
        if (oldNode) {
            oldNode.replaceWith(effectNode);
        } else {
            center.appendChild(effectNode);
        }
    }

    function recordPreviewEvent(actionText, effectType = "", options = {}) {
        const phase = options.phase || (effectType ? "action" : "idle");
        previewState = buildPreviewState({
            ...previewState,
            allyClass: options.allyClass || previewState.allyClass || getSelectedPlayerClassKey() || "adventurer",
            enemyClass: options.enemyClass || previewState.enemyClass || "shadow",
            effectType,
            actionText,
            phase,
            eventId: Date.now()
        });

        if (!String(phase).startsWith("enemy")) {
            lastEnemyPreviewKey = "";
        }

        if (WORKER_MODE) {
            publishWorkerReport(options.reportPhase || "running", actionText);
            return;
        }

        if (!hasBackgroundWorkerSession()) {
            syncPanelState();
        }
    }

    function renderSkillPriorityPanel(panel) {
        const container = panel.querySelector(".apvp-priority");
        if (!container) {
            return;
        }

        const classKey = getPriorityClassKey();
        const profile = getClassProfile(classKey);
        const priorities = getSkillPriorityList(classKey);
        const disabledSkills = new Set(getDisabledSkillList(classKey));

        container.innerHTML = `
            <div class="apvp-priority-head">
                <span>Priority for ${escapeHtml(profile.label)}</span>
                <button type="button" data-action="reset-skills" ${priorities.length ? "" : "disabled"}>Reset</button>
            </div>
            <div class="apvp-priority-list">
                ${priorities.length ? priorities.map((skillName, index) => `
                    <div class="apvp-priority-item ${disabledSkills.has(skillName) ? "apvp-skill-disabled" : ""}">
                        <div class="apvp-priority-rank">${index + 1}</div>
                        <div class="apvp-priority-name" title="${escapeHtml(skillName)}">${escapeHtml(skillName)}${disabledSkills.has(skillName) ? " <small>Off</small>" : ""}</div>
                        <div class="apvp-priority-actions">
                            <button type="button" data-action="toggle-skill-enabled" data-skill="${escapeHtml(skillName)}" data-disabled="${disabledSkills.has(skillName) ? "1" : "0"}">${disabledSkills.has(skillName) ? "Off" : "On"}</button>
                            <button type="button" data-action="skill-up" data-index="${index}" ${index === 0 ? "disabled" : ""}>Up</button>
                            <button type="button" data-action="skill-down" data-index="${index}" ${index === priorities.length - 1 ? "disabled" : ""}>Dn</button>
                        </div>
                    </div>
                `).join("") : `
                    <div class="apvp-priority-empty">Open a fight and let the skill menu appear once for ${escapeHtml(profile.label)} so GravyPvP can learn the skills.</div>
                `}
            </div>
        `;
    }

    function getPriorityClassKey() {
        return getSelectedPlayerClassKey() || "auto";
    }

    function getSkillPriorityList(classKey) {
        const priorities = settings.skillPriorities;
        if (!priorities || typeof priorities !== "object") {
            return [];
        }

        const list = priorities[classKey];
        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .map((skillName) => String(skillName || "").trim())
            .filter(Boolean);
    }

    function getDisabledSkillList(classKey) {
        const disabled = settings.skillDisabled;
        if (!disabled || typeof disabled !== "object") {
            return [];
        }

        const list = disabled[classKey];
        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .map((skillName) => String(skillName || "").trim())
            .filter(Boolean);
    }

    function isSkillDisabled(classKey, skillName) {
        return getDisabledSkillList(classKey).includes(String(skillName || "").trim());
    }

    function handlePanelChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
            return;
        }

        const settingName = target.dataset.setting;
        if (!settingName) {
            return;
        }

        if (target.type === "checkbox") {
            settings[settingName] = target.checked;
        } else if (target.type === "number") {
            settings.skillNumber = clampSkillNumber(target.value);
        } else if (target instanceof HTMLSelectElement) {
            settings.playerClass = normalizeClassKey(target.value);
        }

        saveSettings();

        syncPanelState();
        touchProgress();
        scheduleTick();
        scheduleVisualRefresh(80);
    }

    function handlePanelClick(event) {
        const rawTarget = event.target;
        if (!(rawTarget instanceof HTMLElement)) {
            return;
        }

        const target = rawTarget.closest("[data-action]");
        if (!(target instanceof HTMLElement) || !target.closest(`#${PANEL_ID}`)) {
            return;
        }

        const action = target.dataset.action;
        if (!action) {
            return;
        }

        if (action === "toggle-panel") {
            settings.expanded = !settings.expanded;
            saveSettings();
            syncPanelState();
            return;
        }

        if (action === "start-worker") {
            startBackgroundWorker();
            return;
        }

        if (action === "start-now") {
            requestImmediateStart();
            return;
        }

        if (action === "stop-worker") {
            stopBackgroundWorker("Stopped hidden background worker");
            return;
        }

        if (action === "skill-up" || action === "skill-down") {
            const index = Number.parseInt(target.dataset.index || "", 10);
            moveSkillPriority(index, action === "skill-up" ? -1 : 1);
            return;
        }

        if (action === "toggle-skill-enabled") {
            toggleSkillEnabled(target.dataset.skill || "");
            return;
        }

        if (action === "reset-skills") {
            resetSkillPriority();
        }
    }

    function clampSkillNumber(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) {
            return CONFIG.defaults.skillNumber;
        }
        return Math.min(9, Math.max(1, parsed));
    }

    function buildClassSelect() {
        return `
            <select data-setting="playerClass">
                ${CLASS_KEYS.map((classKey) => `<option value="${classKey}" ${settings.playerClass === classKey ? "selected" : ""}>${escapeHtml(getClassProfile(classKey).label)}</option>`).join("")}
            </select>
        `;
    }

    function normalizeClassKey(value) {
        return CLASS_KEYS.includes(value) ? value : "auto";
    }

    function moveSkillPriority(index, direction) {
        const classKey = getPriorityClassKey();
        const skills = getSkillPriorityList(classKey);
        const nextIndex = index + direction;

        if (!Number.isInteger(index) || index < 0 || nextIndex < 0 || nextIndex >= skills.length) {
            return;
        }

        const reordered = [...skills];
        const [moved] = reordered.splice(index, 1);
        reordered.splice(nextIndex, 0, moved);
        settings.skillPriorities[classKey] = reordered;
        saveSettings();
        syncPanelState();
    }

    function toggleSkillEnabled(skillName) {
        const normalizedSkill = String(skillName || "").trim();
        if (!normalizedSkill) {
            return;
        }

        const classKey = getPriorityClassKey();
        const disabledSkills = getDisabledSkillList(classKey);
        const nextDisabled = disabledSkills.includes(normalizedSkill)
            ? disabledSkills.filter((name) => name !== normalizedSkill)
            : [...disabledSkills, normalizedSkill];

        if (nextDisabled.length) {
            settings.skillDisabled[classKey] = uniqueSkillNames(nextDisabled);
        } else {
            delete settings.skillDisabled[classKey];
        }

        saveSettings();
        syncPanelState();
        updateStatus(`${normalizedSkill} ${isSkillDisabled(classKey, normalizedSkill) ? "disabled" : "enabled"} for ${getClassProfile(classKey).label}`);
    }

    function requestImmediateStart() {
        if (WORKER_MODE) {
            forceStartNow = true;
            updateStatus("Lobby: start now override armed");
            return;
        }

        const workerState = getCurrentWorkerState();
        const sessionId = String(workerSession || localStorage.getItem(WORKER_SESSION_KEY) || "").trim();
        if (!workerState.active || !sessionId) {
            syncPanelState();
            return;
        }

        publishWorkerCommand("start_now", sessionId, "Immediate start override requested");
        updateStatus("Start now override requested");
    }

    function resetSkillPriority() {
        const classKey = getPriorityClassKey();
        const hasPriority = !!settings.skillPriorities?.[classKey];
        const hasDisabled = !!settings.skillDisabled?.[classKey];
        if (!hasPriority && !hasDisabled) {
            return;
        }

        delete settings.skillPriorities[classKey];
        delete settings.skillDisabled[classKey];
        saveSettings();
        syncPanelState();
        updateStatus(`Cleared saved skill settings for ${getClassProfile(classKey).label}`);
    }

    function parseLaunchFlags() {
        const hash = String(window.location.hash || "").replace(/^#/, "");
        const params = new URLSearchParams(hash);
        const nameMatch = String(window.name || "").match(/^gravy-worker:(.+)$/);
        return {
            worker: params.get("gravy-worker") || (nameMatch ? "1" : ""),
            session: params.get("gravy-session") || (nameMatch ? nameMatch[1] : "")
        };
    }

    function ensureHiddenWorkerHost() {
        let host = document.getElementById(WORKER_HOST_ID);
        if (host) {
            return host;
        }

        host = document.createElement("div");
        host.id = WORKER_HOST_ID;
        host.setAttribute("aria-hidden", "true");
        host.style.cssText = "position:fixed;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;";
        document.body.appendChild(host);
        return host;
    }

    function createHiddenWorkerFrame(urlValue, frameName = "") {
        const host = ensureHiddenWorkerHost();
        const frame = document.createElement("iframe");
        if (frameName) {
            frame.name = frameName;
        }
        frame.src = String(urlValue || "");
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
        frame.setAttribute("aria-hidden", "true");
        frame.tabIndex = -1;
        frame.style.cssText = "position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
        host.appendChild(frame);
        return frame;
    }

    function buildWorkerSessionId() {
        return `gravy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function hasBackgroundWorkerSession() {
        return !WORKER_MODE && !!String(workerSession || localStorage.getItem(WORKER_SESSION_KEY) || "").trim();
    }

    function readWorkerCommand() {
        try {
            const raw = localStorage.getItem(WORKER_COMMAND_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function publishWorkerCommand(command, sessionId, detail = "") {
        const normalizedSession = String(sessionId || "").trim();
        if (!normalizedSession) {
            return;
        }

        localStorage.setItem(WORKER_COMMAND_KEY, JSON.stringify({
            sessionId: normalizedSession,
            command,
            detail: String(detail || ""),
            issuedAt: Date.now()
        }));
    }

    function clearWorkerCommand(sessionId) {
        const command = readWorkerCommand();
        if (command?.sessionId === sessionId) {
            localStorage.removeItem(WORKER_COMMAND_KEY);
        }
    }

    function clearWorkerSessionState(sessionId = "") {
        const normalizedSession = String(sessionId || workerSession || localStorage.getItem(WORKER_SESSION_KEY) || "").trim();
        if (normalizedSession) {
            clearWorkerCommand(normalizedSession);
        }

        workerSession = "";
        if (workerFrame) {
            workerFrame.remove();
            workerFrame = null;
        }

        localStorage.removeItem(WORKER_SESSION_KEY);
        localStorage.removeItem(WORKER_REPORT_KEY);
        localStorage.removeItem(WORKER_COMMAND_KEY);
    }

    function shouldStopWorkerSession() {
        if (!WORKER_MODE) {
            return false;
        }

        const command = readWorkerCommand();
        return command?.sessionId === WORKER_SESSION_ID && command.command === "stop";
    }

    function consumeImmediateStartCommand() {
        if (!WORKER_MODE) {
            return false;
        }

        const command = readWorkerCommand();
        if (command?.sessionId !== WORKER_SESSION_ID || command.command !== "start_now") {
            return false;
        }

        forceStartNow = true;
        clearWorkerCommand(WORKER_SESSION_ID);
        updateStatus("Lobby: start now override armed");
        touchProgress();
        return true;
    }

    function closeCurrentWorkerSoon() {
        if (!WORKER_MODE) {
            return;
        }

        window.setTimeout(() => {
            try {
                if (window.top !== window.self && window.frameElement instanceof HTMLIFrameElement) {
                    window.frameElement.remove();
                    return;
                }

                window.close();
            } catch (error) {
                // Ignore windows the browser refuses to close.
            }
        }, 140);
    }

    function startBackgroundWorker() {
        if (WORKER_MODE) {
            syncPanelState();
            return;
        }

        if (getCurrentWorkerState().active) {
            syncPanelState();
            return;
        }

        const sessionId = buildWorkerSessionId();
        settings.enabled = true;
        saveSettings();
        workerSession = sessionId;
        localStorage.setItem(WORKER_SESSION_KEY, sessionId);
        clearWorkerCommand(sessionId);
        publishWorkerReport("starting", "Launching hidden background worker", sessionId);

        const url = new URL("https://demonicscans.org/pvp.php");
        url.hash = `gravy-worker=1&gravy-session=${encodeURIComponent(sessionId)}`;
        workerFrame = createHiddenWorkerFrame(url.toString(), `gravy-worker:${sessionId}`);
        updateStatus("Started hidden background worker");
    }

    function stopBackgroundWorker(message = "Stopped hidden background worker") {
        const sessionId = String(workerSession || localStorage.getItem(WORKER_SESSION_KEY) || "").trim();
        if (sessionId) {
            publishWorkerCommand("stop", sessionId, message);
        }

        if (sessionId) {
            publishWorkerReport("stopped", message, sessionId);
        }

        settings.enabled = false;
        forceStartNow = false;
        saveSettings();
        previewState = buildPreviewState({
            actionText: "Background idle",
            phase: "idle",
            eventId: Date.now()
        });
        clearWorkerSessionState(sessionId);
        updateStatus(message);
    }

    function readWorkerReport() {
        try {
            const raw = localStorage.getItem(WORKER_REPORT_KEY);
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return null;
            }

            return parsed;
        } catch (error) {
            return null;
        }
    }

    function publishWorkerReport(phase, detail, sessionOverride = "") {
        const sessionId = String(sessionOverride || workerSession || WORKER_SESSION_ID || "").trim();
        if (!sessionId) {
            return;
        }

        const preview = buildPreviewState(previewState);
        localStorage.setItem(WORKER_REPORT_KEY, JSON.stringify({
            sessionId,
            phase,
            detail: String(detail || ""),
            path: `${location.pathname}${location.search}`,
            updatedAt: Date.now(),
            preview,
            forceStartNow
        }));

        if (phase === "stopped") {
            clearWorkerCommand(sessionId);
        }
    }

    function getCurrentWorkerState() {
        const report = readWorkerReport();
        const sessionId = String(workerSession || localStorage.getItem(WORKER_SESSION_KEY) || "").trim();
        if (!sessionId) {
            return { active: false, text: "Background worker idle", forceStartNow: false, showStartNow: false };
        }

        if (!WORKER_MODE && !workerFrame?.isConnected) {
            clearWorkerSessionState(sessionId);
            return { active: false, text: "Background worker idle", forceStartNow: false, showStartNow: false };
        }

        const matchingReport = report && report.sessionId === sessionId ? report : null;
        const fresh = matchingReport
            && (Date.now() - Number(matchingReport.updatedAt || 0)) <= CONFIG.workerStaleMs
            && matchingReport.phase !== "stopped";

        if (workerFrame?.isConnected || fresh) {
            const detail = matchingReport?.detail || "Background worker active";
            const path = matchingReport?.path ? ` on ${matchingReport.path}` : "";
            const showStartNow = !!matchingReport
                && /\/pvp\.php/i.test(String(matchingReport.path || ""))
                && /banking tokens|start now armed|start now override armed/i.test(String(matchingReport.detail || ""));
            return {
                active: true,
                text: `${detail}${path}`,
                forceStartNow: !!matchingReport?.forceStartNow,
                showStartNow
            };
        }

        if (!WORKER_MODE) {
            clearWorkerSessionState(sessionId);
        }

        return { active: false, text: "Background worker idle", forceStartNow: false, showStartNow: false };
    }

    function getWorkerSummaryText() {
        return getCurrentWorkerState().text;
    }

    function isBackgroundWorkerRunning() {
        return getCurrentWorkerState().active;
    }

    function updateStatus(text) {
        statusText = text;
        if (WORKER_MODE) {
            publishWorkerReport("running", text);
            return;
        }

        syncPanelState();
    }

    function rememberError(error) {
        lastError = String(error);
        console.error("GravyPvP:", error);
        if (WORKER_MODE) {
            publishWorkerReport("error", lastError);
            return;
        }

        syncPanelState();
    }

    function clearError() {
        if (!lastError) {
            return;
        }
        lastError = "";
        if (!WORKER_MODE) {
            syncPanelState();
        }
    }

    function observePage() {
        if (!document.body || observer) {
            return;
        }

        observer = new MutationObserver((mutations) => {
            const hasExternalChange = mutations.some((mutation) => !isManagedMutation(mutation));
            if (!hasExternalChange) {
                return;
            }

            touchProgress();
            scheduleTick(250);
            scheduleVisualRefresh(140);

            if (!WORKER_MODE && !document.getElementById(PANEL_ID)) {
                renderPanel();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["disabled", "class", "style", "data-alive"]
        });
    }

    function isManagedMutation(mutation) {
        if (isManagedNode(mutation.target)) {
            return true;
        }

        const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
        return nodes.length > 0 && nodes.every(isManagedNode);
    }

    function isManagedNode(node) {
        if (!(node instanceof Node)) {
            return false;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        const element = node;
        if (element.id === PANEL_ID || element.id === STAGE_ID || element.id === WORKER_HOST_ID) {
            return true;
        }

        return !!element.closest(`#${PANEL_ID}, #${STAGE_ID}, #${WORKER_HOST_ID}, .apvp-slot-visual`);
    }

    function scheduleTick(delay = 100) {
        window.clearTimeout(scheduledTick);
        scheduledTick = window.setTimeout(() => {
            scheduledTick = 0;
            tick();
        }, delay);
    }

    function scheduleVisualRefresh(delay = 120) {
        window.clearTimeout(scheduledVisualRefresh);
        scheduledVisualRefresh = window.setTimeout(() => {
            scheduledVisualRefresh = 0;
            refreshBattleVisuals();
        }, delay);
    }

    async function tick() {
        try {
            if (!WORKER_MODE) {
                renderPanel();
                if (hasBackgroundWorkerSession()) {
                    cleanupBattleVisuals();
                } else {
                    refreshBattleVisuals();
                }
            }

            if (shouldStopWorkerSession()) {
                previewState = buildPreviewState({
                    actionText: "Stopped",
                    phase: "idle",
                    eventId: Date.now()
                });
                publishWorkerReport("stopped", "Stopped by host");
                settings.enabled = false;
                closeCurrentWorkerSoon();
                return;
            }

            consumeImmediateStartCommand();

            if (isBattlePage()) {
                if (!battlePageEnteredAt) {
                    battlePageEnteredAt = Date.now();
                    battleOutcomeHandled = false;
                }
                lobbyPageEnteredAt = 0;

                const visibleSkillButtons = getSkillButtons();
                if (visibleSkillButtons.length) {
                    rememberSkillButtons(visibleSkillButtons);
                }
            } else if (isLobbyPage()) {
                if (!lobbyPageEnteredAt) {
                    lobbyPageEnteredAt = Date.now();
                }
                battlePageEnteredAt = 0;
                battleNoTargetLoops = 0;
                battleOutcomeHandled = false;
            } else {
                battlePageEnteredAt = 0;
                lobbyPageEnteredAt = 0;
                battleNoTargetLoops = 0;
                battleOutcomeHandled = false;
            }

            if (!settings.enabled) {
                updateStatus("Paused");
                return;
            }

            if (!WORKER_MODE && hasBackgroundWorkerSession()) {
                if (statusText !== getWorkerSummaryText()) {
                    updateStatus(getWorkerSummaryText());
                } else {
                    syncPanelState();
                }
                return;
            }

            if (!WORKER_MODE) {
                const dashboardText = "Dashboard idle. Click Start to run hidden fights.";
                if (statusText !== dashboardText) {
                    updateStatus(dashboardText);
                } else {
                    syncPanelState();
                }
                return;
            }

            if (isLobbyPage()) {
                await handleLobbyPage();
                return;
            }

            if (isBattlePage()) {
                await handleBattlePage();
                return;
            }

            updateStatus("Waiting on a PvP page");
        } catch (error) {
            rememberError(error?.message || error);
        }
    }

    function isLobbyPage() {
        return /\/pvp\.php$/i.test(window.location.pathname);
    }

    function isBattlePage() {
        return /\/pvp_battle\.php$/i.test(window.location.pathname);
    }

    async function handleLobbyPage() {
        clearError();

        const continueButton = findClickableElementByText([
            "continue solo match",
            "continue match",
            "resume match",
            "resume battle"
        ]);
        const joinButton = findVisibleElement([
            ".action-btn.js-matchmake",
            ".js-matchmake",
            "button[class*='matchmake']",
            "button[data-action*='match']",
            "a.action-btn.js-matchmake"
        ]);

        const tokens = getTokenCount();
        const tokenLabel = Number.isFinite(tokens) ? `tokens ${tokens}` : "tokens unknown";
        const shouldMonitorTokens = WORKER_MODE && settings.enabled;
        const readyTokenCount = Number(CONFIG.readyTokenCount) || 30;
        const tokenGoalLabel = `${readyTokenCount} tokens`;
        const activeTokenThreshold = forceStartNow ? 1 : readyTokenCount;

        if (continueButton) {
            recordPreviewEvent("Continuing solo match", "", {
                allyClass: getSelectedPlayerClassKey() || "adventurer",
                phase: "idle"
            });
            clickElement(continueButton, "Continuing solo match");
            return;
        }

        if (!joinButton) {
            if (shouldMonitorTokens && maybeRefreshLobbyMonitor(`Lobby: waiting for join button, ${tokenLabel}`)) {
                return;
            }
            updateStatus(`Lobby: waiting for join button, ${tokenLabel}`);
            return;
        }

        if (!Number.isFinite(tokens) || tokens < activeTokenThreshold) {
            const waitingText = forceStartNow
                ? (Number.isFinite(tokens)
                    ? `Lobby: start now armed. Waiting for tokens ${tokens}/1 to begin immediately.`
                    : "Lobby: start now armed. Waiting for the next token to begin immediately.")
                : (Number.isFinite(tokens)
                    ? `Lobby: banking tokens ${tokens}/${readyTokenCount} in background. Will start at ${readyTokenCount} to optimize win rate.`
                    : `Lobby: banking tokens in background, waiting for ${tokenGoalLabel}. Will start when full to optimize win rate.`);
            if (shouldMonitorTokens && maybeRefreshLobbyMonitor(waitingText)) {
                return;
            }
            updateStatus(waitingText);
            return;
        }

        if (!isClickable(joinButton)) {
            if (shouldMonitorTokens && maybeRefreshLobbyMonitor(`Lobby: join unavailable, ${tokenLabel}`)) {
                return;
            }
            updateStatus(`Lobby: join unavailable, ${tokenLabel}`);
            return;
        }

        if (Date.now() - lastJoinAt < CONFIG.joinCooldownMs) {
            updateStatus(`Lobby: cooldown, ${tokenLabel}`);
            return;
        }

        lastJoinAt = Date.now();
        forceStartNow = false;
        recordPreviewEvent("Joined PvP matchmaking", "", {
            allyClass: getSelectedPlayerClassKey() || "adventurer",
            phase: "idle"
        });
        clickElement(joinButton, "Joined PvP matchmaking");
    }

    async function handleBattlePage() {
        clearError();

        const resolution = getBattleResolutionState();

        if (await maybeLeaveFinishedBattle(resolution)) {
            return;
        }

        if (resolution.finished) {
            recordBattleOutcome(resolution.outcome);
            const outcomeLabel = resolution.outcome === "loss" ? "Defeat" : resolution.outcome === "win" ? "Victory" : "Battle over";
            recordPreviewEvent(outcomeLabel, "", {
                allyClass: getSelectedPlayerClassKey() || previewState.allyClass || "adventurer",
                enemyClass: previewState.enemyClass || "shadow",
                phase: "idle"
            });
            updateStatus(`Battle: ${outcomeLabel.toLowerCase()} detected, waiting for return`);
            return;
        }

        if (busy) {
            updateStatus("Battle: action in progress");
            return;
        }

        const attackButton = findAttackButton();
        const skillButtons = getSkillButtons();

        if (skillButtons.length) {
            await useBestAvailableSkill(skillButtons);
            return;
        }

        if (attackButton && !isClickable(attackButton)) {
            maybeRecordEnemyTurnPreview();
            updateStatus("Battle: waiting for turn");
            return;
        }

        await targetLowestHpEnemy();
    }

    function maybeRefreshLobbyMonitor(waitingStatus) {
        if (!WORKER_MODE || !isLobbyPage()) {
            return false;
        }

        const elapsed = lobbyPageEnteredAt > 0 ? Date.now() - lobbyPageEnteredAt : 0;
        if (elapsed < CONFIG.lobbyMonitorReloadMs) {
            updateStatus(waitingStatus);
            return false;
        }

        touchProgress();
        updateStatus("Lobby: refreshing hidden token monitor");
        window.location.reload();
        return true;
    }

    async function maybeLeaveFinishedBattle(resolution = getBattleResolutionState()) {
        const backButton = resolution.backButton;
        if (!backButton || !isClickable(backButton)) {
            return false;
        }

        const pageSettled = battlePageEnteredAt > 0 && Date.now() - battlePageEnteredAt >= 2500;
        if (!resolution.finished && !pageSettled) {
            return false;
        }

        if (!resolution.finished) {
            return false;
        }

        recordBattleOutcome(resolution.outcome);
        battleNoTargetLoops = 0;
        const outcomeLabel = resolution.outcome === "loss" ? "Defeat" : resolution.outcome === "win" ? "Victory" : "Battle finished";
        recordPreviewEvent(outcomeLabel, "", {
            allyClass: getSelectedPlayerClassKey() || previewState.allyClass || "adventurer",
            enemyClass: previewState.enemyClass || "shadow",
            phase: "idle"
        });
        clickElement(backButton, `${outcomeLabel}, returning`);
        return true;
    }

    function getBattleResolutionState() {
        const backButton = findVisibleElement([
            ".back-btn",
            "button.back-btn",
            "a.back-btn",
            ".result-actions .back-btn"
        ]);
        const resultText = getBattleResultText();
        const textOutcome = detectOutcomeFromText(resultText);
        const enemyState = summarizeTeamSlots(getBattleTeamSlots(ENEMY_CONTAINER_SELECTORS, "enemy"));
        const allyState = summarizeTeamSlots(getBattleTeamSlots(ALLY_CONTAINER_SELECTORS, "ally"));
        const outcome = textOutcome || (enemyState.defeated ? "win" : "") || (allyState.defeated ? "loss" : "");
        const genericResult = /battle over|match over|finished|results?/i.test(resultText);

        return {
            backButton,
            outcome,
            finished: Boolean(outcome || genericResult),
            resultText,
            enemyState,
            allyState
        };
    }

    function getBattleResultText() {
        const selectors = [
            ".result",
            ".battle-result",
            ".match-result",
            ".toast",
            ".notice",
            ".modal.show",
            ".popup",
            ".result-title",
            ".result-text",
            ".battle-log .highlight",
            ".battle-log .system",
            ".battleOutcome"
        ];

        const text = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (element?.textContent) {
                    text.push(element.textContent);
                }
            }
        }

        return text.join(" ").replace(/\s+/g, " ").trim();
    }

    function detectOutcomeFromText(text) {
        const value = String(text || "").toLowerCase();
        if (!value) {
            return "";
        }

        if (/victory|winner|you win|won the match|match won|battle won|you are victorious/i.test(value)) {
            return "win";
        }

        if (/defeat|you lost|you lose|lost the match|match lost|battle lost|you were defeated/i.test(value)) {
            return "loss";
        }

        return "";
    }

    function getBattleTeamSlots(selectors, team) {
        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (!container) {
                continue;
            }

            const slots = Array.from(container.querySelectorAll(".pSlot"));
            if (slots.length) {
                return slots;
            }
        }

        return Array.from(document.querySelectorAll(".pSlot"))
            .filter((slot) => getSlotTeam(slot) === team);
    }

    function summarizeTeamSlots(slots) {
        const normalizedSlots = Array.isArray(slots)
            ? slots.filter((slot) => slot instanceof HTMLElement)
            : [];

        let alive = 0;
        let dead = 0;
        for (const slot of normalizedSlots) {
            if (isSlotEffectivelyAlive(slot)) {
                alive += 1;
            } else {
                dead += 1;
            }
        }

        return {
            total: normalizedSlots.length,
            alive,
            dead,
            defeated: normalizedSlots.length > 0 && alive === 0 && dead > 0
        };
    }

    function maybeRecordEnemyTurnPreview(force = false) {
        if (!settings.battleVisuals || !isBattlePage()) {
            return;
        }

        const enemyActor = getCurrentEnemyActorSlot()
            || (isAliveSlot(lastTargetSlot) && getSlotTeam(lastTargetSlot) === "enemy" ? lastTargetSlot : null)
            || getEnemySlots()[0]
            || null;
        if (!(enemyActor instanceof HTMLElement)) {
            return;
        }

        const enemyClass = resolveSlotClassKey(enemyActor, "enemy");
        const effectType = getClassProfile(enemyClass).effect || "slash";
        const actorName = getSlotName(enemyActor);
        const now = Date.now();
        const previewKey = `${actorName}|${enemyClass}|${previewState.allyClass || getSelectedPlayerClassKey() || "adventurer"}`;

        if (!force && previewKey === lastEnemyPreviewKey && (now - lastEnemyPreviewAt) < 1400) {
            return;
        }

        lastEnemyPreviewKey = previewKey;
        lastEnemyPreviewAt = now;
        recordPreviewEvent(`${actorName} attacks`, effectType, {
            allyClass: previewState.allyClass || getSelectedPlayerClassKey() || "adventurer",
            enemyClass,
            phase: "enemy-action"
        });
    }

    function scheduleEnemyTurnPreview(delayMs = 800) {
        if (!settings.battleVisuals) {
            return;
        }

        if (scheduledEnemyPreviewTimer) {
            window.clearTimeout(scheduledEnemyPreviewTimer);
        }

        scheduledEnemyPreviewTimer = window.setTimeout(() => {
            scheduledEnemyPreviewTimer = 0;
            maybeRecordEnemyTurnPreview(true);
        }, Math.max(120, Number(delayMs) || 800));
    }

    function isSlotEffectivelyAlive(slot) {
        if (!(slot instanceof HTMLElement)) {
            return false;
        }

        if (slot.dataset.alive === "1") {
            return true;
        }

        if (slot.dataset.alive === "0") {
            return false;
        }

        const hpPercent = getHpPercent(slot);
        if (Number.isFinite(hpPercent)) {
            return hpPercent > 0;
        }

        const text = String(slot.textContent || "").toLowerCase();
        if (/(dead|defeated|ko|k.o.|fainted|down)/.test(text)) {
            return false;
        }

        return true;
    }

    async function targetLowestHpEnemy() {
        const targets = getEnemySlots();
        if (!targets.length) {
            battleNoTargetLoops += 1;
            const backButton = findVisibleElement([
                ".back-btn",
                "button.back-btn",
                "a.back-btn",
                ".result-actions .back-btn"
            ]);
            if (battleNoTargetLoops >= 2 && backButton && isClickable(backButton)) {
                recordPreviewEvent("No targets left", "", {
                    phase: "idle"
                });
                clickElement(backButton, "No targets left, returning");
                return;
            }
            updateStatus("Battle: no enemy targets found");
            return;
        }

        battleNoTargetLoops = 0;

        const target = targets.reduce((lowest, slot) => {
            if (!lowest) {
                return slot;
            }

            return getHpPercent(slot) <= getHpPercent(lowest) ? slot : lowest;
        }, null);

        if (!target) {
            updateStatus("Battle: unable to pick a target");
            return;
        }

        busy = true;

        try {
            const targetName = getSlotName(target);
            lastTargetSlot = target;
            recordPreviewEvent(`Targeting ${targetName}`, "", {
                phase: "cast",
                enemyClass: resolveSlotClassKey(target, "enemy")
            });
            clickElement(target, `Selected ${targetName} (${Math.round(getHpPercent(target))}% HP)`);

            const skillButtons = await waitFor(
                () => getSkillButtons(),
                1800,
                120
            );

            if (!skillButtons.length) {
                updateStatus(`Battle: targeted ${targetName}, skill menu did not open`);
                return;
            }

            await useBestAvailableSkill(skillButtons);
        } finally {
            window.setTimeout(() => {
                busy = false;
            }, CONFIG.actionCooldownMs);
        }
    }

    async function useBestAvailableSkill(existingButtons) {
        const alreadyBusy = busy;
        if (!alreadyBusy) {
            busy = true;
        }

        const buttons = existingButtons.length ? existingButtons : getSkillButtons();
        try {
            if (!buttons.length) {
                updateStatus("Battle: no skill buttons found");
                return;
            }

            const enabledButtons = buttons.filter(isClickable);
            rememberSkillButtons(buttons);
            const chosenButton = chooseSkillButton(buttons, enabledButtons);

            if (!chosenButton) {
                closeSkillModal();
                updateStatus("Battle: no usable skills, closed the skill menu");
                return;
            }

            const classKey = getPriorityClassKey() || "adventurer";
            const skillName = getButtonLabel(chosenButton);
            recordPreviewEvent(`Used ${skillName}`, classifyEffect(skillName, classKey), {
                allyClass: classKey,
                enemyClass: lastTargetSlot ? resolveSlotClassKey(lastTargetSlot, "enemy") : "shadow",
                phase: "action"
            });
            clickElement(chosenButton, `Used ${getButtonLabel(chosenButton)}`);
            scheduleEnemyTurnPreview();
        } finally {
            if (!alreadyBusy) {
                window.setTimeout(() => {
                    busy = false;
                }, CONFIG.actionCooldownMs);
            }
        }
    }

    function rememberSkillButtons(buttons) {
        const classKey = getPriorityClassKey();
        const seenNames = uniqueSkillNames(buttons.map((button) => getButtonLabel(button)));
        if (!seenNames.length) {
            return;
        }

        const savedNames = getSkillPriorityList(classKey);
        const mergedNames = [
            ...savedNames,
            ...seenNames.filter((skillName) => !savedNames.includes(skillName))
        ];

        if (savedNames.length === mergedNames.length && savedNames.every((skillName, index) => skillName === mergedNames[index])) {
            return;
        }

        settings.skillPriorities[classKey] = mergedNames;
        saveSettings();
        syncPanelState();
    }

    function chooseSkillButton(buttons, enabledButtons) {
        const classKey = getPriorityClassKey();
        const priorities = getSkillPriorityList(classKey);
        const usableButtons = enabledButtons.filter((button) => !isSkillDisabled(classKey, getButtonLabel(button)));

        for (const skillName of priorities) {
            if (isSkillDisabled(classKey, skillName)) {
                continue;
            }

            const matchingButton = buttons.find((button) => isClickable(button) && getButtonLabel(button) === skillName);
            if (matchingButton) {
                return matchingButton;
            }
        }

        const fallbackButton = buttons[settings.skillNumber - 1];
        if (isClickable(fallbackButton) && !isSkillDisabled(classKey, getButtonLabel(fallbackButton))) {
            return fallbackButton;
        }

        return usableButtons[0] || null;
    }

    function uniqueSkillNames(skillNames) {
        const seen = new Set();
        const unique = [];

        for (const skillName of skillNames) {
            const normalized = String(skillName || "").trim();
            if (!normalized || seen.has(normalized)) {
                continue;
            }

            seen.add(normalized);
            unique.push(normalized);
        }

        return unique;
    }

    function installInteractionHooks() {
        if (hooksInstalled) {
            return;
        }

        hooksInstalled = true;
        document.addEventListener("click", handleBattleInteraction, true);
    }

    function handleBattleInteraction(event) {
        const target = event.target;
        if (!(target instanceof Element) || !isBattlePage()) {
            return;
        }

        const slot = target.closest(".pSlot");
        if (slot && isVisible(slot)) {
            lastTargetSlot = slot;
            recordPreviewEvent(`Targeting ${getSlotName(slot)}`, "", {
                phase: "cast",
                enemyClass: resolveSlotClassKey(slot, "enemy")
            });
            return;
        }

        const skillButton = target.closest("#skillsModal .skillsGrid button, .skillsGrid button, [id*='skillsModal'] button");
        if (skillButton instanceof HTMLElement && isVisible(skillButton) && settings.battleVisuals) {
            const skillName = getButtonLabel(skillButton);
            window.setTimeout(() => animateSkillCast(skillName), 30);
        }
    }

    function refreshBattleVisuals() {
        cleanupBattleVisuals();
    }

    function cleanupBattleVisuals() {
        const stage = document.getElementById(STAGE_ID);
        if (stage) {
            stage.remove();
        }

        const visuals = document.querySelectorAll(".apvp-slot-visual");
        for (const visual of visuals) {
            visual.remove();
        }
    }

    function ensureBattleStage() {
        let stage = document.getElementById(STAGE_ID);
        if (stage) {
            return stage;
        }

        stage = document.createElement("div");
        stage.id = STAGE_ID;
        (document.body || document.documentElement).appendChild(stage);
        return stage;
    }

    function getTrackedBattleSlots() {
        const enemySlots = getVisibleTeamSlots(ENEMY_CONTAINER_SELECTORS);
        const allySlots = getVisibleTeamSlots(ALLY_CONTAINER_SELECTORS);
        const combined = [...enemySlots, ...allySlots];

        if (combined.length) {
            return combined;
        }

        return Array.from(document.querySelectorAll(".pSlot")).filter(isVisible);
    }

    function getVisibleTeamSlots(selectors) {
        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (!container) {
                continue;
            }

            const slots = Array.from(container.querySelectorAll(".pSlot")).filter(isVisible);
            if (slots.length) {
                return slots;
            }
        }

        return [];
    }

    function areAllTeamSlotsMarkedDead(slots) {
        return Array.isArray(slots)
            && slots.length > 0
            && slots.every((slot) => slot instanceof HTMLElement && slot.dataset.alive === "0");
    }

    function renderSlotVisual(slot) {
        if (!(slot instanceof HTMLElement) || !isVisible(slot)) {
            return;
        }

        const team = getSlotTeam(slot);
        const classKey = resolveSlotClassKey(slot, team);
        const profile = getClassProfile(classKey);

        if (window.getComputedStyle(slot).position === "static") {
            slot.style.position = "relative";
        }

        let visual = Array.from(slot.children).find((child) => child.classList?.contains("apvp-slot-visual"));
        if (!visual) {
            visual = document.createElement("div");
            visual.className = "apvp-slot-visual";
            slot.appendChild(visual);
        }

        const needsRefresh = visual.dataset.team !== team || visual.dataset.class !== classKey || !visual.firstElementChild;
        visual.dataset.team = team;
        visual.dataset.class = classKey;
        visual.style.opacity = slot.dataset.alive === "0" ? "0.38" : "1";
        if (needsRefresh) {
            visual.innerHTML = buildAvatarMarkup(profile.label, classKey);
        }
    }

    function buildAvatarMarkup(label, classKey = "adventurer") {
        return `
            <img class="apvp-avatar apvp-avatar-art" alt="" src="${buildAvatarDataUri(classKey)}">
            <div class="apvp-badge">${escapeHtml(label)}</div>
        `;
    }

    function buildAvatarDataUri(classKey) {
        const svg = buildAvatarSvg(classKey)
            .replace(/>\s+</g, "><")
            .replace(/\s{2,}/g, " ")
            .trim();
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function buildAvatarSvg(classKey) {
        const palette = getAvatarPalette(classKey);
        const outline = palette.outline;
        const accessory = buildAvatarAccessorySvg(classKey, palette);
        return `<svg viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg" role="presentation" focusable="false"><ellipse cx="22" cy="45" rx="12" ry="5" fill="${palette.glow}" opacity="0.62"></ellipse><path d="M15 24 C18 20, 26 20, 29 24 L30 39 C26 42, 18 42, 14 39 Z" fill="${palette.primary}" stroke="${outline}" stroke-width="1.8" stroke-linejoin="round"></path><path d="M17 26 C20 29, 24 29, 27 26 L28 34 C24 36, 20 36, 16 34 Z" fill="${palette.secondary}" opacity="0.92"></path><path d="M16 39 L14 48" stroke="${outline}" stroke-width="3" stroke-linecap="round"></path><path d="M28 39 L30 48" stroke="${outline}" stroke-width="3" stroke-linecap="round"></path><path d="M15 28 L10 36" stroke="${outline}" stroke-width="3" stroke-linecap="round"></path><path d="M29 28 L34 36" stroke="${outline}" stroke-width="3" stroke-linecap="round"></path><circle cx="22" cy="14" r="8" fill="${palette.skin}" stroke="${outline}" stroke-width="1.8"></circle><path d="M14 13 C16 5, 28 5, 30 13 L30 16 C26 12, 18 12, 14 16 Z" fill="${palette.hair}"></path><circle cx="19" cy="14" r="1.1" fill="${outline}"></circle><circle cx="25" cy="14" r="1.1" fill="${outline}"></circle><path d="M19 18 C21 19.5, 23 19.5, 25 18" stroke="${outline}" stroke-width="1.2" stroke-linecap="round" fill="none"></path>${accessory}</svg>`;
    }

    function getAvatarPalette(classKey) {
        switch (normalizeClassKey(classKey)) {
        case "warrior":
            return { primary: "#cb5932", secondary: "#ffd37d", hair: "#582416", skin: "#f3c8a7", glow: "rgba(255, 168, 108, 0.58)", outline: "#1a0e0d", accent: "#ffe4a6", dark: "#5c2a1f" };
        case "mage":
            return { primary: "#4b7dff", secondary: "#b08dff", hair: "#2e2964", skin: "#efcdb4", glow: "rgba(109, 172, 255, 0.52)", outline: "#131629", accent: "#d8c4ff", dark: "#25306a" };
        case "ranger":
            return { primary: "#4d9d53", secondary: "#d4ff7a", hair: "#2f3a21", skin: "#ecc69f", glow: "rgba(116, 220, 136, 0.48)", outline: "#142013", accent: "#efffc0", dark: "#24452a" };
        case "rogue":
            return { primary: "#4e5d86", secondary: "#9ec1ff", hair: "#182036", skin: "#dec1ad", glow: "rgba(120, 170, 255, 0.4)", outline: "#0e1421", accent: "#b3c2ff", dark: "#1d2a45" };
        case "healer":
            return { primary: "#55b89d", secondary: "#fff3af", hair: "#4a5734", skin: "#f1d7bf", glow: "rgba(127, 255, 212, 0.5)", outline: "#123329", accent: "#ffffff", dark: "#2e5a49" };
        case "paladin":
            return { primary: "#d1a63a", secondary: "#fff3bf", hair: "#6b5521", skin: "#efceaf", glow: "rgba(255, 224, 123, 0.52)", outline: "#33240e", accent: "#fffdf3", dark: "#7c6024" };
        case "necromancer":
            return { primary: "#7047b5", secondary: "#63d3a2", hair: "#1d1233", skin: "#d4c2dd", glow: "rgba(146, 104, 255, 0.48)", outline: "#120d1f", accent: "#b8f5da", dark: "#342053" };
        case "monk":
            return { primary: "#d88e47", secondary: "#ffe6a7", hair: "#69462b", skin: "#efc49c", glow: "rgba(255, 187, 102, 0.45)", outline: "#2a170e", accent: "#fff0cf", dark: "#784d24" };
        case "berserker":
            return { primary: "#c23d46", secondary: "#ffba69", hair: "#5a1a1f", skin: "#e8b699", glow: "rgba(255, 111, 112, 0.48)", outline: "#240b0f", accent: "#ffd7a2", dark: "#6a252a" };
        case "shadow":
            return { primary: "#505575", secondary: "#b59af8", hair: "#171a28", skin: "#c8bfd8", glow: "rgba(141, 146, 210, 0.42)", outline: "#0e1320", accent: "#d6cbff", dark: "#252845" };
        default:
            return { primary: "#83b8ff", secondary: "#e7f1ff", hair: "#4c5568", skin: "#ffd2b8", glow: "rgba(131, 184, 255, 0.45)", outline: "#1b2330", accent: "#f9fcff", dark: "#314157" };
        }
    }

    function buildAvatarAccessorySvg(classKey, palette) {
        switch (normalizeClassKey(classKey)) {
        case "warrior":
            return `
                <path d="M31 26 L39 18" stroke="${palette.accent}" stroke-width="3" stroke-linecap="round"></path>
                <path d="M36 15 L40 19 L39 22 L35 18 Z" fill="#f4f0ea" stroke="${palette.outline}" stroke-width="1"></path>
                <path d="M30 26 L34 30" stroke="${palette.dark}" stroke-width="3" stroke-linecap="round"></path>
            `;
        case "mage":
            return `
                <path d="M33 22 L37 40" stroke="${palette.accent}" stroke-width="2.8" stroke-linecap="round"></path>
                <circle cx="32" cy="19" r="4.5" fill="${palette.secondary}" opacity="0.95"></circle>
                <path d="M13 10 L22 4 L31 10" fill="${palette.secondary}" stroke="${palette.outline}" stroke-width="1.5"></path>
            `;
        case "ranger":
            return `
                <path d="M34 21 C38 23, 38 33, 34 35" stroke="${palette.accent}" stroke-width="2.2" fill="none"></path>
                <path d="M31 20 C35 23, 35 33, 31 36" stroke="${palette.dark}" stroke-width="2.2" fill="none"></path>
                <path d="M30 21 L37 36" stroke="${palette.accent}" stroke-width="1.8"></path>
            `;
        case "rogue":
            return `
                <path d="M13 8 C17 5, 27 5, 31 8 L28 18 L16 18 Z" fill="${palette.dark}" opacity="0.92"></path>
                <path d="M30 28 L37 23" stroke="${palette.accent}" stroke-width="2.6" stroke-linecap="round"></path>
            `;
        case "healer":
            return `
                <path d="M33 22 L36 40" stroke="${palette.accent}" stroke-width="2.6" stroke-linecap="round"></path>
                <path d="M16 26 H24" stroke="${palette.accent}" stroke-width="2.2" stroke-linecap="round"></path>
                <path d="M20 22 V30" stroke="${palette.accent}" stroke-width="2.2" stroke-linecap="round"></path>
            `;
        case "paladin":
            return `
                <path d="M11 24 L16 22 L16 33 L11 35 L7 33 L7 22 Z" fill="${palette.accent}" opacity="0.92" stroke="${palette.outline}" stroke-width="1.2"></path>
                <path d="M31 24 L37 19" stroke="${palette.secondary}" stroke-width="2.8" stroke-linecap="round"></path>
                <circle cx="12" cy="28" r="1.6" fill="${palette.primary}"></circle>
            `;
        case "necromancer":
            return `
                <path d="M33 20 L36 40" stroke="${palette.accent}" stroke-width="2.5" stroke-linecap="round"></path>
                <circle cx="32" cy="17" r="4.2" fill="${palette.secondary}" opacity="0.75"></circle>
                <circle cx="31" cy="16.5" r="0.9" fill="${palette.outline}"></circle>
                <circle cx="34" cy="16.5" r="0.9" fill="${palette.outline}"></circle>
            `;
        case "monk":
            return `
                <circle cx="12" cy="28" r="3.4" fill="${palette.accent}" opacity="0.82"></circle>
                <circle cx="32" cy="28" r="3.4" fill="${palette.accent}" opacity="0.82"></circle>
                <path d="M14 9 C18 6, 26 6, 30 9" stroke="${palette.outline}" stroke-width="1.8" fill="none"></path>
            `;
        case "berserker":
            return `
                <path d="M31 24 L40 16" stroke="${palette.accent}" stroke-width="3.4" stroke-linecap="round"></path>
                <path d="M36 13 L41 18 L39 21 L34 16 Z" fill="#f4ebe0" stroke="${palette.outline}" stroke-width="1"></path>
                <path d="M13 9 L16 5 L19 9" fill="${palette.accent}" opacity="0.88"></path>
            `;
        case "shadow":
            return `
                <path d="M12 8 C17 3, 27 3, 32 8 L28 18 L16 18 Z" fill="${palette.dark}" opacity="0.96"></path>
                <path d="M30 27 L38 21" stroke="${palette.secondary}" stroke-width="2.6" stroke-linecap="round"></path>
            `;
        default:
            return `
                <circle cx="32" cy="23" r="4" fill="${palette.accent}" opacity="0.82"></circle>
            `;
        }
    }

    function getSlotTeam(slot) {
        if (!(slot instanceof Element)) {
            return "ally";
        }

        if (slot.closest(ALLY_CONTAINER_SELECTORS.join(", "))) {
            return "ally";
        }

        if (slot.closest(ENEMY_CONTAINER_SELECTORS.join(", "))) {
            return "enemy";
        }

        const rect = slot.getBoundingClientRect();
        return rect.top < window.innerHeight / 2 ? "enemy" : "ally";
    }

    function resolveSlotClassKey(slot, team) {
        if (!(slot instanceof Element)) {
            return team === "enemy" ? "shadow" : getSelectedPlayerClassKey() || "adventurer";
        }

        if (team === "ally" && settings.playerClass !== "auto") {
            return settings.playerClass;
        }

        const hints = [
            slot.getAttribute("data-class"),
            slot.getAttribute("data-role"),
            slot.dataset.class,
            readTextCandidates(slot, [
                ".class-name",
                ".role",
                ".job",
                ".class",
                ".unitClass",
                ".unit-role",
                ".sub",
                ".name"
            ]),
            slot.textContent
        ];

        if (team === "ally") {
            hints.push(detectSelectedPlayerClass());
            hints.push(getSkillHintClass());
        }

        const detected = detectClassKey(hints.join(" "));
        if (detected) {
            return detected;
        }

        return team === "enemy" ? "shadow" : getSelectedPlayerClassKey() || "adventurer";
    }

    function readTextCandidates(root, selectors) {
        const values = [];
        for (const selector of selectors) {
            const node = root.querySelector(selector);
            if (node?.textContent) {
                values.push(node.textContent.trim());
            }
        }
        return values.join(" ");
    }

    function getSelectedPlayerClassKey() {
        if (settings.playerClass !== "auto") {
            return settings.playerClass;
        }

        return detectSelectedPlayerClass() || getSkillHintClass() || null;
    }

    function detectSelectedPlayerClass() {
        const selectors = [
            "[data-selected-class]",
            "[data-class-name]",
            "[data-class]",
            ".selected-class",
            ".class-name",
            ".character-class",
            ".player-class",
            ".job",
            ".role",
            ".class-card.active",
            ".class-card.selected",
            ".loadout .active",
            ".loadout .selected"
        ];

        const hints = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (!(element instanceof HTMLElement) || !isVisible(element)) {
                    continue;
                }

                hints.push(
                    element.getAttribute("data-selected-class"),
                    element.getAttribute("data-class-name"),
                    element.getAttribute("data-class"),
                    element.textContent
                );
            }
        }

        return detectClassKey(hints.join(" "));
    }

    function getSkillHintClass() {
        const skillHints = getSkillButtons()
            .map((button) => getButtonLabel(button))
            .join(" ");

        return detectClassKey(skillHints);
    }

    function detectClassKey(text) {
        const value = String(text || "").toLowerCase();
        if (!value) {
            return null;
        }

        if (/(paladin|templar|crusader|holy knight|smite|divine)/.test(value)) {
            return "paladin";
        }

        if (/(necromancer|lich|reaper|death mage|doom|curse|drain|shadowbolt)/.test(value)) {
            return "necromancer";
        }

        if (/(healer|cleric|priest|saint|support|restore|heal|mend|bless)/.test(value)) {
            return "healer";
        }

        if (/(mage|wizard|sorcerer|warlock|arcane|fireball|frost|meteor|bolt)/.test(value)) {
            return "mage";
        }

        if (/(ranger|archer|hunter|sniper|gunslinger|arrow|bow|snipe)/.test(value)) {
            return "ranger";
        }

        if (/(rogue|assassin|ninja|thief|duelist|shadowblade|stab|poison)/.test(value)) {
            return "rogue";
        }

        if (/(monk|brawler|pugilist|martial|chi|fist|palm|combo)/.test(value)) {
            return "monk";
        }

        if (/(berserker|barbarian|slayer|axe|rage|frenzy|cleave)/.test(value)) {
            return "berserker";
        }

        if (/(warrior|fighter|knight|guardian|tank|slash|strike|sword)/.test(value)) {
            return "warrior";
        }

        if (/(shadow|void|phantom|specter|dark)/.test(value)) {
            return "shadow";
        }

        return null;
    }

    function getClassProfile(classKey) {
        if (classKey === "auto") {
            return { label: "Auto", effect: "slash", colors: ["#83b8ff", "#e7f1ff"] };
        }

        return CLASS_PROFILES[classKey] || CLASS_PROFILES.adventurer;
    }

    function animateSkillCast(skillName) {
        if (!settings.battleVisuals || !isBattlePage()) {
            return;
        }

        const actor = getCurrentActorSlot();
        const actorTeam = getSlotTeam(actor);
        const actorClass = resolveSlotClassKey(actor, actorTeam);
        const effectType = classifyEffect(skillName, actorClass);
        const target = resolveEffectTarget(effectType, actor);
        recordPreviewEvent(`Used ${skillName}`, effectType, {
            allyClass: actorClass,
            enemyClass: target ? resolveSlotClassKey(target, getSlotTeam(target)) : previewState.enemyClass || "shadow",
            phase: "action"
        });
    }

    function getCurrentActorSlot() {
        return getCurrentTeamActorSlot(ALLY_CONTAINER_SELECTORS);
    }

    function getCurrentEnemyActorSlot() {
        return getCurrentTeamActorSlot(ENEMY_CONTAINER_SELECTORS);
    }

    function getCurrentTeamActorSlot(selectors) {
        const slots = getVisibleTeamSlots(selectors);
        const activeSlot = slots.find((slot) => {
            if (!(slot instanceof HTMLElement)) {
                return false;
            }

            if (slot.dataset.turn === "1" || slot.dataset.active === "1") {
                return true;
            }

            return /(active|current|turn|selected)/i.test(slot.className);
        });

        return activeSlot || slots.find((slot) => slot.dataset.alive !== "0") || slots[0] || null;
    }

    function resolveEffectTarget(effectType, actor) {
        const healing = effectType === "heal";

        if (healing) {
            if (isAliveSlot(lastTargetSlot) && getSlotTeam(lastTargetSlot) === "ally") {
                return lastTargetSlot;
            }

            return actor || getAllySlots()[0] || null;
        }

        if (isAliveSlot(lastTargetSlot) && getSlotTeam(lastTargetSlot) === "enemy") {
            return lastTargetSlot;
        }

        const enemies = getEnemySlots();
        return getLowestHpSlot(enemies);
    }

    function classifyEffect(skillName, classKey) {
        const text = String(skillName || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();

        for (const entry of SKILL_EFFECT_PATTERNS) {
            if (entry.test.test(text)) {
                return entry.effect;
            }
        }

        return getClassProfile(classKey).effect;
    }

    function spawnEffect(options) {
        const { source, target, effectType, classKey } = options;
        const stage = ensureBattleStage();
        const sourcePoint = getEffectPoint(source) || { x: window.innerWidth * 0.5, y: window.innerHeight * 0.65 };
        const targetPoint = getEffectPoint(target) || sourcePoint;
        const palette = getEffectPalette(effectType, classKey);

        spawnRune(stage, sourcePoint, palette, 0.72);

        if (effectType === "heal") {
            spawnRing(stage, targetPoint, palette, 46, "apvp-ring", 650);
            spawnParticles(stage, targetPoint, palette, 9, 26);
            return;
        }

        if (effectType === "slash" || effectType === "impact") {
            window.setTimeout(() => {
                spawnSlash(stage, targetPoint, palette);
                spawnImpact(stage, targetPoint, palette, 34);
            }, 70);
            return;
        }

        if (effectType === "holy") {
            spawnBeam(stage, sourcePoint, targetPoint, palette, 7);
            window.setTimeout(() => {
                spawnRing(stage, targetPoint, palette, 54, "apvp-ring", 700);
                spawnParticles(stage, targetPoint, palette, 10, 28);
            }, 110);
            return;
        }

        if (effectType === "fire" || effectType === "ice" || effectType === "shadow" || effectType === "projectile" || effectType === "arcane") {
            spawnBeam(stage, sourcePoint, targetPoint, palette, 6);
            window.setTimeout(() => {
                spawnOrb(stage, targetPoint, palette, 26, 520);
                spawnImpact(stage, targetPoint, palette, 30);
                spawnParticles(stage, targetPoint, palette, 7, 18);
            }, 110);
            return;
        }

        spawnBeam(stage, sourcePoint, targetPoint, palette, 6);
        window.setTimeout(() => spawnImpact(stage, targetPoint, palette, 30), 110);
    }

    function getEffectPoint(slot) {
        if (!(slot instanceof Element) || !slot.isConnected) {
            return null;
        }

        const rect = slot.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            return null;
        }

        const team = getSlotTeam(slot);
        const biasX = team === "enemy" ? 0.35 : 0.65;
        return {
            x: rect.left + rect.width * biasX,
            y: rect.top + rect.height * 0.45
        };
    }

    function getEffectPalette(effectType, classKey) {
        const profile = getClassProfile(classKey);
        if (effectType === "fire") {
            return ["#ff754f", "#ffd166"];
        }

        if (effectType === "ice") {
            return ["#79dbff", "#ebffff"];
        }

        if (effectType === "shadow") {
            return ["#7d69ff", "#66e1be"];
        }

        if (effectType === "holy") {
            return ["#ffd76c", "#fff7c7"];
        }

        if (effectType === "heal") {
            return ["#7fffd4", "#f6ffbc"];
        }

        return profile.colors;
    }

    function spawnBeam(stage, sourcePoint, targetPoint, palette, height) {
        const dx = targetPoint.x - sourcePoint.x;
        const dy = targetPoint.y - sourcePoint.y;
        const distance = Math.max(10, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const shell = makeFxShell(sourcePoint.x, sourcePoint.y, angle);
        const beam = document.createElement("div");
        beam.className = "apvp-fx apvp-beam";
        beam.style.width = `${distance}px`;
        beam.style.height = `${height}px`;
        beam.style.background = `linear-gradient(90deg, transparent, ${palette[0]} 25%, ${palette[1]} 70%, transparent)`;
        shell.appendChild(beam);
        appendTransient(stage, shell, 520);
    }

    function spawnSlash(stage, point, palette) {
        const shell = makeFxShell(point.x - 48, point.y, -18);
        const slash = document.createElement("div");
        slash.className = "apvp-fx apvp-slash";
        slash.style.background = `linear-gradient(90deg, transparent, ${palette[0]} 30%, ${palette[1]} 55%, transparent)`;
        shell.appendChild(slash);
        appendTransient(stage, shell, 440);
    }

    function spawnRing(stage, point, palette, size, className, duration) {
        const ring = document.createElement("div");
        ring.className = `apvp-fx ${className}`;
        ring.style.width = `${size}px`;
        ring.style.height = `${size}px`;
        ring.style.left = `${point.x - size / 2}px`;
        ring.style.top = `${point.y - size / 2}px`;
        ring.style.border = `2px solid ${palette[0]}`;
        ring.style.boxShadow = `0 0 16px ${palette[1]}`;
        appendTransient(stage, ring, duration);
    }

    function spawnOrb(stage, point, palette, size, duration) {
        const orb = document.createElement("div");
        orb.className = "apvp-fx apvp-orb";
        orb.style.width = `${size}px`;
        orb.style.height = `${size}px`;
        orb.style.left = `${point.x - size / 2}px`;
        orb.style.top = `${point.y - size / 2}px`;
        orb.style.background = `radial-gradient(circle, ${palette[1]} 0 25%, ${palette[0]} 35% 70%, transparent 75%)`;
        orb.style.boxShadow = `0 0 22px ${palette[0]}`;
        appendTransient(stage, orb, duration);
    }

    function spawnImpact(stage, point, palette, size) {
        const impact = document.createElement("div");
        impact.className = "apvp-fx apvp-impact";
        impact.style.width = `${size}px`;
        impact.style.height = `${size}px`;
        impact.style.left = `${point.x - size / 2}px`;
        impact.style.top = `${point.y - size / 2}px`;
        impact.style.background = `radial-gradient(circle, ${palette[1]} 0 24%, ${palette[0]} 25% 58%, transparent 65%)`;
        impact.style.boxShadow = `0 0 18px ${palette[0]}`;
        appendTransient(stage, impact, 480);
    }

    function spawnRune(stage, point, palette, scale) {
        const size = 54 * scale;
        const rune = document.createElement("div");
        rune.className = "apvp-fx apvp-rune";
        rune.style.width = `${size}px`;
        rune.style.height = `${size}px`;
        rune.style.left = `${point.x - size / 2}px`;
        rune.style.top = `${point.y - size / 2}px`;
        rune.style.borderColor = palette[0];
        rune.style.boxShadow = `0 0 18px ${palette[1]}`;
        appendTransient(stage, rune, 820);
    }

    function spawnParticles(stage, point, palette, count, spread) {
        for (let index = 0; index < count; index += 1) {
            const angle = (Math.PI * 2 * index) / count;
            const distance = 8 + (index % 3) * spread * 0.3;
            const particle = document.createElement("div");
            particle.className = "apvp-fx apvp-particle";
            particle.style.left = `${point.x + Math.cos(angle) * distance}px`;
            particle.style.top = `${point.y + Math.sin(angle) * distance * 0.55}px`;
            particle.style.background = `radial-gradient(circle, ${palette[1]}, ${palette[0]} 72%, transparent 76%)`;
            particle.style.boxShadow = `0 0 10px ${palette[0]}`;
            appendTransient(stage, particle, 760);
        }
    }

    function makeFxShell(x, y, angle) {
        const shell = document.createElement("div");
        shell.className = "apvp-fx-shell";
        shell.style.left = `${x}px`;
        shell.style.top = `${y}px`;
        shell.style.transform = `rotate(${angle}deg)`;
        return shell;
    }

    function appendTransient(stage, element, duration) {
        stage.appendChild(element);
        window.setTimeout(() => {
            if (element.isConnected) {
                element.remove();
            }
        }, duration);
    }

    function pulseSlotVisual(slot, className, duration) {
        if (!(slot instanceof Element)) {
            return;
        }

        const visual = Array.from(slot.children).find((child) => child.classList?.contains("apvp-slot-visual"));
        if (!(visual instanceof HTMLElement)) {
            return;
        }

        visual.classList.remove(className);
        void visual.offsetWidth;
        visual.classList.add(className);
        window.setTimeout(() => {
            visual.classList.remove(className);
        }, duration);
    }

    function isAliveSlot(slot) {
        return slot instanceof Element && slot.isConnected && isVisible(slot) && slot.dataset.alive !== "0";
    }

    function getLowestHpSlot(slots) {
        return slots.reduce((lowest, slot) => {
            if (!lowest) {
                return slot;
            }

            return getHpPercent(slot) <= getHpPercent(lowest) ? slot : lowest;
        }, null);
    }

    function closeSkillModal() {
        const closeButton = findVisibleElement([
            "#skillsModal .xbtn",
            ".modal .xbtn",
            "button[aria-label='Close']"
        ]);

        if (closeButton && isClickable(closeButton)) {
            closeButton.click();
            touchProgress();
        }
    }

    function findAttackButton() {
        return findVisibleElement([
            ".attackBtn",
            "button.attackBtn",
            "button[class*='attackBtn']"
        ]);
    }

    function getSkillButtons() {
        return Array.from(document.querySelectorAll(
            "#skillsModal .skillsGrid button, .skillsGrid button, [id*='skillsModal'] button"
        )).filter(isVisible);
    }

    function getEnemySlots() {
        for (const selector of ENEMY_CONTAINER_SELECTORS) {
            const container = document.querySelector(selector);
            const slots = getAliveSlots(container);
            if (slots.length) {
                return slots;
            }
        }

        return Array.from(document.querySelectorAll(".pSlot[data-alive='1']"))
            .filter((slot) => !slot.closest("#bottomTeamCard, [id*='bottomTeam'], .ally-team, .team-ally"))
            .filter(isVisible);
    }

    function getAllySlots() {
        for (const selector of ALLY_CONTAINER_SELECTORS) {
            const container = document.querySelector(selector);
            const slots = getAliveSlots(container);
            if (slots.length) {
                return slots;
            }
        }

        return [];
    }

    function hasTeamContainer(selectors) {
        return selectors.some((selector) => !!document.querySelector(selector));
    }

    function getAliveSlots(container) {
        if (!container) {
            return [];
        }

        return Array.from(container.querySelectorAll(".pSlot[data-alive='1']"))
            .filter(isVisible);
    }

    function getHpPercent(slot) {
        const fill = slot.querySelector(".hpFill, [class*='hpFill']");
        if (fill) {
            const styleWidth = parsePercent(fill.style?.width);
            if (Number.isFinite(styleWidth)) {
                return styleWidth;
            }

            const styleAttr = fill.getAttribute("style") || "";
            const widthMatch = styleAttr.match(/width:\s*([\d.]+)%/i);
            if (widthMatch) {
                return Number.parseFloat(widthMatch[1]);
            }

            const parent = fill.parentElement;
            if (parent) {
                const parentWidth = parent.getBoundingClientRect().width;
                const fillWidth = fill.getBoundingClientRect().width;
                if (parentWidth > 0) {
                    return (fillWidth / parentWidth) * 100;
                }
            }
        }

        const hpText = slot.querySelector(".hpText, [class*='hpText']")?.textContent || "";
        const hpMatch = hpText.replace(/,/g, "").match(/(\d+)\s*\/\s*(\d+)/);
        if (hpMatch) {
            const current = Number.parseFloat(hpMatch[1]);
            const max = Number.parseFloat(hpMatch[2]);
            if (max > 0) {
                return (current / max) * 100;
            }
        }

        return Number.POSITIVE_INFINITY;
    }

    function parsePercent(value) {
        if (!value) {
            return Number.NaN;
        }
        const parsed = Number.parseFloat(String(value).replace("%", ""));
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    }

    function getSlotName(slot) {
        return (
            slot.querySelector(".slotName, .name, [class*='name']")?.textContent?.trim() ||
            "target"
        );
    }

    function getButtonLabel(button) {
        return button.textContent?.replace(/\s+/g, " ").trim() || "skill";
    }

    function getTokenCount() {
        const selectors = [
            ".info-pill:last-child span",
            ".info-pill span",
            "[data-token-count]"
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (!element) {
                continue;
            }

            const raw = element.getAttribute("data-token-count") || element.textContent || "";
            const match = raw.replace(/,/g, "").match(/-?\d+/);
            if (match) {
                return Number.parseInt(match[0], 10);
            }
        }

        return Number.NaN;
    }

    function hasResultBanner() {
        return /victory|defeat|winner|you win|you lost|battle over|match over/i.test(getBattleResultText());
    }

    function findVisibleElement(selectors) {
        for (const selector of selectors) {
            const element = Array.from(document.querySelectorAll(selector)).find(isVisible);
            if (element) {
                return element;
            }
        }
        return null;
    }

    function findClickableElementByText(patterns) {
        const candidates = Array.from(document.querySelectorAll("button, a, .btn, [role='button']"))
            .filter(isClickable);

        return candidates.find((element) => {
            const text = getButtonLabel(element).toLowerCase();
            return patterns.some((pattern) => text.includes(String(pattern).toLowerCase()));
        }) || null;
    }

    function isClickable(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        if (!isVisible(element)) {
            return false;
        }

        if ("disabled" in element && element.disabled) {
            return false;
        }

        if (element.getAttribute("aria-disabled") === "true") {
            return false;
        }

        if (element.classList.contains("disabled")) {
            return false;
        }

        return true;
    }

    function isVisible(element) {
        if (!(element instanceof Element)) {
            return false;
        }

        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return false;
        }

        return element.getClientRects().length > 0;
    }

    function clickElement(element, status) {
        const anchor = element instanceof HTMLAnchorElement ? element : element.closest?.("a[href]");
        if (WORKER_MODE && anchor instanceof HTMLAnchorElement && anchor.href) {
            window.location.href = anchor.href;
        } else if (WORKER_MODE && "form" in element && element.form instanceof HTMLFormElement) {
            element.form.setAttribute("target", "_self");
            if (typeof element.form.requestSubmit === "function" && (element instanceof HTMLButtonElement || element instanceof HTMLInputElement)) {
                element.form.requestSubmit(element);
            } else {
                element.form.submit();
            }
        } else {
            element.click();
        }
        updateStatus(status);
        touchProgress();
    }

    function touchProgress() {
        lastProgressAt = Date.now();
    }

    function runWatchdog() {
        if (!WORKER_MODE && hasBackgroundWorkerSession()) {
            return;
        }

        if (!settings.enabled || (!WORKER_MODE && document.hidden)) {
            return;
        }

        if (!isLobbyPage() && !isBattlePage()) {
            return;
        }

        if (busy && Date.now() - lastProgressAt < CONFIG.staleReloadMs * 2) {
            return;
        }

        if (Date.now() - lastProgressAt < CONFIG.staleReloadMs) {
            return;
        }

        updateStatus("Page looks stuck, reloading...");
        window.location.reload();
    }

    async function waitFor(getValue, timeoutMs, pollMs) {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            const value = getValue();
            if (Array.isArray(value) ? value.length : value) {
                return value;
            }
            await sleep(pollMs);
        }

        return getValue();
    }

    function sleep(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
