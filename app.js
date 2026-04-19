const STORAGE_KEY = "opendoor_pass_profile_v1";
const SUPPORTED_LANGUAGES = ["en-CA", "fr-CA"];
const DEFAULT_PASS_LANGUAGE = "en-CA";
const FAMILY_WORD_BY_LANGUAGE = {
  "en-CA": "Family",
  "fr-CA": "Famille",
};

const HTML_ROOT = document.documentElement;
const APP_BASE = HTML_ROOT.dataset.appBase || ".";
const BRANDING_BASE = HTML_ROOT.dataset.brandingBase || "./branding";
const FORCED_CENTRE_ID = Number.parseInt(HTML_ROOT.dataset.centreId || "", 10);

function resolveAppUrl(relativePath) {
  return new URL(relativePath, new URL(APP_BASE + "/", window.location.href)).href;
}

function resolveBrandingUrl(relativePath) {
  return new URL(relativePath, new URL(BRANDING_BASE + "/", window.location.href)).href;
}

const DEFAULT_BRANDING = {
  centre_name: "Family",
  centre_logo: resolveAppUrl("./assets/centre-logo.png"),
  opendoor_logo: resolveAppUrl("./assets/opendoor-logo.png"),
};

const INSTALL_STATE = {
  deferredPrompt: null,
  ui: null,
};

const MANIFEST_STATE = {
  objectUrl: null,
};

function detectBrowser() {
  const ua = navigator.userAgent || "";

  return {
    isAndroid: /Android/i.test(ua),
    isIOS: /iPhone|iPad|iPod/i.test(ua),
    isFirefox: /Firefox/i.test(ua),
    isEdge: /Edg\//i.test(ua),
    isSamsungInternet: /SamsungBrowser/i.test(ua),
    isChrome: /Chrome|CriOS/i.test(ua) && !/Edg\/|OPR\/|SamsungBrowser|Firefox/i.test(ua),
    isSafari: /Safari/i.test(ua) && !/Chrome|CriOS|Edg\/|OPR\/|Firefox/i.test(ua),
  };
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function getInstallMessage() {
  const browser = detectBrowser();

  if (browser.isFirefox && browser.isAndroid) {
    return "Firefox on Android does not support the app-install prompt. Use the browser menu and add this page to your home screen.";
  }

  if (browser.isSafari && browser.isIOS) {
    return "Use Safari Share -> Add to Home Screen to install this pass.";
  }

  if (browser.isChrome || browser.isEdge || browser.isSamsungInternet) {
    return "This browser can install the pass when it decides the app is eligible.";
  }

  return "If install is available in this browser, use its Add to Home Screen or Install App option.";
}

async function updateInstallManifestForCurrentPage() {
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (!manifestLink) {
    return;
  }

  const manifestUrl = new URL(manifestLink.href, window.location.href);

  try {
    const response = await fetch(manifestUrl.href, { cache: "no-cache" });
    if (!response.ok) {
      return;
    }

    const manifest = await response.json();
    manifest.start_url = window.location.href;
    manifest.scope = new URL("./", window.location.href).href;

    if (Array.isArray(manifest.icons)) {
      manifest.icons = manifest.icons.map((icon) => ({
        ...icon,
        src: new URL(icon.src, manifestUrl.href).href,
      }));
    }

    if (MANIFEST_STATE.objectUrl) {
      URL.revokeObjectURL(MANIFEST_STATE.objectUrl);
    }

    MANIFEST_STATE.objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" })
    );

    manifestLink.href = MANIFEST_STATE.objectUrl;
  } catch {
    // If manifest rewriting fails, leave the static manifest in place.
  }
}

function ensureInstallUi() {
  if (INSTALL_STATE.ui) {
    return INSTALL_STATE.ui;
  }

  const shell = document.querySelector(".shell");
  const opendoorLogo = document.querySelector(".opendoor-logo");
  if (!shell || !opendoorLogo) {
    return null;
  }

  const wrap = document.createElement("section");
  wrap.className = "install-panel";
  wrap.hidden = true;

  const heading = document.createElement("p");
  heading.className = "install-heading";
  heading.textContent = "Save this pass";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "install-button";
  button.textContent = "Install app";
  button.hidden = true;

  const message = document.createElement("p");
  message.className = "install-message";

  wrap.append(heading, button, message);
  shell.insertBefore(wrap, opendoorLogo);

  INSTALL_STATE.ui = { wrap, button, message };
  return INSTALL_STATE.ui;
}

