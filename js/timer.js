/**
 * 포모도로 타이머 코어 엔진
 * Date.now() 기준 시간 보정으로 백그라운드 탭에서도 오차 없이 자동 전환됩니다.
 */
(function (global) {
  const DURATIONS = {
    standard: {
      focus: 25 * 60 * 1000,
      break: 5 * 60 * 1000,
    },
    test: {
      focus: 5 * 1000,
      break: 3 * 1000,
    },
  };

  class PomodoroTimer {
    constructor({ onTick, onModeChange, onComplete, onStateChange } = {}) {
      this.onTick = onTick || (() => {});
      this.onModeChange = onModeChange || (() => {});
      this.onComplete = onComplete || (() => {});
      this.onStateChange = onStateChange || (() => {});

      this.isTestMode = false;
      this.mode = 'focus'; // 'focus' | 'break'
      this.status = 'idle'; // 'idle' | 'running' | 'paused'
      this.totalMs = this.getDurationMs('focus');
      this.remainingMs = this.totalMs;
      this.endTime = null;

      this._rafId = null;
      this._intervalId = null;
      this._tick = this._tick.bind(this);
    }

    getDurationMs(mode = this.mode) {
      const preset = this.isTestMode ? DURATIONS.test : DURATIONS.standard;
      return preset[mode];
    }

    getSnapshot() {
      const remainingSeconds = Math.ceil(this.remainingMs / 1000);
      const elapsedRatio =
        this.totalMs > 0
          ? Math.min(1, Math.max(0, 1 - this.remainingMs / this.totalMs))
          : 0;

      return {
        mode: this.mode,
        status: this.status,
        remainingMs: this.remainingMs,
        remainingSeconds,
        totalMs: this.totalMs,
        elapsedRatio,
        isTestMode: this.isTestMode,
      };
    }

    start() {
      if (this.status === 'running') return;
      this.status = 'running';
      this.endTime = Date.now() + this.remainingMs;

      this._startLoops();
      this.onStateChange(this.getSnapshot());
      this.onTick(this.getSnapshot());
    }

    pause() {
      if (this.status !== 'running') return;
      this.remainingMs = Math.max(0, this.endTime - Date.now());
      this.status = 'paused';
      this._stopLoops();

      this.onStateChange(this.getSnapshot());
      this.onTick(this.getSnapshot());
    }

    reset() {
      this._stopLoops();
      this.status = 'idle';
      this.totalMs = this.getDurationMs(this.mode);
      this.remainingMs = this.totalMs;
      this.endTime = null;

      this.onStateChange(this.getSnapshot());
      this.onTick(this.getSnapshot());
    }

    setTestMode(enabled) {
      this.isTestMode = Boolean(enabled);
      this._stopLoops();
      this.mode = 'focus';
      this.status = 'idle';
      this.totalMs = this.getDurationMs('focus');
      this.remainingMs = this.totalMs;
      this.endTime = null;

      const snapshot = this.getSnapshot();
      this.onModeChange(snapshot);
      this.onStateChange(snapshot);
      this.onTick(snapshot);
    }

    _startLoops() {
      this._stopLoops();
      this._intervalId = setInterval(this._tick, 200);
      const rafLoop = () => {
        if (this.status !== 'running') return;
        this._tick();
        this._rafId = requestAnimationFrame(rafLoop);
      };
      this._rafId = requestAnimationFrame(rafLoop);
    }

    _stopLoops() {
      if (this._intervalId !== null) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    }

    _tick() {
      if (this.status !== 'running') return;

      const now = Date.now();
      const remaining = this.endTime - now;

      if (remaining <= 0) {
        this._handlePhaseComplete();
        return;
      }

      this.remainingMs = remaining;
      this.onTick(this.getSnapshot());
    }

    _handlePhaseComplete() {
      const finishedMode = this.mode;
      const nextMode = finishedMode === 'focus' ? 'break' : 'focus';

      // 1) 현재 단계 완료 알림
      this.onComplete(finishedMode);

      // 2) 다음 모드로 자동 전환 후 연속 실행
      this.mode = nextMode;
      this.totalMs = this.getDurationMs(nextMode);
      this.remainingMs = this.totalMs;
      this.endTime = Date.now() + this.totalMs;

      const snapshot = this.getSnapshot();
      this.onModeChange(snapshot);
      this.onStateChange(snapshot);
      this.onTick(snapshot);
    }
  }

  global.PomodoroTimer = PomodoroTimer;
})(window);
