const STORAGE_QUESTIONS_KEY = 'sciencebowl_questions';
const STORAGE_PREFS_KEY = 'sciencebowl_master_prefs_v1';
const SOUND_ASSET_BASE = 'assets/sounds';
const LETTERS = ['A', 'B', 'C', 'D'];

const PHASES = {
  waitingStartGame: 'waiting_start_game',
  buzz: 'buzz',
  answer: 'answer',
  steal: 'steal',
  roundResult: 'round_result',
  waitingNextRound: 'waiting_next_round',
  paused: 'paused',
  sessionEnd: 'session_end'
};

const OFFICIAL_TIMERS = {
  buzz: 20,
  answer: 10,
  steal: 10
};

const DEFAULT_BANK_TEXT = `What force keeps planets in orbit?
A) Friction
B) Gravity*
C) Magnetism
D) Tension

What does DNA stand for?
Answer: deoxyribonucleic acid

A car travels 120 km in 2 hours. Speed in km/h?
Answer: 60
Tolerance: 0.1

Which organelle produces ATP?
A) Nucleus
B) Lysosome
C) Mitochondria*
D) Ribosome

pH less than 7 is called ____.
Answer: acidic`;

const els = {
  app: document.getElementById('app'),
  leftScore: document.getElementById('left-score'),
  rightScore: document.getElementById('right-score'),
  phaseLabel: document.getElementById('phase-label'),
  questionCounter: document.getElementById('question-counter'),
  roundCounter: document.getElementById('round-counter'),
  questionText: document.getElementById('question-text'),
  questionChoices: document.getElementById('question-choices'),
  questionCard: document.getElementById('question-card'),
  timerDisplay: document.getElementById('timer-display'),
  statusLine: document.getElementById('status-line'),
  buzzFlash: document.getElementById('buzz-flash'),

  buzzLeft: document.getElementById('buzz-left'),
  buzzRight: document.getElementById('buzz-right'),

  judgePanel: document.getElementById('judge-panel'),
  judgeTitle: document.getElementById('judge-title'),
  judgeCorrect: document.getElementById('judge-correct'),
  judgeWrong: document.getElementById('judge-wrong'),
  judgeTimeout: document.getElementById('judge-timeout'),

  startOverlay: document.getElementById('start-overlay'),
  startGameBtn: document.getElementById('start-game-btn'),
  openSettingsStartBtn: document.getElementById('open-settings-start-btn'),

  resultOverlay: document.getElementById('result-overlay'),
  resultMessage: document.getElementById('result-message'),
  resultSubtext: document.getElementById('result-subtext'),

  waitingOverlay: document.getElementById('waiting-overlay'),
  waitingTitle: document.getElementById('waiting-title'),
  waitingSummary: document.getElementById('waiting-summary'),
  waitingHint: document.getElementById('waiting-hint'),
  startNextRoundBtn: document.getElementById('start-next-round-btn'),
  pauseOverlay: document.getElementById('pause-overlay'),
  resumeBtn: document.getElementById('resume-btn'),

  resetGameBtn: document.getElementById('reset-game-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  muteBtn: document.getElementById('mute-btn'),
  testSoundBtn: document.getElementById('test-sound-btn'),
  volumeSlider: document.getElementById('volume-slider'),
  fullscreenBtn: document.getElementById('fullscreen-btn'),
  settingsBtn: document.getElementById('settings-btn'),

  settingsPanel: document.getElementById('settings-panel'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  cfgBuzzTimer: document.getElementById('cfg-buzz-timer'),
  cfgAnswerTimer: document.getElementById('cfg-answer-timer'),
  cfgStealTimer: document.getElementById('cfg-steal-timer'),
  applyTimersBtn: document.getElementById('apply-timers-btn'),
  cfgMasterVolume: document.getElementById('cfg-master-volume'),
  cfgMasterVolumeValue: document.getElementById('cfg-master-volume-value'),
  cfgMusicToggle: document.getElementById('cfg-music-toggle'),
  cfgSfxToggle: document.getElementById('cfg-sfx-toggle'),
  bankCount: document.getElementById('bank-count'),
  bankInput: document.getElementById('bank-input'),
  saveBankBtn: document.getElementById('save-bank-btn'),
  settingsMsg: document.getElementById('settings-msg')
};

const state = {
  phase: PHASES.waitingStartGame,
  scores: {
    left: 0,
    right: 0
  },
  round: 0,
  buzzedPlayer: null,
  turnPlayer: null,
  pausedPhase: null,
  timer: OFFICIAL_TIMERS.buzz,
  hasStealAttempted: false,

  currentQuestion: null,
  questionBank: [],
  questionQueue: [],
  questionIndex: 0,
  lastTickSecond: null,

  timerId: null,
  roundResultTimeoutId: null,
  buzzFlashTimerId: null,
  pendingDecisionTimerId: null,
  decisionLocked: false,

  result: {
    message: 'LEFT WINS!',
    subtext: ''
  },

  settingsOpen: false,

  audio: {
    initialized: false,
    hasUserInteracted: false,
    bgm: null,
    bgmFilePlayable: null,
    sfx: {},
    sfxReady: {},
    bgmStarted: false,
    bgmIntensity: 0.6,
    bgmDuckTimer: null,
    synthCtx: null,
    synthBgmTimer: null,
    synthBgmStep: 0,
    synthDuckLevel: 1,
    musicEnabled: true,
    sfxEnabled: true,
    muted: false,
    volume: 1
  }
};

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTimerSeconds(value, fallback) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(120, parsed));
}

function canonical(value) {
  return text(value).toLowerCase();
}