function renderInstallUi() {
  const ui = ensureInstallUi();
  if (!ui) {
    return;
  }

  if (isStandaloneMode()) {
    ui.wrap.hidden = true;
    ui.button.hidden = true;
    ui.message.textContent = "";
    return;
  }

  ui.wrap.hidden = false;

  if (INSTALL_STATE.deferredPrompt) {
    ui.button.hidden = false;
    ui.message.textContent = "Install OpenDoor Pass on this device for faster access.";
    return;
  }

  ui.button.hidden = true;
  ui.message.textContent = getInstallMessage();
}

function initializeInstallPrompt() {
  const ui = ensureInstallUi();
  if (!ui) {
    return;
  }

  ui.button.addEventListener("click", async () => {
    if (!INSTALL_STATE.deferredPrompt) {
      renderInstallUi();
      return;
    }

    const promptEvent = INSTALL_STATE.deferredPrompt;
    INSTALL_STATE.deferredPrompt = null;
    await promptEvent.prompt();

    try {
      await promptEvent.userChoice;
    } catch {
      // Ignore choice read failures and just refresh the UI state.
    }

    renderInstallUi();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    INSTALL_STATE.deferredPrompt = event;
    renderInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    INSTALL_STATE.deferredPrompt = null;
    renderInstallUi();
  });

  window.matchMedia("(display-mode: standalone)").addEventListener("change", () => {
    renderInstallUi();
  });

  renderInstallUi();
}

function parseFamilyIdFromScan(scanText) {
  if (!scanText || !scanText.startsWith("F|")) return null;
  const parts = scanText.split("|");
  if (parts.length < 3) return null;
  const familyId = Number.parseInt(parts[1], 10);
  return Number.isInteger(familyId) && familyId > 0 ? familyId : null;
}

function normalizeQrSvg(svgMarkup) {
  if (!svgMarkup || typeof svgMarkup !== "string") {
    return "";
  }

  const trimmed = svgMarkup.trim();
  if (!trimmed.includes("<svg") || !trimmed.includes("</svg>")) {
    return "";
  }

  return trimmed;
}

function normalizeLanguage(language, fallbackLanguage = DEFAULT_PASS_LANGUAGE) {
  const fallback = SUPPORTED_LANGUAGES.includes(fallbackLanguage)
    ? fallbackLanguage
    : DEFAULT_PASS_LANGUAGE;

  if (!language || typeof language !== "string") {
    return fallback;
  }

  return SUPPORTED_LANGUAGES.includes(language) ? language : fallback;
}

function resolveProfileLanguage(profile) {
  const defaultLanguage = normalizeLanguage(profile?.default_lang, DEFAULT_PASS_LANGUAGE);
  return normalizeLanguage(profile?.lang, defaultLanguage);
}

function resolveFamilyLabel(profile) {
  if (profile?.family_name && typeof profile.family_name === "string") {
    const trimmedName = profile.family_name.trim();
    if (trimmedName) {
      return trimmedName;
    }
  }

  const familyId = parseFamilyIdFromScan(profile?.family_scan || "");
  return familyId ? String(familyId) : "";
}

function buildDisplayStrings(profile) {
  const familyId = parseFamilyIdFromScan(profile?.family_scan || "");
  const familyLabel = resolveFamilyLabel(profile);
  const language = resolveProfileLanguage(profile);
  const familyWord = FAMILY_WORD_BY_LANGUAGE[language] || FAMILY_WORD_BY_LANGUAGE[DEFAULT_PASS_LANGUAGE];

  if (!familyLabel) {
    return {
      family_line: familyWord,
      id_line: "ID: --",
    };
  }

  const familyLine = language === "fr-CA"
    ? `${familyWord} ${familyLabel}`
    : `${familyLabel} ${familyWord}`;

  return {
    family_line: familyLine,
    id_line: `ID: ${familyId}`,
  };
}

function parseSetupFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const version = params.get("v");
  const centreId = params.get("centre_id");
  const familyScan = params.get("family_scan");
  const familyName = params.get("family_name");
  const language = params.get("lang");
  const defaultLanguage = params.get("default_lang");
  const qrSvg = normalizeQrSvg(params.get("qr_svg"));

  if (!version || !centreId || !familyScan) {
    return null;
  }

  const centreIdInt = Number.parseInt(centreId, 10);
  if (!Number.isInteger(centreIdInt) || centreIdInt <= 0) {
    return null;
  }

  const familyId = parseFamilyIdFromScan(familyScan);
  if (!familyId) {
    return null;
  }

  return {
    v: version,
    centre_id: centreIdInt,
    family_scan: familyScan,
    family_name: familyName || "",
    qr_svg: qrSvg,
    qr_png: "",
    family_line: "",
    id_line: "",
    lang: language || "",
    default_lang: defaultLanguage || "",
    updated_at: new Date().toISOString(),
  };
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.family_scan || !data.centre_id) return null;
    data.family_name = typeof data.family_name === "string" ? data.family_name : "";
    data.qr_svg = normalizeQrSvg(data.qr_svg);
    data.qr_png = typeof data.qr_png === "string" ? data.qr_png : "";
    data.family_line = typeof data.family_line === "string" ? data.family_line : "";
    data.id_line = typeof data.id_line === "string" ? data.id_line : "";
    return data;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function drawQrPlaceholder(canvas, message) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f0f4f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#47627c";
  ctx.font = "16px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

function renderQrFromDataUrl(canvas, dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      reject(new Error("invalid_data_url"));
      return;
    }

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => reject(new Error("png_render_failed"));
    img.src = dataUrl;
  });
}

function renderQrFromSvg(canvas, svgMarkup) {
  return new Promise((resolve, reject) => {
    const normalizedSvg = normalizeQrSvg(svgMarkup);
    if (!normalizedSvg) {
      reject(new Error("invalid_svg"));
      return;
    }

    const blob = new Blob([normalizedSvg], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("svg_render_failed"));
    };
    img.src = objectUrl;
  });
}

async function renderQr(profile) {
  const canvas = document.getElementById("pass-qr");
  if (!canvas) return;

  const qrText = profile?.family_scan || "";
  const qrSvg = normalizeQrSvg(profile?.qr_svg);
  const qrPng = typeof profile?.qr_png === "string" ? profile.qr_png : "";

  if (qrSvg) {
    try {
      await renderQrFromSvg(canvas, qrSvg);
      return;
    } catch {
      // Fall through to text-based QR rendering if available.
    }
  }

  if (qrPng) {
    try {
      await renderQrFromDataUrl(canvas, qrPng);
      return;
    } catch {
      // Fall through to text-based QR rendering if available.
    }
  }

  if (!qrText) {
    drawQrPlaceholder(canvas, "No pass loaded");
    return;
  }

  if (window.QRCode && window.QRCode.toCanvas) {
    try {
      await window.QRCode.toCanvas(canvas, qrText, {
        margin: 1,
        width: canvas.width,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      return;
    } catch {
      // Fall through to placeholder.
    }
  }

  drawQrPlaceholder(canvas, "QR unavailable");
}

function generateQrSvg(text) {
  return new Promise((resolve, reject) => {
    if (!window.QRCode || typeof window.QRCode.toString !== "function") {
      reject(new Error("qr_svg_generation_unavailable"));
      return;
    }

    window.QRCode.toString(text, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    }, (error, svgText) => {
      if (error) {
        reject(error);
        return;
      }

      const normalizedSvg = normalizeQrSvg(String(svgText || "")
        .replace(/\r?\n/g, "")
        .replace(/>\s+</g, "><")
        .replace(/\s{2,}/g, " ")
        .trim());

      if (!normalizedSvg) {
        reject(new Error("svg_output_invalid"));
        return;
      }

      resolve(normalizedSvg);
    });
  });
}

function generateQrPng(text) {
  return new Promise((resolve, reject) => {
    if (!window.QRCode || typeof window.QRCode.toDataURL !== "function") {
      reject(new Error("qr_png_generation_unavailable"));
      return;
    }

    window.QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    }, (error, dataUrl) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(String(dataUrl || ""));
    });
  });
}

