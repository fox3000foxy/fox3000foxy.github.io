import { useEffect, useRef, useState } from "react";

export default function AudioPlayer({
	slug,
	lang,
}: {
	slug: string;
	lang: string;
}) {
	const audioRef = useRef<HTMLAudioElement>(null);
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
		fetch(audioUrl, { method: "HEAD" })
			.then((res) => setAudioAvailable(res.ok))
			.catch(() => setAudioAvailable(false));
	}, [audioUrl]);

	function togglePlay() {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		if (playing) {
			audio.pause();
		} else {
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

	function formatTime(seconds: number): string {
		if (!Number.isFinite(seconds)) {
			return "0:00";
		}
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, "0")}`;
	}

	function handleSeek(
		e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
	) {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		if (!duration) {
			return;
		}
		let fraction: number;
		if ("clientX" in e) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			fraction = Math.max(
				0,
				Math.min(1, (e.clientX - rect.left) / rect.width),
			);
		} else {
			const step =
				e.key === "ArrowRight"
					? 0.05
					: e.key === "ArrowLeft"
						? -0.05
						: 0;
			fraction = Math.max(
				0,
				Math.min(1, audio.currentTime / duration + step),
			);
		}
		audio.currentTime = fraction * duration;
	}

	if (!audioAvailable) {
		return null;
	}

	return (
		<div className="audio-player">
			<audio
				ref={audioRef}
				src={audioUrl}
				onPlay={() => {
					setPlaying(true);
				}}
				onPause={() => {
					setPlaying(false);
				}}
				onTimeUpdate={handleTimeUpdate}
				onLoadedMetadata={handleLoadedMetadata}
				onEnded={handleEnded}
				preload="metadata"
			>
				<track kind="captions" />
			</audio>
			<button
				type="button"
				className="audio-play-btn"
				onClick={togglePlay}
				aria-label={playing ? "Pause" : "Play"}
			>
				{playing ? "⏸" : "▶"}
			</button>
			<div
				className="audio-progress"
				onClick={handleSeek}
				onKeyDown={handleSeek}
				role="progressbar"
				aria-valuenow={currentTime}
				aria-valuemax={duration}
				aria-label="Audio progress"
			>
				<div
					className="audio-progress-bar"
					style={{
						width: duration
							? `${(currentTime / duration) * 100}%`
							: "0%",
					}}
				/>
			</div>
			<span className="audio-time">
				{formatTime(currentTime)} / {formatTime(duration)}
			</span>
		</div>
	);
}