function stripQuestionPrefix(value) {
  return text(value).replace(/^q\s*:\s*/i, '').trim();
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseStrictNumber(value) {
  const cleaned = String(value || '').trim().replace(/,/g, '');
  if (!cleaned) {
    return null;
  }
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTolerance(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  if (raw.endsWith('%')) {
    const num = parseStrictNumber(raw.slice(0, -1));
    if (num === null || num < 0) {
      return null;
    }
    return { mode: 'percent', value: num };
  }
  const num = parseStrictNumber(raw);
  if (num === null || num < 0) {
    return null;
  }
  return { mode: 'absolute', value: num };
}

function normalizeQuestion(input) {
  const type = text(input?.type).toLowerCase();
  const prompt = stripQuestionPrefix(input?.prompt || input?.question);

  if (!prompt || !['mcq', 'fill', 'numeric'].includes(type)) {
    return null;
  }

  const base = {
    id: input?.id || uid('q'),
    type,
    prompt,
    options: [],
    answer: {
      mode: type === 'mcq' ? 'choice' : type === 'numeric' ? 'number' : 'text',
      value: null,
      display: '',
      tolerance: null
    }
  };

  if (type === 'mcq') {
    const options = Array.isArray(input?.options)
      ? input.options
          .map((option, index) => {
            const key = text(option?.key || LETTERS[index]).toUpperCase();
            const optionText = text(option?.text);
            if (!LETTERS.includes(key) || !optionText) {
              return null;
            }
            return { key, text: optionText };
          })
          .filter(Boolean)
      : [];

    const correctKey = text(input?.answer?.value).toUpperCase();
    const found = options.find((item) => item.key === correctKey);
    if (!found || options.length < 2) {
      return null;
    }

    base.options = options;
    base.answer.value = found.key;
    base.answer.display = `${found.key}) ${found.text}`;
    return base;
  }

  if (type === 'fill') {
    const ans = text(input?.answer?.display || input?.answer?.value || input?.answer);
    if (!ans) {
      return null;
    }
    base.answer.value = canonical(ans);
    base.answer.display = ans;
    return base;
  }

  const number = typeof input?.answer?.value === 'number' ? input.answer.value : parseStrictNumber(input?.answer?.value);
  if (number === null) {
    return null;
  }

  const tolerance = input?.answer?.tolerance?.mode
    ? {
        mode: input.answer.tolerance.mode,
        value: Number(input.answer.tolerance.value)
      }
    : null;

  base.answer.value = number;
  base.answer.display = String(number);
  base.answer.tolerance =
    tolerance && (tolerance.mode === 'absolute' || tolerance.mode === 'percent') && Number.isFinite(tolerance.value)
      ? tolerance
      : null;

  return base;
}

function parseOptionLine(line) {
  const raw = String(line || '').trim();
  if (!raw) {
    return null;
  }

  const isCorrect = raw.includes('*');
  const cleaned = raw.replace(/\*/g, '').trim();
  const match = cleaned.match(/^([A-Da-d])[\).:\-]?\s*(.+)$/);
  if (!match) {
    return null;
  }

  const body = match[2].trim();
  if (!body) {
    return null;
  }

  return {
    key: match[1].toUpperCase(),
    text: body,
    isCorrect
  };
}

function parseQuestionBlocks(rawText) {
  const blocks = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const questions = [];
  const errors = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const promptParts = [];
    const options = [];
    let answerText = '';
    let toleranceText = '';

    for (const line of lines) {
      const option = parseOptionLine(line);
      if (option) {
        options.push(option);
        continue;
      }

      const ans = line.match(/^Answer\s*:\s*(.+)$/i);
      if (ans) {
        answerText = ans[1].trim();
        continue;
      }

      const tol = line.match(/^Tolerance\s*:\s*(.+)$/i);
      if (tol) {
        toleranceText = tol[1].trim();
        continue;
      }

      promptParts.push(line);
    }

    const prompt = stripQuestionPrefix(promptParts.join(' '));
    if (!prompt) {
      errors.push(`Block ${blockIndex + 1}: missing prompt.`);
      return;
    }

    if (options.length) {
      const normalizedOptions = [];
      const map = new Map();
      let correctKey = '';

      for (const opt of options) {
        if (!LETTERS.includes(opt.key)) {
          continue;
        }
        map.set(opt.key, opt);
        if (opt.isCorrect) {
          correctKey = opt.key;
        }
      }

      LETTERS.forEach((letter) => {
        if (map.has(letter)) {
          normalizedOptions.push({ key: letter, text: map.get(letter).text });
        }
      });

      if (!correctKey) {
        errors.push(`Block ${blockIndex + 1}: MCQ requires * on the correct option.`);
        return;
      }

      const question = normalizeQuestion({
        type: 'mcq',
        prompt,
        options: normalizedOptions,
        answer: { value: correctKey }
      });

      if (!question) {
        errors.push(`Block ${blockIndex + 1}: invalid MCQ format.`);
        return;
      }

      questions.push(question);
      return;
    }

    if (!answerText) {
      errors.push(`Block ${blockIndex + 1}: missing Answer:.`);
      return;
    }

    const numericAnswer = parseStrictNumber(answerText);
    const tolerance = parseTolerance(toleranceText);

    if (numericAnswer !== null || tolerance !== null) {
      if (numericAnswer === null) {
        errors.push(`Block ${blockIndex + 1}: invalid numeric Answer.`);
        return;
      }

      const question = normalizeQuestion({
        type: 'numeric',
        prompt,
        answer: {
          value: numericAnswer,
          tolerance
        }
      });

      if (!question) {
        errors.push(`Block ${blockIndex + 1}: invalid numeric question.`);
        return;
      }

      questions.push(question);
      return;
    }

    const fill = normalizeQuestion({
      type: 'fill',
      prompt,
      answer: {
        value: answerText,
        display: answerText
      }
    });

    if (!fill) {
      errors.push(`Block ${blockIndex + 1}: invalid fill question.`);
      return;
    }

    questions.push(fill);
  });

  return {
    questions,
    errors,
    blocks
  };
}

function parsePipeQuestions(rawText) {
  const questions = [];
  const errors = [];

  const lines = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const parts = line.split('|').map((item) => item.trim());
    if (parts.length < 2) {
      errors.push(`Line ${index + 1}: expected "Question | Answer".`);
      return;
    }

    const q = normalizeQuestion({
      type: 'fill',
      prompt: parts[0],
      answer: {
        value: parts.slice(1).join(' | '),
        display: parts.slice(1).join(' | ')
      }
    });

    if (!q) {
      errors.push(`Line ${index + 1}: invalid entry.`);
      return;
    }

    questions.push(q);
  });

  return { questions, errors };
}

function parseBankInput(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return { questions: [], errors: ['Question input is empty.'] };
  }

  if (/^\s*\[/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return { questions: [], errors: ['JSON must be an array of question objects.'] };
      }
      const normalized = parsed.map(normalizeQuestion).filter(Boolean);
      if (!normalized.length) {
        return { questions: [], errors: ['JSON parsed, but no valid questions were found.'] };
      }
      return { questions: normalized, errors: [] };
    } catch (error) {
      return { questions: [], errors: [`Invalid JSON: ${error.message}`] };
    }
  }

  const blocksParsed = parseQuestionBlocks(trimmed);
  if (blocksParsed.questions.length) {
    return { questions: blocksParsed.questions, errors: blocksParsed.errors };
  }

  const pipesParsed = parsePipeQuestions(trimmed);
  if (pipesParsed.questions.length) {
    return pipesParsed;
  }

  return {
    questions: [],
    errors: [...blocksParsed.errors, ...pipesParsed.errors]
  };
}