async function finalizeSetupProfile(profile) {
  const finalizedProfile = {
    ...profile,
    ...buildDisplayStrings(profile),
    qr_svg: normalizeQrSvg(profile.qr_svg),
    qr_png: typeof profile.qr_png === "string" ? profile.qr_png : "",
  };

  if (!finalizedProfile.qr_svg) {
    try {
      finalizedProfile.qr_svg = await generateQrSvg(finalizedProfile.family_scan);
    } catch {
      finalizedProfile.qr_svg = "";
    }
  }

  if (!finalizedProfile.qr_png) {
    try {
      finalizedProfile.qr_png = await generateQrPng(finalizedProfile.family_scan);
    } catch {
      finalizedProfile.qr_png = "";
    }
  }

  return finalizedProfile;
}

async function loadBranding(centreId) {
  if (!Number.isInteger(centreId) || centreId <= 0) {
    return DEFAULT_BRANDING;
  }

  const brandingUrl = resolveBrandingUrl(`./${centreId}/branding.json`);
  try {
    const response = await fetch(brandingUrl, { cache: "no-cache" });
    if (!response.ok) {
      return DEFAULT_BRANDING;
    }
    const data = await response.json();
    return {
      centre_name: (data.centre_name || DEFAULT_BRANDING.centre_name),
      centre_logo: new URL(data.centre_logo || DEFAULT_BRANDING.centre_logo, response.url).href,
      opendoor_logo: new URL(data.opendoor_logo || DEFAULT_BRANDING.opendoor_logo, response.url).href,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

async function updateUi(profile) {
  const familyNameEl = document.getElementById("family-name");
  const familyIdEl = document.getElementById("family-id");
  const centreLogoEl = document.querySelector(".centre-logo");
  const opendoorLogoEl = document.querySelector(".opendoor-logo");

  const fallbackCentreId = Number.isInteger(FORCED_CENTRE_ID) && FORCED_CENTRE_ID > 0
    ? FORCED_CENTRE_ID
    : null;

  if (!profile) {
    const fallbackBranding = fallbackCentreId ? await loadBranding(fallbackCentreId) : DEFAULT_BRANDING;
    centreLogoEl.src = fallbackBranding.centre_logo;
    opendoorLogoEl.src = fallbackBranding.opendoor_logo;
    familyNameEl.textContent = "Family";
    familyIdEl.textContent = "ID: --";
    await renderQr(null);
    return;
  }

  const familyId = parseFamilyIdFromScan(profile.family_scan);
  const centreId = Number.parseInt(String(profile.centre_id), 10);
  const branding = await loadBranding(centreId);
  const displayStrings = buildDisplayStrings(profile);
  const familyLine = displayStrings.family_line;
  const idLine = displayStrings.id_line;

  centreLogoEl.src = branding.centre_logo;
  opendoorLogoEl.src = branding.opendoor_logo;

  if (!familyId) {
    familyNameEl.textContent = familyLine;
    familyIdEl.textContent = idLine;
    await renderQr(profile);
    return;
  }

  familyNameEl.textContent = familyLine;
  familyIdEl.textContent = idLine;
  await renderQr(profile);
}

async function main() {
  await updateInstallManifestForCurrentPage();
  initializeInstallPrompt();

  const setupProfile = parseSetupFromUrl();
  if (setupProfile) {
    const finalizedProfile = await finalizeSetupProfile(setupProfile);
    saveProfile(finalizedProfile);
    await updateUi(finalizedProfile);
  } else {
    await updateUi(loadProfile());
  }

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(resolveAppUrl("./sw.js"));
    } catch {
      // Non-fatal for scaffold.
    }
  }
}

main();

