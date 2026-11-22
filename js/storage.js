/**
 * 로컬 저장소 관리 모듈 (세션 카운터, 음량, 음소거 설정)
 */
(function (global) {
  const STORAGE_KEYS = {
    SESSIONS: 'pomodoro_completed_sessions_v1',
    VOLUME: 'pomodoro_ambient_volume_v1',
    MUTED: 'pomodoro_ambient_muted_v1',
  };

  function safeGet(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value !== null ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // 시크릿 모드 등 스토리지 제한 환경 무시
    }
  }

  const Storage = {
    getSessions() {
      const parsed = parseInt(safeGet(STORAGE_KEYS.SESSIONS, '0'), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    },

    setSessions(count) {
      safeSet(STORAGE_KEYS.SESSIONS, Math.max(0, Math.floor(count)));
    },

    getVolume() {
      const parsed = parseFloat(safeGet(STORAGE_KEYS.VOLUME, '0.5'));
      if (!Number.isFinite(parsed)) return 0.5;
      return Math.min(1, Math.max(0, parsed));
    },

    setVolume(volume) {
      const clamped = Math.min(1, Math.max(0, volume));
      safeSet(STORAGE_KEYS.VOLUME, clamped.toFixed(2));
    },

    getMuted() {
      return safeGet(STORAGE_KEYS.MUTED, 'false') === 'true';
    },

    setMuted(muted) {
      safeSet(STORAGE_KEYS.MUTED, muted ? 'true' : 'false');
    },
  };

  global.PomodoroStorage = Storage;
})(window);