function bankToText(bank) {
  if (!Array.isArray(bank) || !bank.length) {
    return '';
  }

  return bank
    .map((question) => {
      if (question.type === 'mcq') {
        const lines = [question.prompt];
        question.options.forEach((option) => {
          const star = option.key === question.answer.value ? '*' : '';
          lines.push(`${option.key}) ${option.text}${star}`);
        });
        return lines.join('\n');
      }

      if (question.type === 'fill') {
        return `${question.prompt}\nAnswer: ${question.answer.display}`;
      }

      const lines = [question.prompt, `Answer: ${question.answer.display}`];
      if (question.answer.tolerance) {
        const tol = question.answer.tolerance;
        lines.push(`Tolerance: ${tol.mode === 'percent' ? `${tol.value}%` : tol.value}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

function evaluateQuestion(question, inputValue) {
  if (!question) {
    return false;
  }

  if (question.type === 'mcq') {
    return text(inputValue).toUpperCase() === question.answer.value;
  }

  if (question.type === 'fill') {
    return canonical(inputValue) === question.answer.value;
  }

  const userNumber = parseStrictNumber(inputValue);
  if (userNumber === null) {
    return false;
  }

  const expected = Number(question.answer.value);
  const tolerance = question.answer.tolerance;

  if (!tolerance) {
    return Math.abs(userNumber - expected) <= 1e-9;
  }

  if (tolerance.mode === 'absolute') {
    return Math.abs(userNumber - expected) <= tolerance.value + 1e-9;
  }

  const margin = Math.max(Math.abs(expected) * (tolerance.value / 100), tolerance.value / 100);
  return Math.abs(userNumber - expected) <= margin + 1e-9;
}

function generateDemoBank(count) {
  const list = [];
  for (let i = 1; i <= count; i += 1) {
    if (i % 3 === 1) {
      list.push(
        normalizeQuestion({
          type: 'mcq',
          prompt: `Demo MCQ #${i}: Which quantity is measured in Newtons?`,
          options: [
            { key: 'A', text: 'Mass' },
            { key: 'B', text: 'Energy' },
            { key: 'C', text: 'Force' },
            { key: 'D', text: 'Speed' }
          ],
          answer: { value: 'C' }
        })
      );
      continue;
    }

    if (i % 3 === 2) {
      list.push(
        normalizeQuestion({
          type: 'numeric',
          prompt: `Demo Numeric #${i}: If v=4 m/s and t=3 s, distance?`,
          answer: { value: 12, tolerance: { mode: 'absolute', value: 0.2 } }
        })
      );
      continue;
    }

    list.push(
      normalizeQuestion({
        type: 'fill',
        prompt: `Demo Fill #${i}: The process plants use sunlight to make food is _____.`,
        answer: { value: 'photosynthesis', display: 'photosynthesis' }
      })
    );
  }
  return list.filter(Boolean);
}

function savePrefs() {
  const payload = {
    muted: state.audio.muted,
    volume: state.audio.volume,
    musicEnabled: state.audio.musicEnabled,
    sfxEnabled: state.audio.sfxEnabled,
    timers: {
      buzz: OFFICIAL_TIMERS.buzz,
      answer: OFFICIAL_TIMERS.answer,
      steal: OFFICIAL_TIMERS.steal
    }
  };
  localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(payload));
}

function loadPrefs() {
  const raw = localStorage.getItem(STORAGE_PREFS_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    state.audio.muted = Boolean(parsed?.muted);
    const vol = Number(parsed?.volume);
    state.audio.volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1;
    state.audio.musicEnabled = parsed?.musicEnabled !== undefined ? Boolean(parsed.musicEnabled) : true;
    state.audio.sfxEnabled = parsed?.sfxEnabled !== undefined ? Boolean(parsed.sfxEnabled) : true;
    const timers = parsed?.timers || {};
    OFFICIAL_TIMERS.buzz = normalizeTimerSeconds(timers.buzz, OFFICIAL_TIMERS.buzz);
    OFFICIAL_TIMERS.answer = normalizeTimerSeconds(timers.answer, OFFICIAL_TIMERS.answer);
    OFFICIAL_TIMERS.steal = normalizeTimerSeconds(timers.steal, OFFICIAL_TIMERS.steal);
  } catch {
    state.audio.muted = false;
    state.audio.volume = 1;
    state.audio.musicEnabled = true;
    state.audio.sfxEnabled = true;
  }
}

function saveQuestionBank() {
  localStorage.setItem(STORAGE_QUESTIONS_KEY, JSON.stringify(state.questionBank));
}

function resetQuestionQueue() {
  state.questionQueue = [...state.questionBank];
  state.questionIndex = 0;
}

function setQuestionBank(bank, message) {
  state.questionBank = Array.isArray(bank) ? bank.filter(Boolean) : [];
  saveQuestionBank();
  resetQuestionQueue();
  updateSettingsPanel();
  if (message) {
    setSettingsMessage(message, false);
  }
}

function loadQuestionBank() {
  const raw = localStorage.getItem(STORAGE_QUESTIONS_KEY);

  if (!raw) {
    const defaults = parseQuestionBlocks(DEFAULT_BANK_TEXT).questions;
    setQuestionBank(defaults.length ? defaults : generateDemoBank(20), 'Default question bank loaded.');
    els.bankInput.value = bankToText(state.questionBank);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed) ? parsed.map(normalizeQuestion).filter(Boolean) : [];
    if (!normalized.length) {
      const defaults = parseQuestionBlocks(DEFAULT_BANK_TEXT).questions;
      setQuestionBank(defaults.length ? defaults : generateDemoBank(20), 'Storage was invalid. Defaults restored.');
      els.bankInput.value = bankToText(state.questionBank);
      return;
    }
    setQuestionBank(normalized, 'Question bank ready.');
    els.bankInput.value = bankToText(state.questionBank);
  } catch {
    const defaults = parseQuestionBlocks(DEFAULT_BANK_TEXT).questions;
    setQuestionBank(defaults.length ? defaults : generateDemoBank(20), 'Storage parse failed. Defaults restored.');
    els.bankInput.value = bankToText(state.questionBank);
  }
}

function popNextQuestion() {
  if (!state.questionQueue.length) {
    return null;
  }

  if (state.questionIndex >= state.questionQueue.length) {
    return null;
  }

  const question = state.questionQueue[state.questionIndex] || null;
  state.questionIndex += 1;
  return question;
}

function clearCountdown() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  state.lastTickSecond = null;
}

function clearRoundResultDelay() {
  if (state.roundResultTimeoutId) {
    window.clearTimeout(state.roundResultTimeoutId);
    state.roundResultTimeoutId = null;
  }
}

function clearPendingDecision() {
  if (state.pendingDecisionTimerId) {
    window.clearTimeout(state.pendingDecisionTimerId);
    state.pendingDecisionTimerId = null;
  }
  state.decisionLocked = false;
}

function startCountdown(seconds, onTimeout) {
  clearCountdown();
  state.timer = Math.max(0, Math.floor(seconds));
  render();

  state.timerId = window.setInterval(() => {
    state.timer -= 1;
    if (state.timer > 0 && state.timer <= 3 && state.lastTickSecond !== state.timer) {
      playTickSound(state.timer);
      state.lastTickSecond = state.timer;
    }
    if (state.timer <= 0) {
      state.timer = 0;
      clearCountdown();
      render();
      onTimeout();
      return;
    }
    render();
  }, 1000);
}

function getOppositePlayer(player) {
  return player === 'left' ? 'right' : 'left';
}

function getWinnerMessage(player) {
  return player === 'left' ? 'LEFT WINS!' : 'RIGHT WINS!';
}

function hasRemainingQuestions() {
  return state.questionIndex < state.questionQueue.length;
}

function getFinalWinnerMessage() {
  if (state.scores.left > state.scores.right) {
    return 'LEFT GROUP WINS THE GAME!';
  }
  if (state.scores.right > state.scores.left) {
    return 'RIGHT GROUP WINS THE GAME!';
  }
  return 'FINAL RESULT: TIE GAME';
}

