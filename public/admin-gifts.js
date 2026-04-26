let ideas = [];

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message, success = true) {
  const status = byId("catalogStatus");
  status.textContent = message;
  status.classList.toggle("warning", !success);
}

function blankIdea() {
  return {
    title: "",
    query: "",
    imageUrl: "",
    message: "Hi {{firstName}}, thought you might enjoy this. - {{owner}}"
  };
}

async function requireAdminAccess() {
  try {
    const response = await fetch("/api/auth/config", { credentials: "same-origin" });
    const payload = await response.json();
    if (payload.user && payload.permissions?.giftIdeaAdmin) {
      byId("catalogEditor").hidden = false;
      byId("catalogAuth").hidden = true;
      return true;
    }

    byId("catalogEditor").hidden = true;
    byId("catalogAuth").hidden = false;
    byId("authStatus").textContent = payload.user
      ? "You are signed in, but this email is not allowed to edit gift suggestions."
      : "You are not signed in yet.";
    return false;
  } catch (_error) {
    byId("catalogEditor").hidden = true;
    byId("catalogAuth").hidden = false;
    byId("authStatus").textContent = "Could not check authorization.";
    return false;
  }
}

async function loadIdeas() {
  try {
    const response = await fetch("/api/gift-ideas", { credentials: "same-origin" });
    const payload = await response.json();
    ideas = payload.ok && Array.isArray(payload.ideas) ? payload.ideas : [blankIdea()];
    renderIdeas();
  } catch (_error) {
    ideas = [blankIdea()];
    renderIdeas();
    setStatus("Could not load the catalog. You can still draft changes here.", false);
  }
}

function renderIdeas() {
  const list = byId("catalogList");
  const template = byId("catalogItemTemplate");
  list.innerHTML = "";

  ideas.forEach((idea, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("[data-title-label]").textContent = idea.title || `Gift idea ${index + 1}`;
    node.querySelector(".remove-catalog-item").addEventListener("click", () => {
      ideas.splice(index, 1);
      if (!ideas.length) ideas.push(blankIdea());
      renderIdeas();
    });

    node.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      input.value = idea[field] || "";
      input.addEventListener("input", () => {
        idea[field] = input.value;
        if (field === "imageUrl") {
          idea.imageUrlSavedAt = input.value.trim() ? new Date().toISOString() : "";
        }
        if (field === "title") node.querySelector("[data-title-label]").textContent = input.value || `Gift idea ${index + 1}`;
      });
    });

    list.appendChild(node);
  });
}

async function saveIdeas() {
  const cleaned = ideas
    .map((idea) => ({
      title: String(idea.title || "").trim(),
      query: String(idea.query || "").trim(),
      imageUrl: String(idea.imageUrl || "").trim(),
      imageUrlSavedAt: String(idea.imageUrl || "").trim() ? (idea.imageUrlSavedAt || new Date().toISOString()) : "",
      message: String(idea.message || "").trim()
    }))
    .filter((idea) => idea.title && idea.query);

  if (!cleaned.length) {
    setStatus("Add at least one gift with a title and Amazon search query.", false);
    return;
  }

  const response = await fetch("/api/gift-ideas", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideas: cleaned })
  });
  const payload = await response.json();

  if (!payload.ok) {
    setStatus(payload.errors?.join(" ") || "Could not save gift ideas.", false);
    return;
  }

  ideas = payload.ideas;
  renderIdeas();
  setStatus("Gift ideas saved.");
}

byId("addGiftIdeaButton").addEventListener("click", () => {
  ideas.push(blankIdea());
  renderIdeas();
});
byId("saveGiftIdeasButton").addEventListener("click", saveIdeas);

requireAdminAccess().then((allowed) => {
  if (allowed) loadIdeas();
});
