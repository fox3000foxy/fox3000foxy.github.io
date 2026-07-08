import { useState } from "react";
import { useLang } from "../hooks/useLang";
import "../styles/Photos.css";

interface Photo {
	src: string;
	alt: string;
}

function discoverPhotos(): Photo[] {
	const known: Photo[] = [
		{
			src: "/uploads/430087066_362752016741701_1789090055850910350_n.png",
			alt: "",
		},
		{
			src: "/uploads/430211211_1506393849948620_2289852538544570689_n.png",
			alt: "",
		},
		{
			src: "/uploads/430306739_1096266581640599_4223690919449423402_n.png",
			alt: "",
		},
		{
			src: "/uploads/430333617_1441291393440641_3513029838453039108_n.png",
			alt: "",
		},
		{
			src: "/uploads/430351528_460519246393040_8676436084581333629_n.png",
			alt: "",
		},
		{
			src: "/uploads/430829334_2216111272054528_1672689474813728089_n.png",
			alt: "",
		},
		{
			src: "/uploads/430986791_2549915025169770_2055293833870974255_n.png",
			alt: "",
		},
		{
			src: "/uploads/433170570_3705959496395744_465341575681966835_n.png",
			alt: "",
		},
		{
			src: "/uploads/433200108_444443761648586_2008342869375830981_n.png",
			alt: "",
		},
	];
	return known;
}

export default function Photos() {
	const { t } = useLang();
	const [photos] = useState<Photo[]>(discoverPhotos);

	return (
		<article className="photos-page">
			<h1>{t("photos.title")}</h1>

			{photos.length === 0 ? (
				<p>{t("photos.empty")}</p>
			) : (
				<div className="photos-grid">
					{photos.map((photo, i) => (
						<div key={photo.src} className="photo-thumb">
							<img
								src={photo.src}
								alt={photo.alt || `Photo ${i + 1}`}
								loading="lazy"
							/>
						</div>
					))}
				</div>
			)}
		</article>
	);
}