function endSession() {
  clearCountdown();
  clearPendingDecision();
  clearRoundResultDelay();

  state.phase = PHASES.sessionEnd;
  state.result.message = getFinalWinnerMessage();
  state.result.subtext = `Final score - Left: ${state.scores.left} | Right: ${state.scores.right}`;
  state.pausedPhase = null;
  setStatusLine('Game complete. Final winner announced.');
  setBgmIntensity(0.4);
  startMusic();
  render();
}

function getTimeoutHandlerForPhase(phase) {
  if (phase === PHASES.answer || phase === PHASES.steal) {
    return () => queueDecision('timeout', 220, true);
  }

  if (phase === PHASES.buzz) {
    return () => {
      startRoundResult({
        message: 'BOTH ELIMINATED!',
        subtext: 'Timeout with no response.',
        winner: null,
        soundType: 'timeout'
      });
    };
  }

  return null;
}

function renderQuestionChoices(question) {
  if (!els.questionChoices) {
    return;
  }

  els.questionChoices.textContent = '';
  if (!question || question.type !== 'mcq' || !Array.isArray(question.options) || !question.options.length) {
    els.questionChoices.hidden = true;
    return;
  }

  const choicesEnabled = [PHASES.answer, PHASES.steal].includes(state.phase) && !state.decisionLocked;

  question.options.forEach((option) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-btn';
    button.dataset.choiceKey = option.key;
    button.disabled = !choicesEnabled;
    const keySpan = document.createElement('span');
    keySpan.className = 'choice-key';
    keySpan.textContent = `${option.key})`;
    const textSpan = document.createElement('span');
    textSpan.className = 'choice-text';
    textSpan.textContent = option.text;
    button.appendChild(keySpan);
    button.appendChild(textSpan);
    item.appendChild(button);
    els.questionChoices.appendChild(item);
  });

  els.questionChoices.hidden = false;
}

function handleChoicePick(choiceKey) {
  if (![PHASES.answer, PHASES.steal].includes(state.phase) || state.decisionLocked) {
    return;
  }

  const question = state.currentQuestion;
  if (!question || question.type !== 'mcq') {
    return;
  }

  const selected = text(choiceKey).toUpperCase();
  if (!selected || !LETTERS.includes(selected)) {
    return;
  }

  const allChoiceButtons = Array.from(els.questionChoices.querySelectorAll('button[data-choice-key]'));
  const selectedButton = allChoiceButtons.find((button) => text(button.dataset.choiceKey).toUpperCase() === selected);
  if (!selectedButton) {
    return;
  }

  const isCorrect = selected === question.answer.value;
  allChoiceButtons.forEach((button) => {
    button.disabled = true;
  });
  selectedButton.classList.add(isCorrect ? 'correct-pick' : 'wrong-pick');

  queueDecision(isCorrect ? 'correct' : 'wrong', 480, true);
}

function setQuestionSwapAnimation() {
  if (!els.questionCard) {
    return;
  }
  els.questionCard.classList.remove('swap');
  void els.questionCard.offsetWidth;
  els.questionCard.classList.add('swap');
}

function updateSettingsPanel() {
  els.bankCount.textContent = `Questions loaded: ${state.questionBank.length}`;
}

function syncTimerInputs() {
  els.cfgBuzzTimer.value = String(OFFICIAL_TIMERS.buzz);
  els.cfgAnswerTimer.value = String(OFFICIAL_TIMERS.answer);
  els.cfgStealTimer.value = String(OFFICIAL_TIMERS.steal);
}

function syncAudioInputs() {
  if (els.cfgMasterVolume) {
    els.cfgMasterVolume.value = state.audio.volume.toFixed(2);
  }
  if (els.cfgMasterVolumeValue) {
    els.cfgMasterVolumeValue.textContent = state.audio.volume.toFixed(2);
  }
  if (els.cfgMusicToggle) {
    els.cfgMusicToggle.checked = state.audio.musicEnabled;
  }
  if (els.cfgSfxToggle) {
    els.cfgSfxToggle.checked = state.audio.sfxEnabled;
  }
}

function applyTimerSettings() {
  const nextBuzz = normalizeTimerSeconds(els.cfgBuzzTimer.value, OFFICIAL_TIMERS.buzz);
  const nextAnswer = normalizeTimerSeconds(els.cfgAnswerTimer.value, OFFICIAL_TIMERS.answer);
  const nextSteal = normalizeTimerSeconds(els.cfgStealTimer.value, OFFICIAL_TIMERS.steal);

  OFFICIAL_TIMERS.buzz = nextBuzz;
  OFFICIAL_TIMERS.answer = nextAnswer;
  OFFICIAL_TIMERS.steal = nextSteal;
  syncTimerInputs();
  savePrefs();
  setSettingsMessage(`Timers updated: Buzz ${nextBuzz}s, Answer ${nextAnswer}s, Steal ${nextSteal}s.`, false);

  if (state.phase === PHASES.waitingStartGame) {
    state.timer = OFFICIAL_TIMERS.buzz;
  }
  render();
}

function setSettingsMessage(message, isError) {
  els.settingsMsg.textContent = message;
  els.settingsMsg.style.color = isError ? '#ff9e9e' : '#96ffb6';
}

function setStatusLine(message) {
  els.statusLine.textContent = message;
}

function pauseGame() {
  if (![PHASES.buzz, PHASES.answer, PHASES.steal].includes(state.phase) || state.decisionLocked) {
    return;
  }

  clearCountdown();
  clearPendingDecision();
  state.pausedPhase = state.phase;
  state.phase = PHASES.paused;
  setStatusLine('Paused by teacher.');
  setBgmIntensity(0.25);
  render();
}

function resumeGame() {
  if (state.phase !== PHASES.paused || !state.pausedPhase) {
    return;
  }

  const resumeTo = state.pausedPhase;
  state.pausedPhase = null;
  state.phase = resumeTo;
  setStatusLine('Game resumed.');
  setBgmIntensity(1);
  startMusic();

  const timeoutHandler = getTimeoutHandlerForPhase(resumeTo);
  if (timeoutHandler && state.timer > 0) {
    startCountdown(state.timer, timeoutHandler);
  } else if (timeoutHandler) {
    timeoutHandler();
  }
  render();
}

function flashJudgeAction(decision) {
  const valid = ['correct', 'wrong', 'timeout'];
  if (!valid.includes(decision)) {
    return;
  }

  [els.judgeCorrect, els.judgeWrong, els.judgeTimeout].forEach((button) => {
    button.classList.remove('flash-correct', 'flash-wrong', 'flash-timeout');
  });

  const target =
    decision === 'correct' ? els.judgeCorrect : decision === 'wrong' ? els.judgeWrong : els.judgeTimeout;
  target.classList.add(`flash-${decision}`);

  window.setTimeout(() => {
    target.classList.remove(`flash-${decision}`);
  }, 460);
}

