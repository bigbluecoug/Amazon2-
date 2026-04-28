const storeKey = "giftflow-studio-state-v1";
const demoAuthEmail = "team@giftflow.local";
const demoAuthPassword = "giftflow-demo";
const affiliateIdeas = [
  {
    title: "Premium coffee sampler",
    imageKey: "coffeeSampler",
    query: "premium coffee sampler gift box",
    message: "Hi {{firstName}}, thought this would make your next planning session a little better. - {{owner}}"
  },
  {
    title: "Desk notebook set",
    imageKey: "notebookSet",
    query: "premium desk notebook set",
    message: "Hi {{firstName}}, a useful place for the next round of big ideas. - {{owner}}"
  },
  {
    title: "Insulated desk tumbler",
    imageKey: "deskTumbler",
    query: "insulated desk tumbler gift",
    message: "Hi {{firstName}}, hope this keeps the good ideas fueled. - {{owner}}"
  },
  {
    title: "Wireless charging stand",
    imageKey: "chargingStand",
    query: "wireless charging stand desk",
    message: "Hi {{firstName}}, a small desk upgrade for the workday. - {{owner}}"
  }
];

const today = new Date().toISOString().slice(0, 10);
const amazonImageMaxAgeMs = 24 * 60 * 60 * 1000;
const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const demoState = () => ({
  campaign: {
    name: "Founder intro sequence",
    goal: "Turn warm prospects into booked calls with thoughtful gifts.",
    owner: "Eric",
    startDate: today,
    targetFilter: "Warm founder prospects"
  },
  steps: [
    {
      id: uid(),
      order: 1,
      name: "Welcome gift",
      sendDate: today,
      itemName: "Premium coffee box",
      asin: "B000TEST1",
      itemUrl: "",
      imageUrl: "",
      imageUrlSavedAt: "",
      quantity: 1,
      message: "Hi {{firstName}}, thought this would make your next planning session a little better. - {{owner}}",
      emailSubjectWhenSent: "Sent a small thank-you",
      emailBodyWhenSent: "Hi {{firstName}}, I sent a small gift your way and hope it arrives smoothly.",
      emailSubjectWhenDelivered: "Hope the coffee arrived",
      emailBodyWhenDelivered: "Hi {{firstName}}, hope the coffee made it to you. Would love to compare notes when you have time.",
      note: "Use for first touch"
    },
    {
      id: uid(),
      order: 2,
      name: "Follow-up gift",
      sendDate: addDays(7),
      itemName: "Desk notebook",
      asin: "B000TEST2",
      itemUrl: "",
      imageUrl: "",
      imageUrlSavedAt: "",
      quantity: 1,
      message: "Hi {{firstName}}, another useful tool for big ideas. Looking forward to connecting. - {{owner}}",
      emailSubjectWhenSent: "Another small gift is on the way",
      emailBodyWhenSent: "Hi {{firstName}}, I queued up a second small gift for you.",
      emailSubjectWhenDelivered: "Quick follow-up",
      emailBodyWhenDelivered: "Hi {{firstName}}, hope the notebook is useful. Open to a short conversation next week?",
      note: "Send one week later"
    }
  ],
  recipients: [
    {
      id: uid(),
      source: "manual",
      name: "Alex Morgan",
      email: "alex@example.com",
      company: "Northstar Labs",
      street: "123 Market St",
      city: "Denver",
      state: "CO",
      zip: "80202",
      assignedTo: "Eric",
      assignmentNote: "",
      readyToSend: true,
      readyMarkedAt: new Date().toISOString()
    }
  ],
  execution: {
    amazonMode: "queue-only",
    shippingDefaults: "",
    sequenceConfirmedAt: "",
    confirmedSequenceSignature: "",
    lastRunAt: "",
    lastRunDate: ""
  },
  amazon: {
    region: "na",
    marketplace: "",
    clientId: "",
    refreshToken: "",
    endpoint: "https://api.business.amazon.com"
  },
  associates: {
    tag: "",
    images: {}
  },
  email: {
    enabled: "disabled",
    trigger: "sent",
    host: "",
    port: 587,
    fromAddress: "",
    username: "",
    password: "",
    subjectWhenSent: "",
    bodyWhenSent: "",
    subjectWhenDelivered: "",
    bodyWhenDelivered: ""
  },
  orderHistory: []
});

let state = loadState();
let currentSlide = 0;
let authConfig = null;
let currentUser = null;
let amazonConnectionConfig = null;

async function initAuth() {
  const authMessage = consumeAuthMessage();
  try {
    const response = await fetch("/api/auth/config", { credentials: "same-origin" });
    authConfig = await response.json();
    currentUser = authConfig.user || null;

    if (currentUser) {
      routeAuthenticatedUser();
    } else if (authMessage) {
      showSignIn(authMessage);
    } else {
      showLanding();
    }
  } catch (_error) {
    authConfig = {
      configured: false,
      accountLoginEnabled: false,
      accountRegistrationEnabled: false,
      passwordLoginEnabled: false,
      googleLoginEnabled: false,
      demoLoginEnabled: false
    };
    if (authMessage) {
      showSignIn(authMessage);
    } else {
      showLanding();
    }
  }
}

function consumeAuthMessage() {
  const params = new URLSearchParams(window.location.search);
  const message = params.get("authError") || "";
  if (message) {
    params.delete("authError");
    const query = params.toString();
    history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }
  return message;
}

