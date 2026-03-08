import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
import {
  fetchFile,
  toBlobURL,
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

const API_ENDPOINT = "https://api.airforce/v1/images/generations";
const PUBLIC_HISTORY_URL = "./history.json";
const SETTINGS_KEY = "musicgen-settings-v1";
const LOCAL_HISTORY_KEY = "musicgen-history-v1";
const MAX_LOCAL_HISTORY_ITEMS = 24;
const DEFAULT_STYLE = "";
const DEFAULT_STATUS = "Ready when you are.";
const FFMPEG_CORE_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);

const state = {
  isGenerating: false,
  timerId: null,
  timerStartedAt: null,
  activeGenerationId: null,
  localHistory: [],
  publicHistory: [],
  sessionDownloads: new Map(),
  ffmpeg: null,
  ffmpegPromise: null,
};

const dom = {
  form: document.querySelector("#generation-form"),
  apiKey: document.querySelector("#api-key"),
  model: document.querySelector("#model"),
  style: document.querySelector("#style"),
  lyrics: document.querySelector("#lyrics"),
  lyricsHelp: document.querySelector("#lyrics-help"),
  instrumental: document.querySelector("#instrumental"),
  generateButton: document.querySelector("#generate-button"),
  statusText: document.querySelector("#status-text"),
  statusTimer: document.querySelector("#status-timer"),
  currentResult: document.querySelector("#current-result"),
  historyList: document.querySelector("#history-list"),
};

initialize();

function initialize() {
  loadSettings();
  loadLocalHistory();
  bindEvents();
  updateLyricsState();
  renderHistory();
  renderCurrentResult();
  loadPublicHistory();
  window.addEventListener("beforeunload", revokeSessionObjectUrls);
}

function bindEvents() {
  dom.form.addEventListener("submit", handleGenerateSubmit);
  dom.instrumental.addEventListener("change", () => {
    updateLyricsState();
    saveSettings();
  });

  [dom.apiKey, dom.model, dom.style, dom.lyrics].forEach((element) => {
    element.addEventListener("input", saveSettings);
    element.addEventListener("change", saveSettings);
  });

  dom.historyList.addEventListener("click", handleHistoryAction);
}

function loadSettings() {
  const settings = readJsonStorage(SETTINGS_KEY, {});

  dom.apiKey.value = settings.apiKey || "";
  dom.model.value = settings.model || "suno-v5";
  dom.style.value = settings.style || DEFAULT_STYLE;
  dom.lyrics.value = settings.lyrics || "";
  dom.instrumental.checked = Boolean(settings.instrumental);
}

