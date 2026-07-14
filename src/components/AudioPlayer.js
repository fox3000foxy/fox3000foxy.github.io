import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
export default function AudioPlayer({ slug, lang, }) {
    const audioRef = useRef(null);
    const [audioAvailable, setAudioAvailable] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioUrl = `/articles/assets/audio-${slug}-${lang}.mp3`;
    useEffect(() => {
        setAudioAvailable(false);
        setPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        const controller = new AbortController();
        fetch(audioUrl, { method: "HEAD", signal: controller.signal })
            .then((res) => {
            if (!controller.signal.aborted) {
                setAudioAvailable(res.ok);
            }
        })
            .catch(() => {
            if (!controller.signal.aborted) {
                setAudioAvailable(false);
            }
        });
        return () => controller.abort();
    }, [audioUrl]);
    function togglePlay() {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (playing) {
            audio.pause();
        }
        else {
            void audio.play();
        }
    }
    function handleTimeUpdate() {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    }
    function handleLoadedMetadata() {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    }
    function handleEnded() {
        setPlaying(false);
        setCurrentTime(0);
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
        }
    }
    function formatTime(seconds) {
        if (!Number.isFinite(seconds)) {
            return "0:00";
        }
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    }
    function handleSeek(e) {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (!duration) {
            return;
        }
        let fraction;
        if ("clientX" in e) {
            const rect = e.currentTarget.getBoundingClientRect();
            fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        }
        else {
            const step = e.key === "ArrowRight" ? 0.05 : e.key === "ArrowLeft" ? -0.05 : 0;
            fraction = Math.max(0, Math.min(1, audio.currentTime / duration + step));
        }
        audio.currentTime = fraction * duration;
    }
    if (!audioAvailable) {
        return null;
    }
    return (_jsxs("div", { className: "audio-player", children: [_jsx("audio", { ref: audioRef, src: audioUrl, onPlay: () => {
                    setPlaying(true);
                }, onPause: () => {
                    setPlaying(false);
                }, onTimeUpdate: handleTimeUpdate, onLoadedMetadata: handleLoadedMetadata, onEnded: handleEnded, preload: "metadata", children: _jsx("track", { kind: "captions" }) }), _jsx("button", { type: "button", className: "audio-play-btn", onClick: togglePlay, "aria-label": playing ? "Pause" : "Play", children: playing ? "⏸" : "▶" }), _jsx("div", { className: "audio-progress", onClick: handleSeek, onKeyDown: handleSeek, role: "progressbar", "aria-valuenow": currentTime, "aria-valuemax": duration, "aria-label": "Audio progress", children: _jsx("div", { className: "audio-progress-bar", style: {
                        width: duration ? `${(currentTime / duration) * 100}%` : "0%",
                    } }) }), _jsxs("span", { className: "audio-time", children: [formatTime(currentTime), " / ", formatTime(duration)] })] }));
}
