const TASKS = [
  {
    id: 'duration',
    label: '持続時間の弁別',
    folder: 'duration_discrimination',
    csvName: 'duration_discrimination',
    detail: '3 つの音のうち 1 つだけ長さが異なります。長さの違いに集中してください。',
    thresholdLabel: '推定閾値 (リバーサル平均)'
  },
  {
    id: 'formant',
    label: 'フォルマントの弁別',
    folder: 'formant_discrimination',
    csvName: 'formant_discrimination',
    detail: '1 つだけフォルマント（音色）が異なります。音質の違いに集中してください。',
    thresholdLabel: '推定閾値 (折り返し平均)'
  },
  {
    id: 'pitch',
    label: 'ピッチの弁別',
    folder: 'pitch_discrimination',
    csvName: 'pitch_discrimination',
    detail: '1 つだけ高さ（ピッチ）が異なります。音の高さの違いに集中してください。',
    thresholdLabel: '推定閾値 (折り返し平均)'
  },
  {
    id: 'risetime',
    label: '立ち上がり時間の弁別',
    folder: 'risetime_discrimination',
    csvName: 'risetime_discrimination',
    detail: '1 つだけ立ち上がり時間が異なります。音の立ち上がり方に集中してください。',
    thresholdLabel: '推定閾値 (折り返し平均)'
  }
];

const config = {
  startingStep: 51,
  maxTrials: 75,
  numSteps: 101,
  targetReversals: 7,
  interStimulusDelay: 500,
  postSequenceDelay: 500,
  postResponseDelay: 1000,
  stepSizes: [10, 5, 2, 1, 1, 1, 1, 1]
};

const practiceConfig = {
  trials: 3,
  baseStep: 1,
  differentStep: 100
};

const elements = {
  setup: document.getElementById('setup'),
  overview: document.getElementById('overview'),
  instructions: document.getElementById('instructions'),
  trial: document.getElementById('trial'),
  taskComplete: document.getElementById('taskComplete'),
  complete: document.getElementById('complete'),
  subjectId: document.getElementById('subjectId'),
  decideOrder: document.getElementById('decideOrder'),
  orderList: document.getElementById('orderList'),
  beginBattery: document.getElementById('beginBattery'),
  taskTag: document.getElementById('taskTag'),
  taskTitle: document.getElementById('taskTitle'),
  taskDetail: document.getElementById('taskDetail'),
  startPractice: document.getElementById('startPractice'),
  startTest: document.getElementById('startTest'),
  practiceStatus: document.getElementById('practiceStatus'),
  sessionTag: document.getElementById('sessionTag'),
  trialHeading: document.getElementById('trialHeading'),
  trialPrompt: document.getElementById('trialPrompt'),
  playbackStatus: document.getElementById('playbackStatus'),
  choose1: document.getElementById('choose1'),
  choose3: document.getElementById('choose3'),
  feedback: document.getElementById('feedback'),
  taskProgress: document.getElementById('taskProgress'),
  completeTitle: document.getElementById('completeTitle'),
  thresholdText: document.getElementById('thresholdText'),
  taskCompleteHint: document.getElementById('taskCompleteHint'),
  nextTaskButton: document.getElementById('nextTaskButton'),
  summaryList: document.getElementById('summaryList'),
  downloadCsv: document.getElementById('downloadCsv')
};

let subjectId = '';
let taskOrder = [];
let currentTaskIndex = 0;
let currentTask = null;
let stimOrder = [];
let responseWindowStart = null;
let trialState = {};
let audioPool = [];
let baseAudioA = null;
let baseAudioB = null;
let warmupPromise = null;
let state = createState();
let practiceState = createPracticeState();
const currentResults = [];
const allResults = [];
const taskSummaries = [];

function createState() {
  return {
    currentStep: config.startingStep,
    currentTrial: 0,
    numReversals: 0,
    lastCorrect: -1,
    numCorrect: 0,
    reversalsSum: 0
  };
}

function createPracticeState() {
  return {
    currentTrial: 0,
    order: [],
    completed: false
  };
}

function initAudioPool(task) {
  const pool = [null];
  for (let i = 1; i <= config.numSteps; i++) {
    pool.push(createAudio(`../${task.folder}/Stimuli/${i}.flac`));
  }
  return pool;
}

function createAudio(src) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.load();
  return audio;
}

function resetAudio(audio) {
  audio.pause();
  audio.currentTime = 0;
}