function saveSettings() {
  const settings = {
    apiKey: dom.apiKey.value.trim(),
    model: dom.model.value,
    style: dom.style.value,
    lyrics: dom.lyrics.value,
    instrumental: dom.instrumental.checked,
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadLocalHistory() {
  const historyItems = readJsonStorage(LOCAL_HISTORY_KEY, []);
  state.localHistory = Array.isArray(historyItems)
    ? historyItems.map((item) => normalizeHistoryEntry(item, "local"))
    : [];
}

async function loadPublicHistory() {
  try {
    const response = await fetch(PUBLIC_HISTORY_URL, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
    state.publicHistory = items.map((item) =>
      normalizeHistoryEntry(item, "public"),
    );
    renderHistory();
  } catch (error) {
    console.warn("Public history could not be loaded.", error);
  }
}

function updateLyricsState() {
  const disabled = dom.instrumental.checked;
  dom.lyrics.disabled = disabled;
  dom.lyrics.required = !disabled;
  dom.lyricsHelp.textContent = disabled
    ? "Instrumental mode is enabled, so lyrics are disabled for this request."
    : "Lyrics are required unless instrumental mode is enabled.";
}

async function handleGenerateSubmit(event) {
  event.preventDefault();
  if (state.isGenerating) {
    return;
  }

  const apiKey = dom.apiKey.value.trim();
  const style = dom.style.value.trim();
  const instrumental = dom.instrumental.checked;
  const lyrics = dom.lyrics.value.trim();

  if (!apiKey) {
    updateStatus("Add an API key before generating.", true);
    dom.apiKey.focus();
    return;
  }

  if (!style) {
    updateStatus("Add a style prompt before generating.", true);
    dom.style.focus();
    return;
  }

  if (!instrumental && !lyrics) {
    updateStatus("Add lyrics or enable instrumental mode.", true);
    dom.lyrics.focus();
    return;
  }

  const entry = normalizeHistoryEntry(
    {
      id: `local-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      completedAt: null,
      durationMs: 0,
      model: dom.model.value,
      style,
      lyrics,
      instrumental,
      custom: true,
      status: "running",
      sourceUrl: null,
      sourceType: null,
      audioUrl: null,
      errorMessage: "",
    },
    "local",
  );

  state.localHistory = [entry, ...state.localHistory].slice(
    0,
    MAX_LOCAL_HISTORY_ITEMS,
  );
  state.activeGenerationId = entry.id;
  persistLocalHistory();
  renderHistory();
  renderCurrentResult();
  setBusyState(true);
  startTimer();
  updateStatus("Sending generation request…");

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(
        buildPayload({
          model: dom.model.value,
          lyrics,
          instrumental,
          style,
        }),
      ),
    });

    const media = await waitForGenerationMedia(response);
    if (!media?.url) {
      throw new Error("No media URL was returned by the API.");
    }

    entry.sourceUrl = media.url;
    entry.sourceType = media.type;
    renderHistory();
    renderCurrentResult();

    if (media.type === "audio") {
      updateStatus("Audio URL received. Finalizing…");
      entry.audioUrl = media.url;
      entry.status = "finalizing";
    } else {
      entry.status = "converting";
      renderHistory();
      renderCurrentResult();
      const converted = await convertRemoteVideoToMp3(media.url, (message) => {
        updateStatus(message);
      });

      replaceSessionDownload(entry.id, converted);
      entry.audioUrl = converted.objectUrl;
      updateStatus("MP3 ready. Finalizing history…");
    }

    entry.status = "completed";
    entry.completedAt = new Date().toISOString();
    entry.durationMs = Date.now() - new Date(entry.createdAt).getTime();
    entry.errorMessage = "";
    persistLocalHistory();
    updateStatus("Generation complete.");
  } catch (error) {
    entry.status = "error";
    entry.completedAt = new Date().toISOString();
    entry.durationMs = Date.now() - new Date(entry.createdAt).getTime();
    entry.errorMessage = getErrorMessage(error);
    persistLocalHistory();
    updateStatus(entry.errorMessage, true);
  } finally {
    stopTimer();
    setBusyState(false);
    renderHistory();
    renderCurrentResult();
  }
}

function buildPayload({ model, lyrics, instrumental, style }) {
  return {
    model,
    prompt: instrumental ? "" : lyrics,
    n: 1,
    size: "1024x1024",
    response_format: "url",
    sse: true,
    custom: true,
    instrumental,
    style,
  };
}

async function waitForGenerationMedia(response) {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Request failed with status ${response.status}.`,
    );
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("text/event-stream")) {
    const payload = await response.text();
    return extractMediaFromPayloadText(payload);
  }

  updateStatus("Waiting for the media URL…");

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported in this browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");
    const segments = buffer.split("\n\n");
    buffer = segments.pop() ?? "";

    for (const segment of segments) {
      const media = extractMediaFromSseSegment(segment);
      if (media === "DONE") {
        return null;
      }

      if (media?.url) {
        try {
          await reader.cancel();
        } catch (cancelError) {
          console.warn("Stream could not be cancelled cleanly.", cancelError);
        }
        return media;
      }
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const media = extractMediaFromSseSegment(buffer);
    if (media?.url) {
      return media;
    }
  }

  return null;
}

function extractMediaFromSseSegment(segment) {
  const lines = segment.split("\n");
  const dataLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  const payloadText = dataLines.join("\n").trim();
  if (!payloadText) {
    return null;
  }

  if (payloadText === "[DONE]") {
    return "DONE";
  }

  return extractMediaFromPayloadText(payloadText);
}

function extractMediaFromPayloadText(payloadText) {
  let parsedPayload;

  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    console.warn("Skipping non-JSON payload.", error);
    return null;
  }

  const media = extractMediaUrls(parsedPayload);
  if (media.audio.length > 0) {
    return { type: "audio", url: media.audio[0] };
  }

  if (media.video.length > 0) {
    return { type: "video", url: media.video[0] };
  }

  return null;
}

function extractMediaUrls(value, result = { audio: [], video: [] }) {
  if (Array.isArray(value)) {
    value.forEach((item) => extractMediaUrls(item, result));
    return result;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => extractMediaUrls(item, result));
    return result;
  }

  if (typeof value !== "string") {
    return result;
  }

  const urlMatches = value.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const rawUrl of urlMatches) {
    const url = rawUrl.replace(/[),.;]+$/, "");
    const type = detectMediaType(url);
    if (type === "audio" && !result.audio.includes(url)) {
      result.audio.push(url);
    }

    if (type === "video" && !result.video.includes(url)) {
      result.video.push(url);
    }
  }

  return result;
}

