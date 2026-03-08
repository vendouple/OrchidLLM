import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
import {
  fetchFile,
  toBlobURL,
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

const MAX_HISTORY_ITEMS = 3;
const MAX_SUMMARIES_PER_DAY = 2;
const MAX_CLIP_SECONDS = 5 * 60;
const TRANSCRIPTION_MODEL = "whisper-large-v3";
const SUMMARY_MODEL = "gemini-fast";
const FFMPEG_CORE_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

const SUPPORTED_EXTENSIONS = new Set([
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".wav",
  ".webm",
]);

const TERMINAL_STATUSES = new Set(["completed", "error", "interrupted"]);

const STORAGE_KEYS = {
  history: "onescriber-history-v1",
  theme: "onescriber-theme-v1",
  summaryQuota: "onescriber-summary-quota-v1",
  activeTask: "onescriber-active-task-v1",
  sessionId: "onescriber-session-id-v1",
  uiState: "onescriber-ui-state-v1",
};

const runtimeConfig = window.ONESCRIBER_CONFIG || {};

const API_CONFIG = {
  directApiKey: runtimeConfig.apiKey || "",
  directTranscribeUrl:
    runtimeConfig.directTranscribeUrl ||
    "https://gen.pollinations.ai/v1/audio/transcriptions",
  directSummaryUrl:
    runtimeConfig.directSummaryUrl ||
    "https://gen.pollinations.ai/v1/chat/completions",
  transcribeProxyUrl: runtimeConfig.transcribeUrl || "/api/transcribe",
  summarizeProxyUrl: runtimeConfig.summarizeUrl || "/api/summarize",
};

const state = {
  theme: "dark",
  sessionId: "",
  sourceMode: "upload",
  history: [],
  activeEntryId: null,
  activeTask: null,
  selectedFile: null,
  selectedFileInfo: null,
  youtubeInfo: null,
  isBusy: false,
  toastTimerId: null,
  ffmpeg: null,
  ffmpegPromise: null,
  youtubeApiPromise: null,
  youtubePlayerPromise: null,
};

const dom = {
  body: document.body,
  themeToggle: document.querySelector("#theme-toggle"),
  sessionId: document.querySelector("#session-id"),
  summaryQuota: document.querySelector("#summary-quota"),
  transportCopy: document.querySelector("#transport-copy"),
  tabUpload: document.querySelector("#tab-upload"),
  tabYoutube: document.querySelector("#tab-youtube"),
  panelUpload: document.querySelector("#panel-upload"),
  panelYoutube: document.querySelector("#panel-youtube"),
  fileInput: document.querySelector("#file-input"),
  dropzone: document.querySelector("#dropzone"),
  fileMeta: document.querySelector("#file-meta"),
  youtubeUrl: document.querySelector("#youtube-url"),
  inspectYoutube: document.querySelector("#inspect-youtube"),
  youtubeMeta: document.querySelector("#youtube-meta"),
  transcribeButton: document.querySelector("#transcribe-button"),
  statusPhase: document.querySelector("#status-phase"),
  statusSource: document.querySelector("#status-source"),
  statusMessage: document.querySelector("#status-message"),
  resultMeta: document.querySelector("#result-meta"),
  transcriptOutput: document.querySelector("#transcript-output"),
  downloadTranscript: document.querySelector("#download-transcript"),
  summarizeButton: document.querySelector("#summarize-button"),
  summaryOutput: document.querySelector("#summary-output"),
  historyList: document.querySelector("#history-list"),
  trimDialog: document.querySelector("#trim-dialog"),
  trimDescription: document.querySelector("#trim-description"),
  trimStart: document.querySelector("#trim-start"),
  trimEnd: document.querySelector("#trim-end"),
  trimFeedback: document.querySelector("#trim-feedback"),
  trimApply: document.querySelector("#trim-apply"),
  toast: document.querySelector("#toast"),
  youtubeProbe: document.querySelector("#youtube-probe"),
};

initialize();

function initialize() {
  restoreTheme();
  restoreSessionId();
  restoreHistory();
  restoreUiState();
  restoreActiveTask();
  finalizeAbandonedTasks();
  bindEvents();
  updateTransportCopy();
  renderSummaryQuota();
  renderSourceMode();
  renderFileMeta();
  renderYoutubeMeta();
  renderStatus();
  renderHistory();
  renderActiveEntry();
}

function bindEvents() {
  dom.themeToggle.addEventListener("click", handleThemeToggle);
  dom.tabUpload.addEventListener("click", () => setSourceMode("upload"));
  dom.tabYoutube.addEventListener("click", () => setSourceMode("youtube"));
  dom.fileInput.addEventListener("change", handleFileSelection);
  dom.inspectYoutube.addEventListener("click", handleInspectYoutube);
  dom.transcribeButton.addEventListener("click", handleTranscribe);
  dom.downloadTranscript.addEventListener("click", handleDownloadTranscript);
  dom.summarizeButton.addEventListener("click", () => handleSummarize());
  dom.historyList.addEventListener("click", handleHistoryAction);
  dom.youtubeUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleInspectYoutube();
    }
  });
  dom.trimStart.addEventListener("input", validateTrimDialog);
  dom.trimEnd.addEventListener("input", validateTrimDialog);
  dom.trimDialog.addEventListener("close", handleTrimDialogClose);

  ["dragenter", "dragover"].forEach((eventName) => {
    dom.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dom.dropzone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dom.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dom.dropzone.classList.remove("is-dragging");
    });
  });

  dom.dropzone.addEventListener("drop", async (event) => {
    const [file] = [...(event.dataTransfer?.files || [])];
    if (!file) {
      return;
    }

    dom.fileInput.files = event.dataTransfer.files;
    await setSelectedFile(file);
  });
}