function waitForAudioReady(audio) {
  // Ready when we have future data (3) and a usable duration
  const hasData = () => audio.readyState >= 3 && Number.isFinite(audio.duration) && audio.duration > 0;
  if (hasData()) return Promise.resolve();

  return new Promise(resolve => {
    let timer = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      audio.removeEventListener('canplaythrough', cleanup);
      audio.removeEventListener('loadeddata', cleanup);
      audio.removeEventListener('error', cleanup);
      resolve();
    };
    timer = setTimeout(cleanup, 5000);
    audio.addEventListener('canplaythrough', cleanup, { once: true });
    audio.addEventListener('loadeddata', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    try {
      audio.load();
    } catch (e) {
      cleanup();
    }
  });
}

function warmUpTaskAudio() {
  const stepsToWarm = new Set([1, config.startingStep, practiceConfig.baseStep, practiceConfig.differentStep]);
  const targets = [baseAudioA, baseAudioB];
  stepsToWarm.forEach(step => {
    const audio = audioPool[step];
    if (audio) targets.push(audio);
  });
  return Promise.all(targets.map(a => waitForAudioReady(a).catch(() => {})));
}

function showSection(section) {
  [elements.setup, elements.overview, elements.instructions, elements.trial, elements.taskComplete, elements.complete]
    .forEach(el => el.classList.remove('active'));
  elements[section].classList.add('active');
}

function seededRandom(seedStr) {
  let seed = 0;
  const normalized = seedStr.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    seed = (seed * 31 + normalized.charCodeAt(i) + i) >>> 0;
  }
  if (seed === 0) seed = 1234567;
  return () => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 0x100000000) / 0x100000000;
  };
}

function seededShuffle(array, seedStr) {
  const rand = seededRandom(seedStr || 'default');
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderOrderList() {
  elements.orderList.innerHTML = '';
  taskOrder.forEach((task, index) => {
    const li = document.createElement('li');
    li.textContent = task.label;
    elements.orderList.appendChild(li);
  });
}

function resetPracticeProgress() {
  practiceState = createPracticeState();
  elements.startTest.disabled = true;
  elements.practiceStatus.textContent = 'まず練習を完了してください。（刺激 1 と 100 を使用）';
}

function resetTaskState() {
  state = createState();
  currentResults.length = 0;
  stimOrder = [];
  trialState = {};
  responseWindowStart = null;
}

function prepareTask(task) {
  currentTask = task;
  resetTaskState();
  resetPracticeProgress();
  audioPool = initAudioPool(task);
  baseAudioA = createAudio(`../${task.folder}/Stimuli/1.flac`);
  baseAudioB = createAudio(`../${task.folder}/Stimuli/1.flac`);
  elements.startPractice.disabled = true;
  elements.practiceStatus.textContent = '音声を読み込んでいます...';
  warmupPromise = warmUpTaskAudio();
  warmupPromise.finally(() => {
    elements.startPractice.disabled = false;
    if (!practiceState.completed) {
      elements.practiceStatus.textContent = 'まず練習を完了してください。（刺激 1 と 100 を使用）';
    }
  });
  elements.taskTag.textContent = `タスク ${currentTaskIndex + 1}/${taskOrder.length} | 説明`;
  elements.taskTitle.textContent = task.label;
  elements.taskDetail.textContent = task.detail;
  elements.feedback.textContent = '';
  elements.feedback.classList.remove('correct', 'incorrect');
  showSection('instructions');
}

function setSessionUi(mode) {
  const prefix = `タスク ${currentTaskIndex + 1}/${taskOrder.length}`;
  if (mode === 'practice') {
    elements.sessionTag.textContent = `${prefix} | 練習`;
    elements.trialHeading.textContent = `${currentTask.label} - 練習`;
    elements.trialPrompt.textContent = 'はっきり異なる音です。1 番目か 3 番目を選んでください。';
    elements.taskProgress.textContent = `${prefix} | 練習 ${practiceState.currentTrial + 1}/${practiceConfig.trials}`;
  } else {
    elements.sessionTag.textContent = `${prefix} | 本番`;
    elements.trialHeading.textContent = `${currentTask.label} - 本番`;
    elements.trialPrompt.textContent = 'どの音が異なるでしょうか？ (1 または 3)';
    elements.taskProgress.textContent = `${prefix} | 本番 ${state.currentTrial + 1}/${config.maxTrials}`;
  }
  elements.playbackStatus.textContent = '音声を再生しています...';
}

function clearFeedback() {
  elements.feedback.textContent = '';
  elements.feedback.classList.remove('correct', 'incorrect');
}

function setFeedback(message, wasCorrect) {
  elements.feedback.textContent = message;
  elements.feedback.classList.remove('correct', 'incorrect');
  elements.feedback.classList.add(wasCorrect ? 'correct' : 'incorrect');
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildStimOrder() {
  const arr = [];
  for (let i = 0; i < Math.floor(config.maxTrials / 2); i++) arr.push(0);
  for (let i = Math.floor(config.maxTrials / 2); i < config.maxTrials; i++) arr.push(1);
  return shuffle(arr);
}

function buildPracticeOrder(numTrials) {
  const arr = [];
  for (let i = 0; i < numTrials; i++) {
    arr.push(Math.random() < 0.5 ? 0 : 1);
  }
  return arr;
}

function toggleResponseButtons(enabled) {
  elements.choose1.disabled = !enabled;
  elements.choose3.disabled = !enabled;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playAndWait(audio) {
  await waitForAudioReady(audio);
  resetAudio(audio);
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      resolve();
    };
    const onEnded = () => finish();
    const onError = () => finish();
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });
    const fallbackMs = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.round(audio.duration * 1000) + 200
      : 4000;
    setTimeout(finish, fallbackMs);
    audio.play().catch(() => finish());
  });
}