function detectMediaType(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const extension = path.includes(".")
      ? path.slice(path.lastIndexOf("."))
      : "";

    if (AUDIO_EXTENSIONS.has(extension)) {
      return "audio";
    }

    if (VIDEO_EXTENSIONS.has(extension)) {
      return "video";
    }
  } catch (error) {
    console.warn("Could not inspect media URL.", error);
  }

  return null;
}

async function convertRemoteVideoToMp3(videoUrl, onStatus) {
  onStatus?.("Downloading source video…");
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(
      `The source video could not be downloaded (${response.status}).`,
    );
  }

  const videoBlob = await response.blob();
  const ffmpeg = await ensureFfmpegLoaded(onStatus);
  const inputName = `input-${crypto.randomUUID()}.mp4`;
  const outputName = `output-${crypto.randomUUID()}.mp3`;

  await ffmpeg.writeFile(inputName, await fetchFile(videoBlob));
  onStatus?.("Converting to MP3 in your browser…");
  await ffmpeg.exec(["-i", inputName, "-vn", "-b:a", "192k", outputName]);
  const outputData = await ffmpeg.readFile(outputName);

  await safeDeleteFfmpegFile(ffmpeg, inputName);
  await safeDeleteFfmpegFile(ffmpeg, outputName);

  const mp3Blob = new Blob([outputData.buffer], { type: "audio/mpeg" });
  return {
    objectUrl: URL.createObjectURL(mp3Blob),
    fileName: buildDownloadFileName(),
  };
}