function restoreTheme() {
  const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  const preferred =
    storedTheme ||
    (window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark");
  setTheme(preferred, false);
}

function restoreSessionId() {
  const existing = sessionStorage.getItem(STORAGE_KEYS.sessionId);
  state.sessionId = existing || crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId);
  dom.sessionId.textContent = state.sessionId.slice(0, 12);
}

function restoreHistory() {
  const history = readJson(localStorage.getItem(STORAGE_KEYS.history), []);
  state.history = Array.isArray(history)
    ? history.map(normalizeHistoryEntry).slice(0, MAX_HISTORY_ITEMS)
    : [];
  state.activeEntryId = state.history[0]?.id || null;
}

function restoreUiState() {
  const uiState = readJson(sessionStorage.getItem(STORAGE_KEYS.uiState), {});
  if (uiState?.sourceMode === "youtube") {
    state.sourceMode = "youtube";
  }
  if (uiState?.youtubeUrl) {
    dom.youtubeUrl.value = uiState.youtubeUrl;
  }
}

function restoreActiveTask() {
  const task = readJson(sessionStorage.getItem(STORAGE_KEYS.activeTask), null);
  if (!task) {
    return;
  }

  state.activeTask = { ...task, restored: true };
  if (task.entryId) {
    state.activeEntryId = task.entryId;
  }
}

function finalizeAbandonedTasks() {
  if (state.activeTask) {
    return;
  }

  let didUpdate = false;
  state.history = state.history.map((entry) => {
    if (TERMINAL_STATUSES.has(entry.status)) {
      return entry;
    }

    didUpdate = true;
    return {
      ...entry,
      status: "interrupted",
      errorMessage:
        entry.errorMessage ||
        "The last run ended before the result returned. Start it again to continue.",
    };
  });

  if (didUpdate) {
    persistHistory();
  }
}

function handleThemeToggle() {
  setTheme(state.theme === "dark" ? "light" : "dark", true);
}

function setTheme(theme, persist) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  if (persist) {
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
  }
}

function setSourceMode(mode) {
  state.sourceMode = mode === "youtube" ? "youtube" : "upload";
  persistUiState();
  renderSourceMode();
  renderStatus();
}

function renderSourceMode() {
  const isUpload = state.sourceMode === "upload";
  dom.tabUpload.classList.toggle("is-active", isUpload);
  dom.tabYoutube.classList.toggle("is-active", !isUpload);
  dom.tabUpload.setAttribute("aria-selected", String(isUpload));
  dom.tabYoutube.setAttribute("aria-selected", String(!isUpload));
  dom.panelUpload.hidden = !isUpload;
  dom.panelYoutube.hidden = isUpload;
}

async function handleFileSelection(event) {
  const [file] = [...(event.target.files || [])];
  await setSelectedFile(file || null);
}

async function setSelectedFile(file) {
  state.selectedFile = null;
  state.selectedFileInfo = null;

  if (!file) {
    renderFileMeta();
    return;
  }

  const extension = getFileExtension(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    showToast(
      "Unsupported file type. Use mp3, mp4, mpeg, mpga, m4a, wav, or webm.",
      true,
    );
    dom.fileInput.value = "";
    renderFileMeta();
    return;
  }

  updateStatusCard({
    phase: "Inspecting",
    source: file.name,
    message: "Reading media metadata locally before upload.",
  });

  try {
    const durationSeconds = await loadMediaDuration(file);
    state.selectedFile = file;
    state.selectedFileInfo = {
      name: file.name,
      type: file.type || guessMimeTypeFromExtension(extension),
      size: file.size,
      extension,
      durationSeconds,
      isOverLimit: durationSeconds > MAX_CLIP_SECONDS,
    };
    renderFileMeta();
    persistUiState();
    updateStatusCard({
      phase: "Ready",
      source: file.name,
      message:
        durationSeconds > MAX_CLIP_SECONDS
          ? "This file is over five minutes. A clip picker will open when you start transcription."
          : "File is ready for transcription.",
    });
  } catch (error) {
    const message = getErrorMessage(error, "Could not inspect this file.");
    showToast(message, true);
    updateStatusCard({
      phase: "Error",
      source: file.name,
      message,
      isError: true,
    });
    renderFileMeta();
  }
}

