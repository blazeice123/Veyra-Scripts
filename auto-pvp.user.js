// ==UserScript==
// @name         GravyPvP
// @namespace    https://github.com/blazeice123/Veyra-Scripts
// @version      2.2
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
    const SETTINGS_KEY = "gravy_pvp_settings_v1";
    const CLASS_KEYS = ["auto", "warrior", "mage", "ranger", "rogue", "healer", "paladin", "necromancer", "monk", "berserker", "shadow"];
    const CONFIG = {
        tickMs: 1200,
        actionCooldownMs: 1000,
        joinCooldownMs: 4000,
        staleReloadMs: 180000,
        defaults: {
            enabled: true,
            autoJoin: true,
            autoFight: true,
            autoReload: true,
            battleVisuals: true,
            skillNumber: 2,
            playerClass: "auto",
            skillPriorities: {},
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
            effect: "arcane",
            colors: ["#83b8ff", "#e7f1ff"]
        },
        warrior: {
            label: "Warrior",
            effect: "slash",
            colors: ["#ff7d55", "#ffd166"]
        },
        mage: {
            label: "Mage",
            effect: "arcane",
            colors: ["#4fc3ff", "#a57cff"]
        },
        ranger: {
            label: "Ranger",
            effect: "projectile",
            colors: ["#67d77e", "#d4ff7a"]
        },
        rogue: {
            label: "Rogue",
            effect: "shadow",
            colors: ["#7bd8ff", "#9fb7ff"]
        },
        healer: {
            label: "Healer",
            effect: "heal",
            colors: ["#7fffd4", "#f7ffbc"]
        },
        paladin: {
            label: "Paladin",
            effect: "holy",
            colors: ["#ffd76b", "#fff5bf"]
        },
        necromancer: {
            label: "Necromancer",
            effect: "shadow",
            colors: ["#b77dff", "#56d69f"]
        },
        monk: {
            label: "Monk",
            effect: "impact",
            colors: ["#ffbf72", "#ffe99e"]
        },
        berserker: {
            label: "Berserker",
            effect: "slash",
            colors: ["#ff5d68", "#ffb56b"]
        },
        shadow: {
            label: "Shadow",
            effect: "shadow",
            colors: ["#7f86a7", "#c0a6ff"]
        }
    };

    let settings = loadSettings();
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

    window.addEventListener("error", (event) => {
        const message = event?.error?.message || event?.message || "Unknown script error";
        rememberError(message);
    });

    window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason?.message || String(event?.reason || "Unhandled rejection");
        rememberError(reason);
    });

    onReady(() => {
        installStyles();
        renderPanel();
        observePage();
        installInteractionHooks();
        refreshBattleVisuals();
        tick();
        window.setInterval(tick, CONFIG.tickMs);
        window.setInterval(runWatchdog, 5000);
        window.addEventListener("resize", () => scheduleVisualRefresh(80));
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
        normalized.playerClass = normalizeClassKey(normalized.playerClass);
        normalized.skillNumber = clampSkillNumber(normalized.skillNumber);
        normalized.skillPriorities = normalizeSkillPriorities(normalized.skillPriorities);
        return normalized;
    }

    function normalizeSkillPriorities(priorities) {
        if (!priorities || typeof priorities !== "object") {
            return {};
        }

        const normalized = {};
        for (const [classKey, values] of Object.entries(priorities)) {
            if (!Array.isArray(values)) {
                continue;
            }

            const safeClassKey = normalizeClassKey(classKey);
            normalized[safeClassKey] = uniqueSkillNames(values);
        }

        return normalized;
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
                right: 16px;
                bottom: 16px;
                width: 280px;
                z-index: 2147483647;
                color: #f2f5f7;
                background: rgba(18, 23, 29, 0.96);
                border: 1px solid #384451;
                border-radius: 12px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
                font: 13px/1.4 Verdana, sans-serif;
                overflow: hidden;
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
            }

            #${PANEL_ID} .apvp-body {
                display: grid;
                gap: 8px;
                padding: 12px;
            }

            #${PANEL_ID}.collapsed .apvp-body {
                display: none;
            }

            #${PANEL_ID} .apvp-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }

            #${PANEL_ID} label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
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
                min-width: 116px;
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
            }

            #${PANEL_ID} button:hover {
                filter: brightness(1.08);
            }

            #${PANEL_ID} button[data-action="toggle-panel"] {
                background: #223140;
                border-color: #405163;
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

            #${PANEL_ID} .apvp-priority-actions {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            #${PANEL_ID} .apvp-priority-actions button,
            #${PANEL_ID} .apvp-priority-head button {
                min-width: 28px;
                padding: 4px 7px;
                background: #223140;
                border-color: #405163;
            }

            #${PANEL_ID} .apvp-priority-empty {
                color: #aeb9c4;
                font-size: 12px;
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
        `;

        document.head.appendChild(style);
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
                    <button type="button" data-action="toggle-panel">Hide</button>
                </div>
                <div class="apvp-body">
                    <div class="apvp-row">
                        <label><input type="checkbox" data-setting="enabled">Enabled</label>
                        <button type="button" data-action="run-now">Run now</button>
                    </div>
                    <div class="apvp-row">
                        <label><input type="checkbox" data-setting="autoJoin">Auto join</label>
                        <label><input type="checkbox" data-setting="autoFight">Auto fight</label>
                    </div>
                    <div class="apvp-row">
                        <label><input type="checkbox" data-setting="autoReload">Safe reload</label>
                        <label><input type="checkbox" data-setting="battleVisuals">Visual FX</label>
                    </div>
                    <div class="apvp-row">
                        <label>Fallback slot <input type="number" min="1" max="9" step="1" data-setting="skillNumber"></label>
                        <label>Class ${buildClassSelect()}</label>
                    </div>
                    <div class="apvp-priority"></div>
                    <div class="apvp-status"></div>
                    <div class="apvp-error" hidden></div>
                    <div class="apvp-muted"></div>
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

        syncCheckbox(panel, "enabled", settings.enabled);
        syncCheckbox(panel, "autoJoin", settings.autoJoin);
        syncCheckbox(panel, "autoFight", settings.autoFight);
        syncCheckbox(panel, "autoReload", settings.autoReload);
        syncCheckbox(panel, "battleVisuals", settings.battleVisuals);

        const skillInput = panel.querySelector('input[data-setting="skillNumber"]');
        if (skillInput instanceof HTMLInputElement && skillInput.value !== String(settings.skillNumber)) {
            skillInput.value = String(settings.skillNumber);
        }

        const classSelect = panel.querySelector('select[data-setting="playerClass"]');
        if (classSelect instanceof HTMLSelectElement && classSelect.value !== settings.playerClass) {
            classSelect.value = settings.playerClass;
        }

        const toggleButton = panel.querySelector('button[data-action="toggle-panel"]');
        if (toggleButton instanceof HTMLButtonElement) {
            toggleButton.textContent = settings.expanded ? "Hide" : "Show";
        }

        const statusNode = panel.querySelector(".apvp-status");
        if (statusNode) {
            statusNode.textContent = statusText;
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

    function renderSkillPriorityPanel(panel) {
        const container = panel.querySelector(".apvp-priority");
        if (!container) {
            return;
        }

        const classKey = getPriorityClassKey();
        const profile = getClassProfile(classKey);
        const priorities = getSkillPriorityList(classKey);

        container.innerHTML = `
            <div class="apvp-priority-head">
                <span>Priority for ${escapeHtml(profile.label)}</span>
                <button type="button" data-action="reset-skills" ${priorities.length ? "" : "disabled"}>Reset</button>
            </div>
            <div class="apvp-priority-list">
                ${priorities.length ? priorities.map((skillName, index) => `
                    <div class="apvp-priority-item">
                        <div class="apvp-priority-rank">${index + 1}</div>
                        <div class="apvp-priority-name" title="${escapeHtml(skillName)}">${escapeHtml(skillName)}</div>
                        <div class="apvp-priority-actions">
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
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
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

        if (action === "run-now") {
            updateStatus("Manual run requested");
            scheduleTick(10);
            return;
        }

        if (action === "skill-up" || action === "skill-down") {
            const index = Number.parseInt(target.dataset.index || "", 10);
            moveSkillPriority(index, action === "skill-up" ? -1 : 1);
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

    function resetSkillPriority() {
        const classKey = getPriorityClassKey();
        if (!settings.skillPriorities?.[classKey]) {
            return;
        }

        delete settings.skillPriorities[classKey];
        saveSettings();
        syncPanelState();
        updateStatus(`Cleared saved skill order for ${getClassProfile(classKey).label}`);
    }

    function updateStatus(text) {
        statusText = text;
        syncPanelState();
    }

    function rememberError(error) {
        lastError = String(error);
        console.error("GravyPvP:", error);
        syncPanelState();
    }

    function clearError() {
        if (!lastError) {
            return;
        }
        lastError = "";
        syncPanelState();
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

            if (!document.getElementById(PANEL_ID)) {
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
        if (element.id === PANEL_ID || element.id === STAGE_ID) {
            return true;
        }

        return !!element.closest(`#${PANEL_ID}, #${STAGE_ID}, .apvp-slot-visual`);
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
            renderPanel();
            refreshBattleVisuals();

            if (isBattlePage()) {
                const visibleSkillButtons = getSkillButtons();
                if (visibleSkillButtons.length) {
                    rememberSkillButtons(visibleSkillButtons);
                }
            }

            if (!settings.enabled) {
                updateStatus("Paused");
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

        const joinButton = findVisibleElement([
            ".action-btn.js-matchmake",
            ".js-matchmake",
            "button[class*='matchmake']",
            "button[data-action*='match']",
            "a.action-btn.js-matchmake"
        ]);

        const tokens = getTokenCount();
        const tokenLabel = Number.isFinite(tokens) ? `tokens ${tokens}` : "tokens unknown";

        if (!settings.autoJoin) {
            updateStatus(`Lobby: ${tokenLabel}`);
            return;
        }

        if (!joinButton) {
            updateStatus(`Lobby: waiting for join button, ${tokenLabel}`);
            return;
        }

        if (!isClickable(joinButton)) {
            updateStatus(`Lobby: join unavailable, ${tokenLabel}`);
            return;
        }

        if (tokens === 0) {
            updateStatus("Lobby: no PvP tokens left");
            return;
        }

        if (Date.now() - lastJoinAt < CONFIG.joinCooldownMs) {
            updateStatus(`Lobby: cooldown, ${tokenLabel}`);
            return;
        }

        lastJoinAt = Date.now();
        clickElement(joinButton, "Joined PvP matchmaking");
    }

    async function handleBattlePage() {
        clearError();

        if (await maybeLeaveFinishedBattle()) {
            return;
        }

        if (!settings.autoFight) {
            updateStatus("Battle: auto fight is off");
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
            updateStatus("Battle: waiting for turn");
            return;
        }

        await targetLowestHpEnemy();
    }

    async function maybeLeaveFinishedBattle() {
        const backButton = findVisibleElement([
            ".back-btn",
            "button.back-btn",
            "a.back-btn",
            ".result-actions .back-btn"
        ]);

        if (!backButton || !isClickable(backButton)) {
            return false;
        }

        const enemyAlive = getEnemySlots().length;
        const allyAlive = getAllySlots().length;
        const resultBannerVisible = hasResultBanner();
        const enemyContainerKnown = hasTeamContainer(ENEMY_CONTAINER_SELECTORS);
        const allyContainerKnown = hasTeamContainer(ALLY_CONTAINER_SELECTORS);
        const enemyDefeated = enemyContainerKnown && enemyAlive === 0;
        const allyDefeated = allyContainerKnown && allyAlive === 0;

        if (!resultBannerVisible && !enemyDefeated && !allyDefeated) {
            return false;
        }

        clickElement(backButton, "Battle finished, returning");
        return true;
    }

    async function targetLowestHpEnemy() {
        const targets = getEnemySlots();
        if (!targets.length) {
            updateStatus("Battle: no enemy targets found");
            return;
        }

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

            clickElement(chosenButton, `Used ${getButtonLabel(chosenButton)}`);
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

        for (const skillName of priorities) {
            const matchingButton = buttons.find((button) => isClickable(button) && getButtonLabel(button) === skillName);
            if (matchingButton) {
                return matchingButton;
            }
        }

        const fallbackButton = buttons[settings.skillNumber - 1];
        if (isClickable(fallbackButton)) {
            return fallbackButton;
        }

        return enabledButtons[0] || null;
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
            pulseSlotVisual(slot, "apvp-hit", 280);
            return;
        }

        const skillButton = target.closest("#skillsModal .skillsGrid button, .skillsGrid button, [id*='skillsModal'] button");
        if (skillButton instanceof HTMLElement && isVisible(skillButton) && settings.battleVisuals) {
            const skillName = getButtonLabel(skillButton);
            window.setTimeout(() => animateSkillCast(skillName), 30);
        }
    }

    function refreshBattleVisuals() {
        if (!settings.battleVisuals || !isBattlePage()) {
            cleanupBattleVisuals();
            return;
        }

        ensureBattleStage();

        const slots = getTrackedBattleSlots();
        const trackedParents = new Set(slots);

        for (const slot of slots) {
            renderSlotVisual(slot);
        }

        const visuals = document.querySelectorAll(".apvp-slot-visual");
        for (const visual of visuals) {
            if (!(visual.parentElement instanceof HTMLElement) || !trackedParents.has(visual.parentElement) || !isVisible(visual.parentElement)) {
                visual.remove();
            }
        }
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
            visual.innerHTML = buildAvatarMarkup(profile.label);
        }
    }

    function buildAvatarMarkup(label) {
        return `
            <div class="apvp-avatar">
                <div class="apvp-aura"></div>
                <div class="apvp-hat"></div>
                <div class="apvp-head"></div>
                <div class="apvp-body"></div>
                <div class="apvp-accent"></div>
                <div class="apvp-weapon"></div>
            </div>
            <div class="apvp-badge">${escapeHtml(label)}</div>
        `;
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
            return { label: "Auto", effect: "arcane", colors: ["#83b8ff", "#e7f1ff"] };
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

        pulseSlotVisual(actor, "apvp-casting", 420);
        if (target) {
            window.setTimeout(() => pulseSlotVisual(target, "apvp-hit", 420), 140);
        }

        spawnEffect({
            source: actor,
            target,
            effectType,
            classKey: actorClass
        });
    }

    function getCurrentActorSlot() {
        const allies = getVisibleTeamSlots(ALLY_CONTAINER_SELECTORS);
        const activeSlot = allies.find((slot) => {
            if (!(slot instanceof HTMLElement)) {
                return false;
            }

            if (slot.dataset.turn === "1" || slot.dataset.active === "1") {
                return true;
            }

            return /(active|current|turn|selected)/i.test(slot.className);
        });

        return activeSlot || allies.find((slot) => slot.dataset.alive !== "0") || allies[0] || null;
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
        const text = String(skillName || "").toLowerCase();
        if (/(heal|mend|recover|renew|restore|regen|cure)/.test(text)) {
            return "heal";
        }

        if (/(holy|smite|judg|light|blessing|divine)/.test(text)) {
            return "holy";
        }

        if (/(fire|flame|burn|ember|inferno|meteor)/.test(text)) {
            return "fire";
        }

        if (/(ice|frost|blizzard|glacier)/.test(text)) {
            return "ice";
        }

        if (/(shadow|void|curse|doom|drain|poison|venom|reap)/.test(text)) {
            return "shadow";
        }

        if (/(arrow|shot|snipe|bolt|pierce|throw)/.test(text)) {
            return "projectile";
        }

        if (/(slash|strike|stab|cut|cleave|rend|smash|combo|punch|kick)/.test(text)) {
            return "slash";
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
        const selectors = [
            ".result",
            ".battle-result",
            ".match-result",
            ".toast",
            ".notice",
            ".modal.show",
            ".popup"
        ];

        const text = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                text.push(element.textContent || "");
            }
        }

        return /victory|defeat|winner|you win|you lost|battle over|match over/i.test(text.join(" "));
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
        element.click();
        updateStatus(status);
        touchProgress();
    }

    function touchProgress() {
        lastProgressAt = Date.now();
    }

    function runWatchdog() {
        if (!settings.enabled || !settings.autoReload || document.hidden) {
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