async function ensureFfmpegLoaded(onStatus) {
  if (state.ffmpeg) {
    return state.ffmpeg;
  }

  if (!state.ffmpegPromise) {
    state.ffmpegPromise = (async () => {
      onStatus?.("Preparing the browser audio converter…");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => {
        if (Number.isFinite(progress) && progress > 0 && progress < 1) {
          onStatus?.(
            `Converting to MP3 in your browser… ${Math.round(progress * 100)}%`,
          );
        }
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
    console.warn(`Could not remove temporary file ${fileName}.`, error);
  }
}

function handleHistoryAction(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const { action, id } = target.dataset;
  if (action !== "rebuild-mp3" || !id) {
    return;
  }

  const entry = state.localHistory.find((item) => item.id === id);
  if (!entry?.sourceUrl || entry.sourceType !== "video") {
    return;
  }

  rebuildMp3ForEntry(entry, target);
}

async function rebuildMp3ForEntry(entry, button) {
  if (button.disabled) {
    return;
  }

  button.disabled = true;
  const previousLabel = button.textContent;
  button.textContent = "Building MP3…";
  updateStatus("Rebuilding MP3 from the stored video link…");

  try {
    const converted = await convertRemoteVideoToMp3(
      entry.sourceUrl,
      (message) => updateStatus(message),
    );
    replaceSessionDownload(entry.id, converted);
    entry.audioUrl = converted.objectUrl;
    updateStatus("MP3 rebuild complete.");
    renderHistory();
    renderCurrentResult();
  } catch (error) {
    updateStatus(getErrorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
}

function replaceSessionDownload(entryId, downloadInfo) {
  const existing = state.sessionDownloads.get(entryId);
  if (existing?.objectUrl) {
    URL.revokeObjectURL(existing.objectUrl);
  }

  state.sessionDownloads.set(entryId, downloadInfo);
}

function renderHistory() {
  const items = getCombinedHistory();
  if (items.length === 0) {
    dom.historyList.innerHTML = `
            <div class="empty-state">
                No generations yet. Your newest items will appear here.
            </div>
        `;
    return;
  }

  dom.historyList.innerHTML = items
    .map((entry, index) => {
      const download = getSessionDownload(entry.id);
      const audioUrl = download?.objectUrl || getRemoteAudioUrl(entry);
      const sourceUrl = entry.sourceUrl || getRemoteAudioUrl(entry);
      const canRebuild =
        entry.scope === "local" &&
        entry.sourceType === "video" &&
        entry.sourceUrl;
      const isOpen = index === 0 || entry.id === state.activeGenerationId;

      return `
                <details class="history-item" ${isOpen ? "open" : ""}>
                    <summary>
                        <div class="history-summary">
                            <div class="history-heading">
                                <div class="history-title">
                                    <strong>${escapeHtml(entry.model)}</strong>
                                    <span class="badge scope-${escapeHtml(entry.scope)}">${entry.scope}</span>
                                    <span class="badge status-${escapeHtml(entry.status)}">${formatStatus(entry.status)}</span>
                                </div>
                                <span class="history-time">${escapeHtml(formatDateTime(entry.createdAt))}</span>
                            </div>
                            <div class="meta-pills">
                                <span class="soft-pill">${entry.instrumental ? "Instrumental" : "Lyrics"}</span>
                                <span class="soft-pill">${escapeHtml(formatDuration(entry.durationMs))}</span>
                            </div>
                        </div>
                    </summary>

                    <div class="history-body">
                        <div class="meta-grid">
                            <div class="metric-card">
                                <span class="metric-label">Style</span>
                                <div class="metric-value">${escapeHtml(entry.style || "—")}</div>
                            </div>
                            <div class="metric-card">
                                <span class="metric-label">Flags</span>
                                <div class="metric-value">custom=true · ${entry.instrumental ? "instrumental=true" : "instrumental=false"}</div>
                            </div>
                        </div>

                        <div class="metric-card">
                            <span class="metric-label">Lyrics</span>
                            <div class="metric-value">${escapeHtml(entry.instrumental ? "Instrumental request. Lyrics disabled for this run." : entry.lyrics || "—")}</div>
                        </div>

                        ${entry.errorMessage ? `<p class="error-copy">${escapeHtml(entry.errorMessage)}</p>` : ""}

                        ${audioUrl ? `<audio class="audio-player" controls src="${escapeHtml(audioUrl)}"></audio>` : ""}

                        <div class="detail-actions">
                            ${audioUrl ? renderDownloadAction(entry, audioUrl, download?.fileName) : ""}
                            ${sourceUrl ? `<a class="soft-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Open source link</a>` : ""}
                            ${canRebuild && !audioUrl ? `<button class="action-button" data-action="rebuild-mp3" data-id="${escapeHtml(entry.id)}" type="button">Create MP3</button>` : ""}
                        </div>
                    </div>
                </details>
            `;
    })
    .join("");
}

function renderCurrentResult() {
  const latestLocal = [...state.localHistory].sort((left, right) => {
    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  })[0];

  if (!latestLocal) {
    dom.currentResult.innerHTML =
      "Generate a track to see the newest MP3, source link, and playback controls here.";
    dom.currentResult.classList.add("empty-state");
    return;
  }

  dom.currentResult.classList.remove("empty-state");
  const download = getSessionDownload(latestLocal.id);
  const audioUrl = download?.objectUrl || getRemoteAudioUrl(latestLocal);
  const sourceUrl = latestLocal.sourceUrl || getRemoteAudioUrl(latestLocal);

  dom.currentResult.innerHTML = `
        <div class="result-title">
            <div>
                <h3>${escapeHtml(latestLocal.model)}</h3>
                <p class="history-copy">${escapeHtml(formatDateTime(latestLocal.createdAt))} · ${escapeHtml(formatStatus(latestLocal.status))}</p>
            </div>
            <span class="badge status-${escapeHtml(latestLocal.status)}">${formatStatus(latestLocal.status)}</span>
        </div>

        <div class="result-meta">
            <div class="metric-card">
                <span class="metric-label">Style</span>
                <div class="metric-value">${escapeHtml(latestLocal.style || "—")}</div>
            </div>
            <div class="metric-card">
                <span class="metric-label">Mode</span>
                <div class="metric-value">${latestLocal.instrumental ? "Instrumental" : "Lyrics driven"} · custom=true</div>
            </div>
            <div class="metric-card">
                <span class="metric-label">Lyrics</span>
                <div class="metric-value">${escapeHtml(latestLocal.instrumental ? "Instrumental request. Lyrics disabled for this run." : latestLocal.lyrics || "—")}</div>
            </div>
        </div>

        ${audioUrl ? `<audio class="audio-player" controls src="${escapeHtml(audioUrl)}"></audio>` : ""}
        ${latestLocal.errorMessage ? `<p class="error-copy">${escapeHtml(latestLocal.errorMessage)}</p>` : ""}

        <div class="result-actions">
            ${audioUrl ? renderDownloadAction(latestLocal, audioUrl, download?.fileName) : ""}
            ${sourceUrl ? `<a class="soft-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Open source link</a>` : ""}
        </div>
    `;
}

function renderDownloadAction(entry, audioUrl, sessionFileName) {
  const isSessionObject = Boolean(sessionFileName);
  const label = isSessionObject ? "Download MP3" : "Open audio";
  const downloadAttribute = isSessionObject
    ? `download="${escapeHtml(sessionFileName)}"`
    : "";
  const targetAttribute = isSessionObject
    ? ""
    : 'target="_blank" rel="noreferrer"';

  return `
        <a class="soft-link" href="${escapeHtml(audioUrl)}" ${downloadAttribute} ${targetAttribute}>
            ${label}
        </a>
    `;
}

function getCombinedHistory() {
  return [...state.localHistory, ...state.publicHistory].sort((left, right) => {
    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  });
}

function normalizeHistoryEntry(entry, scope) {
  return {
    id: entry.id || `${scope}-${crypto.randomUUID()}`,
    scope,
    createdAt: toIsoString(entry.createdAt) || new Date().toISOString(),
    completedAt: toIsoString(entry.completedAt),
    durationMs: Number.isFinite(Number(entry.durationMs))
      ? Number(entry.durationMs)
      : 0,
    model: entry.model || "suno-v5",
    style: entry.style || "",
    lyrics: entry.lyrics || "",
    instrumental: Boolean(entry.instrumental),
    custom: entry.custom !== false,
    status: entry.status || "completed",
    sourceUrl: entry.sourceUrl || null,
    sourceType: entry.sourceType || detectMediaType(entry.sourceUrl || ""),
    audioUrl:
      typeof entry.audioUrl === "string" && entry.audioUrl.startsWith("http")
        ? entry.audioUrl
        : null,
    errorMessage: entry.errorMessage || "",
  };
}

function persistLocalHistory() {
  const serializableHistory = state.localHistory
    .slice(0, MAX_LOCAL_HISTORY_ITEMS)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      completedAt: entry.completedAt,
      durationMs: entry.durationMs,
      model: entry.model,
      style: entry.style,
      lyrics: entry.lyrics,
      instrumental: entry.instrumental,
      custom: entry.custom,
      status: entry.status,
      sourceUrl: entry.sourceUrl,
      sourceType: entry.sourceType,
      audioUrl: getRemoteAudioUrl(entry),
      errorMessage: entry.errorMessage,
    }));

  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(serializableHistory));
}

function setBusyState(isBusy) {
  state.isGenerating = isBusy;
  dom.generateButton.disabled = isBusy;
  dom.generateButton.textContent = isBusy ? "Generating…" : "Generate song";
}

function startTimer() {
  stopTimer();
  state.timerStartedAt = Date.now();
  dom.statusTimer.classList.add("is-running");
  updateTimerDisplay();
  state.timerId = window.setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }

  state.timerStartedAt = null;
  dom.statusTimer.classList.remove("is-running");
  dom.statusTimer.textContent = "00:00";
}

function updateTimerDisplay() {
  if (!state.timerStartedAt) {
    dom.statusTimer.textContent = "00:00";
    return;
  }

  dom.statusTimer.textContent = formatDuration(
    Date.now() - state.timerStartedAt,
  );
}

function updateStatus(message, isError = false) {
  dom.statusText.textContent = message || DEFAULT_STATUS;
  dom.statusText.style.color = isError ? "#991b1b" : "";
}

function getRemoteAudioUrl(entry) {
  return typeof entry.audioUrl === "string" && entry.audioUrl.startsWith("http")
    ? entry.audioUrl
    : null;
}

function getSessionDownload(entryId) {
  return state.sessionDownloads.get(entryId) || null;
}

function buildDownloadFileName() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
  ];
  const time = [
    padNumber(date.getHours()),
    padNumber(date.getMinutes()),
    padNumber(date.getSeconds()),
  ];
  return `musicgen-${parts.join("")}-${time.join("")}.mp3`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${padNumber(minutes)}:${padNumber(seconds)}`;
}

function formatStatus(status) {
  switch (status) {
    case "running":
      return "Requesting";
    case "converting":
      return "Converting";
    case "finalizing":
      return "Finalizing";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    default:
      return "Saved";
  }
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function readJsonStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    console.warn(`Could not read localStorage key ${key}.`, error);
    return fallbackValue;
  }
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong while generating the track.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function revokeSessionObjectUrls() {
  state.sessionDownloads.forEach((download) => {
    if (download?.objectUrl) {
      URL.revokeObjectURL(download.objectUrl);
    }
  });
}