async function handleInspectYoutube() {
  const url = dom.youtubeUrl.value.trim();
  if (!url) {
    showToast("Paste a YouTube link first.", true);
    return;
  }

  updateStatusCard({
    phase: "Inspecting",
    source: "YouTube",
    message: "Reading YouTube metadata in the browser.",
  });

  try {
    const youtubeInfo = await inspectYoutubeUrl(url);
    state.youtubeInfo = youtubeInfo;
    persistUiState();
    renderYoutubeMeta();
    updateStatusCard({
      phase: "Ready",
      source: youtubeInfo.title || youtubeInfo.videoId,
      message:
        youtubeInfo.durationSeconds > MAX_CLIP_SECONDS
          ? "This video is over five minutes. A clip picker will open before transcription."
          : "YouTube link is ready for transcription.",
    });
  } catch (error) {
    const message = getErrorMessage(
      error,
      "Could not read YouTube metadata for that link.",
    );
    state.youtubeInfo = null;
    renderYoutubeMeta();
    updateStatusCard({
      phase: "Error",
      source: "YouTube",
      message,
      isError: true,
    });
    showToast(message, true);
  }
}

async function handleTranscribe() {
  if (state.isBusy) {
    return;
  }

  const source = await resolveCurrentSource();
  if (!source) {
    return;
  }

  let clipRange = null;
  if (source.durationSeconds > MAX_CLIP_SECONDS) {
    clipRange = await openTrimDialog({
      label: source.label,
      durationSeconds: source.durationSeconds,
    });

    if (!clipRange) {
      updateStatusCard({
        phase: "Cancelled",
        source: source.label,
        message: "No clip was selected.",
      });
      return;
    }
  }

  const entry = createHistoryEntry({ source, clipRange });
  upsertHistoryEntry(entry);
  state.activeEntryId = entry.id;
  setBusyState(true);
  persistHistory();
  renderHistory();
  renderActiveEntry();

  try {
    let transcriptText = "";

    if (source.kind === "upload") {
      updateTask(entry.id, {
        phase: clipRange ? "Preparing clip" : "Uploading",
        source: source.label,
        message: clipRange
          ? "Trimming the selected range in your browser before upload."
          : "Sending the file for transcription.",
      });
      const preparedFile = await prepareUploadFile(source.file, clipRange);
      updateEntryStatus(entry.id, "transcribing");
      renderHistory();
      renderActiveEntry();
      transcriptText = await transcribeUploadedFile(
        preparedFile,
        source,
        clipRange,
      );
    } else {
      updateTask(entry.id, {
        phase: "Transcribing",
        source: source.label,
        message:
          "Sending the YouTube link and clip window to the configured transcription endpoint.",
      });
      updateEntryStatus(entry.id, "transcribing");
      renderHistory();
      renderActiveEntry();
      transcriptText = await transcribeYoutubeSource(source, clipRange);
    }

    const completedEntry = updateEntry(entry.id, {
      status: "completed",
      transcript: transcriptText,
      errorMessage: "",
      completedAt: new Date().toISOString(),
    });

    clearActiveTask();
    renderHistory();
    renderActiveEntry();
    updateStatusCard({
      phase: "Completed",
      source: source.label,
      message: "Transcript is ready.",
    });
    showToast(`Transcript ready for ${completedEntry.title}.`);
  } catch (error) {
    const message = getErrorMessage(error, "The transcription request failed.");
    updateEntry(entry.id, {
      status: "error",
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
    clearActiveTask();
    renderHistory();
    renderActiveEntry();
    updateStatusCard({
      phase: "Error",
      source: source.label,
      message,
      isError: true,
    });
    showToast(message, true);
  } finally {
    setBusyState(false);
  }
}

async function resolveCurrentSource() {
  if (state.sourceMode === "upload") {
    if (!state.selectedFile || !state.selectedFileInfo) {
      showToast("Choose a media file first.", true);
      return null;
    }

    return {
      kind: "upload",
      label: state.selectedFileInfo.name,
      title: state.selectedFileInfo.name,
      durationSeconds: state.selectedFileInfo.durationSeconds,
      file: state.selectedFile,
      mimeType: state.selectedFileInfo.type,
      extension: state.selectedFileInfo.extension,
    };
  }

  if (
    !state.youtubeInfo ||
    state.youtubeInfo.url !== dom.youtubeUrl.value.trim()
  ) {
    await handleInspectYoutube();
  }

  if (!state.youtubeInfo) {
    return null;
  }

  return {
    kind: "youtube",
    label: state.youtubeInfo.title || state.youtubeInfo.videoId,
    title: state.youtubeInfo.title || state.youtubeInfo.videoId,
    durationSeconds: state.youtubeInfo.durationSeconds,
    youtubeUrl: state.youtubeInfo.url,
    videoId: state.youtubeInfo.videoId,
  };
}

async function prepareUploadFile(file, clipRange) {
  if (!clipRange) {
    return file;
  }

  const ffmpeg = await ensureFfmpegLoaded();
  const inputName = `input-${crypto.randomUUID()}${getFileExtension(file.name)}`;
  const outputName = `clip-${crypto.randomUUID()}.wav`;
  const args = [
    "-ss",
    String(clipRange.startSeconds),
    "-to",
    String(clipRange.endSeconds),
    "-i",
    inputName,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    outputName,
  ];

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  await ffmpeg.exec(args);
  const outputData = await ffmpeg.readFile(outputName);
  await safeDeleteFfmpegFile(ffmpeg, inputName);
  await safeDeleteFfmpegFile(ffmpeg, outputName);

  const clipBlob = new Blob([outputData.buffer], { type: "audio/wav" });
  return new File([clipBlob], `${stripExtension(file.name)}-clip.wav`, {
    type: "audio/wav",
  });
}

async function ensureFfmpegLoaded() {
  if (state.ffmpeg) {
    return state.ffmpeg;
  }

  if (!state.ffmpegPromise) {
    state.ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      updateStatusCard({
        phase: "Preparing clip",
        source: getActiveEntry()?.title || "Upload",
        message: "Loading the in-browser clip processor.",
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
          "text/javascript",
        ),
        wasmURL: await toBlobURL(
          `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
          "application/wasm",
        ),
      });
      state.ffmpeg = ffmpeg;
      return ffmpeg;
    })();
  }

  return state.ffmpegPromise;
}

async function safeDeleteFfmpegFile(ffmpeg, fileName) {
  try {
    await ffmpeg.deleteFile(fileName);
  } catch (error) {
    console.warn(`Could not delete temporary FFmpeg file ${fileName}.`, error);
  }
}

async function transcribeUploadedFile(file, source, clipRange) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("model", TRANSCRIPTION_MODEL);
  formData.append("sessionId", state.sessionId);
  formData.append("sourceType", "upload");
  if (clipRange) {
    formData.append("clipStartSeconds", String(clipRange.startSeconds));
    formData.append("clipEndSeconds", String(clipRange.endSeconds));
  }

  const response = await fetch(getTranscribeUrl(), {
    method: "POST",
    headers: buildTranscribeHeaders(),
    body: formData,
  });

  const payload = await parseApiResponse(response, getTranscribeUrl());
  return extractTranscriptText(payload, source.label);
}

async function transcribeYoutubeSource(source, clipRange) {
  const response = await fetch(API_CONFIG.transcribeProxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: TRANSCRIPTION_MODEL,
      sessionId: state.sessionId,
      sourceType: "youtube",
      youtubeUrl: source.youtubeUrl,
      videoId: source.videoId,
      clipStartSeconds: clipRange?.startSeconds ?? 0,
      clipEndSeconds:
        clipRange?.endSeconds ??
        Math.min(source.durationSeconds, MAX_CLIP_SECONDS),
    }),
  });

  const payload = await parseApiResponse(
    response,
    API_CONFIG.transcribeProxyUrl,
  );
  return extractTranscriptText(payload, source.label);
}

async function handleSummarize(entryId = state.activeEntryId) {
  const entry = getHistoryEntry(entryId);
  if (!entry?.transcript) {
    showToast("Choose a completed transcript first.", true);
    return;
  }

  const quota = getSummaryQuota();
  if (quota.count >= MAX_SUMMARIES_PER_DAY) {
    showToast("You have already used both free summaries for today.", true);
    renderSummaryQuota();
    return;
  }

  setBusyState(true);
  updateStatusCard({
    phase: "Summarizing",
    source: entry.title,
    message: "Sending the transcript to gemini-fast.",
  });

  try {
    const summary = await summarizeTranscript(entry.transcript);
    incrementSummaryQuota();
    updateEntry(entry.id, {
      summary,
      summaryUpdatedAt: new Date().toISOString(),
    });
    renderSummaryQuota();
    renderHistory();
    renderActiveEntry();
    updateStatusCard({
      phase: "Completed",
      source: entry.title,
      message: "Summary is ready.",
    });
    showToast("Summary generated.");
  } catch (error) {
    const message = getErrorMessage(error, "Summary generation failed.");
    updateStatusCard({
      phase: "Error",
      source: entry.title,
      message,
      isError: true,
    });
    showToast(message, true);
  } finally {
    setBusyState(false);
  }
}

async function summarizeTranscript(transcript) {
  const prompt = [
    "Summarize the transcript below.",
    "Return plain text with three short sections:",
    "Summary:",
    "Key points:",
    "Action items:",
    "Keep it concise and grounded in the transcript.",
    "Transcript:",
    transcript,
  ].join("\n\n");

  const body = useDirectPollinations()
    ? {
        model: SUMMARY_MODEL,
        messages: [{ role: "user", content: prompt }],
      }
    : {
        model: SUMMARY_MODEL,
        sessionId: state.sessionId,
        transcript,
        prompt,
      };

  const response = await fetch(getSummaryUrl(), {
    method: "POST",
    headers: buildSummaryHeaders(),
    body: JSON.stringify(body),
  });

  const payload = await parseApiResponse(response, getSummaryUrl());
  return extractSummaryText(payload);
}

function handleDownloadTranscript() {
  const entry = getActiveEntry();
  if (!entry?.transcript) {
    return;
  }

  const content = [
    `Title: ${entry.title}`,
    `Created: ${formatDateTime(entry.createdAt)}`,
    `Source: ${entry.sourceMode}`,
    `Duration: ${formatDuration(entry.durationSeconds)}`,
    entry.clipStartSeconds != null && entry.clipEndSeconds != null
      ? `Clip: ${formatDuration(entry.clipStartSeconds)} - ${formatDuration(entry.clipEndSeconds)}`
      : null,
    "",
    entry.transcript,
  ]
    .filter(Boolean)
    .join("\n");

  downloadTextFile(`${safeSlug(entry.title)}-transcript.txt`, content);
}

function handleHistoryAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const entryId = button.dataset.entryId;
  const action = button.dataset.action;
  if (!entryId || !action) {
    return;
  }

  if (action === "activate") {
    state.activeEntryId = entryId;
    renderHistory();
    renderActiveEntry();
    return;
  }

  if (action === "download") {
    state.activeEntryId = entryId;
    renderHistory();
    renderActiveEntry();
    handleDownloadTranscript();
    return;
  }

  if (action === "summarize") {
    state.activeEntryId = entryId;
    renderHistory();
    renderActiveEntry();
    handleSummarize(entryId);
  }
}

function createHistoryEntry({ source, clipRange }) {
  return normalizeHistoryEntry({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    completedAt: null,
    title: source.title,
    sourceMode: source.kind,
    sourceLabel: source.label,
    durationSeconds: source.durationSeconds,
    clipStartSeconds: clipRange?.startSeconds ?? null,
    clipEndSeconds: clipRange?.endSeconds ?? null,
    status: "preparing",
    transcript: "",
    summary: "",
    errorMessage: "",
  });
}

function normalizeHistoryEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    createdAt: entry.createdAt || new Date().toISOString(),
    completedAt: entry.completedAt || null,
    title: entry.title || entry.sourceLabel || "Untitled transcript",
    sourceMode: entry.sourceMode === "youtube" ? "youtube" : "upload",
    sourceLabel: entry.sourceLabel || entry.title || "Source",
    durationSeconds: Number(entry.durationSeconds) || 0,
    clipStartSeconds:
      entry.clipStartSeconds == null ? null : Number(entry.clipStartSeconds),
    clipEndSeconds:
      entry.clipEndSeconds == null ? null : Number(entry.clipEndSeconds),
    status: entry.status || "completed",
    transcript: entry.transcript || "",
    summary: entry.summary || "",
    summaryUpdatedAt: entry.summaryUpdatedAt || null,
    errorMessage: entry.errorMessage || "",
  };
}

function upsertHistoryEntry(entry) {
  const filtered = state.history.filter((item) => item.id !== entry.id);
  state.history = [entry, ...filtered].slice(0, MAX_HISTORY_ITEMS);
  persistHistory();
}

function updateEntry(entryId, patch) {
  let updatedEntry = null;
  state.history = state.history.map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }

    updatedEntry = normalizeHistoryEntry({ ...entry, ...patch });
    return updatedEntry;
  });
  persistHistory();
  return updatedEntry;
}

function updateEntryStatus(entryId, status) {
  updateEntry(entryId, { status });
}

function getHistoryEntry(entryId) {
  return state.history.find((entry) => entry.id === entryId) || null;
}

function getActiveEntry() {
  return getHistoryEntry(state.activeEntryId) || state.history[0] || null;
}

function persistHistory() {
  localStorage.setItem(
    STORAGE_KEYS.history,
    JSON.stringify(state.history.slice(0, MAX_HISTORY_ITEMS)),
  );
}

function persistUiState() {
  sessionStorage.setItem(
    STORAGE_KEYS.uiState,
    JSON.stringify({
      sourceMode: state.sourceMode,
      youtubeUrl: dom.youtubeUrl.value.trim(),
    }),
  );
}

function setBusyState(isBusy) {
  state.isBusy = isBusy;
  dom.transcribeButton.disabled = isBusy;
  dom.summarizeButton.disabled = isBusy || !getActiveEntry()?.transcript;
  dom.downloadTranscript.disabled = !getActiveEntry()?.transcript;
}

function updateTask(entryId, task) {
  state.activeTask = {
    entryId,
    updatedAt: new Date().toISOString(),
    ...task,
  };
  sessionStorage.setItem(
    STORAGE_KEYS.activeTask,
    JSON.stringify(state.activeTask),
  );
  updateStatusCard(task);
}

function clearActiveTask() {
  state.activeTask = null;
  sessionStorage.removeItem(STORAGE_KEYS.activeTask);
}

function updateStatusCard({ phase, source, message, isError = false }) {
  dom.statusPhase.textContent = phase;
  dom.statusSource.textContent = source;
  dom.statusMessage.textContent = message;
  dom.statusMessage.classList.toggle("is-error", Boolean(isError));
}

function renderStatus() {
  if (state.activeTask) {
    updateStatusCard({
      phase: state.activeTask.phase,
      source: state.activeTask.source,
      message: state.activeTask.restored
        ? `${state.activeTask.message} Last known status restored after refresh.`
        : state.activeTask.message,
    });
    return;
  }

  const activeEntry = getActiveEntry();
  if (activeEntry) {
    updateStatusCard({
      phase: formatStatus(activeEntry.status),
      source: activeEntry.title,
      message:
        activeEntry.status === "error"
          ? activeEntry.errorMessage || "The last run failed."
          : activeEntry.status === "interrupted"
            ? activeEntry.errorMessage
            : activeEntry.transcript
              ? "Ready for download or summary."
              : "Select a source to start a new transcript.",
      isError: activeEntry.status === "error",
    });
    return;
  }

  updateStatusCard({
    phase: "Ready",
    source: state.sourceMode === "upload" ? "Upload media" : "YouTube",
    message: "Choose an upload or a YouTube link to begin.",
  });
}

function renderFileMeta() {
  if (!state.selectedFileInfo) {
    dom.fileMeta.innerHTML = "No file selected yet.";
    return;
  }

  const info = state.selectedFileInfo;
  const clipMessage = info.isOverLimit
    ? "Over the free-tier limit. You will be asked to pick a clip under 5:00."
    : "Fits inside the free-tier limit.";

  dom.fileMeta.innerHTML = `
    <div class="meta-grid">
      <article class="meta-chip">
        <span class="meta-label">File</span>
        <div class="meta-value">${escapeHtml(info.name)}</div>
      </article>
      <article class="meta-chip">
        <span class="meta-label">Duration</span>
        <div class="meta-value">${escapeHtml(formatDuration(info.durationSeconds))}</div>
      </article>
      <article class="meta-chip">
        <span class="meta-label">Size</span>
        <div class="meta-value">${escapeHtml(formatFileSize(info.size))}</div>
      </article>
    </div>
    <p class="history-copy">${escapeHtml(clipMessage)}</p>
  `;
}

function renderYoutubeMeta() {
  if (!state.youtubeInfo) {
    dom.youtubeMeta.innerHTML = "Paste a link, then inspect it.";
    return;
  }

  const info = state.youtubeInfo;
  const clipMessage =
    info.durationSeconds > MAX_CLIP_SECONDS
      ? "This video exceeds 5:00. A clip picker will enforce a shorter range before transcription."
      : "This video is within the free-tier limit.";

  dom.youtubeMeta.innerHTML = `
    <div class="meta-grid">
      <article class="meta-chip">
        <span class="meta-label">Title</span>
        <div class="meta-value">${escapeHtml(info.title || info.videoId)}</div>
      </article>
      <article class="meta-chip">
        <span class="meta-label">Duration</span>
        <div class="meta-value">${escapeHtml(formatDuration(info.durationSeconds))}</div>
      </article>
      <article class="meta-chip">
        <span class="meta-label">Video ID</span>
        <div class="meta-value">${escapeHtml(info.videoId)}</div>
      </article>
    </div>
    <p class="history-copy">${escapeHtml(clipMessage)}</p>
  `;
}

function renderHistory() {
  if (state.history.length === 0) {
    dom.historyList.innerHTML = `
      <div class="empty-state-card">
        Your completed transcripts will appear here.
      </div>
    `;
    return;
  }

  dom.historyList.innerHTML = state.history
    .map((entry) => {
      const isActive = entry.id === getActiveEntry()?.id;
      const summaryButtonDisabled =
        !entry.transcript ||
        state.isBusy ||
        getSummaryQuota().count >= MAX_SUMMARIES_PER_DAY;
      return `
        <article class="history-item">
          <div class="history-head">
            <div>
              <p class="history-title">${escapeHtml(entry.title)}</p>
              <p class="history-copy">${escapeHtml(formatStatus(entry.status))} · ${escapeHtml(formatDateTime(entry.createdAt))}</p>
            </div>
            <span class="status-badge">${escapeHtml(entry.sourceMode)}</span>
          </div>

          <div class="meta-grid">
            <article class="meta-chip">
              <span class="meta-label">Length</span>
              <div class="meta-value">${escapeHtml(formatDuration(entry.durationSeconds))}</div>
            </article>
            <article class="meta-chip">
              <span class="meta-label">Clip</span>
              <div class="meta-value">${escapeHtml(formatClipWindow(entry))}</div>
            </article>
          </div>

          ${entry.errorMessage ? `<p class="history-transcript error-copy">${escapeHtml(entry.errorMessage)}</p>` : ""}
          ${entry.transcript ? `<p class="history-transcript">${escapeHtml(entry.transcript.slice(0, 180))}${entry.transcript.length > 180 ? "…" : ""}</p>` : ""}

          <div class="history-actions">
            <button class="ghost-button" type="button" data-action="activate" data-entry-id="${escapeHtml(entry.id)}">${isActive ? "Viewing" : "Open"}</button>
            <button class="ghost-button" type="button" data-action="download" data-entry-id="${escapeHtml(entry.id)}" ${entry.transcript ? "" : "disabled"}>Download</button>
            <button class="ghost-button" type="button" data-action="summarize" data-entry-id="${escapeHtml(entry.id)}" ${summaryButtonDisabled ? "disabled" : ""}>Summarize</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderActiveEntry() {
  const entry = getActiveEntry();
  dom.downloadTranscript.disabled = !entry?.transcript;
  dom.summarizeButton.disabled =
    state.isBusy ||
    !entry?.transcript ||
    getSummaryQuota().count >= MAX_SUMMARIES_PER_DAY;

  if (!entry) {
    dom.resultMeta.innerHTML = "Completed transcripts will show metadata here.";
    dom.transcriptOutput.value = "";
    dom.summaryOutput.textContent =
      "Each browser gets two summaries per day on the free tier.";
    return;
  }

  dom.resultMeta.innerHTML = `
    <div class="meta-grid">
      <article class="meta-chip">
        <span class="meta-label">Source</span>
        <div class="meta-value">${escapeHtml(entry.sourceMode)}</div>
      </article>
      <article class="meta-chip">
        <span class="meta-label">Recorded</span>
        <div class="meta-value">${escapeHtml(formatDateTime(entry.createdAt))}</div>
      </article>
      <article class="meta-chip">
        <span class="meta-label">Window</span>
        <div class="meta-value">${escapeHtml(formatClipWindow(entry))}</div>
      </article>
    </div>
  `;
  dom.transcriptOutput.value = entry.transcript || "";
  dom.summaryOutput.textContent =
    entry.summary ||
    "Each browser gets two summaries per day on the free tier.";
  renderStatus();
}

function renderSummaryQuota() {
  const quota = getSummaryQuota();
  dom.summaryQuota.textContent = String(
    Math.max(0, MAX_SUMMARIES_PER_DAY - quota.count),
  );
}

function getSummaryQuota() {
  const stored = readJson(
    localStorage.getItem(STORAGE_KEYS.summaryQuota),
    null,
  );
  const dateKey = getLocalDateKey();

  if (!stored || stored.date !== dateKey) {
    return { date: dateKey, count: 0 };
  }

  return {
    date: dateKey,
    count: Number.isFinite(Number(stored.count)) ? Number(stored.count) : 0,
  };
}

function incrementSummaryQuota() {
  const quota = getSummaryQuota();
  const nextQuota = { date: quota.date, count: quota.count + 1 };
  localStorage.setItem(STORAGE_KEYS.summaryQuota, JSON.stringify(nextQuota));
}

function updateTransportCopy() {
  dom.transportCopy.textContent = useDirectPollinations()
    ? "Runtime API key detected. Uploads and summaries can go straight to Pollinations.ai from the browser. YouTube transcription still expects /api/transcribe so a function can resolve and clip the source."
    : "No runtime API key found. The frontend will call /api/transcribe and /api/summarize so Vercel functions can inject the secret later.";
}

function useDirectPollinations() {
  return Boolean(API_CONFIG.directApiKey);
}

function getTranscribeUrl() {
  return useDirectPollinations()
    ? API_CONFIG.directTranscribeUrl
    : API_CONFIG.transcribeProxyUrl;
}

function getSummaryUrl() {
  return useDirectPollinations()
    ? API_CONFIG.directSummaryUrl
    : API_CONFIG.summarizeProxyUrl;
}

function buildTranscribeHeaders() {
  if (!useDirectPollinations()) {
    return { Accept: "application/json" };
  }

  return {
    Authorization: `Bearer ${API_CONFIG.directApiKey}`,
    Accept: "application/json",
  };
}

function buildSummaryHeaders() {
  if (!useDirectPollinations()) {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  return {
    Authorization: `Bearer ${API_CONFIG.directApiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function parseApiResponse(response, url) {
  const rawText = await response.text();
  const payload = tryParseJson(rawText);

  if (!response.ok) {
    throw new Error(buildApiErrorMessage(response, url, payload, rawText));
  }

  return payload ?? rawText;
}

function extractTranscriptText(payload, label) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const text =
    payload?.text ||
    payload?.transcript ||
    payload?.data?.text ||
    payload?.data?.transcript ||
    payload?.result?.text ||
    payload?.result?.transcript;

  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  throw new Error(`No transcript text was returned for ${label}.`);
}

function extractSummaryText(payload) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const direct = payload?.summary || payload?.text || payload?.data?.summary;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("\n").trim();
    }
  }

  throw new Error("No summary text was returned by the API.");
}

function buildApiErrorMessage(response, url, payload, rawText) {
  const message =
    payload?.error?.message ||
    payload?.error ||
    payload?.message ||
    rawText ||
    `Request failed with status ${response.status}.`;

  if (response.status === 404 && url.startsWith("/api/")) {
    return `${message} Configure ${url} as a Vercel function. Direct browser calls with window.ONESCRIBER_CONFIG.apiKey only cover file uploads and summaries; YouTube transcription still needs a server helper.`;
  }

  return String(message).trim();
}

async function inspectYoutubeUrl(url) {
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) {
    throw new Error("That does not look like a valid YouTube URL.");
  }

  const player = await ensureYoutubePlayer();
  player.cueVideoById(videoId);

  const durationSeconds = await waitForYoutubeDuration(player, videoId);
  const title = player.getVideoData?.().title || (await fetchYoutubeTitle(url));
  return {
    url,
    videoId,
    title: title || `YouTube video ${videoId}`,
    durationSeconds,
  };
}

async function ensureYoutubePlayer() {
  if (!state.youtubePlayerPromise) {
    state.youtubePlayerPromise = (async () => {
      const YT = await loadYoutubeApi();
      return new Promise((resolve) => {
        const player = new YT.Player(dom.youtubeProbe, {
          height: "1",
          width: "1",
          playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
          },
          events: {
            onReady: () => resolve(player),
          },
        });
      });
    })();
  }

  return state.youtubePlayerPromise;
}

function loadYoutubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (!state.youtubeApiPromise) {
    state.youtubeApiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () =>
        reject(new Error("The YouTube IFrame API could not be loaded."));
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      document.head.append(script);
    });
  }

  return state.youtubeApiPromise;
}

async function waitForYoutubeDuration(player, videoId) {
  const start = Date.now();

  while (Date.now() - start < 12000) {
    const duration = Number(player.getDuration?.());
    const currentId = player.getVideoData?.().video_id;
    if (currentId === videoId && duration > 0) {
      return duration;
    }
    await wait(250);
  }

  throw new Error(
    "Could not read the YouTube duration in the browser. A server-side metadata helper may be required for this link.",
  );
}

async function fetchYoutubeTitle(url) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!response.ok) {
      return "";
    }
    const payload = await response.json();
    return payload?.title || "";
  } catch (error) {
    return "";
  }
}

function parseYoutubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return url.pathname.slice(1) || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/")[2] || null;
      }
      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/")[2] || null;
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function loadMediaDuration(file) {
  const objectUrl = URL.createObjectURL(file);
  const isVideo =
    file.type.startsWith("video/") || getFileExtension(file.name) === ".mp4";
  const element = document.createElement(isVideo ? "video" : "audio");

  return new Promise((resolve, reject) => {
    element.preload = "metadata";
    element.src = objectUrl;

    element.onloadedmetadata = () => {
      const duration = Number(element.duration);
      URL.revokeObjectURL(objectUrl);
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(
          new Error("This media file does not expose a readable duration."),
        );
        return;
      }
      resolve(duration);
    };

    element.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This file could not be read in the browser."));
    };
  });
}

function openTrimDialog({ label, durationSeconds }) {
  return new Promise((resolve) => {
    dom.trimDescription.textContent = `${label} is ${formatDuration(durationSeconds)} long. Choose a start and end time at or below 5:00.`;
    dom.trimStart.value = "0:00";
    dom.trimEnd.value = formatDuration(
      Math.min(durationSeconds, MAX_CLIP_SECONDS),
    );
    dom.trimDialog.dataset.durationSeconds = String(durationSeconds);
    dom.trimDialog.dataset.resolveId = crypto.randomUUID();
    dom.trimDialog._resolver = resolve;
    validateTrimDialog();
    dom.trimDialog.showModal();
  });
}

function validateTrimDialog() {
  const durationSeconds = Number(dom.trimDialog.dataset.durationSeconds || 0);
  const startSeconds = parseTimestamp(dom.trimStart.value);
  const endSeconds = parseTimestamp(dom.trimEnd.value);

  let error = "";
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    error = "Use mm:ss or hh:mm:ss format.";
  } else if (startSeconds < 0 || endSeconds < 0) {
    error = "Times cannot be negative.";
  } else if (endSeconds <= startSeconds) {
    error = "End time must be greater than start time.";
  } else if (endSeconds > durationSeconds) {
    error = "End time is past the media duration.";
  } else if (endSeconds - startSeconds > MAX_CLIP_SECONDS) {
    error = "Clips must stay at or below 5:00.";
  }

  dom.trimApply.disabled = Boolean(error);
  dom.trimFeedback.textContent = error
    ? error
    : `Clip length: ${formatDuration(endSeconds - startSeconds)}`;
  dom.trimFeedback.classList.toggle("is-error", Boolean(error));
}

function handleTrimDialogClose() {
  const resolver = dom.trimDialog._resolver;
  if (!resolver) {
    return;
  }

  const returnValue = dom.trimDialog.returnValue;
  dom.trimDialog._resolver = null;

  if (returnValue !== "apply") {
    resolver(null);
    return;
  }

  resolver({
    startSeconds: parseTimestamp(dom.trimStart.value),
    endSeconds: parseTimestamp(dom.trimEnd.value),
  });
}

function getLocalDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatStatus(status) {
  switch (status) {
    case "preparing":
      return "Preparing";
    case "transcribing":
      return "Transcribing";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    case "interrupted":
      return "Interrupted";
    default:
      return "Queued";
  }
}

function formatClipWindow(entry) {
  if (entry.clipStartSeconds == null || entry.clipEndSeconds == null) {
    return entry.durationSeconds
      ? `0:00 - ${formatDuration(entry.durationSeconds)}`
      : "Full length";
  }

  return `${formatDuration(entry.clipStartSeconds)} - ${formatDuration(entry.clipEndSeconds)}`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) {
    return "Unknown";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function parseTimestamp(value) {
  const input = String(value || "").trim();
  if (!input) {
    return Number.NaN;
  }

  if (/^\d+$/.test(input)) {
    return Number(input);
  }

  const parts = input.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return Number.NaN;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return Number.NaN;
}

function readJson(raw, fallback) {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function getFileExtension(fileName) {
  const normalized = String(fileName || "").toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index === -1 ? "" : normalized.slice(index);
}

function guessMimeTypeFromExtension(extension) {
  switch (extension) {
    case ".mp3":
    case ".mpeg":
    case ".mpga":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "video/webm";
    case ".mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

function stripExtension(fileName) {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? fileName : fileName.slice(0, index);
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function safeSlug(value) {
  return String(value || "onescriber")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function showToast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  dom.toast.style.borderColor = isError
    ? "rgba(255, 109, 98, 0.45)"
    : "var(--border-strong)";
  clearTimeout(state.toastTimerId);
  state.toastTimerId = window.setTimeout(() => {
    dom.toast.classList.remove("is-visible");
  }, 3200);
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getErrorMessage(error, fallback = "Something went wrong.") {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