function showLanding() {
  byId("landingHeader").hidden = false;
  byId("landingPage").hidden = false;
  byId("appHeader").hidden = true;
  byId("appShell").hidden = true;
  byId("authGate").hidden = true;
  byId("signInPanel").hidden = false;
  byId("createAccountPanel").hidden = true;
  byId("onboardingPanel").hidden = true;
}

function showSignIn(message = "") {
  byId("landingHeader").hidden = true;
  byId("landingPage").hidden = true;
  byId("appHeader").hidden = true;
  byId("appShell").hidden = true;
  byId("authGate").hidden = false;
  byId("signInPanel").hidden = false;
  byId("createAccountPanel").hidden = true;
  byId("onboardingPanel").hidden = true;
  const passwordLoginEnabled = Boolean(authConfig?.accountLoginEnabled || authConfig?.passwordLoginEnabled);
  byId("passwordLoginFields").hidden = !passwordLoginEnabled;
  byId("passwordSignInButton").hidden = !passwordLoginEnabled;
  byId("showCreateAccountButton").hidden = !authConfig?.accountRegistrationEnabled;
  byId("demoLoginButton").hidden = !authConfig?.demoLoginEnabled;
  byId("authEmail").required = passwordLoginEnabled;
  byId("authPassword").required = passwordLoginEnabled;

  byId("authStatus").textContent = message || authReadyMessage();
  if (passwordLoginEnabled) {
    byId("authEmail").focus();
  } else if (authConfig?.accountRegistrationEnabled) {
    byId("showCreateAccountButton").focus();
  }
}

function authReadyMessage() {
  if (!authConfig?.configured) {
    return "Login is not configured yet. Enable account creation or set workspace password credentials, then restart the server.";
  }

  if (authConfig.accountRegistrationEnabled && !authConfig.hasRegisteredUsers) {
    return "Create the first account to open the workspace. The first account can edit gift ideas.";
  }

  if (authConfig.accountRegistrationEnabled) {
    return "Sign in or create an account to continue.";
  }

  if (authConfig.demoLoginEnabled) {
    return "Demo login is enabled: team@giftflow.local / giftflow-demo.";
  }

  return "Use your workspace email and password to continue.";
}

function showCreateAccount(message = "") {
  if (!authConfig?.accountRegistrationEnabled) {
    showSignIn("Account creation is not enabled for this workspace.");
    return;
  }

  byId("landingHeader").hidden = true;
  byId("landingPage").hidden = true;
  byId("appHeader").hidden = true;
  byId("appShell").hidden = true;
  byId("authGate").hidden = false;
  byId("signInPanel").hidden = true;
  byId("createAccountPanel").hidden = false;
  byId("onboardingPanel").hidden = true;
  byId("createAccountStatus").textContent = message || "Use at least 8 characters for your password.";
  byId("createName").focus();
}

function routeAuthenticatedUser() {
  if (currentUser?.onboarded) {
    showApp();
  } else {
    showOnboarding();
  }
}

function showOnboarding() {
  byId("landingHeader").hidden = true;
  byId("landingPage").hidden = true;
  byId("appHeader").hidden = true;
  byId("appShell").hidden = true;
  byId("authGate").hidden = false;
  byId("signInPanel").hidden = true;
  byId("createAccountPanel").hidden = true;
  byId("onboardingPanel").hidden = false;
}

function showApp() {
  byId("landingHeader").hidden = true;
  byId("landingPage").hidden = true;
  byId("authGate").hidden = true;
  byId("appHeader").hidden = false;
  byId("appShell").hidden = false;
  byId("userBadge").textContent = currentUser?.email ? `Signed in as ${currentUser.email}` : "";
  render();
  loadAmazonConnectionConfig();
  byId("campaign").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function requestSignIn(email, password, statusMessage = "Checking credentials...") {
  byId("authStatus").textContent = statusMessage;
  const result = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password
    })
  });
  const payload = await result.json();

  if (!payload.ok) {
    byId("authStatus").textContent = payload.errors?.join(" ") || "Sign-in failed.";
    return null;
  }

  currentUser = payload.user;
  return currentUser;
}

async function submitSignIn(event) {
  event.preventDefault();
  if (!authConfig?.accountLoginEnabled && !authConfig?.passwordLoginEnabled) return;
  const user = await requestSignIn(fieldValue("authEmail"), fieldValue("authPassword"));
  if (!user) return;

  routeAuthenticatedUser();
}

async function submitCreateAccount(event) {
  event.preventDefault();
  if (!authConfig?.accountRegistrationEnabled) {
    showSignIn("Account creation is not enabled for this workspace.");
    return;
  }

  byId("createAccountStatus").textContent = "Creating your account...";
  const result = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: fieldValue("createName"),
      email: fieldValue("createEmail"),
      password: byId("createPassword").value,
      confirmPassword: byId("createConfirmPassword").value
    })
  });
  const payload = await result.json();

  if (!payload.ok) {
    byId("createAccountStatus").textContent = payload.errors?.join(" ") || "Could not create that account.";
    return;
  }

  currentUser = payload.user;
  routeAuthenticatedUser();
}

