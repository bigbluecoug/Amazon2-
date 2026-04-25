const storeKey = "giftflow-studio-state-v1";
const amazonImageMaxAgeMs = 24 * 60 * 60 * 1000;
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

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(storeKey);
  if (!raw) {
    return {
      associates: { tag: "", images: {} },
      steps: []
    };
  }

  try {
    const parsed = JSON.parse(raw);
    parsed.associates = parsed.associates || { tag: "", images: {} };
    parsed.associates.images = parsed.associates.images || {};
    parsed.steps = parsed.steps || [];
    return parsed;
  } catch (_error) {
    return {
      associates: { tag: "", images: {} },
      steps: []
    };
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

function freshAmazonImageUrl(record) {
  if (!record || typeof record !== "object") return "";
  const savedAt = Date.parse(record.savedAt || "");
  if (!record.url || Number.isNaN(savedAt) || Date.now() - savedAt > amazonImageMaxAgeMs) return "";
  return record.url;
}

function freshAffiliateImageUrl(imageKey) {
  return freshAmazonImageUrl(state.associates?.images?.[imageKey]);
}

function buildAffiliateUrl(query) {
  const url = new URL("https://www.amazon.com/s");
  url.searchParams.set("k", query);
  const tag = String(state.associates?.tag || "").trim();
  if (tag) url.searchParams.set("tag", tag);
  return url.toString();
}

function renderAffiliateIdeas() {
  const tagInput = byId("affiliateTag");
  tagInput.value = state.associates?.tag || "";

  const list = byId("affiliateIdeaList");
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
      saveState();
    });
    input.addEventListener("change", renderAffiliateIdeas);
  });
}

function useAffiliateIdea(index) {
  const idea = affiliateIdeas[index];
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
  step.imageUrl = freshAffiliateImageUrl(idea.imageKey) || step.imageUrl || "";
  step.imageUrlSavedAt = step.imageUrl ? new Date().toISOString() : "";
  step.asin = "";
  step.quantity = step.quantity || 1;
  step.message = step.message || idea.message;
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
  state.associates.images = state.associates.images || {};
  state.associates.tag = event.target.value.trim();
  saveState();
  renderAffiliateIdeas();
});

renderAffiliateIdeas();
