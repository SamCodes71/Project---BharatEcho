import { useState, useRef } from "react";
import { sendAudio } from "@/lib/api";

export default function VoiceAgent() {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;

    audioChunks.current = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.current.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
      const file = new File([audioBlob], "input.webm");

      const res = await sendAudio(file);

const audioUrl = res.audio_url;
console.log("Playing:", audioUrl);

// 🔥 wait a bit
// await new Promise((resolve) => setTimeout(resolve, 300));

// 🔥 use real DOM audio element
const player = document.getElementById("player") as HTMLAudioElement;

if (player) {
  player.src = audioUrl;
  player.load();
  player.volume = 1;
  player.muted = false;

  player.play().catch((err) => {
    console.error("Playback failed:", err);
  });
}

      // 🔥 Stop mic properly
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>🎙 AI Voice Agent</h2>

      {!recording ? (
        <button onClick={startRecording}>Start Talking</button>
      ) : (
        <button onClick={stopRecording}>Stop & Send</button>

      )}
  {/* 🔥 THIS WAS MISSING */}
    <audio
      id="player"
      controls
      style={{ marginTop: "20px", width: "100%" }}
    />
    </div>
  );
}