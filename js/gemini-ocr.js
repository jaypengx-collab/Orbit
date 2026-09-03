// Loads a chosen photo into a plain canvas at its native colour (no destructive filtering),
// capped to a sane max dimension so later steps stay fast.
class ImagePreprocessor {
  async process(file) {
    if (!(file instanceof Blob)) throw new Error('請選擇一張圖片。');
    if (!file.type.startsWith('image/')) throw new Error('請選擇支援的圖片格式。');
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('圖片載入失敗，請換一張再試。'));
        element.src = url;
      });
      if (image.naturalWidth < 240 || image.naturalHeight < 160) throw new Error('圖片解析度過低，請換一張更清楚的照片。');
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return { canvas, width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Downscales a canvas in place so the JPEG payload sent to the AI stays small; a no-op if
// the canvas is already within bounds.
function capCanvasDimension(canvas, maxDimension = 1600) {
  const scale = Math.min(1, maxDimension / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas;
  const scaled = document.createElement('canvas');
  scaled.width = Math.max(1, Math.round(canvas.width * scale));
  scaled.height = Math.max(1, Math.round(canvas.height * scale));
  scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}

// True while a Gemini OCR request is in flight; the editor sheet checks this to block
// closing mid-recognition (closing would abandon the in-progress import silently).
let isOcrProcessing = false;

// Gemini API keys are user-supplied and kept only in this browser's localStorage; never
// hardcode a real key in this file (it would be exposed to anyone who opens/shares it).
const GEMINI_API_KEY_STORAGE_KEY = 'orbitAiGeminiApiKey';

function getStoredGeminiApiKey() {
  try { return (localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '').trim(); } catch { return ''; }
}

function setStoredGeminiApiKey(key) {
  try {
    if (key) localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch { /* localStorage unavailable (private browsing, etc.) */ }
}

class AIVisionProcessor {
  constructor() {
    // Ordered for the best balance of accuracy and speed on this structured-extraction task:
    // gemini-3.6-flash (newest GA, strong accuracy + token efficiency) is tried first, then
    // gemini-3.7-flash (strong general reasoning) and gemini-2.5-flash (proven, stable) as
    // capable fallbacks, with the flash-lite variant last since it favors speed over accuracy.
    this.geminiModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
  }

  buildPrompt() {
    return `Extract the class timetable from this photo and return it as a single JSON object. Focus on the timetable only — ignore background, margins, decorations, and unrelated content; it may only occupy part of the frame.

Return valid JSON only, matching this exact schema:
{
  "bellTimes": [],
  "breakTimes": [{"name":"午休","start":"12:00","end":"13:00"}],
  "teacherDB": {"國文": ["國文", "陳老師", "A101"], "英文": ["英文", "王老師", "B202"]},
  "locationDB": {"國文":"A101", "英文":"B202"},
  "weeklySchedule": {"1": ["國文","英文",null], "2": [], "3": [], "4": [], "5": []},
  "reverseWeek": false,
  "countdownEvents": [{"name":"116 學測","startDate":"2027-01-22","endDate":"2027-01-24"}]
}

Interpret the timetable visually and use your best judgment to reconstruct its structure. Rules:
- Read class period times from the image when available. Use 24-hour "HH:MM" strings, one entry per period in order, exactly as shown (either ["08:10","09:00"] or {"start":"08:10","end":"09:00"} is acceptable). Preserve the actual times; never invent, guess, or fall back to standard/default school times. If no class times are visible anywhere, return an empty bellTimes array.
- Identify visible subjects, teachers, classrooms, breaks, and other timetable information.
- teacherDB: one entry per distinct subject actually visible in the photo — do not invent subjects that aren't shown. Use the subject's Chinese name as its own key in this object; if two subjects share the same name, make the keys distinct (e.g. append the teacher's name). Value is [full subject name, teacher name, classroom]. Use "" for teacher/location when that information is not readable.
- locationDB maps each subject key to its visible classroom/location; use "" when not visible.
- weeklySchedule: keys "1" through "5" (Monday–Friday) are REQUIRED and must all be present, even as an empty array — never omit or truncate "5" (Friday) even if it is partially cut off in the photo. Add "6" (Saturday) and/or "0" (Sunday) ONLY if the photo actually shows a column for that day; otherwise omit them entirely. Keep each day's array aligned with the detected periods (one entry per bellTimes index). Use null when a slot is genuinely empty or cannot be identified; every non-null entry must be a key that exists in teacherDB.
- If odd/even weeks contain alternatives in the same slot, combine them with "/" (e.g. "國文/公民") and do the same for the corresponding teacher names, using one shared key for that slot.
- Set reverseWeek to true only when the photo clearly indicates a reversed odd/even week orientation; otherwise false.
- Add breakTimes only for explicitly shown non-class periods such as lunch or cleaning — not empty/free periods.
- Add countdownEvents only for clearly visible events/exams with a readable calendar date, formatted as "YYYY-MM-DD". Set startDate and endDate to the same date for a single-day event; use the visible first and last dates for a multi-day event/exam period. Only include dates you can actually read; otherwise return an empty array.
- Do not invent information. When uncertain, prefer an empty value or null.
- Keep all fields internally consistent.
- Return ONLY the raw JSON object — no markdown fences, no comments, no extra text.`;
  }

  async recognizeSchedule(canvas, apiKey, onProgress) {
    const report = (message) => { try { onProgress?.(message); } catch { /* ignore progress callback errors */ } };
    const trimmedKey = String(apiKey || '').trim();
    if (!trimmedKey) throw new Error('請先輸入 Gemini API 金鑰。');

    report('正在壓縮並編碼圖片…');
    const base64Data = canvas.toDataURL('image/jpeg', 0.9).replace(/^data:image\/jpeg;base64,/, '');
    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: this.buildPrompt() }, { inline_data: { mime_type: 'image/jpeg', data: base64Data } }] }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.1, maxOutputTokens: 8192 }
    });

    let lastError = null;
    for (const model of this.geminiModels) {
      report(`正在請求 AI 模型（${model}）分析課表…`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(trimmedKey)}`;
      let response;
      try {
        response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody });
      } catch (networkError) {
        lastError = new Error(`無法連線至 AI 服務：${networkError.message}`);
        report(`連線失敗，準備改用下一個模型…`);
        continue;
      }
      if (response.ok) {
        report(`AI 已回應（使用模型：${model}），正在解析辨識結果…`);
        return { candidate: this.parseResponse(await response.json()), modelUsed: model };
      }

      const errorJson = await response.json().catch(() => ({}));
      const message = errorJson.error?.message || response.statusText;
      if (response.status === 400 && /API_KEY_INVALID/.test(message)) {
        throw new Error('Gemini API 金鑰無效，請確認後重新輸入。');
      }
      // Retryable on the next model: retired/unknown model (404), overloaded (503), rate-limited (429), or transient server errors (5xx).
      lastError = new Error(`AI 辨識請求失敗（${response.status}）：${message}`);
      const retryableStatus = response.status === 404 || response.status === 429 || response.status === 503 || response.status >= 500;
      if (!retryableStatus) throw lastError;
      report(`模型（${model}）暫時無法使用（${response.status}：${message}），準備改用下一個模型…`);
    }

    throw lastError || new Error('AI 辨識請求失敗：沒有可用的模型。');
  }

  parseResponse(responseData) {
    const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('AI 沒有回傳任何課表內容，請換一張更清楚的照片再試。');
    // Ignore any surrounding features unrelated to the JSON itself (markdown fences, stray
    // commentary before/after) — isolate just the outermost {...} object and read that.
    const fenceStripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const firstBrace = fenceStripped.indexOf('{');
    const lastBrace = fenceStripped.lastIndexOf('}');
    const cleaned = (firstBrace !== -1 && lastBrace > firstBrace) ? fenceStripped.slice(firstBrace, lastBrace + 1) : fenceStripped;
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`AI 回傳的內容不是有效的 JSON：${error.message}`);
    }
    return this.normalizeAIOutput(parsed);
  }

  normalizeAIOutput(aiResult) {
    const normalizeTime=value=> {
      const match=String(value||'').trim().replace(/[：。．]/g,':').match(/^(\d{1,2})\s*:\s*(\d{2})$/);
      if (!match) return '';
      const hours=Number(match[1]), minutes=Number(match[2]);
      return hours>=0&&hours<=23&&minutes>=0&&minutes<=59?`${String(hours).padStart(2,'0')}:${match[2]}`:'';
    };
    const bellTimes = [];
    if (Array.isArray(aiResult.bellTimes)) {
      aiResult.bellTimes.forEach(item => {
        if ((Array.isArray(item) && item.length >= 2) || (item && typeof item === 'object')) {
          const s = normalizeTime(Array.isArray(item)?item[0]:item.start);
          const e = normalizeTime(Array.isArray(item)?item[1]:item.end);
          if (s && e) bellTimes.push([s, e]);
        }
      });
    }

    const breakTimes = [];
    if (Array.isArray(aiResult.breakTimes)) {
      aiResult.breakTimes.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const name = String(item.name || '').trim() || '午休';
        const start = normalizeTime(item.start);
        const end = normalizeTime(item.end);
        if (start && end) breakTimes.push({ name, start, end });
      });
    }

    // Keep the AI parser aligned to the current schema: direct property access only.
    // The AI's own keys are only used to cross-reference locationDB/weeklySchedule
    // entries during this parse - the app never shows or edits a class's key, so the
    // internal id generated here doesn't need to be human-readable.
    const teacherDB = {};
    const locationDB = {};
    const keyMap = {};
    let courseCounter = 1;
    if (aiResult.teacherDB && typeof aiResult.teacherDB === 'object') {
      Object.entries(aiResult.teacherDB).forEach(([dbKey, val]) => {
        let subject = '';
        let teacher = '';
        let location = '';

        if (Array.isArray(val)) {
          subject = String(val[0] || dbKey).trim();
          teacher = String(val[1] || '').trim();
          location = String(val[2] || '').trim();
        } else if (val && typeof val === 'object') {
          subject = String(val.subject || dbKey).trim();
          teacher = String(val.teacher || '').trim();
          location = String(val.location || '').trim();
        } else {
          subject = String(val || dbKey).trim();
        }

        if (!subject) return;

        subject = subject.replace(/／/g, '/');
        teacher = teacher.replace(/／/g, '/');
        location = location.replace(/／/g, '/');

        const key = `oc${courseCounter++}`;
        keyMap[String(dbKey || '').trim().replace(/／/g, '/')] = key;
        teacherDB[key] = [subject, teacher, location];
        locationDB[key] = location;
      });
    }
    if (aiResult.locationDB && typeof aiResult.locationDB === 'object') {
      Object.entries(aiResult.locationDB).forEach(([dbKey, value]) => {
        const key = keyMap[String(dbKey || '').trim().replace(/／/g, '/')];
        if (key) locationDB[key] = String(value || '').trim();
      });
    }

    const weeklySchedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const rawWeekly = aiResult.weeklySchedule ?? {};
    [0, 1, 2, 3, 4, 5, 6].forEach(dayKey => {
      const dayArr = rawWeekly[dayKey] ?? rawWeekly[String(dayKey)];
      if (!Array.isArray(dayArr)) return;
      weeklySchedule[dayKey] = dayArr.map(item => {
        if (!item) return '';
        const rawItemKey = (typeof item === 'string' ? item.trim() : String(item.key || '').trim()).replace(/／/g, '/');
        return keyMap[rawItemKey] || '';
      });
    });

    const recognizedBlocks = [];
    [0, 1, 2, 3, 4, 5, 6].forEach(day => {
      const daySchedule = weeklySchedule[day] || [];
      daySchedule.forEach((code, period) => {
        if (code && teacherDB[code]) {
          recognizedBlocks.push({
            id: `${period}:${day}`,
            day,
            period,
            assignment: { key: code, subject: teacherDB[code][0], teacher: teacherDB[code][1] },
            assignmentStatus: 'assigned',
            confidence: 99
          });
        }
      });
    });

    const candidate = {
      teacherDB,
      teacherOrder: Object.keys(teacherDB),
      locationDB,
      weeklySchedule,
      bellTimes,
      breakTimes,
      reverseWeek: aiResult.reverseWeek === true,
      recognizedBlocks
    };
    candidate.countdownEvents = Array.isArray(aiResult.countdownEvents)
      ? normalizeCountdownEvents(aiResult.countdownEvents)
      : [];
    return candidate;
  }
}

class DataValidator {
  validate(candidate) {
    const errors = [];
    if (!candidate || typeof candidate !== 'object') {
      errors.push('AI 沒有回傳有效的課表資料。');
      return { valid: false, errors };
    }
    const hasCountdown=Array.isArray(candidate.countdownEvents)&&candidate.countdownEvents.length>0;
    const hasClasses=Object.keys(candidate.teacherDB||{}).length>0;
    if (!hasClasses&&!hasCountdown) errors.push('沒有辨識到課程或倒數日期。');
    if (!Array.isArray(candidate.bellTimes)) errors.push('節次時間資料格式不正確。');
    if (candidate.bellTimes?.some(time => !Array.isArray(time) || time.length !== 2 || !/^\d{2}:\d{2}$/.test(time[0]) || !/^\d{2}:\d{2}$/.test(time[1]) || time[0] >= time[1])) errors.push('部分節次時間格式不正確。');
    if (!candidate.weeklySchedule || Object.values(candidate.weeklySchedule).some(day => !Array.isArray(day))) errors.push('課表資料格式不正確。');
    return { valid: errors.length === 0, errors };
  }
}

class ImportPreview {
  constructor(root, onImport) {
    this.root = root;
    this.onImport = onImport;
  }

  render(candidate, validation) {
    this.root.hidden = false;
    const teacherDB = candidate.teacherDB || {};
    const bellTimes = Array.isArray(candidate.bellTimes) ? candidate.bellTimes : [];
    const breakTimes = Array.isArray(candidate.breakTimes) ? candidate.breakTimes : [];
    const classRecords = Object.entries(teacherDB);
    const recognizedBlocks = candidate.recognizedBlocks || [];
    const assignmentBySlot = new Map(recognizedBlocks.map(block => [`${block.day}:${block.period}`, block.assignment?.key || '']));

    const previewTemplate = document.getElementById('ocr-preview-template');
    this.root.replaceChildren(previewTemplate.content.cloneNode(true));
    this.root.querySelector('[data-ocr-preview-meta]').textContent = '請確認並視需要修改下方內容，再按下方按鈕匯入。';

    const bellList = this.root.querySelector('[data-ocr-bell-list]');
    bellTimes.forEach((time, index) => {
      const row = document.getElementById('ocr-bell-row-template').content.cloneNode(true);
      row.querySelector('.bell-num').textContent = index + 1;
      row.querySelector('[data-field="bell-start"]').value = time[0] || '';
      row.querySelector('[data-field="bell-end"]').value = time[1] || '';
      bellList.appendChild(row);
    });

    const breakList = this.root.querySelector('[data-ocr-break-list]');
    const breakFold = this.root.querySelector('[data-ocr-break-fold]');
    if (breakFold && !breakTimes.length) breakFold.remove();
    breakTimes.forEach(item => {
      const row = document.getElementById('ocr-break-row-template').content.cloneNode(true);
      row.querySelector('.break-name').value = item.name || '午休';
      row.querySelector('.break-start').value = item.start || '';
      row.querySelector('.break-end').value = item.end || '';
      breakList.appendChild(row);
    });
    const bellFold = this.root.querySelector('[data-ocr-bell-fold]');
    if (bellFold && !bellTimes.length) bellFold.remove();

    const classList = this.root.querySelector('[data-ocr-class-list]');
    const subjectCounts = {};
    classRecords.forEach(([, value]) => { subjectCounts[value[0]] = (subjectCounts[value[0]]||0)+1 });
    classRecords.forEach(([key, value]) => {
      const row = document.getElementById('ocr-class-row-template').content.cloneNode(true);
      const card = row.querySelector('.ocr-import-class-card');
      card.dataset.origKey = key;
      row.querySelector('[data-field="class-subject"]').value = value[0] || '';
      row.querySelector('.tc-teacher').value = value[1] || '';
      row.querySelector('.tc-location').value = candidate.locationDB?.[key] || '';
      updateTeacherCardAvatar(card);
      classList.appendChild(row);
    });
    const classFold = this.root.querySelector('[data-ocr-class-fold]');
    if (classFold && !classRecords.length) classFold.remove();

    const weekdayLabels = { 0: '週日', 1: '週一', 2: '週二', 3: '週三', 4: '週四', 5: '週五', 6: '週六' };
    const weeklySchedule = candidate.weeklySchedule || {};
    const extraDays = [6, 0].filter(day => (weeklySchedule[day] || []).some(Boolean));
    const days = [1, 2, 3, 4, 5, ...extraDays];
    const assignmentGrid = this.root.querySelector('[data-ocr-assignment-grid]');
    days.forEach(day => {
      const row = document.getElementById('ocr-day-row-template').content.cloneNode(true);
      row.querySelector('.schedule-day-row').dataset.day = day;
      row.querySelector('.schedule-day-label').textContent = weekdayLabels[day];
      const periods = row.querySelector('.schedule-periods');
      bellTimes.forEach((time, period) => {
        const select = document.createElement('select');
        select.className = 'period-select';
        select.dataset.assignmentDay = day;
        select.dataset.assignmentPeriod = period;
        select.title = time.join('–');
        select.appendChild(new Option('-', ''));
        classRecords.forEach(([key, value]) => select.appendChild(new Option(formatClassLabel(value[0], value[1], subjectCounts[value[0]]>1), key)));
        select.value = assignmentBySlot.get(`${day}:${period}`) || '';
        periods.appendChild(select);
      });
      assignmentGrid.appendChild(row);
    });
    const assignmentFold = this.root.querySelector('[data-ocr-assignment-fold]');
    if (assignmentFold && (!bellTimes.length || !classRecords.length)) assignmentFold.remove();

    const countdownEvents = Array.isArray(candidate.countdownEvents) ? candidate.countdownEvents : [];
    const countdownFold = this.root.querySelector('[data-ocr-countdown-fold]');
    if (countdownEvents.length) {
      const countdownList = this.root.querySelector('[data-ocr-countdown-list]');
      countdownEvents.forEach(item => {
        const row = document.getElementById('ocr-countdown-row-template').content.cloneNode(true);
        row.querySelector('.ocr-countdown-name').value = item.name || '';
        const startInput = row.querySelector('.ocr-countdown-start');
        const endInput = row.querySelector('.ocr-countdown-end');
        startInput.value = item.startDate || item.date || '';
        endInput.value = item.endDate || item.date || '';
        startInput.addEventListener('change', () => {
          if (!endInput.value || endInput.value < startInput.value) endInput.value = startInput.value;
        });
        countdownList.appendChild(row);
      });
    } else if (countdownFold) {
      countdownFold.remove();
    }

    this.root.querySelector('[data-ocr-preview-note]').textContent = validation.valid
      ? '請確認以上內容無誤，再按下方按鈕匯入。'
      : validation.errors.join('');
    this.root.querySelector('[data-ocr-submit]').hidden = !validation.valid;

    const refreshAssignmentOptions = () => {
      const cards = Array.from(this.root.querySelectorAll('.ocr-import-class-card'));
      const rows = cards.map(card => ({
        key: card.dataset.origKey || '',
        subject: (card.querySelector('[data-field="class-subject"]')?.value || '').trim(),
        teacher: (card.querySelector('.tc-teacher')?.value || '').trim()
      })).filter(row => row.key && row.subject);
      const liveSubjectCounts = {};
      rows.forEach(row => { liveSubjectCounts[row.subject] = (liveSubjectCounts[row.subject]||0)+1 });
      const options = rows.map(row => ({ key: row.key, label: formatClassLabel(row.subject, row.teacher, liveSubjectCounts[row.subject]>1) }));
      this.root.querySelectorAll('[data-assignment-day]').forEach(select => {
        const current = select.value;
        select.replaceChildren(new Option('-', ''));
        options.forEach(option => select.appendChild(new Option(option.label, option.key)));
        select.value = options.some(option => option.key === current) ? current : '';
      });
    };
    this.root.querySelectorAll('.ocr-import-class-card input').forEach(input => input.addEventListener('input', () => {
      const card = input.closest('.ocr-import-class-card');
      if (card) updateTeacherCardAvatar(card);
      refreshAssignmentOptions();
    }));

    this.root.querySelector('[data-ocr-submit]')?.addEventListener('click', () => {
      const edited = { bellTimes: [], breakTimes: [], teacherDB: {}, locationDB: {}, teacherOrder: [], weeklySchedule: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, reverseWeek: candidate.reverseWeek === true };

      this.root.querySelectorAll('[data-ocr-bell-list] .bell-row').forEach(item => {
        const start = (item.querySelector('[data-field="bell-start"]')?.value || '').trim();
        const end = (item.querySelector('[data-field="bell-end"]')?.value || '').trim();
        if (start && end) edited.bellTimes.push([start, end]);
      });

      this.root.querySelectorAll('[data-ocr-break-list] .break-row').forEach(item => {
        const name = (item.querySelector('.break-name')?.value || '').trim() || '午休';
        const start = (item.querySelector('.break-start')?.value || '').trim();
        const end = (item.querySelector('.break-end')?.value || '').trim();
        if (start && end) edited.breakTimes.push({ name, start, end });
      });

      this.root.querySelectorAll('.ocr-import-class-card').forEach(card => {
        const key = (card.dataset.origKey || '').trim();
        const subject = (card.querySelector('[data-field="class-subject"]')?.value || '').trim();
        if (!key || !subject) return;
        const teacher=(card.querySelector('.tc-teacher')?.value || '').trim();
        const location=(card.querySelector('.tc-location')?.value || '').trim();
        edited.teacherDB[key] = [subject, teacher, location];
        edited.locationDB[key] = location;
        edited.teacherOrder.push(key);
      });

      this.root.querySelectorAll('[data-assignment-day]').forEach(select => {
        const day = Number(select.dataset.assignmentDay);
        const period = Number(select.dataset.assignmentPeriod);
        const key = select.value.trim();
        if (key && edited.teacherDB[key]) edited.weeklySchedule[day][period] = key;
      });

      const countdownEvents = [];
      this.root.querySelectorAll('[data-ocr-countdown-list] .bell-row').forEach(item => {
        const name = (item.querySelector('.ocr-countdown-name')?.value || '').trim();
        const startDate = (item.querySelector('.ocr-countdown-start')?.value || '').trim();
        const endDate = (item.querySelector('.ocr-countdown-end')?.value || '').trim();
        if (name && startDate) countdownEvents.push({ name, startDate, endDate: endDate || startDate });
      });
      edited.countdownEvents = countdownEvents;

      this.onImport?.(edited);
    });
  }
}

function mountOCRImporter({ input, runButton, imagePreview, status, result, onImport }) {
  const preprocessor = new ImagePreprocessor();
  const validator = new DataValidator();
  const aiProcessor = new AIVisionProcessor();
  const preview = new ImportPreview(result, onImport);
  let source = null;

  async function loadFile(file) {
    try {
      source = await preprocessor.process(file);
      imagePreview.src = URL.createObjectURL(file);
      imagePreview.hidden = false;
      imagePreview.parentElement?.classList.add('has-image');
      runButton.disabled = false;
      status('已載入圖片，點擊匯入讓 AI 自動判讀課表。');
    } catch (error) {
      status(error.message, true);
    }
  }

  runButton.addEventListener('click', async () => {
    if (!source) return;
    let apiKey = getStoredGeminiApiKey();
    if (!apiKey) {
      apiKey = await promptGeminiApiKey();
      if (!apiKey) return;
    }
    runButton.disabled = true;
    isOcrProcessing = true;
    try {
      const workingCanvas = capCanvasDimension(source.canvas, 1600);

      status('準備圖片中…');
      const { candidate, modelUsed } = await aiProcessor.recognizeSchedule(workingCanvas, apiKey, (message) => status(message));
      status('正在驗證課表資料…');
      const validation = validator.validate(candidate);

      status(validation.valid ? `課表辨識完成（模型：${modelUsed}），請確認下方內容後進行匯入。` : (validation.errors.join('') || 'AI 辨識結果不完整，請手動修正後再匯入。'));
      preview.render(candidate, validation);
    } catch (error) {
      status(error.message, true);
    } finally {
      runButton.disabled = false;
      isOcrProcessing = false;
    }
  });

  return { loadFile };
}

// Shows a one-time modal asking for the Gemini API key; resolves with the trimmed key, or '' if cancelled.
function promptGeminiApiKey() {
  return new Promise(resolve => {
    const overlay = document.getElementById('ocr-apikey-overlay');
    const sheet = document.getElementById('ocr-apikey-sheet');
    const keyInput = document.getElementById('ocr-apikey-input');
    const confirmBtn = document.getElementById('ocr-apikey-confirm');
    const cancelBtn = document.getElementById('ocr-apikey-cancel');

    function close(result) {
      overlay.classList.remove('show');
      sheet.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.onclick = null;
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    }

    function confirm() {
      const key = keyInput.value.trim();
      if (!key) { keyInput.focus(); return; }
      setStoredGeminiApiKey(key);
      close(key);
    }

    keyInput.value = '';
    confirmBtn.onclick = confirm;
    cancelBtn.onclick = () => close('');
    overlay.onclick = () => close('');
    keyInput.onkeydown = event => { if (event.key === 'Enter') confirm(); };
    overlay.classList.add('show');
    sheet.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => keyInput.focus());
  });
}

// Load the importer only when the image-import control is first used.
let ocrImporterPromise;
let ocrImporterController;
function activateOCRImporter() {
  if (ocrImporterPromise) return ocrImporterPromise;
  const input=document.getElementById('ocr-import-image');
  const runButton=document.getElementById('ocr-import-detect');
  const imagePreview=document.getElementById('ocr-import-image-preview');
  const statusElement=document.getElementById('ocr-import-status');
  const result=document.getElementById('ocr-import-result');
  if (!input||!runButton||!imagePreview||!statusElement||!result) return Promise.resolve();
  ocrImporterPromise=new Promise((resolve,reject)=>{
    const config={
      input,
      runButton,
      imagePreview,
      result,
      onImport:data=> {
        try {
          const imported=normalizeSettingsData({
            ...data,
            // AI recognition has no knowledge of the app's visual theme or
            // existing named breaks; retain those editor settings on import.
            breakTimes:(Array.isArray(data.breakTimes)&&data.breakTimes.length)
              ?data.breakTimes
              :settingsDataForExport().breakTimes,
            // A photo recognized with no classes (e.g. one taken just for a countdown date)
            // carries no real signal about odd/even week orientation — keep the existing
            // setting instead of silently resetting it to the AI's unset default.
            reverseWeek:Object.keys(data.teacherDB||{}).length?data.reverseWeek:settingsDataForExport().reverseWeek,
            proAccent:settingsDataForExport().proAccent,
            proSecondary:settingsDataForExport().proSecondary,
            proTertiary:settingsDataForExport().proTertiary,
            styleSlots:settingsDataForExport().styleSlots
          });
          beginEditorImport(settingsDataForExport(),imported,{preserveStyle:true});
        } catch (error) {
          statusElement.textContent=`匯入預覽失敗：${error.message||error}`;
          statusElement.classList.add('error');
        }
      },
      status:(message,error=false)=>{statusElement.textContent=message;statusElement.classList.toggle('error',error)}
    };
    if (typeof mountOCRImporter !== 'function') {
      reject(new Error('OCR importer did not initialize.'));
      return;
    }
    resolve(mountOCRImporter(config));
  }).then(controller=>{ocrImporterController=controller;return controller});
  return ocrImporterPromise;
}
const ocrImageInput=document.getElementById('ocr-import-image');
const ocrImageFilename=document.getElementById('ocr-import-filename');
ocrImageInput?.addEventListener('pointerdown',activateOCRImporter,{once:true});
ocrImageInput?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  if (ocrImageFilename) ocrImageFilename.textContent=file?.name||'尚未選擇檔案';
  const controller=ocrImporterController||await activateOCRImporter();
  await controller?.loadFile(file);
});
