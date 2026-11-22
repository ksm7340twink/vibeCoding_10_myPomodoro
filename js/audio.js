/**
 * Web Audio API 기반 백색소음(파도, 비, 새 소리) & 종료 알림음 엔진
 * 외부 오디오 링크 장애 없이 완전 오프라인으로 동작합니다.
 */
(function (global) {
  class AudioEngine {
    constructor({ volume = 0.5, muted = false } = {}) {
      this.ctx = null;
      this.ambientMasterGain = null;
      this.activeSound = null; // 'wave' | 'rain' | 'birds' | null
      this.activeNodes = [];
      this.activeTimers = [];
      this.volume = volume;
      this.muted = muted;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
        this.ambientMasterGain = this.ctx.createGain();
        this.ambientMasterGain.gain.setValueAtTime(
          this.muted ? 0 : this.volume,
          this.ctx.currentTime
        );
        this.ambientMasterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    /**
     * Pink Noise 버퍼 생성 (Voss-McCartney 근사 필터)
     */
    createPinkNoiseBuffer(seconds = 4) {
      const ctx = this.ctx;
      const sampleRate = ctx.sampleRate;
      const length = Math.floor(sampleRate * seconds);
      const buffer = ctx.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.065;
          b6 = white * 0.115926;
        }
      }
      return buffer;
    }

    /**
     * Brown Noise 버퍼 생성 (부드러운 저역 파도/바람용)
     */
    createBrownNoiseBuffer(seconds = 5) {
      const ctx = this.ctx;
      const sampleRate = ctx.sampleRate;
      const length = Math.floor(sampleRate * seconds);
      const buffer = ctx.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let lastOut = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.022 * white) / 1.022;
          data[i] = lastOut * 2.8;
        }
      }
      return buffer;
    }

    stopAmbient() {
      this.activeTimers.forEach((id) => clearTimeout(id));
      this.activeTimers = [];

      this.activeNodes.forEach((node) => {
        try {
          if (typeof node.stop === 'function') {
            node.stop();
          }
        } catch {
          // 이미 중지된 노드 무시
        }
        try {
          node.disconnect();
        } catch {
          // 이미 연결 해제된 노드 무시
        }
      });
      this.activeNodes = [];
      this.activeSound = null;
    }

    /**
     * 백색소음 토글/전환 ('wave' | 'rain' | 'birds' | null)
     */
    toggleAmbient(type) {
      if (this.activeSound === type || !type) {
        this.stopAmbient();
        return null;
      }

      const ctx = this.ensureContext();
      if (!ctx) return null;

      this.stopAmbient();
      this.activeSound = type;

      if (type === 'wave') {
        this._startWave();
      } else if (type === 'rain') {
        this._startRain();
      } else if (type === 'birds') {
        this._startBirds();
      }

      this._applyAmbientGain();
      return this.activeSound;
    }

    /**
     * 파도 소리: 저역 브라운 노이즈 + 느린 LFO 파도 밀물/썰물 변조 + 부드러운 거품 레이어
     */
    _startWave() {
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const brownSource = ctx.createBufferSource();
      brownSource.buffer = this.createBrownNoiseBuffer(6);
      brownSource.loop = true;

      const surfFilter = ctx.createBiquadFilter();
      surfFilter.type = 'lowpass';
      surfFilter.frequency.setValueAtTime(340, now);
      surfFilter.Q.setValueAtTime(0.8, now);

      const surfGain = ctx.createGain();
      surfGain.gain.setValueAtTime(0.55, now);

      // 느린 파도 주기 (약 8초 간격)
      const waveLfo = ctx.createOscillator();
      waveLfo.type = 'sine';
      waveLfo.frequency.setValueAtTime(0.125, now);

      const freqModGain = ctx.createGain();
      freqModGain.gain.setValueAtTime(240, now);

      const ampModGain = ctx.createGain();
      ampModGain.gain.setValueAtTime(0.28, now);

      waveLfo.connect(freqModGain);
      freqModGain.connect(surfFilter.frequency);
      waveLfo.connect(ampModGain);
      ampModGain.connect(surfGain.gain);

      brownSource.connect(surfFilter);
      surfFilter.connect(surfGain);
      surfGain.connect(this.ambientMasterGain);

      // 파도 거품(고역 쉬머)
      const foamSource = ctx.createBufferSource();
      foamSource.buffer = this.createPinkNoiseBuffer(4);
      foamSource.loop = true;

      const foamFilter = ctx.createBiquadFilter();
      foamFilter.type = 'bandpass';
      foamFilter.frequency.setValueAtTime(1400, now);
      foamFilter.Q.setValueAtTime(0.7, now);

      const foamGain = ctx.createGain();
      foamGain.gain.setValueAtTime(0.08, now);

      const foamLfoGain = ctx.createGain();
      foamLfoGain.gain.setValueAtTime(0.07, now);

      waveLfo.connect(foamLfoGain);
      foamLfoGain.connect(foamGain.gain);

      foamSource.connect(foamFilter);
      foamFilter.connect(foamGain);
      foamGain.connect(this.ambientMasterGain);

      brownSource.start(now);
      foamSource.start(now);
      waveLfo.start(now);

      this.activeNodes.push(
        brownSource,
        surfFilter,
        surfGain,
        waveLfo,
        freqModGain,
        ampModGain,
        foamSource,
        foamFilter,
        foamGain,
        foamLfoGain
      );
    }

    /**
     * 비 소리: 따뜻한 중역 빗줄기 + 고역 빗방울 텍스처 + 간헐적 미세 물방울
     */
    _startRain() {
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const rainSource = ctx.createBufferSource();
      rainSource.buffer = this.createPinkNoiseBuffer(5);
      rainSource.loop = true;

      const bodyFilter = ctx.createBiquadFilter();
      bodyFilter.type = 'bandpass';
      bodyFilter.frequency.setValueAtTime(1150, now);
      bodyFilter.Q.setValueAtTime(0.45, now);

      const warmthFilter = ctx.createBiquadFilter();
      warmthFilter.type = 'lowpass';
      warmthFilter.frequency.setValueAtTime(3200, now);

      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.62, now);

      rainSource.connect(bodyFilter);
      bodyFilter.connect(warmthFilter);
      warmthFilter.connect(bodyGain);
      bodyGain.connect(this.ambientMasterGain);

      // 빗소리 잔물결 레이어
      const mistSource = ctx.createBufferSource();
      mistSource.buffer = this.createPinkNoiseBuffer(4);
      mistSource.loop = true;

      const mistFilter = ctx.createBiquadFilter();
      mistFilter.type = 'highpass';
      mistFilter.frequency.setValueAtTime(2600, now);

      const mistGain = ctx.createGain();
      mistGain.gain.setValueAtTime(0.16, now);

      mistSource.connect(mistFilter);
      mistFilter.connect(mistGain);
      mistGain.connect(this.ambientMasterGain);

      rainSource.start(now);
      mistSource.start(now);

      this.activeNodes.push(
        rainSource,
        bodyFilter,
        warmthFilter,
        bodyGain,
        mistSource,
        mistFilter,
        mistGain
      );
    }

    /**
     * 새 소리: 잔잔한 숲속 바람 배경 + 자연스러운 멀티 톤 새 지저귐 스케줄러
     */
    _startBirds() {
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // 아주 잔잔한 숲속 공기/바람 배경
      const breezeSource = ctx.createBufferSource();
      breezeSource.buffer = this.createPinkNoiseBuffer(5);
      breezeSource.loop = true;

      const breezeFilter = ctx.createBiquadFilter();
      breezeFilter.type = 'lowpass';
      breezeFilter.frequency.setValueAtTime(520, now);

      const breezeGain = ctx.createGain();
      breezeGain.gain.setValueAtTime(0.16, now);

      breezeSource.connect(breezeFilter);
      breezeFilter.connect(breezeGain);
      breezeGain.connect(this.ambientMasterGain);
      breezeSource.start(now);

      this.activeNodes.push(breezeSource, breezeFilter, breezeGain);

      // 자연스러운 새소리 지저귐 반복 예약
      const scheduleNextChirp = (initialDelay) => {
        if (this.activeSound !== 'birds') return;
        const delay =
          typeof initialDelay === 'number'
            ? initialDelay
            : 950 + Math.random() * 2400;

        const timerId = setTimeout(() => {
          if (this.activeSound !== 'birds') return;
          this._playBirdPhrase();
          scheduleNextChirp();
        }, delay);

        this.activeTimers.push(timerId);
      };

      scheduleNextChirp(200);
    }

    _playBirdPhrase() {
      if (!this.ctx || this.activeSound !== 'birds') return;
      const ctx = this.ctx;
      const baseTime = ctx.currentTime + 0.03;

      // 2~4음절의 짧은 지저귐 패턴 생성
      const noteCount = 2 + Math.floor(Math.random() * 3);
      const baseFreq = 2500 + Math.random() * 1400;
      const panValue = (Math.random() * 1.4) - 0.7;

      for (let i = 0; i < noteCount; i++) {
        const start = baseTime + i * (0.11 + Math.random() * 0.08);
        const duration = 0.075 + Math.random() * 0.065;

        const osc = ctx.createOscillator();
        osc.type = Math.random() > 0.35 ? 'sine' : 'triangle';

        const peakFreq = baseFreq * (1.12 + Math.random() * 0.25);
        const endFreq = baseFreq * (0.92 + Math.random() * 0.18);

        osc.frequency.setValueAtTime(baseFreq, start);
        osc.frequency.exponentialRampToValueAtTime(peakFreq, start + duration * 0.45);
        osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0.0001, start);
        noteGain.gain.linearRampToValueAtTime(0.11 + Math.random() * 0.05, start + 0.015);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        osc.connect(noteGain);

        if (typeof ctx.createStereoPanner === 'function') {
          const panner = ctx.createStereoPanner();
          panner.pan.setValueAtTime(panValue, start);
          noteGain.connect(panner);
          panner.connect(this.ambientMasterGain);
        } else {
          noteGain.connect(this.ambientMasterGain);
        }

        osc.start(start);
        osc.stop(start + duration + 0.02);
      }
    }

    setVolume(value) {
      this.volume = Math.min(1, Math.max(0, value));
      this._applyAmbientGain();
    }

    setMuted(muted) {
      this.muted = Boolean(muted);
      this._applyAmbientGain();
    }

    _applyAmbientGain() {
      if (!this.ctx || !this.ambientMasterGain) return;
      const target = this.muted ? 0 : this.volume;
      this.ambientMasterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
    }

    /**
     * 종료 알림음 재생 (백색소음 음소거 여부와 무관하게 독립 채널로 울림)
     * @param {'focus' | 'break'} completedMode
     */
    playAlarm(completedMode = 'focus') {
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime + 0.02;

      // 집중 완료: 성취감을 주는 밝은 4음 차임 (C5 - E5 - G5 - C6)
      // 휴식 완료: 다시 집중을 알리는 차분한 2음 벨 (G4 - D5 x2)
      const sequence =
        completedMode === 'focus'
          ? [
              { freq: 523.25, delay: 0.0, duration: 0.55, gain: 0.22 },
              { freq: 659.25, delay: 0.16, duration: 0.55, gain: 0.22 },
              { freq: 783.99, delay: 0.32, duration: 0.65, gain: 0.24 },
              { freq: 1046.5, delay: 0.5, duration: 1.05, gain: 0.26 },
            ]
          : [
              { freq: 392.0, delay: 0.0, duration: 0.5, gain: 0.2 },
              { freq: 587.33, delay: 0.2, duration: 0.75, gain: 0.24 },
              { freq: 392.0, delay: 0.65, duration: 0.5, gain: 0.2 },
              { freq: 587.33, delay: 0.85, duration: 0.9, gain: 0.24 },
            ];

      sequence.forEach(({ freq, delay, duration, gain }) => {
        const start = now + delay;

        // 기본음 + 부드러운 배음
        const oscMain = ctx.createOscillator();
        const oscOver = ctx.createOscillator();
        oscMain.type = 'sine';
        oscOver.type = 'triangle';

        oscMain.frequency.setValueAtTime(freq, start);
        oscOver.frequency.setValueAtTime(freq * 2, start);

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, start);
        env.gain.linearRampToValueAtTime(gain, start + 0.015);
        env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        const overGain = ctx.createGain();
        overGain.gain.setValueAtTime(0.18, start);

        oscMain.connect(env);
        oscOver.connect(overGain);
        overGain.connect(env);
        env.connect(ctx.destination);

        oscMain.start(start);
        oscOver.start(start);
        oscMain.stop(start + duration + 0.04);
        oscOver.stop(start + duration + 0.04);
      });
    }
  }

  global.PomodoroAudioEngine = AudioEngine;
})(window);