async function openDemoWorkspace() {
  if (!authConfig?.demoLoginEnabled) {
    showSignIn("Demo login is not enabled for this workspace.");
    return;
  }

  setValue("authEmail", demoAuthEmail);
  setValue("authPassword", demoAuthPassword);

  const user = await requestSignIn(demoAuthEmail, demoAuthPassword, "Opening the demo workspace...");
  if (!user) return;

  if (user.onboarded) {
    showApp();
    return;
  }

  const result = await fetch("/api/auth/onboarding", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: "GiftFlow Demo",
      teamName: "Sales",
      role: "Demo user",
      useCase: "Prospect outreach"
    })
  });
  const payload = await result.json();

  if (!payload.ok) {
    byId("authStatus").textContent = payload.errors?.join(" ") || "Could not open the demo workspace.";
    return;
  }

  currentUser = payload.user;
  showApp();
}

async function submitOnboarding(event) {
  event.preventDefault();
  const result = await fetch("/api/auth/onboarding", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: fieldValue("onboardingCompany"),
      teamName: fieldValue("onboardingTeam"),
      role: fieldValue("onboardingRole"),
      useCase: fieldValue("onboardingUseCase")
    })
  });
  const payload = await result.json();

  if (!payload.ok) {
    showSignIn(payload.errors?.join(" ") || "Could not complete onboarding.");
    return;
  }

  currentUser = payload.user;
  if (fieldValue("onboardingCompany")) {
    state.campaign.owner = currentUser.name || state.campaign.owner;
    state.campaign.targetFilter = fieldValue("onboardingUseCase");
    silentSave();
  }
  showApp();
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  currentUser = null;
  showLanding();
}

function loadState() {
  const raw = localStorage.getItem(storeKey);
  if (!raw) return demoState();

  try {
    return { ...demoState(), ...JSON.parse(raw) };
  } catch (_error) {
    return demoState();
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
  showToast("Saved locally.");
}

function silentSave() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function sequenceSignature() {
  return JSON.stringify(state.steps.map((step) => [
    Number(step.order || 0),
    step.name || "",
    step.sendDate || "",
    step.itemName || "",
    step.asin || "",
    step.itemUrl || "",
    step.imageUrl || "",
    step.imageUrlSavedAt || "",
    Number(step.quantity || 0),
    step.message || "",
    step.emailSubjectWhenSent || "",
    step.emailBodyWhenSent || "",
    step.emailSubjectWhenDelivered || "",
    step.emailBodyWhenDelivered || "",
    step.note || ""
  ]));
}

function sequenceConfirmed() {
  return Boolean(state.execution.sequenceConfirmedAt) &&
    state.execution.confirmedSequenceSignature === sequenceSignature();
}

function byId(id) {
  return document.getElementById(id);
}

function setValue(id, value) {
  const element = byId(id);
  if (element) element.value = value || "";
}

function fieldValue(id) {
  return byId(id).value.trim();
}

function bindField(id, getter, setter, afterChange = render) {
  const element = byId(id);
  if (!element) return;
  element.value = getter() || "";
  element.addEventListener("input", () => {
    setter(element.value);
    afterChange();
    silentSave();
  });
}

function bindCampaignFields() {
  bindField("campaignName", () => state.campaign.name, (value) => state.campaign.name = value);
  bindField("campaignOwner", () => state.campaign.owner, (value) => state.campaign.owner = value);
  bindField("campaignStartDate", () => state.campaign.startDate, (value) => state.campaign.startDate = value);
  bindField("targetFilter", () => state.campaign.targetFilter, (value) => state.campaign.targetFilter = value);
  bindField("campaignGoal", () => state.campaign.goal, (value) => state.campaign.goal = value);
  bindField("runDate", () => state.execution.lastRunDate || today, (value) => state.execution.lastRunDate = value, silentSave);
  bindField("amazonMode", () => state.execution.amazonMode, (value) => state.execution.amazonMode = value);
  bindField("amazonMarketplace", () => state.amazon.marketplace, (value) => state.amazon.marketplace = value);
  bindField("amazonClientId", () => state.amazon.clientId, (value) => state.amazon.clientId = value);
  bindField("amazonRefreshToken", () => state.amazon.refreshToken, (value) => state.amazon.refreshToken = value);
  bindField("amazonEndpoint", () => state.amazon.endpoint, (value) => state.amazon.endpoint = value);
  bindField("shippingDefaults", () => state.execution.shippingDefaults, (value) => state.execution.shippingDefaults = value);
  bindField("affiliateTag", () => state.associates?.tag, (value) => {
    state.associates = state.associates || {};
    state.associates.tag = value;
  }, () => {
    renderAffiliateIdeas();
    silentSave();
  });
}

function markSequenceDirty() {
  state.execution.confirmedSequenceSignature = "";
  state.execution.sequenceConfirmedAt = "";
}

function render() {
  renderInstructionSlides();
  renderMetrics();
  renderAffiliateIdeas();
  renderSteps();
  renderRecipients();
  renderHistory();
  renderStatus();
}

function renderAffiliateIdeas() {
  const list = byId("affiliateIdeaList");
  if (!list) return;

  list.innerHTML = affiliateIdeas.map((idea, index) => {
    const url = buildAffiliateUrl(idea.query);
    const imageUrl = freshAffiliateImageUrl(idea.imageKey);
    return `
      <article class="affiliate-idea-card">
        <figure class="affiliate-idea-image ${imageUrl ? "" : "is-empty"}">
          ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(idea.title)}">` : "<span>Add Amazon image URL</span>"}
        </figure>
        <div>
          <span>Idea ${index + 1}</span>
          <strong>${escapeHtml(idea.title)}</strong>
        </div>
        <label class="affiliate-image-field">
          <span>Amazon image URL</span>
          <input type="url" value="${escapeHtml(imageUrl)}" placeholder="Paste PA-API image URL" data-affiliate-image="${escapeHtml(idea.imageKey)}">
        </label>
        <div class="affiliate-actions">
          <a class="button button-light" href="${escapeHtml(url)}" target="_blank" rel="sponsored noreferrer">View on Amazon</a>
          <button class="button button-dark" type="button" data-affiliate-idea="${index}">Use idea</button>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-affiliate-idea]").forEach((button) => {
    button.addEventListener("click", () => useAffiliateIdea(Number(button.dataset.affiliateIdea)));
  });

  list.querySelectorAll("[data-affiliate-image]").forEach((input) => {
    input.addEventListener("input", () => {
      state.associates = state.associates || {};
      state.associates.images = state.associates.images || {};
      const url = input.value.trim();
      if (url) {
        state.associates.images[input.dataset.affiliateImage] = {
          url,
          savedAt: new Date().toISOString()
        };
      } else {
        delete state.associates.images[input.dataset.affiliateImage];
      }
      silentSave();
    });
    input.addEventListener("change", renderAffiliateIdeas);
  });
}