function queueDecision(decision, delayMs = 220, withFlash = true) {
  if (![PHASES.answer, PHASES.steal].includes(state.phase) || state.decisionLocked) {
    return;
  }

  clearCountdown();
  clearPendingDecision();
  state.decisionLocked = true;

  if (withFlash) {
    flashJudgeAction(decision);
  }

  state.pendingDecisionTimerId = window.setTimeout(() => {
    state.pendingDecisionTimerId = null;
    state.decisionLocked = false;
    handleJudgeDecision(decision);
  }, Math.max(0, delayMs));
}

function showBuzzFlash(player) {
  if (!els.buzzFlash) {
    return;
  }

  if (state.buzzFlashTimerId) {
    window.clearTimeout(state.buzzFlashTimerId);
    state.buzzFlashTimerId = null;
  }

  els.buzzFlash.textContent = `${player.toUpperCase()} BUZZED!`;
  els.buzzFlash.hidden = false;
  els.buzzFlash.classList.remove('show');
  void els.buzzFlash.offsetWidth;
  els.buzzFlash.classList.add('show');

  state.buzzFlashTimerId = window.setTimeout(() => {
    els.buzzFlash.classList.remove('show');
    els.buzzFlash.hidden = true;
    state.buzzFlashTimerId = null;
  }, 900);
}

function clearBuzzFlash() {
  if (state.buzzFlashTimerId) {
    window.clearTimeout(state.buzzFlashTimerId);
    state.buzzFlashTimerId = null;
  }
  if (els.buzzFlash) {
    els.buzzFlash.classList.remove('show');
    els.buzzFlash.hidden = true;
  }
}

function enterWaitingNextRound() {
  clearCountdown();
  state.phase = PHASES.waitingNextRound;
  setStatusLine('Round locked. Master must press START NEXT ROUND.');
  setBgmIntensity(0.4);
  startMusic();
  render();
}

function startRoundResult({ message, subtext, winner = null, soundType = null }) {
  clearCountdown();
  clearRoundResultDelay();
  clearPendingDecision();

  if (winner === 'left' || winner === 'right') {
    state.scores[winner] += 1;
  }

  state.phase = PHASES.roundResult;
  state.result.message = message;
  state.result.subtext = subtext;
  setStatusLine('Result shown. Preparing waiting screen...');

  const resolvedSoundType =
    soundType || (message === 'LEFT WINS!' || message === 'RIGHT WINS!' ? 'correct' : 'wrong');
  playResultSound(resolvedSoundType);
  render();

  state.roundResultTimeoutId = window.setTimeout(() => {
    if (hasRemainingQuestions()) {
      enterWaitingNextRound();
      return;
    }
    endSession();
  }, 1800);
}

function startGameFromBeginning() {
  if (!state.questionBank.length) {
    setStatusLine('No questions loaded. Open Settings and load a bank.');
    render();
    return;
  }

  clearCountdown();
  clearPendingDecision();
  clearRoundResultDelay();
  clearBuzzFlash();

  state.scores.left = 0;
  state.scores.right = 0;
  state.round = 0;
  state.currentQuestion = null;
  state.buzzedPlayer = null;
  state.turnPlayer = null;
  state.hasStealAttempted = false;
  state.pausedPhase = null;
  state.phase = PHASES.waitingStartGame;

  resetQuestionQueue();
  setStatusLine('New game started.');
  startMusic();
  startNextRound();
}

function startNextRound() {
  if (!state.questionBank.length) {
    setStatusLine('No questions loaded. Open Settings and load a bank.');
    render();
    return;
  }

  if (state.phase === PHASES.sessionEnd) {
    startGameFromBeginning();
    return;
  }

  clearCountdown();
  clearRoundResultDelay();
  clearPendingDecision();

  state.buzzedPlayer = null;
  state.turnPlayer = null;
  state.timer = OFFICIAL_TIMERS.buzz;
  state.hasStealAttempted = false;
  clearBuzzFlash();

  state.currentQuestion = popNextQuestion();
  if (!state.currentQuestion) {
    endSession();
    return;
  }
  state.round += 1;
  state.phase = PHASES.buzz;
  state.pausedPhase = null;

  setQuestionSwapAnimation();
  setStatusLine('Buzzers active. First buzz gets answer control.');
  setBgmIntensity(1);
  startMusic();

  startCountdown(OFFICIAL_TIMERS.buzz, getTimeoutHandlerForPhase(PHASES.buzz));

  render();
}

function handleBuzz(player) {
  if (state.phase !== PHASES.buzz) {
    return;
  }

  unlockAudio();
  els.buzzLeft.disabled = true;
  els.buzzRight.disabled = true;
  state.buzzedPlayer = player;
  state.turnPlayer = player;
  state.phase = PHASES.answer;
  setStatusLine(`${player.toUpperCase()} buzzed first. Judge answer in ${OFFICIAL_TIMERS.answer} seconds.`);
  showBuzzFlash(player);

  playBuzzSound(player);

  startCountdown(OFFICIAL_TIMERS.answer, () => {
    queueDecision('timeout', 220, true);
  });

  render();
}

function enterSteal(reasonText) {
  state.hasStealAttempted = true;
  state.turnPlayer = getOppositePlayer(state.buzzedPlayer);
  state.phase = PHASES.steal;

  setStatusLine(`${state.turnPlayer.toUpperCase()} steal attempt. ${reasonText}`);
  playStealCue();

  startCountdown(OFFICIAL_TIMERS.steal, () => {
    queueDecision('timeout', 220, true);
  });

  render();
}

function handleJudgeDecision(decision) {
  if (![PHASES.answer, PHASES.steal].includes(state.phase)) {
    return;
  }

  if (decision === 'correct') {
    startRoundResult({
      message: getWinnerMessage(state.turnPlayer),
      subtext: state.phase === PHASES.steal ? 'Steal success.' : 'Correct answer.',
      winner: state.turnPlayer,
      soundType: 'correct'
    });
    return;
  }

  if (state.phase === PHASES.answer && !state.hasStealAttempted) {
    const cause = decision === 'timeout' ? 'Answer timeout.' : 'Initial answer failed.';
    enterSteal(cause);
    return;
  }

  startRoundResult({
    message: 'BOTH ELIMINATED!',
    subtext: decision === 'timeout' ? 'Steal timeout.' : 'Both teams failed the round.',
    winner: null,
    soundType: decision === 'timeout' ? 'timeout' : 'wrong'
  });
}

function resetGame() {
  clearCountdown();
  clearRoundResultDelay();
  clearBuzzFlash();
  clearPendingDecision();

  state.phase = PHASES.waitingStartGame;
  state.scores.left = 0;
  state.scores.right = 0;
  state.round = 0;
  state.timer = OFFICIAL_TIMERS.buzz;
  state.buzzedPlayer = null;
  state.turnPlayer = null;
  state.pausedPhase = null;
  state.hasStealAttempted = false;
  state.currentQuestion = null;
  resetQuestionQueue();

  setStatusLine('Game reset. Waiting for master start.');
  setBgmIntensity(0.6);
  render();
}

