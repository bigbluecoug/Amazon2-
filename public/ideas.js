const storeKey = "giftflow-studio-state-v1";
const amazonImageMaxAgeMs = 24 * 60 * 60 * 1000;
const fallbackIdeas = [
  {
    title: "Premium coffee sampler",
    query: "premium coffee sampler gift box",
    imageUrl: "",
    message: "Hi {{firstName}}, thought this would make your next planning session a little better. - {{owner}}"
  },
  {
    title: "Desk notebook set",
    query: "premium desk notebook set",
    imageUrl: "",
    message: "Hi {{firstName}}, a useful place for the next round of big ideas. - {{owner}}"
  }
];

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

let state = loadState();
let giftIdeas = fallbackIdeas;

function loadState() {
  const raw = localStorage.getItem(storeKey);
  if (!raw) return { associates: { tag: "" }, steps: [] };

  try {
    const parsed = JSON.parse(raw);
    parsed.associates = parsed.associates || { tag: "" };
    parsed.steps = parsed.steps || [];
    return parsed;
  } catch (_error) {
    return { associates: { tag: "" }, steps: [] };
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function freshAmazonImageUrl(url, savedAt) {
  if (!url) return "";
  if (!savedAt) return url;
  const savedTime = Date.parse(savedAt);
  if (Number.isNaN(savedTime) || Date.now() - savedTime > amazonImageMaxAgeMs) return "";
  return url;
}

function buildAffiliateUrl(query) {
  const url = new URL("https://www.amazon.com/s");
  url.searchParams.set("k", query);
  const tag = String(state.associates?.tag || "").trim();
  if (tag) url.searchParams.set("tag", tag);
  return url.toString();
}

async function loadGiftIdeas() {
  try {
    const response = await fetch("/api/gift-ideas", { credentials: "same-origin" });
    const payload = await response.json();
    if (payload.ok && Array.isArray(payload.ideas) && payload.ideas.length) {
      giftIdeas = payload.ideas;
    }
  } catch (_error) {
    giftIdeas = fallbackIdeas;
  }
}

function renderAffiliateIdeas() {
  const tagInput = byId("affiliateTag");
  tagInput.value = state.associates?.tag || "";

  const list = byId("affiliateIdeaList");
  list.innerHTML = giftIdeas.map((idea, index) => {
    const url = buildAffiliateUrl(idea.query);
    const imageUrl = freshAmazonImageUrl(idea.imageUrl, idea.imageUrlSavedAt);
    return `
      <article class="affiliate-idea-card">
        <figure class="affiliate-idea-image ${imageUrl ? "" : "is-empty"}">
          ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(idea.title)}">` : "<span>Amazon Associates gift</span>"}
        </figure>
        <div>
          <span>Idea ${index + 1}</span>
          <strong>${escapeHtml(idea.title)}</strong>
        </div>
        <p>${escapeHtml(idea.query)}</p>
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
}

function useAffiliateIdea(index) {
  const idea = giftIdeas[index];
  if (!idea) return;

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
  step.imageUrl = freshAmazonImageUrl(idea.imageUrl, idea.imageUrlSavedAt) || step.imageUrl || "";
  step.imageUrlSavedAt = step.imageUrl ? new Date().toISOString() : "";
  step.asin = "";
  step.quantity = step.quantity || 1;
  step.message = step.message || idea.message || "Hi {{firstName}}, thought you might enjoy this. - {{owner}}";
  step.note = step.note || "Amazon Associates idea link";
  state.execution = state.execution || {};
  state.execution.confirmedSequenceSignature = "";
  state.execution.sequenceConfirmedAt = "";

  saveState();
  byId("ideasStatus").textContent = `Added ${idea.title} to the gift sequence.`;
  window.location.href = "/#sequence";
}

byId("affiliateTag").addEventListener("input", (event) => {
  state.associates = state.associates || {};
  state.associates.tag = event.target.value.trim();
  saveState();
  renderAffiliateIdeas();
});

loadGiftIdeas().then(renderAffiliateIdeas);