function buildAffiliateUrl(query) {
  const url = new URL("https://www.amazon.com/s");
  url.searchParams.set("k", query);
  const tag = String(state.associates?.tag || "").trim();
  if (tag) url.searchParams.set("tag", tag);
  return url.toString();
}

function freshAffiliateImageUrl(imageKey) {
  return freshAmazonImageUrl(state.associates?.images?.[imageKey]);
}

function freshAmazonImageUrl(record) {
  if (!record || typeof record !== "object") return "";
  const savedAt = Date.parse(record.savedAt || "");
  if (!record.url || Number.isNaN(savedAt) || Date.now() - savedAt > amazonImageMaxAgeMs) return "";
  return record.url;
}

function renderInstructionSlides() {
  const slides = Array.from(document.querySelectorAll(".instruction-slide"));
  const dots = byId("slideDots");
  const counter = byId("slideCounter");
  if (!slides.length || !dots || !counter) return;

  currentSlide = Math.max(0, Math.min(currentSlide, slides.length - 1));

  slides.forEach((slide, index) => {
    slide.classList.toggle("is-active", index === currentSlide);
  });

  dots.innerHTML = slides.map((_slide, index) => `
    <button class="slide-dot ${index === currentSlide ? "is-active" : ""}" type="button" data-slide-dot="${index}" aria-label="Show slide ${index + 1}"></button>
  `).join("");

  dots.querySelectorAll("[data-slide-dot]").forEach((button) => {
    button.addEventListener("click", () => {
      currentSlide = Number(button.dataset.slideDot);
      renderInstructionSlides();
    });
  });

  counter.textContent = `${currentSlide + 1} / ${slides.length}`;
}

function renderMetrics() {
  const readyRecipients = state.recipients.filter((recipient) => recipient.readyToSend && completeAddress(recipient));
  const dueSteps = getDueSteps(byId("runDate")?.value || today);
  byId("readyMetric").textContent = readyRecipients.length;
  byId("dueMetric").textContent = dueSteps.length;
  byId("queuedMetric").textContent = state.orderHistory.length;
  byId("phoneCampaignName").textContent = state.campaign.name || "Untitled campaign";
  byId("phoneCampaignGoal").textContent = state.campaign.goal || "Add a goal for your campaign.";
  byId("phoneSteps").innerHTML = state.steps
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order))
    .slice(0, 4)
    .map((step, index) => `
      <div class="mini-step">
        <span class="mini-step-index">${index + 1}</span>
        <strong>${escapeHtml(step.itemName || "Gift pending")}</strong>
        <span>${escapeHtml(step.sendDate || "No date")}</span>
      </div>
    `).join("");
}

function renderStatus() {
  byId("campaignStatus").textContent = sequenceConfirmed() ? "Confirmed" : "Draft";
  byId("campaignStatusDetail").textContent = sequenceConfirmed()
    ? `Sequence confirmed ${new Date(state.execution.sequenceConfirmedAt).toLocaleString()}.`
    : "Confirm your sequence before running automation.";

  const mode = state.execution.amazonMode || "queue-only";
  byId("amazonModeStatus").textContent = {
    "queue-only": "Queue only",
    "sandbox": "Sandbox",
    "amazon-business-api": "API ready"
  }[mode] || "Queue only";

  const upcoming = state.steps
    .filter((step) => step.sendDate)
    .sort((a, b) => a.sendDate.localeCompare(b.sendDate))[0];

  byId("nextSendStatus").textContent = upcoming ? upcoming.sendDate : "Not scheduled";
  byId("nextSendDetail").textContent = upcoming
    ? `${upcoming.name || "Gift"}: ${upcoming.itemName || "item pending"}`
    : "Add send dates to your gift sequence.";

  byId("sequenceConfirmation").textContent = sequenceConfirmed()
    ? "Sequence locked for automation. Editing a gift will move it back to draft."
    : "Any gift edit requires a fresh confirmation before orders can run.";
}

