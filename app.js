const STORAGE_KEY = "opendoor_pass_profile_v1";
const SUPPORTED_LANGUAGES = ["en-CA", "fr-CA"];
const DEFAULT_PASS_LANGUAGE = "en-CA";
const FAMILY_WORD_BY_LANGUAGE = {
  "en-CA": "Family",
  "fr-CA": "Famille",
};

const DEFAULT_BRANDING = {
  centre_name: "Family",
  centre_logo: "./assets/centre-logo.png",
  opendoor_logo: "./assets/opendoor-logo.png",
};

function parseFamilyIdFromScan(scanText) {
  if (!scanText || !scanText.startsWith("F|")) return null;
  const parts = scanText.split("|");
  if (parts.length < 3) return null;
  const familyId = Number.parseInt(parts[1], 10);
  return Number.isInteger(familyId) && familyId > 0 ? familyId : null;
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

function parseSetupFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const version = params.get("v");
  const centreId = params.get("centre_id");
  const familyScan = params.get("family_scan");
  const language = params.get("lang");
  const defaultLanguage = params.get("default_lang");

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
  ctx.fillText(message, 84, 145);
}

function renderQrFromRemoteImage(canvas, text) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => reject(new Error("remote_qr_failed"));
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${canvas.width}x${canvas.height}&data=${encodeURIComponent(text)}`;
  });
}

async function renderQr(text) {
  const canvas = document.getElementById("pass-qr");
  if (!canvas) return;

  if (!text) {
    drawQrPlaceholder(canvas, "No pass loaded");
    return;
  }

  if (window.QRCode && window.QRCode.toCanvas) {
    try {
      await window.QRCode.toCanvas(canvas, text, {
        margin: 1,
        width: canvas.width,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      return;
    } catch {
      // Fall through to remote image fallback.
    }
  }

  try {
    await renderQrFromRemoteImage(canvas, text);
  } catch {
    drawQrPlaceholder(canvas, "QR unavailable");
  }
}

async function loadBranding(centreId) {
  if (!Number.isInteger(centreId) || centreId <= 0) {
    return DEFAULT_BRANDING;
  }

  const brandingUrl = `./branding/${centreId}/branding.json`;
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

  if (!profile) {
    centreLogoEl.src = DEFAULT_BRANDING.centre_logo;
    opendoorLogoEl.src = DEFAULT_BRANDING.opendoor_logo;
    familyNameEl.textContent = "Family";
    familyIdEl.textContent = "ID: --";
    await renderQr("");
    return;
  }

  const familyId = parseFamilyIdFromScan(profile.family_scan);
  const centreId = Number.parseInt(String(profile.centre_id), 10);
  const branding = await loadBranding(centreId);
  const language = resolveProfileLanguage(profile);
  const familyWord = FAMILY_WORD_BY_LANGUAGE[language] || FAMILY_WORD_BY_LANGUAGE[DEFAULT_PASS_LANGUAGE];

  centreLogoEl.src = branding.centre_logo;
  opendoorLogoEl.src = branding.opendoor_logo;

  if (!familyId) {
    familyNameEl.textContent = familyWord;
    familyIdEl.textContent = "ID: --";
    await renderQr("");
    return;
  }

  familyNameEl.textContent = `${familyId} ${familyWord}`;
  familyIdEl.textContent = `ID: ${familyId}`;
  await renderQr(profile.family_scan);
}

async function main() {
  const setupProfile = parseSetupFromUrl();
  if (setupProfile) {
    saveProfile(setupProfile);
    await updateUi(setupProfile);
  } else {
    await updateUi(loadProfile());
  }

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // Non-fatal for scaffold.
    }
  }
}

main();

