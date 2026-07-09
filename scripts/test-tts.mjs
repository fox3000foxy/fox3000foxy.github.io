import { getVoices, tts } from "edge-tts";

const voices = await getVoices();

const ourLangs = ["en-US","en-GB","fr-FR","de-DE","es-ES","it-IT","pt-PT","pt-BR","ru-RU","ja-JP","ko-KR","zh-CN","ar-SA","hi-IN","id-ID","th-TH","tr-TR","vi-VN"];

for (const v of voices) {
  if (ourLangs.some(l => v.Locale === l)) {
    const neural = v.VoiceTag?.ContentCategories?.includes("Neural") ? "🧠" : "  ";
    console.log(`${neural} ${v.Locale.padEnd(8)} ${v.ShortName.padEnd(30)} ${v.FriendlyName.padEnd(30)} ${(v.Gender||"").padEnd(6)} ${v.VoiceTag?.ContentCategories?.join(",") || ""}`);
  }
}

console.log("\n--- Generating test audio ---");
const audio = await tts("Bonjour, ceci est un test de synthèse vocale avec une voix naturelle et réaliste.", { voice: "fr-FR-DeniseNeural" });
console.log(`Generated ${audio.length} bytes of MP3 audio`);