function renderSteps() {
  const list = byId("stepList");
  const template = byId("stepTemplate");
  list.innerHTML = "";

  const giftCount = state.steps.length;
  byId("giftCountStatus").textContent = `${giftCount} gift${giftCount === 1 ? "" : "s"} in this sequence`;

  if (!giftCount) {
    list.innerHTML = `
      <div class="empty-sequence">
        <strong>No gifts yet.</strong>
        <p>Add the first gift, choose the Amazon item, and write the message your prospect will see.</p>
      </div>
    `;
    return;
  }

  state.steps
    .sort((a, b) => Number(a.order) - Number(b.order))
    .forEach((step, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.id = step.id;
      node.querySelector(".step-number").textContent = `Gift ${index + 1}`;
      node.querySelector(".remove-step").addEventListener("click", () => removeStep(step.id));

      node.querySelectorAll("[data-field]").forEach((input) => {
        const field = input.dataset.field;
        input.value = step[field] || "";
        input.addEventListener("input", () => {
          step[field] = field === "quantity" ? Number(input.value || 1) : input.value;
          if (field === "imageUrl") {
            step.imageUrlSavedAt = step.imageUrl ? new Date().toISOString() : "";
          }
          markSequenceDirty();
          renderMetrics();
          renderStatus();
          silentSave();
        });
      });

      const urlInput = node.querySelector('[data-field="itemUrl"]');
      const imageInput = node.querySelector('[data-field="imageUrl"]');
      const imagePreview = node.querySelector("[data-image-preview]");
      const fillButton = node.querySelector(".fill-amazon-details");
      const fillFromUrl = () => populateAmazonFields(step, node);
      const renderStepImage = () => {
        if (imageInput.value.trim() !== step.imageUrl) {
          step.imageUrl = imageInput.value.trim();
          step.imageUrlSavedAt = step.imageUrl ? new Date().toISOString() : "";
        }

        const imageUrl = freshAmazonImageUrl({ url: step.imageUrl, savedAt: step.imageUrlSavedAt });
        const emptyMessage = step.imageUrl && !imageUrl ? "Image link expired" : "No image added";
        imagePreview.innerHTML = imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(step.itemName || "Gift image")}">`
          : `<span>${emptyMessage}</span>`;
        imagePreview.classList.toggle("is-empty", !imageUrl);
      };
      urlInput.addEventListener("change", fillFromUrl);
      urlInput.addEventListener("blur", fillFromUrl);
      imageInput.addEventListener("input", renderStepImage);
      fillButton.addEventListener("click", fillFromUrl);
      renderStepImage();

      list.appendChild(node);
    });
}

function populateAmazonFields(step, node) {
  const details = parseAmazonUrl(step.itemUrl);
  const status = node.querySelector(".amazon-lookup-status");
  if (!details.asin && !details.title) {
    status.textContent = "I could not find an ASIN in that URL. Try a product URL that includes /dp/ or /gp/product/.";
    return;
  }

  if (details.asin) {
    step.asin = details.asin;
    node.querySelector('[data-field="asin"]').value = details.asin;
  }

  if (!step.itemName && details.title) {
    step.itemName = details.title;
    node.querySelector('[data-field="itemName"]').value = details.title;
  } else if (!step.itemName && details.asin) {
    step.itemName = `Amazon item ${details.asin}`;
    node.querySelector('[data-field="itemName"]').value = step.itemName;
  }

  if (!step.quantity || Number(step.quantity) < 1) {
    step.quantity = 1;
    node.querySelector('[data-field="quantity"]').value = 1;
  }

  markSequenceDirty();
  renderMetrics();
  renderStatus();
  silentSave();

  const parts = [];
  if (details.asin) parts.push(`ASIN ${details.asin}`);
  if (details.title && step.itemName === details.title) parts.push("gift name");
  status.textContent = `Filled ${parts.join(" and ")} from the Amazon URL.`;
}

function parseAmazonUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { asin: "", title: "" };

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch (_error) {
    return { asin: "", title: "" };
  }

  const path = decodeURIComponent(url.pathname || "");
  const asin = extractAsin(path);
  const title = extractTitle(path, asin);
  return { asin, title };
}

