// Runs inside Gmail. Finds the GitHub issue/PR referenced in the open email and
// drops a GitHub-style State pill next to the subject line.

const REF_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(issues|pull)\/(\d+)/;

// @primer/octicons 16px paths, drawn white via currentColor.
const ICONS = {
  "issue-opened":
    '<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path>',
  "issue-closed":
    '<path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"></path><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"></path>',
  skip:
    '<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 0 0 10.62 5.038L2.962 3.879A6.472 6.472 0 0 0 1.5 8Zm12.99 0a6.5 6.5 0 0 0-10.62-5.038l9.158 9.159A6.472 6.472 0 0 0 14.49 8Z"></path>',
  "git-pull-request":
    '<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path>',
  "git-merge":
    '<path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"></path>',
  "git-pull-request-closed":
    '<path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"></path><path d="M9.72 2.22a.75.75 0 0 1 1.06 0l.97.97.97-.97a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734l-.97.97.97.97a.751.751 0 0 1-.734 1.275.749.749 0 0 1-.326-.215l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z"></path>',
};

function iconSvg(key) {
  return `<svg class="gh-pr-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">${ICONS[key] || ""}</svg>`;
}

// Find the first github.com issue/pull link inside the open email.
function findRef() {
  const anchors = document.querySelectorAll('a[href*="github.com"]');
  for (const a of anchors) {
    const m = (a.href || "").match(REF_RE);
    if (m) {
      return {
        owner: m[1],
        repo: m[2],
        number: m[4],
        url: `https://github.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`,
      };
    }
  }
  return null;
}

// Gmail's open-conversation subject line.
function getSubjectEl() {
  const els = document.querySelectorAll("h2.hP");
  for (const el of els) {
    if (el.offsetParent !== null) return el; // first visible one
  }
  return null;
}

let shownKey = null; // key of the pill currently in the DOM
let pendingKey = null; // key we've dispatched a fetch for and are awaiting

function clearBadge() {
  document.querySelectorAll(".gh-pr-badge").forEach((b) => b.remove());
  shownKey = null;
}

// Build the pill WITHOUT attaching it. We only add it to the page once we have a
// real value, so there is no loading placeholder and no blink.
function buildBadge(ref) {
  const badge = document.createElement("a");
  badge.className = "gh-pr-badge";
  badge.href = ref.url;
  badge.target = "_blank";
  badge.rel = "noopener noreferrer";
  return badge;
}

function placeBadge(badge) {
  const subject = getSubjectEl();
  if (subject) {
    badge.classList.add("gh-pr-inline");
    subject.appendChild(badge);
  } else {
    badge.classList.add("gh-pr-fixed"); // fallback: pin to viewport
    document.body.appendChild(badge);
  }
}

function applyData(badge, ref, data) {
  if (!data || data.error) {
    badge.classList.add("gh-pr-gray");
    const openOptions = (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    };
    if (data && data.error === "auth") {
      badge.textContent = "Set GitHub token →";
      badge.href = "#";
      badge.addEventListener("click", openOptions);
    } else if (data && data.error === "noaccess") {
      badge.textContent = "No repo access →";
      badge.title =
        `Your token can't read ${ref.owner}/${ref.repo}. Use a classic token with the ` +
        "'repo' scope, or have the org approve a fine-grained token scoped to it. Click to open settings.";
      badge.href = "#";
      badge.addEventListener("click", openOptions);
    } else if (data && data.error === "notfound") {
      badge.textContent = "Not found";
      badge.title = `The repo is visible to your token, but #${ref.number} wasn't found.`;
    } else if (data && data.error === "rate") {
      badge.textContent = "Rate limited";
    } else {
      badge.textContent = "Error";
      badge.title = (data && data.message) || "Could not fetch status.";
    }
    return;
  }

  badge.classList.add("gh-pr-" + data.color);
  badge.innerHTML = iconSvg(data.icon);
  const span = document.createElement("span");
  span.className = "gh-pr-label";
  span.textContent = data.label;
  badge.appendChild(span);
  badge.href = data.url || ref.url;
  badge.title = `${data.isPr ? "PR" : "Issue"} ${ref.owner}/${ref.repo}#${ref.number}: ${data.title || ""} — ${data.label}`;
}

function run() {
  const ref = findRef();
  if (!ref) {
    if (shownKey || pendingKey) {
      clearBadge();
      pendingKey = null;
    }
    return;
  }

  const key = `${ref.owner}/${ref.repo}#${ref.number}`;

  // Already rendered for this ref and still attached — nothing to do.
  const existing = document.querySelector(".gh-pr-badge");
  if (key === shownKey && existing && existing.isConnected) return;

  // A fetch for this exact ref is already in flight — wait for it.
  if (key === pendingKey) return;

  // New email (or Gmail wiped our pill). Drop anything stale and fetch fresh.
  clearBadge();
  pendingKey = key;

  chrome.runtime.sendMessage({ type: "GH_STATUS", ref }, (data) => {
    if (key !== pendingKey) return; // superseded by a newer email
    pendingKey = null;
    if (chrome.runtime.lastError || !data) return;

    // Only insert once we have an actual value — never an empty/loading tag.
    const badge = buildBadge(ref);
    applyData(badge, ref, data);
    placeBadge(badge);
    shownKey = key;
  });
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    run();
  }, 300);
}

window.addEventListener("hashchange", schedule);
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
schedule();