async function playSequence(first, second, third) {
  await playAndWait(first);
  await wait(config.interStimulusDelay);
  await playAndWait(second);
  await wait(config.interStimulusDelay);
  await playAndWait(third);
  await wait(config.postSequenceDelay);
}

function startPractice() {
  if (warmupPromise) {
    elements.practiceStatus.textContent = '音声を読み込んでいます...';
  }
  practiceState.currentTrial = 0;
  practiceState.order = buildPracticeOrder(practiceConfig.trials);
  practiceState.completed = false;
  elements.startTest.disabled = true;
  elements.practiceStatus.textContent = '練習中です。音声の再生後に 1 か 3 を選んでください。';
  setSessionUi('practice');
  clearFeedback();
  showSection('trial');
  runPracticeTrial();
}

async function runPracticeTrial() {
  clearFeedback();
  if (warmupPromise) {
    await warmupPromise;
  }
  const trialIndex = practiceState.currentTrial;
  const oddIsThird = practiceState.order[trialIndex] === 0;
  const correctAnswer = oddIsThird ? '3' : '1';

  toggleResponseButtons(false);
  setSessionUi('practice');
  elements.playbackStatus.textContent = `練習 ${trialIndex + 1}/${practiceConfig.trials}：音声を再生しています...`;

  const differentAudio = audioPool[practiceConfig.differentStep];
  const first = oddIsThird ? baseAudioA : differentAudio;
  const second = oddIsThird ? baseAudioB : baseAudioA;
  const third = oddIsThird ? differentAudio : baseAudioB;
  trialState = { correctAnswer, trialStep: practiceConfig.differentStep, oddPosition: oddIsThird ? 3 : 1, mode: 'practice' };

  await playSequence(first, second, third);
  responseWindowStart = performance.now();
  elements.playbackStatus.textContent = `練習 ${trialIndex + 1}/${practiceConfig.trials}：1 番目か 3 番目かを選んでください。`;
  toggleResponseButtons(true);
}

async function startExperiment() {
  if (!practiceState.completed) {
    elements.practiceStatus.textContent = '本番を開始する前に練習を完了してください。';
    return;
  }
  if (warmupPromise) {
    await warmupPromise;
  }
  resetTaskState();
  stimOrder = buildStimOrder();
  setSessionUi('test');
  clearFeedback();
  showSection('trial');
  runTrial();
}

function nextTrial() {
  if (state.currentTrial === config.maxTrials || state.numReversals === config.targetReversals) {
    return concludeTask();
  }
  runTrial();
}

async function runTrial() {
  const trialIndex = state.currentTrial;
  const oddIsThird = stimOrder[trialIndex] === 0;
  const correctAnswer = oddIsThird ? '3' : '1';
  const trialStep = state.currentStep;

  clearFeedback();
  toggleResponseButtons(false);
  setSessionUi('test');
  elements.playbackStatus.textContent = '音声を再生しています...';

  const stepAudio = audioPool[trialStep];
  const first = oddIsThird ? baseAudioA : stepAudio;
  const second = oddIsThird ? baseAudioB : baseAudioA;
  const third = oddIsThird ? stepAudio : baseAudioB;
  trialState = { correctAnswer, trialStep, oddPosition: oddIsThird ? 3 : 1, mode: 'test' };

  await playSequence(first, second, third);
  responseWindowStart = performance.now();
  elements.playbackStatus.textContent = '1 番目か 3 番目かを選んでください。';
  toggleResponseButtons(true);
}

