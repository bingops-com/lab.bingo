const root = document.documentElement;
const themeButton = document.querySelector("[data-theme-toggle]");
const readPreference = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const savePreference = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Preferences are optional. */
  }
};
// Keep compatibility with the existing unquoted theme preference.
let theme = "light";
try {
  theme = localStorage.getItem("lab-theme") === "dark" ? "dark" : "light";
} catch {
  /* Light is the initial theme. */
}
function setTheme(value) {
  root.dataset.theme = value;
  themeButton.setAttribute("aria-pressed", String(value === "dark"));
  themeButton.setAttribute(
    "aria-label",
    value === "dark" ? "Activer le thème clair" : "Activer le thème sombre",
  );
}
setTheme(theme);
themeButton.addEventListener("click", () => {
  theme = root.dataset.theme === "dark" ? "light" : "dark";
  setTheme(theme);
  try {
    localStorage.setItem("lab-theme", theme);
  } catch {
    /* Optional. */
  }
});

const search = document.querySelector("#service-search");
const clear = document.querySelector("[data-clear]");
const filters = [...document.querySelectorAll("[data-filter]")];
const categories = [...document.querySelectorAll("[data-category-filter]")];
const groups = [...document.querySelectorAll("[data-group], [data-subgroup]")];
const services = [...document.querySelectorAll("[data-service]")];
const resultCount = document.querySelector("#result-count");
const empty = document.querySelector("#empty-results");
const normalize = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
// Index content once, so changing pin labels never changes search results.
const searchIndex = new Map(
  services.map((service) => [
    service,
    normalize(
      `${service.querySelector("a").textContent} ${service.dataset.keywords}`,
    ),
  ]),
);
let access = "all";
let category = "all";
function filterServices() {
  const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
  let count = 0;
  for (const service of services) {
    const visible =
      (access === "all" || service.dataset.access === access) &&
      (category === "all" || service.dataset.category === category) &&
      terms.every((term) => searchIndex.get(service).includes(term));
    service.hidden = !visible;
    if (visible) count++;
  }
  for (const group of groups)
    group.hidden = ![...group.querySelectorAll("[data-service]")].some(
      (service) => !service.hidden,
    );
  resultCount.textContent = `${count} service${count > 1 ? "s" : ""}`;
  empty.hidden = count !== 0;
  clear.hidden = search.value.length === 0;
}
search.addEventListener("input", filterServices);
clear.addEventListener("click", () => {
  search.value = "";
  filterServices();
  search.focus();
});
for (const button of filters) {
  button.addEventListener("click", () => {
    access = button.dataset.filter;
    for (const other of filters)
      other.setAttribute("aria-pressed", String(other === button));
    filterServices();
  });
}
for (const link of categories) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    category = link.dataset.categoryFilter;
    for (const other of categories) {
      if (other === link) other.setAttribute("aria-current", "true");
      else other.removeAttribute("aria-current");
    }
    filterServices();
  });
}
document.querySelector("[data-reset]").addEventListener("click", () => {
  search.value = "";
  categories[0].click();
  filters[0].click();
  search.focus();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) &&
    !document.activeElement.isContentEditable
  ) {
    event.preventDefault();
    search.focus();
  }
  if (event.key === "Escape" && document.activeElement === search) {
    search.value = "";
    filterServices();
    search.blur();
  }
});

const shortcuts = document.querySelector("[data-shortcuts]");
const pinStatus = document.querySelector("[data-pin-status]");
let noticeTimeout;
function announcePin(message) {
  clearTimeout(noticeTimeout);
  pinStatus.textContent = message;
  noticeTimeout = setTimeout(() => {
    pinStatus.textContent = "";
  }, 6000);
}
const pinButtons = [...document.querySelectorAll("[data-pin]")];
const byId = new Map(services.map((service) => [service.dataset.id, service]));
const savedPins = readPreference("lab-shortcuts-v1", [
  "notes",
  "coder",
  "portal",
]);
let pins = Array.isArray(savedPins)
  ? [...new Set(savedPins)].filter((id) => byId.has(id)).slice(0, 4)
  : ["notes", "coder", "portal"];
function renderShortcuts() {
  shortcuts.replaceChildren(
    ...pins.map((id) => {
      const service = byId.get(id);
      const source = service.querySelector("a");
      const link = document.createElement("a");
      link.className = "quick-link";
      link.href = source.href;
      link.append(source.querySelector(".service-icon").cloneNode(true));
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = source.querySelector(".service-name").textContent;
      const access = document.createElement("small");
      access.textContent = source.querySelector(".access").textContent;
      copy.append(name, access);
      link.append(copy, source.querySelector(".out").cloneNode(true));
      return link;
    }),
  );
  document.querySelector("[data-quick-empty]").hidden = pins.length !== 0;
  for (const button of pinButtons) {
    const selected = pins.includes(button.dataset.pin);
    const name = byId
      .get(button.dataset.pin)
      .querySelector(".service-name").textContent;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute(
      "aria-label",
      `${selected ? "Retirer" : "Ajouter"} ${name} ${selected ? "des" : "aux"} raccourcis`,
    );
    button.title = button.getAttribute("aria-label");
  }
}
for (const button of pinButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.pin;
    const name = byId.get(id).querySelector(".service-name").textContent;
    if (pins.includes(id)) {
      pins = pins.filter((pin) => pin !== id);
      announcePin(`${name} retiré des raccourcis.`);
    } else {
      if (pins.length >= 4) {
        announcePin(
          "4 raccourcis maximum. Retirez un raccourci avant d’en ajouter un autre.",
        );
        return;
      }
      pins.push(id);
      announcePin(`${name} ajouté aux raccourcis.`);
    }
    savePreference("lab-shortcuts-v1", pins);
    renderShortcuts();
    button.classList.remove("pin-confirm");
    requestAnimationFrame(() => button.classList.add("pin-confirm"));
  });
}
renderShortcuts();
root.classList.add("js");
document.querySelector(".finder").hidden = false;
filterServices();