function toggleSettings(open = !state.settingsOpen) {
  state.settingsOpen = Boolean(open);
  els.settingsPanel.hidden = !state.settingsOpen;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    return;
  }
  document.exitFullscreen().catch(() => {});
}

function enterFullscreenForGameStart() {
  if (document.fullscreenElement) {
    return;
  }
  document.documentElement.requestFullscreen().catch(() => {});
}

function createAudioAsset(fileName, { loop = false } = {}) {
  const audio = new Audio(`${SOUND_ASSET_BASE}/${fileName}`);
  audio.preload = 'auto';
  audio.loop = loop;
  return audio;
}

function getSynthContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  if (!state.audio.synthCtx) {
    state.audio.synthCtx = new Ctx();
  }
  return state.audio.synthCtx;
}

function playSynthTone({ freq = 440, durationMs = 120, type = 'sine', gain = 0.08, whenMs = 0, freqEnd = null } = {}) {
  const ctx = getSynthContext();
  if (!ctx) {
    return;
  }

  const safeGain = Math.max(0, Math.min(1, gain));
  const start = ctx.currentTime + Math.max(0, Number(whenMs) || 0) / 1000;
  const duration = Math.max(30, Number(durationMs) || 120) / 1000;
  const stop = start + duration;

  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(30, Number(freq) || 440), start);
  if (freqEnd && Number(freqEnd) > 20) {
    osc.frequency.exponentialRampToValueAtTime(Number(freqEnd), stop);
  }

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, safeGain), start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, stop);

  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(stop + 0.02);
}

function getSynthMusicGain() {
  const base = getTargetMusicVolume();
  return Math.max(0, Math.min(1, base * 0.22 * state.audio.synthDuckLevel));
}

function startSynthBgm() {
  if (state.audio.synthBgmTimer || !state.audio.musicEnabled || state.audio.muted) {
    return;
  }

  const ctx = getSynthContext();
  if (!ctx) {
    return;
  }
  ctx.resume().catch(() => {});

  const pattern = [164.81, 196.0, 246.94, 220.0, 196.0, 246.94, 293.66, 220.0];
  const bassPattern = [82.41, 98.0, 110.0, 98.0];

  const stepBeat = () => {
    const pulseGain = getSynthMusicGain();
    if (pulseGain <= 0.0001) {
      state.audio.synthBgmStep = (state.audio.synthBgmStep + 1) % 8;
      return;
    }

    const lead = pattern[state.audio.synthBgmStep % pattern.length];
    const bass = bassPattern[state.audio.synthBgmStep % bassPattern.length];
    playSynthTone({ freq: lead, durationMs: 120, type: 'triangle', gain: pulseGain });
    if (state.audio.synthBgmStep % 2 === 0) {
      playSynthTone({ freq: bass, durationMs: 90, type: 'sawtooth', gain: pulseGain * 0.72 });
    }
    state.audio.synthBgmStep = (state.audio.synthBgmStep + 1) % 8;
  };

  stepBeat();
  state.audio.synthBgmTimer = window.setInterval(stepBeat, 240);
}

function stopSynthBgm() {
  if (!state.audio.synthBgmTimer) {
    return;
  }
  window.clearInterval(state.audio.synthBgmTimer);
  state.audio.synthBgmTimer = null;
}

function playSynthSfx(name, volume = 1) {
  if (!state.audio.hasUserInteracted || !state.audio.sfxEnabled || state.audio.muted) {
    return;
  }
  const ctx = getSynthContext();
  if (!ctx) {
    return;
  }
  ctx.resume().catch(() => {});

  const v = Math.max(0.02, Math.min(1, volume * getEffectiveMasterVolume()));
  if (name === 'buzzer') {
    playSynthTone({ freq: 160, freqEnd: 120, durationMs: 180, type: 'sawtooth', gain: v * 0.22 });
    playSynthTone({ freq: 132, freqEnd: 95, durationMs: 220, type: 'square', gain: v * 0.18, whenMs: 30 });
    return;
  }
  if (name === 'correct') {
    playSynthTone({ freq: 392, durationMs: 110, type: 'triangle', gain: v * 0.14 });
    playSynthTone({ freq: 523.25, durationMs: 140, type: 'triangle', gain: v * 0.15, whenMs: 90 });
    playSynthTone({ freq: 659.25, durationMs: 170, type: 'triangle', gain: v * 0.16, whenMs: 180 });
    return;
  }
  if (name === 'timeout') {
    playSynthTone({ freq: 170, freqEnd: 75, durationMs: 520, type: 'sawtooth', gain: v * 0.18 });
    return;
  }
  if (name === 'tick') {
    playSynthTone({ freq: 1080, durationMs: 45, type: 'square', gain: v * 0.07 });
    return;
  }
  playSynthTone({ freq: 260, freqEnd: 180, durationMs: 260, type: 'triangle', gain: v * 0.17 });
}

function initAudioSystem() {
  if (state.audio.initialized) {
    return;
  }

  state.audio.bgm = createAudioAsset('bgm.mp3', { loop: true });
  state.audio.bgm.addEventListener('canplaythrough', () => {
    state.audio.bgmFilePlayable = true;
  });
  state.audio.bgm.addEventListener('error', () => {
    state.audio.bgmFilePlayable = false;
    startSynthBgm();
  });

  const makeSfx = (name, file) => {
    const clip = createAudioAsset(file);
    state.audio.sfxReady[name] = false;
    clip.addEventListener('canplaythrough', () => {
      state.audio.sfxReady[name] = true;
    });
    clip.addEventListener('error', () => {
      state.audio.sfxReady[name] = false;
    });
    return clip;
  };

  state.audio.sfx = {
    buzzer: makeSfx('buzzer', 'buzzer.mp3'),
    correct: makeSfx('correct', 'correct.mp3'),
    wrong: makeSfx('wrong', 'wrong.mp3'),
    timeout: makeSfx('timeout', 'timeout.mp3'),
    tick: makeSfx('tick', 'tick.mp3')
  };
  state.audio.initialized = true;
}

function getEffectiveMasterVolume() {
  if (state.audio.muted) {
    return 0;
  }
  return Math.max(0, Math.min(1, state.audio.volume));
}

function getTargetMusicVolume() {
  const master = getEffectiveMasterVolume();
  if (!state.audio.musicEnabled) {
    return 0;
  }
  return Math.max(0, Math.min(1, master * 0.58 * state.audio.bgmIntensity));
}

function applyMusicVolume() {
  if (!state.audio.bgm || state.audio.bgmFilePlayable === false) {
    return;
  }
  state.audio.bgm.volume = getTargetMusicVolume();
}

function startMusic() {
  initAudioSystem();
  if (!state.audio.hasUserInteracted || !state.audio.bgm) {
    return;
  }
  if (!state.audio.musicEnabled || state.audio.muted) {
    stopSynthBgm();
    return;
  }

  if (state.audio.bgmFilePlayable === false || !state.audio.bgm) {
    startSynthBgm();
    return;
  }

  if (state.audio.bgm.readyState < 2) {
    startSynthBgm();
  }

  applyMusicVolume();
  state.audio.bgm
    .play()
    .then(() => {
      state.audio.bgmStarted = true;
      state.audio.bgmFilePlayable = true;
      stopSynthBgm();
    })
    .catch(() => {
      state.audio.bgmFilePlayable = false;
      startSynthBgm();
    });
}

