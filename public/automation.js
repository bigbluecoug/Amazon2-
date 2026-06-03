const storeKey = "giftflow-studio-state-v1";
const amazonOAuthResultKey = "giftflow-amazon-oauth-result";
const defaultAmazonEndpoint = "https://na.business-api.amazon.com";

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
      endpoint: defaultAmazonEndpoint
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
    if (parsed.amazon.endpoint === "https://api.business.amazon.com") {
      parsed.amazon.endpoint = defaultAmazonEndpoint;
    }
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

function setStepState(id, stateName, detail) {
  const step = byId(id);
  if (!step) return;

  step.classList.remove("is-ready", "is-waiting", "is-blocked");
  step.classList.add(`is-${stateName}`);
  const detailElement = byId(`${id.replace("Step", "")}Detail`);
  if (detailElement && detail) {
    detailElement.textContent = detail;
  }
}

function updateSetupSteps() {
  const hasServerSetup = !!amazonConnectionConfig?.configured;
  const hasAmazonConnection = !!state.amazon?.refreshToken;
  const hasApiReadyMode = state.execution?.amazonMode === "amazon-business-api";

  if (amazonConnectionConfig) {
    const missing = amazonConnectionConfig?.missing || [];
    setStepState(
      "serverSetupStep",
      hasServerSetup ? "ready" : "blocked",
      hasServerSetup
        ? "Private Amazon app settings are saved on the server."
        : `An admin still needs to finish Forge setup${missing.length ? `: ${missing.join(", ")}` : "."}`
    );
  } else {
    setStepState(
      "serverSetupStep",
      "waiting",
      "Sign in so GiftFlow can check the private Amazon app settings."
    );
  }

  setStepState(
    "amazonConnectionStep",
    hasAmazonConnection ? "ready" : "waiting",
    hasAmazonConnection
      ? "Amazon Business approved the workspace connection."
      : "Click Connect Amazon Business when the admin setup is ready."
  );

  setStepState(
    "teamQueueStep",
    hasAmazonConnection && hasApiReadyMode ? "ready" : "waiting",
    hasAmazonConnection && hasApiReadyMode
      ? "The team can use GiftFlow without handling API credentials."
      : "Enable the Amazon send queue after the account is connected."
  );
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
    byId("authStateBadge").textContent = currentUser ? "Workspace signed in" : "Sign in required";
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
  byId("connectAmazonButton").textContent = amazonConnectionConfig?.configured ? "Connect Amazon Business" : "Waiting on admin setup";
  byId("connectAmazonButton").disabled = !amazonConnectionConfig?.configured;
  byId("setupStateBadge").textContent = amazonConnectionConfig?.configured ? "Admin setup ready" : "Admin setup needed";
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
    showStatus("Ready for Amazon approval", "An Amazon Business admin can connect the account now. Everyone else can keep using GiftFlow normally.", true);
  } else {
    showStatus("Admin setup needed", `A workspace admin needs to finish the private Forge settings before users can connect Amazon${missing.length ? `: ${missing.join(", ")}` : "."}`);
  }

  renderTokenState();
  updateSetupSteps();
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
    ? "Amazon send queue is enabled for this browser workspace."
    : "Connect Amazon once, then enable the send queue for the team.";

  setValue("amazonMarketplace", state.amazon.marketplace);
  setValue("amazonClientId", state.amazon.clientId);
  setValue("amazonRefreshToken", state.amazon.refreshToken);
  setValue("amazonEndpoint", state.amazon.endpoint);
  renderTokenState();
  updateSetupSteps();
}

function renderTokenState() {
  byId("tokenStateBadge").textContent = state.amazon?.refreshToken ? "Amazon connected" : "Amazon not connected";
  const enableButton = byId("enableQueueButton");
  if (enableButton) {
    enableButton.disabled = !state.amazon?.refreshToken;
  }
  updateSetupSteps();
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
    const missing = amazonConnectionConfig?.missing?.join(", ") || "private Amazon app settings";
    showStatus("Admin setup needed", `A workspace admin needs to finish ${missing} before users can connect Amazon.`);
    return;
  }

  if (!popup) {
    window.location.href = "/api/amazon/oauth/start";
    return;
  }

  popup.location.href = "/api/amazon/oauth/start";
  popup.focus();
  showStatus("Amazon approval window opened", "Sign in as the Amazon Business admin and select Allow. GiftFlow will save the connection when Amazon returns.");
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
    showStatus("Missing Amazon code", "Paste the callback URL Amazon showed you, or paste only the temporary code.");
    return;
  }

  showStatus("Finishing connection", "GiftFlow is sending the temporary code to the secure backend. Amazon codes expire quickly.");
  try {
    const response = await fetch("/api/amazon/oauth/exchange", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const payload = await response.json();
    if (!payload.ok) {
      const message = payload.errors?.join(" ") || "Amazon did not return a workspace connection.";
      showStatus("Exchange failed", message);
      return;
    }

    applyAmazonOAuthResult(payload);
    byId("manualAmazonCode").value = "";
  } catch (_error) {
    showStatus("Connection failed", "GiftFlow could not reach the Amazon connection route.");
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
    showStatus("Amazon connection failed", payload.error || payload.errors?.join(" ") || "Amazon Business did not approve the workspace connection.");
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
  showStatus("Amazon Business connected", "The private connection is saved. Team members can use the GiftFlow send queue without seeing API credentials.", true);
}

async function copyRedirectUri() {
  const value = fieldValue("amazonRedirectUri");
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    showStatus("Callback URL copied", "Paste this exact URL into the Amazon Business app registration.", true);
  } catch (_error) {
    showStatus("Copy failed", "Select and copy the callback URL manually.");
  }
}

function enableAmazonQueue() {
  syncAmazonFields();
  state.execution = state.execution || {};
  state.execution.amazonMode = "amazon-business-api";
  saveState();
  renderGiftFlowState();
  showStatus("Amazon send queue enabled", "GiftFlow will prepare approved due gifts for the live Amazon connector without asking users for API details.", true);
}

function wireEvents() {
  byId("connectAmazonButton").addEventListener("click", connectAmazonBusiness);
  byId("exchangeCodeButton").addEventListener("click", exchangeManualCode);
  byId("copyRedirectButton").addEventListener("click", copyRedirectUri);
  byId("enableQueueButton").addEventListener("click", enableAmazonQueue);
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
