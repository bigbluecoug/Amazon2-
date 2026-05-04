const storeKey = "giftflow-studio-state-v1";
const amazonOAuthResultKey = "giftflow-amazon-oauth-result";

const today = new Date().toISOString().slice(0, 10);
let state = loadState();
let currentUser = null;
let amazonConnectionConfig = null;

function byId(id) {
  return document.getElementById(id);
}

function loadState() {
  const fallback = {
    campaign: { name: "GiftFlow campaign" },
    steps: [],
    recipients: [],
    execution: { amazonMode: "queue-only" },
    amazon: {
      marketplace: "",
      clientId: "",
      refreshToken: "",
      endpoint: "https://api.business.amazon.com"
    },
    orderHistory: []
  };

  const raw = localStorage.getItem(storeKey);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    parsed.campaign = parsed.campaign || fallback.campaign;
    parsed.steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    parsed.recipients = Array.isArray(parsed.recipients) ? parsed.recipients : [];
    parsed.execution = parsed.execution || fallback.execution;
    parsed.amazon = { ...fallback.amazon, ...(parsed.amazon || {}) };
    parsed.orderHistory = Array.isArray(parsed.orderHistory) ? parsed.orderHistory : [];
    return parsed;
  } catch (_error) {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function setValue(id, value) {
  const element = byId(id);
  if (element) element.value = value || "";
}

function fieldValue(id) {
  return byId(id).value.trim();
}

function completeAddress(recipient) {
  return ["name", "street", "city", "state", "zip"].every((field) => String(recipient[field] || "").trim());
}

function getDueSteps(runDate) {
  return state.steps.filter((step) => step.sendDate && step.sendDate <= runDate && step.itemName && (step.asin || step.itemUrl));
}

function showStatus(title, message, success = false) {
  const status = byId("automationStatus");
  status.className = `automation-result is-visible ${success ? "success" : "warning"}`;
  status.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function loadAuth() {
  try {
    const response = await fetch("/api/auth/config", { credentials: "same-origin" });
    const payload = await response.json();
    currentUser = payload.user || null;
    byId("authStateBadge").textContent = currentUser ? `Signed in as ${currentUser.email}` : "Sign in required";
    if (!currentUser) {
      showStatus("Sign in required", "Sign in to GiftFlow before connecting Amazon Business.");
      byId("connectAmazonButton").disabled = true;
      byId("exchangeCodeButton").disabled = true;
      return false;
    }
    return true;
  } catch (_error) {
    byId("authStateBadge").textContent = "Auth unavailable";
    showStatus("Could not check sign-in", "Open GiftFlow and sign in, then return to this automation console.");
    return false;
  }
}

async function loadAmazonConnectionConfig() {
  try {
    const response = await fetch("/api/amazon/oauth/config", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Amazon connection route unavailable");
    amazonConnectionConfig = await response.json();
  } catch (_error) {
    amazonConnectionConfig = {
      configured: false,
      missing: ["Amazon connection route unavailable"],
      redirectUri: "https://amazon2-momyzfei.on-forge.com/api/amazon/oauth/callback"
    };
  }

  applyAmazonConnectionConfig();
}

function applyAmazonConnectionConfig() {
  const missing = amazonConnectionConfig?.missing || [];
  byId("connectAmazonButton").textContent = amazonConnectionConfig?.configured ? "Connect Amazon Business" : "Check Amazon setup";
  byId("setupStateBadge").textContent = amazonConnectionConfig?.configured ? "Server setup ready" : "Missing server setup";
  setValue("amazonRedirectUri", amazonConnectionConfig?.redirectUri || "https://amazon2-momyzfei.on-forge.com/api/amazon/oauth/callback");

  if (amazonConnectionConfig?.clientId && !fieldValue("amazonClientId")) {
    state.amazon.clientId = amazonConnectionConfig.clientId;
    setValue("amazonClientId", amazonConnectionConfig.clientId);
  }
  if (amazonConnectionConfig?.marketplace && !fieldValue("amazonMarketplace")) {
    state.amazon.marketplace = amazonConnectionConfig.marketplace;
    setValue("amazonMarketplace", amazonConnectionConfig.marketplace);
  }
  if (amazonConnectionConfig?.endpoint && !fieldValue("amazonEndpoint")) {
    state.amazon.endpoint = amazonConnectionConfig.endpoint;
    setValue("amazonEndpoint", amazonConnectionConfig.endpoint);
  }

  if (amazonConnectionConfig?.configured) {
    showStatus("Amazon setup ready", "Click Connect Amazon Business, sign in as the Amazon Business admin, and select Allow.", true);
  } else {
    showStatus("Amazon setup missing", `Add these Forge environment variables: ${missing.join(", ")}.`);
  }

  renderTokenState();
  saveState();
}

function renderGiftFlowState() {
  const readyRecipients = state.recipients.filter((recipient) => recipient.readyToSend && completeAddress(recipient));
  const dueSteps = getDueSteps(today);
  byId("campaignName").textContent = state.campaign?.name || "GiftFlow campaign";
  byId("readyProspects").textContent = readyRecipients.length;
  byId("dueGifts").textContent = dueSteps.length;
  byId("queuedOrders").textContent = state.orderHistory.length;
  byId("giftflowConnectionNote").textContent = state.execution?.amazonMode === "amazon-business-api"
    ? "GiftFlow is set to Amazon Business API ready mode."
    : "Changes here save to the same browser workspace used by GiftFlow.";

  setValue("amazonMarketplace", state.amazon.marketplace);
  setValue("amazonClientId", state.amazon.clientId);
  setValue("amazonRefreshToken", state.amazon.refreshToken);
  setValue("amazonEndpoint", state.amazon.endpoint);
  renderTokenState();
}

function renderTokenState() {
  byId("tokenStateBadge").textContent = state.amazon?.refreshToken ? "Refresh token saved" : "No token saved";
}

function syncAmazonFields() {
  state.amazon.marketplace = fieldValue("amazonMarketplace");
  state.amazon.clientId = fieldValue("amazonClientId");
  state.amazon.refreshToken = fieldValue("amazonRefreshToken");
  state.amazon.endpoint = fieldValue("amazonEndpoint");
  saveState();
  renderTokenState();
}

async function connectAmazonBusiness() {
  const popup = window.open("", "giftflowAmazonOAuth", "width=760,height=780");
  if (popup) {
    popup.document.write("<!doctype html><title>Checking Amazon setup</title><p style=\"font-family:Arial,sans-serif;padding:24px\">Checking Amazon Business setup...</p>");
  }

  if (!amazonConnectionConfig) {
    await loadAmazonConnectionConfig();
  }

  if (!amazonConnectionConfig?.configured) {
    if (popup) popup.close();
    const missing = amazonConnectionConfig?.missing?.join(", ") || "Amazon Business OAuth settings";
    showStatus("Amazon setup missing", `Add these Forge environment variables first: ${missing}.`);
    return;
  }

  if (!popup) {
    window.location.href = "/api/amazon/oauth/start";
    return;
  }

  popup.location.href = "/api/amazon/oauth/start";
  popup.focus();
  showStatus("Amazon window opened", "Sign in as the Amazon Business admin and select Allow.");
}

function extractAmazonCode(value) {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return url.searchParams.get("code") || "";
  } catch (_error) {
    return raw;
  }
}

async function exchangeManualCode() {
  const code = extractAmazonCode(fieldValue("manualAmazonCode"));
  if (!code) {
    showStatus("Missing OAuth code", "Paste the code from Amazon or the full callback URL.");
    return;
  }

  showStatus("Exchanging code", "GiftFlow is sending the code to the secure backend. This code expires quickly.");
  try {
    const response = await fetch("/api/amazon/oauth/exchange", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const payload = await response.json();
    if (!payload.ok) {
      const message = payload.errors?.join(" ") || "Amazon did not return a refresh token.";
      showStatus("Exchange failed", message);
      return;
    }

    applyAmazonOAuthResult(payload);
    byId("manualAmazonCode").value = "";
  } catch (_error) {
    showStatus("Exchange failed", "GiftFlow could not reach the token exchange route.");
  }
}

function receiveAmazonOAuthMessage(event) {
  if (event.origin !== window.location.origin) return;
  const payload = event.data || {};
  if (payload.type !== "giftflow-amazon-oauth") return;
  applyAmazonOAuthResult(payload);
}

function consumeStoredAmazonOAuthResult() {
  const raw = localStorage.getItem(amazonOAuthResultKey);
  if (!raw) return;

  localStorage.removeItem(amazonOAuthResultKey);
  try {
    applyAmazonOAuthResult(JSON.parse(raw));
  } catch (_error) {
    showStatus("Amazon result unreadable", "Try connecting Amazon Business again.");
  }
}

function applyAmazonOAuthResult(payload) {
  if (!payload || payload.type !== "giftflow-amazon-oauth") return;

  if (!payload.ok) {
    showStatus("Amazon connection failed", payload.error || payload.errors?.join(" ") || "Amazon Business did not return a refresh token.");
    return;
  }

  state.amazon.refreshToken = payload.refreshToken || state.amazon.refreshToken;
  state.amazon.clientId = payload.clientId || state.amazon.clientId;
  state.amazon.marketplace = payload.marketplace || state.amazon.marketplace;
  state.amazon.endpoint = payload.endpoint || state.amazon.endpoint;
  state.execution = state.execution || {};
  state.execution.amazonMode = "amazon-business-api";
  saveState();
  renderGiftFlowState();
  showStatus("Amazon Business connected", "Refresh token saved. GiftFlow is now set to Amazon Business API ready mode.", true);
}

async function copyRedirectUri() {
  const value = fieldValue("amazonRedirectUri");
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    showStatus("Callback URL copied", "Paste this exact URL into the Amazon SPP app registration.", true);
  } catch (_error) {
    showStatus("Copy failed", "Select and copy the callback URL manually.");
  }
}

function markApiReady() {
  syncAmazonFields();
  state.execution = state.execution || {};
  state.execution.amazonMode = "amazon-business-api";
  saveState();
  renderGiftFlowState();
  showStatus("API-ready mode selected", "GiftFlow will mark due orders as ready for the live connector when required Amazon fields are present.", true);
}

function wireEvents() {
  byId("connectAmazonButton").addEventListener("click", connectAmazonBusiness);
  byId("exchangeCodeButton").addEventListener("click", exchangeManualCode);
  byId("copyRedirectButton").addEventListener("click", copyRedirectUri);
  byId("markApiReadyButton").addEventListener("click", markApiReady);
  ["amazonMarketplace", "amazonClientId", "amazonRefreshToken", "amazonEndpoint"].forEach((id) => {
    byId(id).addEventListener("input", syncAmazonFields);
  });
  window.addEventListener("message", receiveAmazonOAuthMessage);
}

async function init() {
  renderGiftFlowState();
  wireEvents();
  consumeStoredAmazonOAuthResult();
  const signedIn = await loadAuth();
  if (signedIn) {
    await loadAmazonConnectionConfig();
  }
}

init();