function stopMusic() {
  if (state.audio.bgm) {
    state.audio.bgm.pause();
  }
  stopSynthBgm();
}

function unlockAudio() {
  state.audio.hasUserInteracted = true;
  initAudioSystem();
  const ctx = getSynthContext();
  if (ctx) {
    ctx.resume().catch(() => {});
  }
  startMusic();
}

function setMasterVolume() {
  applyMusicVolume();
}

function setBgmIntensity(multiplier) {
  const clamped = Math.max(0, Math.min(1, multiplier));
  state.audio.bgmIntensity = clamped;
  applyMusicVolume();
}

function duckMusic(level, duration) {
  if (!state.audio.musicEnabled || state.audio.muted) {
    return;
  }

  if (state.audio.bgmDuckTimer) {
    window.clearTimeout(state.audio.bgmDuckTimer);
    state.audio.bgmDuckTimer = null;
  }

  const safeLevel = Math.max(0, Math.min(1, Number(level)));
  if (state.audio.bgm && state.audio.bgmFilePlayable !== false) {
    state.audio.bgm.volume = getEffectiveMasterVolume() * safeLevel;
  }
  const baseline = Math.max(0.01, 0.58 * state.audio.bgmIntensity);
  state.audio.synthDuckLevel = Math.max(0.1, Math.min(1, safeLevel / baseline));

  state.audio.bgmDuckTimer = window.setTimeout(() => {
    applyMusicVolume();
    state.audio.synthDuckLevel = 1;
    state.audio.bgmDuckTimer = null;
  }, Math.max(0, Number(duration) || 0));
}

function duckBgmTemporarily(durationMs = 420, duckFactor = 0.2) {
  const safeDuck = Math.max(0, Math.min(1, duckFactor));
  duckMusic(0.58 * state.audio.bgmIntensity * safeDuck, durationMs);
}

function playSfx(name, { volume = 1, duckLevel = null, duckDuration = 0 } = {}) {
  initAudioSystem();
  if (!state.audio.hasUserInteracted || !state.audio.sfxEnabled || state.audio.muted) {
    return;
  }

  const clip = state.audio.sfx[name];
  if (!clip || !clip.src) {
    playSynthSfx(name, volume);
    return;
  }

  if (duckLevel !== null) {
    duckMusic(duckLevel, duckDuration);
  }

  const clipReady = state.audio.sfxReady[name] && clip.readyState >= 2;
  if (!clipReady) {
    playSynthSfx(name, volume);
  }

  if (!clipReady && state.audio.sfxReady[name] === false) {
    return;
  }

  clip.pause();
  clip.currentTime = 0;
  clip.volume = Math.max(0, Math.min(1, volume * getEffectiveMasterVolume()));
  const playAttempt = clip.play();
  if (playAttempt && typeof playAttempt.catch === 'function') {
    playAttempt.catch(() => {
      playSynthSfx(name, volume);
    });
  }
}

function playBuzzSound() {
  playSfx('buzzer', { volume: 1, duckLevel: 0.3, duckDuration: 500 });
}

function playTickSound(secondRemaining = 3) {
  const levelMap = {
    3: 0.34,
    2: 0.5,
    1: 0.72
  };
  playSfx('tick', { volume: levelMap[secondRemaining] || 0.4 });
}

function playStealCue() {
  playSfx('wrong', { volume: 0.62, duckLevel: 0.45, duckDuration: 420 });
}

function playResultSound(soundType) {
  if (soundType === 'correct') {
    playSfx('correct', { volume: 0.95, duckLevel: 0.4, duckDuration: 1200 });
    return;
  }

  if (soundType === 'timeout') {
    playSfx('timeout', { volume: 0.92, duckLevel: 0.25, duckDuration: 1200 });
    return;
  }

  playSfx('wrong', { volume: 0.85, duckLevel: 0.42, duckDuration: 800 });
}

function render() {
  const fullscreenOn = Boolean(document.fullscreenElement);
  document.documentElement.classList.toggle('fullscreen-lock', fullscreenOn);
  document.body.classList.toggle('fullscreen-lock', fullscreenOn);
  els.app.classList.toggle('fullscreen-mode', fullscreenOn);
  if (fullscreenOn) {
    window.scrollTo(0, 0);
  }

  els.app.dataset.phase = state.phase;
  els.leftScore.textContent = String(state.scores.left);
  els.rightScore.textContent = String(state.scores.right);
  els.phaseLabel.textContent = state.phase.toUpperCase();

  els.questionCounter.textContent = `Question ${Math.max(0, state.questionIndex)} / ${state.questionQueue.length || state.questionBank.length || 0}`;
  els.roundCounter.textContent = `Round ${state.round}`;

  els.questionText.textContent = state.currentQuestion ? state.currentQuestion.prompt : 'Press START GAME to begin.';
  els.questionText.classList.toggle('question-long', Boolean(state.currentQuestion && state.currentQuestion.prompt.length > 70));
  renderQuestionChoices(state.currentQuestion);

  const timerVisible = [PHASES.buzz, PHASES.answer, PHASES.steal, PHASES.paused].includes(state.phase);
  els.timerDisplay.textContent = timerVisible ? String(state.timer) : '--';
  els.timerDisplay.classList.remove('timer-safe', 'timer-warn', 'timer-danger', 'timer-pulse');
  if (timerVisible) {
    if (state.timer <= 2) {
      els.timerDisplay.classList.add('timer-danger', 'timer-pulse');
    } else if (state.timer <= 5) {
      els.timerDisplay.classList.add('timer-warn');
    } else {
      els.timerDisplay.classList.add('timer-safe');
    }
  }

  const buzzEnabled = state.phase === PHASES.buzz && !state.decisionLocked;
  els.buzzLeft.disabled = !buzzEnabled;
  els.buzzRight.disabled = !buzzEnabled;
  els.buzzLeft.classList.toggle('ready', buzzEnabled);
  els.buzzRight.classList.toggle('ready', buzzEnabled);

  const lockGlowPhases = [PHASES.answer, PHASES.steal, PHASES.roundResult, PHASES.waitingNextRound];
  const hasWinnerLock = lockGlowPhases.includes(state.phase) && Boolean(state.buzzedPlayer);
  els.buzzLeft.classList.toggle('winner', hasWinnerLock && state.buzzedPlayer === 'left');
  els.buzzRight.classList.toggle('winner', hasWinnerLock && state.buzzedPlayer === 'right');
  els.buzzLeft.classList.toggle('loser', hasWinnerLock && state.buzzedPlayer === 'right');
  els.buzzRight.classList.toggle('loser', hasWinnerLock && state.buzzedPlayer === 'left');

  const judging = [PHASES.answer, PHASES.steal].includes(state.phase);
  els.judgePanel.hidden = !judging;
  if (judging) {
    const modeText = state.phase === PHASES.answer ? 'ANSWER' : 'STEAL';
    els.judgeTitle.textContent = `${state.turnPlayer ? state.turnPlayer.toUpperCase() : ''} - ${modeText}`;
  }

  els.startOverlay.hidden = state.phase !== PHASES.waitingStartGame;
  els.resultOverlay.hidden = state.phase !== PHASES.roundResult;
  els.waitingOverlay.hidden = ![PHASES.waitingNextRound, PHASES.sessionEnd].includes(state.phase);
  els.pauseOverlay.hidden = state.phase !== PHASES.paused;

  els.resultMessage.textContent = state.result.message;
  els.resultSubtext.textContent = state.result.subtext;
  if (state.phase === PHASES.sessionEnd) {
    els.waitingTitle.textContent = 'GAME COMPLETE';
    els.waitingHint.textContent = 'Press START to play again';
    els.startNextRoundBtn.textContent = 'START NEW GAME';
    els.waitingSummary.textContent = `${state.result.message} ${state.result.subtext}`;
  } else {
    els.waitingTitle.textContent = 'WAITING FOR NEXT CHALLENGER';
    els.waitingHint.textContent = 'Press START to continue';
    els.startNextRoundBtn.textContent = 'START NEXT ROUND';
    els.waitingSummary.textContent = state.result.subtext
      ? `${state.result.message} ${state.result.subtext}`
      : `${state.result.message}`;
  }

  els.pauseBtn.textContent = state.phase === PHASES.paused ? 'Resume' : 'Pause';
  els.muteBtn.textContent = state.audio.muted ? 'Unmute' : 'Mute';
  els.volumeSlider.value = String(Math.round(state.audio.volume * 100));
  syncAudioInputs();
  els.fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';

  updateSettingsPanel();
}