function handleResponse(choice) {
  if (!responseWindowStart) return;
  const rtMs = Math.round(performance.now() - responseWindowStart);
  toggleResponseButtons(false);

  const wasCorrect = choice === trialState.correctAnswer;
  if (trialState.mode === 'practice') {
    responseWindowStart = null;
    const practiceMessage = wasCorrect
      ? '正解です！次の練習に進みます。'
      : `不正解です。正解は ${trialState.correctAnswer} 番目でした。`;
    elements.playbackStatus.textContent = practiceMessage;
    setFeedback(practiceMessage, wasCorrect);
    practiceState.currentTrial += 1;
    if (practiceState.currentTrial >= practiceConfig.trials) {
      practiceState.completed = true;
      elements.practiceStatus.textContent = '練習が完了しました。本番を開始できます。';
      elements.startTest.disabled = false;
      setTimeout(() => {
        clearFeedback();
        showSection('instructions');
      }, config.postResponseDelay);
    } else {
      setTimeout(runPracticeTrial, config.postResponseDelay);
    }
    return;
  }

  elements.playbackStatus.textContent = wasCorrect
    ? '正解です！次の試行を準備しています...'
    : `不正解です。正解は ${trialState.correctAnswer} 番目でした。次の試行を準備しています...`;
  const prevStep = state.currentStep;

  const stepSizeUsed = applyStaircase(wasCorrect);
  const meanReversal = state.numReversals > 1 ? state.reversalsSum / (state.numReversals - 1) : '';

  currentResults.push({
    subject_id: subjectId,
    task_id: currentTask.id,
    task_label: currentTask.label,
    task_order: currentTaskIndex + 1,
    trial: state.currentTrial + 1,
    stimulus_step: prevStep,
    odd_position: trialState.oddPosition,
    correct_answer: trialState.correctAnswer,
    response: choice,
    correct: wasCorrect ? 1 : 0,
    rt_ms: rtMs,
    num_reversals_after: state.numReversals,
    step_before: prevStep,
    step_after: state.currentStep,
    step_size_used: stepSizeUsed,
    mean_reversal_so_far: meanReversal,
    threshold_estimate: ''
  });

  setFeedback(wasCorrect ? '正解です！' : `不正解です。正解は ${trialState.correctAnswer} 番目でした。`, wasCorrect);
  state.currentTrial += 1;
  responseWindowStart = null;
  setTimeout(nextTrial, config.postResponseDelay);
}

function applyStaircase(wasCorrect) {
  let stepSizeUsed = config.stepSizes[Math.min(state.numReversals, config.stepSizes.length - 1)];
  const prevLastCorrect = state.lastCorrect;
  const prevNumCorrect = state.numCorrect;

  if (state.numReversals === 0) {
    if (prevLastCorrect > -1) {
      if ((prevLastCorrect === 1 && !wasCorrect) || (prevLastCorrect === 0 && wasCorrect)) {
        state.numReversals += 1;
        if (state.numReversals > 1) {
          state.reversalsSum += state.currentStep;
        }
      }
    }
    stepSizeUsed = config.stepSizes[Math.min(state.numReversals, config.stepSizes.length - 1)];
    if (wasCorrect) {
      state.currentStep -= stepSizeUsed;
    } else {
      state.currentStep += stepSizeUsed;
    }
    state.lastCorrect = wasCorrect ? 1 : 0;
  } else {
    if (prevLastCorrect > -1) {
      if (prevLastCorrect === 1 && !wasCorrect) {
        state.numReversals += 1;
        if (state.numReversals > 1) {
          state.reversalsSum += state.currentStep;
        }
      }
      if (prevLastCorrect === 0 && wasCorrect && prevNumCorrect === 1) {
        state.numReversals += 1;
        if (state.numReversals > 1) {
          state.reversalsSum += state.currentStep;
        }
      }
    }
    stepSizeUsed = config.stepSizes[Math.min(state.numReversals, config.stepSizes.length - 1)];
    if (wasCorrect && prevNumCorrect === 1) {
      state.currentStep -= stepSizeUsed;
    }
    if (!wasCorrect) {
      state.currentStep += stepSizeUsed;
    }
    if (!wasCorrect) {
      state.lastCorrect = 0;
    } else if (prevNumCorrect === 1) {
      state.lastCorrect = 1;
    }
    if (wasCorrect) {
      state.numCorrect += 1;
      if (state.numCorrect === 2) {
        state.numCorrect = 0;
      }
    } else {
      state.numCorrect = 0;
    }
  }

  if (state.currentStep < 2) state.currentStep = 2;
  if (state.currentStep > config.numSteps) state.currentStep = config.numSteps;
  return stepSizeUsed;
}

