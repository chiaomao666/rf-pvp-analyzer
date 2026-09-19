(() => {
    "use strict";

    const STORAGE_KEY = "rfAudioSettingsV1";
    const CATEGORIES = Object.freeze(["effects", "music", "voice"]);
    const LABELS = Object.freeze({
        effects: "效果音",
        music: "背景音樂",
        voice: "角色語音"
    });
    const defaults = Object.freeze({
        effects: { volume: 1, muted: true },
        music: { volume: 1, muted: true },
        voice: { volume: 1, muted: true }
    });

    const trackedMedia = new Set();
    const mediaMetadata = new WeakMap();
    const mediaWithCleanup = new WeakSet();
    const nativePlay = window.HTMLMediaElement && window.HTMLMediaElement.prototype.play;

    function cloneDefaults() {
        return {
            effects: { ...defaults.effects },
            music: { ...defaults.music },
            voice: { ...defaults.voice }
        };
    }

    function clampVolume(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 1;
        return Math.min(1, Math.max(0, number));
    }

    function normalizeCategory(category) {
        return CATEGORIES.includes(category) ? category : "voice";
    }

    function loadState() {
        const state = cloneDefaults();
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            if (!saved || typeof saved !== "object") return state;
            CATEGORIES.forEach((category) => {
                const item = saved[category];
                if (!item || typeof item !== "object") return;
                state[category].volume = clampVolume(item.volume);
                state[category].muted = Boolean(item.muted);
            });
        } catch (error) {
            console.warn("[RF Audio] 無法讀取音量設定，已使用預設值。", error);
        }
        return state;
    }

    const state = loadState();

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn("[RF Audio] 無法儲存音量設定。", error);
        }
    }

    function normalizeSource(source) {
        if (!source) return "";
        try {
            return decodeURIComponent(new URL(String(source), document.baseURI).pathname).toLowerCase();
        } catch (_) {
            return String(source).toLowerCase();
        }
    }

    function classify(source, media, hint) {
        if (CATEGORIES.includes(hint)) return hint;
        const path = normalizeSource(source || (media && (media.currentSrc || media.src)));
        if (path.includes("/audio/music/")) return "music";
        if (path.includes("/audio/sound_effect/")) return "effects";
        if (media && media.loop) return "music";
        return "voice";
    }

    function effectiveVolume(category) {
        const item = state[normalizeCategory(category)];
        return item.muted ? 0 : clampVolume(item.volume);
    }

    function attachCleanup(media) {
        if (mediaWithCleanup.has(media)) return;
        mediaWithCleanup.add(media);
        const cleanup = () => {
            if (!media.loop) trackedMedia.delete(media);
        };
        media.addEventListener("ended", cleanup);
        media.addEventListener("error", cleanup);
        media.addEventListener("abort", cleanup);
    }

    function prepare(media, source, hint) {
        if (!media || typeof media !== "object") return media;
        const category = classify(source, media, hint);
        mediaMetadata.set(media, { category, source: String(source || media.currentSrc || media.src || "") });
        trackedMedia.add(media);
        attachCleanup(media);
        media.volume = effectiveVolume(category);
        return media;
    }

    function shouldPlay(source, hint) {
        return effectiveVolume(classify(source, null, hint)) > 0;
    }

    function notify() {
        document.dispatchEvent(new CustomEvent("rf-audio-settings-change", {
            detail: getState()
        }));
    }

    function updateTrackedMedia(category, resumeMusic) {
        const normalized = normalizeCategory(category);
        const volume = effectiveVolume(normalized);
        trackedMedia.forEach((media) => {
            if (!media || typeof media.volume !== "number") {
                trackedMedia.delete(media);
                return;
            }
            const metadata = mediaMetadata.get(media);
            const mediaCategory = metadata ? metadata.category : classify(media.currentSrc || media.src, media);
            if (mediaCategory !== normalized) return;
            media.volume = volume;
            if (normalized === "music") {
                if (volume <= 0) {
                    media.pause();
                } else if (resumeMusic && media.paused && (media.currentSrc || media.src)) {
                    const result = nativePlay ? nativePlay.call(media) : media.play();
                    if (result && typeof result.catch === "function") result.catch(() => {});
                }
            }
        });
    }

    function setVolume(category, value) {
        const normalized = normalizeCategory(category);
        state[normalized].volume = clampVolume(value);
        if (state[normalized].volume > 0) state[normalized].muted = false;
        saveState();
        updateTrackedMedia(normalized, true);
        notify();
    }

    function setMuted(category, muted) {
        const normalized = normalizeCategory(category);
        state[normalized].muted = Boolean(muted);
        saveState();
        updateTrackedMedia(normalized, true);
        notify();
    }

    function toggleMuted(category) {
        const normalized = normalizeCategory(category);
        setMuted(normalized, !state[normalized].muted);
    }

    function reset() {
        CATEGORIES.forEach((category) => {
            state[category].volume = defaults[category].volume;
            state[category].muted = defaults[category].muted;
            updateTrackedMedia(category, true);
        });
        saveState();
        notify();
    }

    function getState() {
        return CATEGORIES.reduce((result, category) => {
            result[category] = { ...state[category] };
            return result;
        }, {});
    }

    function installGlobalMediaFallback() {
        if (!nativePlay || window.HTMLMediaElement.prototype.play.__rfAudioWrapped) return;
        const wrappedPlay = function(...args) {
            if (!(window.HTMLAudioElement && this instanceof window.HTMLAudioElement))
                return nativePlay.apply(this, args);
            const metadata = mediaMetadata.get(this);
            prepare(this, this.currentSrc || this.src, metadata && metadata.category);
            // v3.0 的音效流程等待 ended。非循環音訊以 volume=0 播放，
            // 保留原生完成事件，避免返回已完成 Promise 卻永遠沒有 ended。
            if (this.loop && effectiveVolume((mediaMetadata.get(this) || {}).category) <= 0) {
                this.pause();
                return Promise.resolve();
            }
            return nativePlay.apply(this, args);
        };
        Object.defineProperty(wrappedPlay, "__rfAudioWrapped", { value: true });
        window.HTMLMediaElement.prototype.play = wrappedPlay;
    }

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    // 外殼（拖曳／收合／貼邊／位置保存）改由 uw_panel.js 統一負責，
    // 這裡只留音量控制自己的內容樣式。
    function injectStyle() {
        if (document.getElementById("rf-audio-panel-style")) return;
        const style = document.createElement("style");
        style.id = "rf-audio-panel-style";
        style.textContent = `
            #uw-panel--rf_audio_panel .rf-audio-item{margin-bottom:10px;}
            #uw-panel--rf_audio_panel .rf-audio-item:last-of-type{margin-bottom:8px;}
            #uw-panel--rf_audio_panel .rf-audio-label-row{display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;}
            #uw-panel--rf_audio_panel .rf-audio-label{color:#e8e4d5; font-size:11px;}
            #uw-panel--rf_audio_panel .rf-audio-value{font-size:clamp(9px, 0.75vw, 11px);}
            #uw-panel--rf_audio_panel .rf-audio-control-row{display:flex; align-items:center; gap:7px;}
            #uw-panel--rf_audio_panel input[type="range"]{flex:1; min-width:0; accent-color:#d9a441; cursor:pointer;}
            #uw-panel--rf_audio_panel button.rf-audio-muted{background:#5b2924; border-color:#9a493f; color:#fff;}
            #uw-panel--rf_audio_panel button.rf-audio-muted:hover{background:#743630; color:#fff;}
            #uw-panel--rf_audio_panel .rf-audio-footer{display:flex; justify-content:flex-end; border-top:1px solid #303525; padding-top:8px;}
            #uw-panel--rf_audio_panel .rf-audio-note{color:#8b9284; font-size:9.5px; margin-top:7px; line-height:1.35;}
        `;
        document.head.appendChild(style);
    }

    function buildPanel() {
        if (!window.UWPanel) {
            console.warn("[RF Audio] 找不到 UWPanel，音量面板略過");
            return;
        }
        injectStyle();

        const panel = window.UWPanel.create({
            id: "rf_audio_panel",
            title: "[RF] 音量控制面板",
            tabTitle: "音量",
            side: "right",
            ariaLabel: "RF 音量控制"
        });
        if (!panel) return;

        const body = panel.body;
        const controls = new Map();

        CATEGORIES.forEach((category) => {
            const item = makeElement("div", "rf-audio-item");
            const labelRow = makeElement("div", "rf-audio-label-row");
            labelRow.appendChild(makeElement("span", "rf-audio-label", LABELS[category]));
            const value = makeElement("span", "rf-audio-value");
            labelRow.appendChild(value);
            item.appendChild(labelRow);

            const controlRow = makeElement("div", "rf-audio-control-row");
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0";
            slider.max = "100";
            slider.step = "1";
            slider.setAttribute("aria-label", `${LABELS[category]}音量`);
            const mute = makeElement("button");
            mute.type = "button";
            controlRow.appendChild(slider);
            controlRow.appendChild(mute);
            item.appendChild(controlRow);
            body.appendChild(item);

            slider.addEventListener("input", () => setVolume(category, Number(slider.value) / 100));
            mute.addEventListener("click", () => toggleMuted(category));
            controls.set(category, { slider, value, mute });
        });

        const footer = makeElement("div", "rf-audio-footer");
        const resetButton = makeElement("button", "", "重設為 100%");
        resetButton.type = "button";
        resetButton.addEventListener("click", reset);
        footer.appendChild(resetButton);
        body.appendChild(footer);
        body.appendChild(makeElement("div", "rf-audio-note", "設定會保存在此瀏覽器；靜音音效仍會載入，以保留遊戲播放完成流程。"));

        function render() {
            CATEGORIES.forEach((category) => {
                const control = controls.get(category);
                const item = state[category];
                const percent = Math.round(item.volume * 100);
                control.slider.value = String(percent);
                control.value.textContent = item.muted ? `靜音 (${percent}%)` : `${percent}%`;
                control.mute.textContent = item.muted ? "取消靜音" : "靜音";
                control.mute.classList.toggle("rf-audio-muted", item.muted);
            });
        }

        document.addEventListener("rf-audio-settings-change", render);
        render();
    }

    const api = Object.freeze({
        classify,
        prepare,
        shouldPlay,
        effectiveVolume,
        getState,
        setVolume,
        setMuted,
        toggleMuted,
        reset
    });

    window.RFAudio = api;
    installGlobalMediaFallback();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildPanel, { once: true });
    } else {
        buildPanel();
    }

    console.log("[RF Audio] 三類音量控制已載入。", getState());
})();