function handleBankSave() {
  const parsed = parseBankInput(els.bankInput.value);

  if (!parsed.questions.length) {
    setSettingsMessage(parsed.errors[0] || 'No valid questions found.', true);
    return;
  }

  setQuestionBank(parsed.questions, `Saved ${parsed.questions.length} questions.`);

  if (parsed.errors.length) {
    setSettingsMessage(`Saved ${parsed.questions.length}. Warnings: ${parsed.errors.length}.`, false);
  }
}

function bindEvents() {
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  els.startGameBtn.addEventListener('click', () => {
    enterFullscreenForGameStart();
    unlockAudio();
    startGameFromBeginning();
  });

  els.openSettingsStartBtn.addEventListener('click', () => {
    toggleSettings(true);
  });

  els.startNextRoundBtn.addEventListener('click', () => {
    unlockAudio();
    startNextRound();
  });

  els.pauseBtn.addEventListener('click', () => {
    if (state.phase === PHASES.paused) {
      resumeGame();
      return;
    }
    pauseGame();
  });

  els.resumeBtn.addEventListener('click', () => {
    resumeGame();
  });

  els.buzzLeft.addEventListener('click', () => handleBuzz('left'));
  els.buzzRight.addEventListener('click', () => handleBuzz('right'));
  els.questionChoices.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button[data-choice-key]');
    if (!button) {
      return;
    }
    handleChoicePick(button.dataset.choiceKey || '');
  });

  els.judgeCorrect.addEventListener('click', () => queueDecision('correct', 220, true));
  els.judgeWrong.addEventListener('click', () => queueDecision('wrong', 220, true));
  els.judgeTimeout.addEventListener('click', () => queueDecision('timeout', 220, true));

  els.resetGameBtn.addEventListener('click', () => {
    if (window.confirm('Reset game and scoreboard?')) {
      resetGame();
    }
  });

  els.muteBtn.addEventListener('click', () => {
    state.audio.muted = !state.audio.muted;
    if (state.audio.muted) {
      stopMusic();
    } else if (state.audio.musicEnabled) {
      startMusic();
    }
    setMasterVolume();
    savePrefs();
    render();
  });

  els.testSoundBtn.addEventListener('click', () => {
    state.audio.muted = false;
    state.audio.musicEnabled = true;
    state.audio.sfxEnabled = true;
    if (state.audio.volume < 0.2) {
      state.audio.volume = 0.85;
    }
    unlockAudio();
    setMasterVolume();
    savePrefs();
    render();
    playBuzzSound();
    window.setTimeout(() => {
      playResultSound('correct');
      setStatusLine('Audio test played.');
    }, 220);
  });

  els.volumeSlider.addEventListener('input', (event) => {
    const next = Number(event.target.value);
    state.audio.volume = Number.isFinite(next) ? Math.max(0, Math.min(1, next / 100)) : 1;
    setMasterVolume();
    savePrefs();
    render();
  });

  els.cfgMasterVolume.addEventListener('input', (event) => {
    const next = Number(event.target.value);
    state.audio.volume = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 1;
    setMasterVolume();
    savePrefs();
    render();
  });

  els.cfgMusicToggle.addEventListener('change', (event) => {
    state.audio.musicEnabled = Boolean(event.target.checked);
    if (state.audio.musicEnabled && !state.audio.muted) {
      startMusic();
    } else {
      stopMusic();
    }
    setMasterVolume();
    savePrefs();
    render();
  });

  els.cfgSfxToggle.addEventListener('change', (event) => {
    state.audio.sfxEnabled = Boolean(event.target.checked);
    savePrefs();
    render();
  });

  els.fullscreenBtn.addEventListener('click', () => {
    toggleFullscreen();
  });

  els.settingsBtn.addEventListener('click', () => {
    toggleSettings(true);
  });

  els.closeSettingsBtn.addEventListener('click', () => {
    toggleSettings(false);
  });

  els.applyTimersBtn.addEventListener('click', applyTimerSettings);
  els.saveBankBtn.addEventListener('click', handleBankSave);

  document.addEventListener('fullscreenchange', () => {
    render();
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTypingTarget =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      Boolean(target && target.isContentEditable);

    if (isTypingTarget) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 's') {
      toggleSettings();
    } else if (key === 'p') {
      if (state.phase === PHASES.paused) {
        resumeGame();
      } else {
        pauseGame();
      }
    } else if (key === 'a') {
      handleBuzz('left');
    } else if (key === 'l') {
      handleBuzz('right');
    } else if (key === 'c') {
      queueDecision('correct', 220, true);
    } else if (key === 'w') {
      queueDecision('wrong', 220, true);
    } else if (key === 't') {
      queueDecision('timeout', 220, true);
    } else if (key === 'n' && [PHASES.waitingNextRound, PHASES.sessionEnd].includes(state.phase)) {
      startNextRound();
    }
  });
}

function init() {
  loadPrefs();
  syncTimerInputs();
  syncAudioInputs();
  bindEvents();
  loadQuestionBank();
  initAudioSystem();

  setMasterVolume();
  setBgmIntensity(0.6);
  setStatusLine('Waiting for master start.');
  render();

  console.info('Science Bowl ready.', {
    phase: state.phase,
    officialTimers: OFFICIAL_TIMERS,
    storageKey: STORAGE_QUESTIONS_KEY
  });
}

init();