function concludeTask() {
  const threshold = state.numReversals > 1 ? state.reversalsSum / (state.numReversals - 1) : null;
  currentResults.forEach(row => {
    row.threshold_estimate = threshold !== null ? threshold.toFixed(2) : '';
  });
  allResults.push(...currentResults);
  taskSummaries.push({
    task: currentTask,
    order: currentTaskIndex + 1,
    threshold
  });

  elements.completeTitle.textContent = `${currentTask.label} が完了しました`;
  elements.thresholdText.textContent = threshold !== null
    ? `${currentTask.thresholdLabel}: ${threshold.toFixed(2)}`
    : `${currentTask.thresholdLabel}: まだ安定していないため計算できませんでした。`;

  const isLastTask = currentTaskIndex === taskOrder.length - 1;
  const nextTask = taskOrder[currentTaskIndex + 1];
  elements.taskCompleteHint.textContent = isLastTask
    ? 'すべてのタスクが終わりました。結果を確認してください。'
    : `次は「${nextTask.label}」です。準備ができたら進んでください。`;
  elements.nextTaskButton.textContent = isLastTask ? '結果を見る' : '次のタスクへ';
  elements.nextTaskButton.onclick = () => {
    if (isLastTask) {
      renderSummary();
      showSection('complete');
    } else {
      currentTaskIndex += 1;
      prepareTask(nextTask);
    }
  };

  showSection('taskComplete');
}

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCsv() {
  const header = [
    'subject_id',
    'task_id',
    'task_label',
    'task_order',
    'trial',
    'stimulus_step',
    'odd_position',
    'correct_answer',
    'response',
    'correct',
    'rt_ms',
    'num_reversals_after',
    'step_before',
    'step_after',
    'step_size_used',
    'mean_reversal_so_far',
    'threshold_estimate'
  ];
  const lines = [header.join(',')];
  allResults.forEach(row => {
    const line = header.map(key => csvEscape(row[key])).join(',');
    lines.push(line);
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const filenameId = subjectId ? subjectId : 'subject';
  a.download = `${filenameId}_audio_discrimination.csv`;
  a.click();
}

function renderSummary() {
  elements.summaryList.innerHTML = '';
  taskSummaries.sort((a, b) => a.order - b.order).forEach(summary => {
    const div = document.createElement('div');
    div.className = 'summary-item';
    const thresholdText = summary.threshold !== null
      ? `${summary.task.thresholdLabel}: ${summary.threshold.toFixed(2)}`
      : `${summary.task.thresholdLabel}: 計算できませんでした`;
    div.innerHTML = `
      <div class="pill">タスク ${summary.order}</div>
      <div><strong>${summary.task.label}</strong></div>
      <div class="status">${thresholdText}</div>
    `;
    elements.summaryList.appendChild(div);
  });
}

elements.decideOrder.addEventListener('click', () => {
  const value = elements.subjectId.value.trim();
  if (!value) {
    elements.subjectId.focus();
    return;
  }
  subjectId = value;
  taskOrder = seededShuffle(TASKS, subjectId);
  currentTaskIndex = 0;
  renderOrderList();
  showSection('overview');
});

elements.beginBattery.addEventListener('click', () => {
  if (!subjectId) {
    elements.subjectId.focus();
    return;
  }
  prepareTask(taskOrder[0]);
});

elements.startPractice.addEventListener('click', () => {
  responseWindowStart = null;
  startPractice();
});

elements.startTest.addEventListener('click', () => {
  startExperiment();
});

elements.choose1.addEventListener('click', () => handleResponse('1'));
elements.choose3.addEventListener('click', () => handleResponse('3'));
elements.downloadCsv.addEventListener('click', downloadCsv);
