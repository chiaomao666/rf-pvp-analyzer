(() => {
    "use strict";

    const defaults = {
        reduceMotion: true
    };

    const existing = window.RFModConfig && typeof window.RFModConfig === "object"
        ? window.RFModConfig
        : {};

    const config = Object.assign(defaults, existing);
    window.RFModConfig = config;

    function applyReducedMotion() {
        document.documentElement.classList.toggle(
            "rf-reduce-motion",
            config.reduceMotion !== false
        );
    }

    function setReduceMotion(enabled) {
        config.reduceMotion = Boolean(enabled);
        applyReducedMotion();
    }

    function setMuteButtonSound(enabled) {
        if (window.RFAudio) window.RFAudio.setMuted("effects", Boolean(enabled));
    }

    window.RFMod = Object.freeze({
        config,
        applyReducedMotion,
        setReduceMotion,
        setMuteButtonSound
    });

    applyReducedMotion();
})();