function extractAsin(path) {
  const patterns = [
    /\/(?:dp|gp\/product|product-reviews|exec\/obidos\/ASIN)\/([A-Z0-9]{10})(?:[/?#]|$)/i,
    /\/([A-Z0-9]{10})(?:[/?#]|$)/i
  ];

  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  return "";
}

function extractTitle(path, asin) {
  const parts = path.split("/").filter(Boolean);
  const asinIndex = asin ? parts.findIndex((part) => part.toUpperCase() === asin) : -1;
  const markerIndex = parts.findIndex((part) => ["dp", "product", "product-reviews"].includes(part.toLowerCase()));
  const titlePart = parts
    .slice(0, asinIndex > 0 ? asinIndex : markerIndex > 0 ? markerIndex : parts.length)
    .reverse()
    .find((part) => part.includes("-") && !part.match(/^[A-Z0-9]{10}$/i));

  if (!titlePart) return "";

  return titlePart
    .replace(/\+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => !["ref", "sr", "qid", "sprefix"].includes(word.toLowerCase()))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderRecipients() {
  const rows = byId("recipientRows");
  rows.innerHTML = "";

  const readyRecipients = state.recipients.filter((recipient) => recipient.readyToSend && completeAddress(recipient));
  byId("prospectCountStatus").textContent = `${state.recipients.length} prospect${state.recipients.length === 1 ? "" : "s"}`;
  byId("readyProspectStatus").textContent = `${readyRecipients.length} ready`;

  if (!state.recipients.length) {
    rows.innerHTML = `
      <div class="empty-sequence">
        <strong>No prospects yet.</strong>
        <p>Add a prospect manually or import a CSV to begin building the send list.</p>
      </div>
    `;
    return;
  }

  state.recipients.forEach((recipient) => {
    const row = document.createElement("article");
    row.className = "recipient-card";
    row.innerHTML = `
      <div class="recipient-card-header">
        <label class="ready-toggle">
          <input data-field="readyToSend" type="checkbox" aria-label="Ready to send">
          <span>Ready to send</span>
        </label>
        <button class="icon-button remove-recipient" type="button" title="Remove prospect" aria-label="Remove prospect">×</button>
      </div>
      <div class="recipient-fields">
        <label>
          <span>Name</span>
          <input data-field="name" type="text" autocomplete="off">
        </label>
        <label>
          <span>Email</span>
          <input data-field="email" type="email" autocomplete="off">
        </label>
        <label>
          <span>Company</span>
          <input data-field="company" type="text" autocomplete="off">
        </label>
        <label>
          <span>Owner</span>
          <input data-field="assignedTo" type="text" autocomplete="off">
        </label>
        <label class="recipient-street">
          <span>Street</span>
          <input data-field="street" type="text" autocomplete="off">
        </label>
        <label>
          <span>City</span>
          <input data-field="city" type="text" autocomplete="off">
        </label>
        <label>
          <span>State</span>
          <input data-field="state" type="text" autocomplete="off">
        </label>
        <label>
          <span>ZIP</span>
          <input data-field="zip" type="text" autocomplete="off">
        </label>
      </div>
    `;

    row.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      if (input.type === "checkbox") {
        input.checked = Boolean(recipient[field]);
        input.addEventListener("change", () => {
          recipient[field] = input.checked;
          recipient.readyMarkedAt = input.checked ? new Date().toISOString() : "";
          renderMetrics();
          silentSave();
        });
      } else {
        input.value = recipient[field] || "";
        input.addEventListener("input", () => {
          recipient[field] = input.value;
          renderMetrics();
          silentSave();
        });
      }
    });

    row.querySelector(".remove-recipient").addEventListener("click", () => {
      state.recipients = state.recipients.filter((candidate) => candidate.id !== recipient.id);
      render();
      silentSave();
    });

    rows.appendChild(row);
  });
}

function renderHistory() {
  const list = byId("historyList");
  if (!state.orderHistory.length) {
    list.innerHTML = `<p class="empty-state">No orders have been queued yet.</p>`;
    return;
  }

  list.innerHTML = state.orderHistory
    .slice()
    .reverse()
    .map((record) => `
      <article class="history-item">
        <div>
          <strong>${escapeHtml(record.recipientName)} · ${escapeHtml(record.itemName)}</strong>
          <p>${escapeHtml(record.stepName)} for ${escapeHtml(record.campaignName)} on ${escapeHtml(record.runDate)}</p>
          <p>${escapeHtml(record.giftMessage || "")}</p>
        </div>
        <span class="status-pill">${escapeHtml(record.status || "queued")}</span>
      </article>
    `).join("");
}

function addStep() {
  markSequenceDirty();
  state.steps.push({
    id: uid(),
    order: state.steps.length + 1,
    name: `Gift ${state.steps.length + 1}`,
    sendDate: addDays(state.steps.length * 7),
    itemName: "",
    asin: "",
    itemUrl: "",
    imageUrl: "",
    imageUrlSavedAt: "",
    quantity: 1,
    message: "Hi {{firstName}}, thought you might enjoy this. - {{owner}}",
    emailSubjectWhenSent: "",
    emailBodyWhenSent: "",
    emailSubjectWhenDelivered: "",
    emailBodyWhenDelivered: "",
    note: ""
  });
  render();
  silentSave();
}

function useAffiliateIdea(index) {
  const idea = affiliateIdeas[index];
  if (!idea) return;

  markSequenceDirty();
  let step = state.steps.find((candidate) => !candidate.itemName && !candidate.asin && !candidate.itemUrl);
  if (!step) {
    step = {
      id: uid(),
      order: state.steps.length + 1,
      name: `Gift ${state.steps.length + 1}`,
      sendDate: addDays(state.steps.length * 7),
      itemName: "",
      asin: "",
      itemUrl: "",
      imageUrl: "",
      imageUrlSavedAt: "",
      quantity: 1,
      message: "",
      emailSubjectWhenSent: "",
      emailBodyWhenSent: "",
      emailSubjectWhenDelivered: "",
      emailBodyWhenDelivered: "",
      note: ""
    };
    state.steps.push(step);
  }

  step.itemName = idea.title;
  step.itemUrl = buildAffiliateUrl(idea.query);
  step.imageUrl = freshAffiliateImageUrl(idea.imageKey) || step.imageUrl || "";
  step.imageUrlSavedAt = step.imageUrl ? new Date().toISOString() : "";
  step.asin = "";
  step.quantity = step.quantity || 1;
  step.message = step.message || idea.message;
  step.note = step.note || "Amazon Associates idea link";

  render();
  silentSave();
  showToast(`Added ${idea.title} to the gift sequence.`);
}

function removeStep(id) {
  markSequenceDirty();
  state.steps = state.steps
    .filter((step) => step.id !== id)
    .map((step, index) => ({ ...step, order: index + 1 }));
  render();
  silentSave();
}

function addRecipient() {
  state.recipients.push({
    id: uid(),
    source: "manual",
    name: "",
    email: "",
    company: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    assignedTo: state.campaign.owner || "",
    assignmentNote: "",
    readyToSend: false,
    readyMarkedAt: ""
  });
  render();
  silentSave();
}

function completeAddress(recipient) {
  return ["name", "street", "city", "state", "zip"].every((field) => String(recipient[field] || "").trim());
}

function getDueSteps(runDate) {
  return state.steps.filter((step) => step.sendDate && step.sendDate <= runDate && step.itemName && (step.asin || step.itemUrl));
}

function confirmSequence() {
  state.execution.confirmedSequenceSignature = sequenceSignature();
  state.execution.sequenceConfirmedAt = new Date().toISOString();
  renderStatus();
  silentSave();
  showResult("Sequence confirmed. Automation can now process due gifts.", true);
}

async function processDueGifts() {
  syncSettingsFromInputs();
  const response = await fetch("/api/orders/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, runDate: fieldValue("runDate") || today })
  });
  const payload = await response.json();

  if (payload.state) {
    state = payload.state;
    silentSave();
    render();
  }

  if (payload.ok) {
    const summary = payload.summary;
    showResult(`Processed ${summary.createdOrders} new order${summary.createdOrders === 1 ? "" : "s"} across ${summary.eligibleRecipients} ready prospect${summary.eligibleRecipients === 1 ? "" : "s"}. Duplicate sends were skipped.`, true);
  } else {
    showResult(payload.errors.join(" "), false);
  }
}

function syncSettingsFromInputs() {
  state.execution.amazonMode = fieldValue("amazonMode") || "queue-only";
  state.execution.shippingDefaults = fieldValue("shippingDefaults");
  state.execution.lastRunDate = fieldValue("runDate") || today;
  state.amazon.marketplace = fieldValue("amazonMarketplace");
  state.amazon.clientId = fieldValue("amazonClientId");
  state.amazon.refreshToken = fieldValue("amazonRefreshToken");
  state.amazon.endpoint = fieldValue("amazonEndpoint");
}

async function loadAmazonConnectionConfig() {
  const status = byId("amazonConnectionStatus");
  const button = byId("connectAmazonButton");
  if (!status || !button || !currentUser) return;

  status.textContent = "Checking Amazon Business connection setup...";
  button.disabled = true;
  try {
    const response = await fetch("/api/amazon/oauth/config", { credentials: "same-origin" });
    const payload = await response.json();
    amazonConnectionConfig = payload;
    applyAmazonConnectionConfig();
  } catch (_error) {
    amazonConnectionConfig = { configured: false, missing: ["Amazon connection route unavailable"] };
    applyAmazonConnectionConfig();
  }
}

function applyAmazonConnectionConfig() {
  const status = byId("amazonConnectionStatus");
  const button = byId("connectAmazonButton");
  if (!status || !button) return;

  const missing = amazonConnectionConfig?.missing || [];
  button.disabled = !amazonConnectionConfig?.configured;

  if (amazonConnectionConfig?.clientId && !fieldValue("amazonClientId")) {
    setValue("amazonClientId", amazonConnectionConfig.clientId);
    state.amazon.clientId = amazonConnectionConfig.clientId;
  }
  if (amazonConnectionConfig?.marketplace && !fieldValue("amazonMarketplace")) {
    setValue("amazonMarketplace", amazonConnectionConfig.marketplace);
    state.amazon.marketplace = amazonConnectionConfig.marketplace;
  }
  if (amazonConnectionConfig?.endpoint && !fieldValue("amazonEndpoint")) {
    setValue("amazonEndpoint", amazonConnectionConfig.endpoint);
    state.amazon.endpoint = amazonConnectionConfig.endpoint;
  }

  if (amazonConnectionConfig?.configured) {
    status.textContent = state.amazon.refreshToken
      ? "Amazon Business is connected. Refresh token is present."
      : "Amazon Business OAuth is ready. Connect as the Amazon Business admin to receive a refresh token.";
  } else {
    status.textContent = `Amazon Business OAuth needs server settings: ${missing.join(", ")}.`;
  }

  silentSave();
}

async function connectAmazonBusiness() {
  if (!amazonConnectionConfig) {
    await loadAmazonConnectionConfig();
  }

  if (!amazonConnectionConfig?.configured) {
    applyAmazonConnectionConfig();
    showResult("Add the missing Amazon Business OAuth environment variables on Forge, then deploy again.", false);
    return;
  }

  const popup = window.open("/api/amazon/oauth/start", "giftflowAmazonOAuth", "width=760,height=780");
  if (!popup) {
    window.location.href = "/api/amazon/oauth/start";
    return;
  }

  popup.focus();
  byId("amazonConnectionStatus").textContent = "Amazon authorization window opened. Sign in as the Amazon Business admin and select Allow.";
}

function receiveAmazonOAuthMessage(event) {
  if (event.origin !== window.location.origin) return;
  const payload = event.data || {};
  if (payload.type !== "giftflow-amazon-oauth") return;

  if (!payload.ok) {
    const message = payload.error || "Amazon Business did not return a refresh token.";
    byId("amazonConnectionStatus").textContent = message;
    showResult(message, false);
    return;
  }

  setValue("amazonRefreshToken", payload.refreshToken);
  if (payload.clientId) setValue("amazonClientId", payload.clientId);
  if (payload.marketplace) setValue("amazonMarketplace", payload.marketplace);
  if (payload.endpoint) setValue("amazonEndpoint", payload.endpoint);
  setValue("amazonMode", "amazon-business-api");
  syncSettingsFromInputs();
  silentSave();
  byId("amazonConnectionStatus").textContent = "Amazon Business connected. Refresh token saved in this browser workspace.";
  renderStatus();
  showResult("Amazon Business returned a refresh token. GiftFlow can now mark due orders as ready for the live connector.", true);
}

function showResult(message, success) {
  const result = byId("automationResult");
  result.className = `automation-result is-visible ${success ? "success" : "warning"}`;
  result.innerHTML = `<strong>${success ? "Ready" : "Needs attention"}</strong><p>${escapeHtml(message)}</p>`;
}

function showToast(message) {
  showResult(message, true);
}

function toggleCsvImport() {
  const input = byId("csvInput");
  input.classList.toggle("is-visible");

  if (input.classList.contains("is-visible")) {
    input.focus();
    return;
  }

  const lines = input.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const imported = lines
    .map(parseCsvLine)
    .filter((columns) => columns.length >= 7)
    .map((columns) => ({
      id: uid(),
      source: "csv",
      name: columns[0] || "",
      email: columns[1] || "",
      company: columns[2] || "",
      street: columns[3] || "",
      city: columns[4] || "",
      state: columns[5] || "",
      zip: columns[6] || "",
      assignedTo: columns[7] || state.campaign.owner || "",
      assignmentNote: "",
      readyToSend: true,
      readyMarkedAt: new Date().toISOString()
    }));

  if (imported.length) {
    state.recipients.push(...imported);
    input.value = "";
    render();
    silentSave();
    showResult(`Imported ${imported.length} prospect${imported.length === 1 ? "" : "s"}.`, true);
  }
}

function parseCsvLine(line) {
  const columns = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      value += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      columns.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  columns.push(value.trim());
  return columns;
}

function exportCsv() {
  const headers = [
    "createdAt",
    "status",
    "campaignName",
    "recipientName",
    "recipientEmail",
    "company",
    "stepName",
    "itemName",
    "asin",
    "itemUrl",
    "quantity",
    "giftMessage",
    "street",
    "city",
    "state",
    "zip"
  ];
  const rows = state.orderHistory.map((record) => headers.map((header) => {
    if (header === "street" || header === "city" || header === "state" || header === "zip") {
      return csvCell(record.shippingAddress?.[header] || "");
    }
    return csvCell(record[header] || "");
  }));
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "giftflow-order-history.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function wireButtons() {
  document.querySelectorAll("[data-start-signin]").forEach((button) => {
    button.addEventListener("click", () => {
      showSignIn();
    });
  });
  byId("getStartedButton").addEventListener("click", () => {
    showSignIn();
  });
  byId("showCreateAccountButton").addEventListener("click", () => showCreateAccount());
  byId("showSignInButton").addEventListener("click", () => showSignIn());
  byId("demoLoginButton").addEventListener("click", openDemoWorkspace);
  byId("backToIntroButton").addEventListener("click", showLanding);
  byId("createBackToIntroButton").addEventListener("click", showLanding);
  byId("saveButton").addEventListener("click", saveState);
  byId("heroRunButton").addEventListener("click", processDueGifts);
  byId("logoutButton").addEventListener("click", signOut);
  byId("connectAmazonButton").addEventListener("click", connectAmazonBusiness);
  byId("signInPanel").addEventListener("submit", submitSignIn);
  byId("createAccountPanel").addEventListener("submit", submitCreateAccount);
  byId("onboardingPanel").addEventListener("submit", submitOnboarding);
  window.addEventListener("message", receiveAmazonOAuthMessage);
  document.querySelectorAll(".need-help-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const guide = byId("amazonCredentialGuide");
      if (!guide.hidden && guide.open) {
        guide.open = false;
        guide.hidden = true;
        return;
      }

      guide.hidden = false;
      guide.open = true;
      guide.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  byId("amazonCredentialGuide").addEventListener("toggle", (event) => {
    if (!event.target.open) event.target.hidden = true;
  });
  byId("slidePrevButton").addEventListener("click", () => {
    const slideCount = document.querySelectorAll(".instruction-slide").length;
    currentSlide = (currentSlide - 1 + slideCount) % slideCount;
    renderInstructionSlides();
  });
  byId("slideNextButton").addEventListener("click", () => {
    const slideCount = document.querySelectorAll(".instruction-slide").length;
    currentSlide = (currentSlide + 1) % slideCount;
    renderInstructionSlides();
  });
  byId("resetDemoButton").addEventListener("click", () => {
    state = demoState();
    silentSave();
    location.reload();
  });
  byId("addStepButton").addEventListener("click", addStep);
  byId("addStepFooterButton").addEventListener("click", addStep);
  byId("addRecipientButton").addEventListener("click", addRecipient);
  byId("confirmSequenceButton").addEventListener("click", confirmSequence);
  byId("runAutomationButton").addEventListener("click", processDueGifts);
  byId("importButton").addEventListener("click", toggleCsvImport);
  byId("exportButton").addEventListener("click", exportCsv);
}

bindCampaignFields();
wireButtons();
initAuth();
render();
silentSave();
