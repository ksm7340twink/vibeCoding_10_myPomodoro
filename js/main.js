/**
 * 포모도로 타이머 메인 앱 컨트롤러
 */
(function () {
  const Storage = window.PomodoroStorage;
  const AudioEngine = window.PomodoroAudioEngine;
  const PomodoroTimer = window.PomodoroTimer;

  // DOM 요소 참조
  const el = {
    favicon: document.getElementById('dynamic-favicon'),
    toast: document.getElementById('toast'),
    testModeToggle: document.getElementById('test-mode-toggle'),
    modeLabel: document.getElementById('mode-label'),
    cycleHint: document.getElementById('cycle-hint'),
    progressCircle: document.getElementById('progress-circle'),
    timeDisplay: document.getElementById('time-display'),
    statusText: document.getElementById('status-text'),
    progressPercent: document.getElementById('progress-percent'),
    startBtn: document.getElementById('start-btn'),
    pauseBtn: document.getElementById('pause-btn'),
    resetBtn: document.getElementById('reset-btn'),
    sessionCount: document.getElementById('session-count'),
    sessionDots: document.querySelectorAll('#session-dots .session-dot'),
    sessionCaption: document.getElementById('session-caption'),
    resetSessionsBtn: document.getElementById('reset-sessions-btn'),
    soundStatusBadge: document.getElementById('sound-status-badge'),
    soundButtons: document.querySelectorAll('.sound-btn'),
    muteBtn: document.getElementById('mute-btn'),
    volumeSlider: document.getElementById('volume-slider'),
    volumeValue: document.getElementById('volume-value'),
    testAlarmBtn: document.getElementById('test-alarm-btn'),
  };

  // 원형 진행 링 기하 상수 (r = 124)
  const RING_RADIUS = 124;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  el.progressCircle.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
  el.progressCircle.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;

  // 상태 변수
  let completedSessions = Storage.getSessions();
  let lastVolumeBeforeMute = Storage.getVolume() || 0.5;
  let toastTimerId = null;

  const SOUND_LABELS = {
    wave: '파도 재생 중',
    rain: '비 재생 중',
    birds: '새 소리 재생 중',
  };

  // 오디오 엔진 초기화
  const audio = new AudioEngine({
    volume: Storage.getVolume(),
    muted: Storage.getMuted(),
  });

  // 타이머 엔진 초기화
  const timer = new PomodoroTimer({
    onTick: renderTimer,
    onModeChange: renderModeTheme,
    onStateChange: renderControlState,
    onComplete: handlePhaseComplete,
  });

  // =========================================================
  // 포맷팅 및 유틸리티
  // =========================================================
  function formatTime(totalSeconds) {
    const safe = Math.max(0, totalSeconds);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function showToast(message) {
    if (toastTimerId) clearTimeout(toastTimerId);
    el.toast.textContent = message;
    el.toast.classList.add('show');
    toastTimerId = setTimeout(() => {
      el.toast.classList.remove('show');
    }, 3600);
  }

  function updateFavicon(mode) {
    const color = mode === 'focus' ? '%23ff6b6b' : '%2338d9a9';
    el.favicon.href = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='28' fill='${color}'/%3E%3Ccircle cx='32' cy='32' r='16' fill='none' stroke='%23ffffff' stroke-width='5'/%3E%3C/svg%3E`;
  }

  // =========================================================
  // 렌더링 함수
  // =========================================================
  function renderTimer(snapshot) {
    const formatted = formatTime(snapshot.remainingSeconds);
    el.timeDisplay.textContent = formatted;

    // 원형 진행 링 업데이트 (시간이 흐를수록 채워지는 진행률)
    const offset = RING_CIRCUMFERENCE * (1 - snapshot.elapsedRatio);
    el.progressCircle.style.strokeDashoffset = `${offset}`;

    const percent = Math.round(snapshot.elapsedRatio * 100);
    el.progressPercent.textContent = `${percent}% 완료`;

    // 브라우저 탭 제목 실시간 동기화
    const modeTag = snapshot.mode === 'focus' ? '집중' : '휴식';
    if (snapshot.status === 'running') {
      document.title = `${formatted} | ${modeTag} - 포모도로`;
    } else if (snapshot.status === 'paused') {
      document.title = `⏸ ${formatted} | ${modeTag} - 포모도로`;
    } else {
      document.title = '포모도로 타이머';
    }
  }

  function renderModeTheme(snapshot) {
    const isFocus = snapshot.mode === 'focus';
    document.body.dataset.mode = snapshot.mode;
    el.modeLabel.textContent = isFocus ? '집중 시간' : '휴식 시간';
    el.cycleHint.textContent = snapshot.isTestMode
      ? '테스트 모드 · 5초 집중 / 3초 휴식'
      : '25분 집중 · 5분 휴식 자동 전환';
    updateFavicon(snapshot.mode);
  }

  function renderControlState(snapshot) {
    const isRunning = snapshot.status === 'running';
    const isPaused = snapshot.status === 'paused';

    document.body.classList.toggle('is-running', isRunning);
    el.startBtn.disabled = isRunning;
    el.pauseBtn.disabled = !isRunning;

    const startLabel = el.startBtn.querySelector('span');
    if (startLabel) {
      startLabel.textContent = isPaused ? '재개' : '시작';
    }

    if (isRunning) {
      el.statusText.textContent =
        snapshot.mode === 'focus'
          ? '온전히 집중하는 시간입니다'
          : '잠시 눈을 쉬고 숨을 고르세요';
    } else if (isPaused) {
      el.statusText.textContent = '일시정지됨 · 재개하려면 시작을 누르세요';
    } else {
      el.statusText.textContent =
        snapshot.mode === 'focus'
          ? '시작 버튼을 눌러 집중을 시작하세요'
          : '휴식 준비됨 · 시작 버튼을 누르세요';
    }
  }

  function renderSessions(animate = false) {
    el.sessionCount.textContent = String(completedSessions);
    el.resetSessionsBtn.disabled = completedSessions === 0;

    if (animate) {
      el.sessionCount.classList.remove('bump');
      void el.sessionCount.offsetWidth;
      el.sessionCount.classList.add('bump');
      setTimeout(() => el.sessionCount.classList.remove('bump'), 350);
    }

    // 4세션 주기 도트 표시
    const cycleCount = completedSessions === 0 ? 0 : ((completedSessions - 1) % 4) + 1;
    el.sessionDots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < cycleCount);
    });

    if (completedSessions === 0) {
      el.sessionCaption.textContent = '첫 번째 집중 세션을 완료해 보세요';
    } else {
      const totalFocusMinutes = completedSessions * 25;
      el.sessionCaption.textContent = `누적 집중 시간 약 ${totalFocusMinutes}분 달성!`;
    }
  }

  function renderSoundUI() {
    const active = audio.activeSound;
    const isMuted = audio.muted;
    const volPercent = Math.round(audio.volume * 100);

    // 사운드 선택 버튼 상태
    el.soundButtons.forEach((btn) => {
      const isSelected = btn.dataset.sound === active;
      btn.classList.toggle('active', isSelected);
      btn.classList.toggle('is-muted', isSelected && isMuted);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    // 상태 배지 (음소거 표시 포함)
    el.soundStatusBadge.classList.remove('active', 'muted');
    if (isMuted) {
      el.soundStatusBadge.textContent = '음소거됨';
      el.soundStatusBadge.classList.add('muted');
    } else if (active) {
      el.soundStatusBadge.textContent = SOUND_LABELS[active] || '재생 중';
      el.soundStatusBadge.classList.add('active');
    } else {
      el.soundStatusBadge.textContent = '꺼짐';
    }

    // 음소거 버튼 & 슬라이더 상태
    el.muteBtn.classList.toggle('muted', isMuted);
    el.muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    el.muteBtn.title = isMuted ? '음소거 해제' : '음소거';

    const visualPercent = isMuted ? 0 : volPercent;
    el.volumeSlider.value = String(volPercent);
    el.volumeSlider.style.setProperty('--volume-percent', `${visualPercent}%`);
    el.volumeSlider.classList.toggle('muted', isMuted);
    el.volumeValue.textContent = isMuted ? '음소거' : `${volPercent}%`;
  }

  // =========================================================
  // 이벤트 핸들러
  // =========================================================
  function handlePhaseComplete(finishedMode) {
    audio.playAlarm(finishedMode);

    if (finishedMode === 'focus') {
      completedSessions += 1;
      Storage.setSessions(completedSessions);
      renderSessions(true);
      showToast('집중 세션 완료! 휴식 시간으로 자동 전환됩니다.');
    } else {
      showToast('휴식 완료! 다음 집중 세션이 자동으로 시작됩니다.');
    }
  }

  // 타이머 제어
  el.startBtn.addEventListener('click', () => {
    audio.ensureContext();
    timer.start();
  });

  el.pauseBtn.addEventListener('click', () => {
    timer.pause();
  });

  el.resetBtn.addEventListener('click', () => {
    timer.reset();
  });

  // 테스트 모드 토글
  el.testModeToggle.addEventListener('change', (e) => {
    timer.setTestMode(e.target.checked);
    showToast(
      e.target.checked
        ? '테스트 모드 활성화 (집중 5초 / 휴식 3초)'
        : '기본 모드 복원 (집중 25분 / 휴식 5분)'
    );
  });

  // 세션 카운터 초기화
  el.resetSessionsBtn.addEventListener('click', () => {
    if (completedSessions === 0) return;
    if (window.confirm('완료한 집중 세션 기록을 0회로 초기화할까요?')) {
      completedSessions = 0;
      Storage.setSessions(0);
      renderSessions(false);
      showToast('세션 기록이 초기화되었습니다.');
    }
  });

  // 백색소음 선택
  el.soundButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const soundType = btn.dataset.sound;
      audio.toggleAmbient(soundType);
      renderSoundUI();
    });
  });

  // 음량 슬라이더
  el.volumeSlider.addEventListener('input', (e) => {
    const percent = Number(e.target.value);
    const normalized = percent / 100;

    if (percent === 0) {
      audio.setVolume(0);
      audio.setMuted(true);
    } else {
      lastVolumeBeforeMute = normalized;
      audio.setVolume(normalized);
      if (audio.muted) {
        audio.setMuted(false);
      }
    }

    Storage.setVolume(audio.volume);
    Storage.setMuted(audio.muted);
    renderSoundUI();
  });

  // 음소거 토글
  el.muteBtn.addEventListener('click', () => {
    if (audio.muted) {
      const restored = audio.volume > 0 ? audio.volume : lastVolumeBeforeMute || 0.5;
      audio.setVolume(restored);
      audio.setMuted(false);
    } else {
      if (audio.volume > 0) {
        lastVolumeBeforeMute = audio.volume;
      }
      audio.setMuted(true);
    }

    Storage.setVolume(audio.volume);
    Storage.setMuted(audio.muted);
    renderSoundUI();
  });

  // 알림음 미리듣기
  el.testAlarmBtn.addEventListener('click', () => {
    const currentMode = timer.getSnapshot().mode;
    audio.playAlarm(currentMode);
    showToast(
      currentMode === 'focus'
        ? '집중 종료 알림음을 재생했습니다.'
        : '휴식 종료 알림음을 재생했습니다.'
    );
  });

  // 키보드 단축키 (Space: 시작/일시정지, R: 초기화)
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;

    if (e.code === 'Space') {
      e.preventDefault();
      audio.ensureContext();
      if (timer.getSnapshot().status === 'running') {
        timer.pause();
      } else {
        timer.start();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      timer.reset();
    }
  });

  // =========================================================
  // 초기 UI 동기화
  // =========================================================
  const initialSnapshot = timer.getSnapshot();
  renderModeTheme(initialSnapshot);
  renderControlState(initialSnapshot);
  renderTimer(initialSnapshot);
  renderSessions(false);
  renderSoundUI();
})();
