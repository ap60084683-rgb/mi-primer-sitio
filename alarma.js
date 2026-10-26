// Sonido de alarma generado en el navegador (no necesita archivos de audio)
let audio = null;
let activo = false;

// Los navegadores exigen que una persona toque un botón antes de permitir sonidos
export function alternarSonido() {
  if (!activo) {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    activo = true;
    sonar();
  } else {
    activo = false;
  }
  return activo;
}

export function sonar() {
  if (!activo || !audio) return;
  const t = audio.currentTime;
  [0, 0.28, 0.56].forEach((retraso, i) => {
    const onda = audio.createOscillator();
    const volumen = audio.createGain();
    onda.type = "square";
    onda.frequency.value = i % 2 ? 880 : 660;
    volumen.gain.setValueAtTime(0.0001, t + retraso);
    volumen.gain.exponentialRampToValueAtTime(0.25, t + retraso + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, t + retraso + 0.24);
    onda.connect(volumen).connect(audio.destination);
    onda.start(t + retraso);
    onda.stop(t + retraso + 0.26);
  });
}