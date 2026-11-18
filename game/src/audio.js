// Procedural WebAudio sound: no audio files. Engine hum, gunshots, sirens,
// pickups and a lazy sun-soaked chord pad, all synthesized live.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.chords = [[220, 277, 330], [174, 220, 262], [196, 247, 294], [146, 220, 293]];
    this.chordIndex = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startMusic();
    this.startEngine();
    this.startBassline();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }
  setEngine(speed01, driving) {
    if (!this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.1);
  }
  startMusic() {
    const playChord = () => {
      if (!this.ctx || this.muted) { this.musicTimer = setTimeout(playChord, 2600); return; }
      const notes = this.chords[this.chordIndex % this.chords.length];
      this.chordIndex += 1;
      for (const f of notes) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle'; osc.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.035, this.ctx.currentTime + 0.6);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.6);
        osc.connect(g); g.connect(this.master);
        osc.start(); osc.stop(this.ctx.currentTime + 2.7);
      }
      this.musicTimer = setTimeout(playChord, 2600);
    };
    playChord();
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine'; osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (dur || 0.15));
    osc.connect(g); g.connect(this.master);
    osc.start(); osc.stop(this.ctx.currentTime + (dur || 0.15));
  }
  noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = freq || 1800;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start();
  }
  gunshot() { this.noise(0.14, 0.3, 2400); }
  pickup() { this.blip(880, 0.12, 'sine', 0.14); setTimeout(() => this.blip(1320, 0.16, 'sine', 0.12), 70); }
  crash() { this.noise(0.3, 0.3, 500); }
  missionDone() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.15), i * 110)); }
  wantedUp() { this.blip(196, 0.3, 'square', 0.08); }
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.03;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenPhase = 0;
    } else if (!on && this.sirenOsc) {
      this.sirenOsc.stop(); this.sirenOsc = null; this.sirenGain = null;
    }
  }
  updateSiren(t) {
    if (this.sirenOsc) this.sirenOsc.frequency.value = 700 + Math.sin(t * 3.2) * 220;
  }

  // Radio stations: three procedural stations sharing one chord engine.
  // Switching swaps the chord set (and the bassline's root) from the next bar.
  stations() {
    return [
      { name: 'BAY FM — Sunset Chords', chords: [[220, 277, 330], [174, 220, 262], [196, 247, 294], [146, 220, 293]], bass: [110, 87, 98, 73] },
      { name: 'NIGHT DRIVE — Low Tide', chords: [[196, 233, 294], [164, 207, 247], [174, 220, 277], [146, 185, 220]], bass: [98, 82, 87, 73] },
      { name: 'PALM STATIC — Boardwalk', chords: [[262, 330, 392], [220, 277, 349], [247, 311, 370], [196, 262, 330]], bass: [131, 110, 123, 98] },
    ];
  }
  stationName() {
    const list = this.stations();
    return list[this.station || 0].name;
  }
  setStation(i) {
    const list = this.stations();
    this.station = ((i % list.length) + list.length) % list.length;
    this.chords = list[this.station].chords;
    this.chordIndex = 0;
    this.playJingle();
    return list[this.station].name;
  }
  nextStation() { return this.setStation((this.station || 0) + 1); }
  playJingle() {
    if (!this.ctx || this.muted) return;
    [660, 880, 990].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'triangle', 0.07), i * 70));
  }
  startBassline() {
    // One low root note per chord change, following the active station.
    const thump = () => {
      if (!this.ctx) return;
      if (!this.muted) {
        const list = this.stations();
        const st = list[this.station || 0];
        const root = st.bass[this.chordIndex % st.bass.length];
        this.blip(root, 0.5, 'sine', 0.06);
      }
      this.bassTimer = setTimeout(thump, 2600);
    };
    thump();
  }
  skid() { this.noise(0.45, 0.16, 900); }
  doorSlam() {
    this.blip(70, 0.18, 'square', 0.2);
    this.noise(0.08, 0.18, 700);
  }
  heliChop() { this.noise(0.2, 0.05, 300); }
}
