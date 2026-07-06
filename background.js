// Service worker: talks to the GitHub API on behalf of the content script so the
// token never lives in the Gmail page and CORS/CSP is never an issue.

const CACHE = new Map(); // "owner/repo#number" -> { data, ts }
const TTL = 5 * 60 * 1000; // 5 minutes

async function getToken() {
  const { githubToken } = await chrome.storage.local.get("githubToken");
  return (githubToken || "").trim();
}

function classify(issue, pull) {
  if (pull) {
    if (pull.merged) return { label: "Merged", color: "purple", icon: "git-merge", isPr: true };
    if (pull.state === "closed") return { label: "Closed", color: "red", icon: "git-pull-request-closed", isPr: true };
    if (pull.draft) return { label: "Draft", color: "gray", icon: "git-pull-request", isPr: true };
    return { label: "Open", color: "green", icon: "git-pull-request", isPr: true };
  }
  if (issue.state === "open") return { label: "Open", color: "green", icon: "issue-opened", isPr: false };
  if (issue.state_reason === "not_planned") return { label: "Closed", color: "gray", icon: "skip", isPr: false };
  return { label: "Closed", color: "purple", icon: "issue-closed", isPr: false };
}

async function fetchStatus(ref) {
  const token = await getToken();
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;

  let issueRes;
  try {
    issueRes = await fetch(`${base}/issues/${ref.number}`, { headers });
  } catch (e) {
    return { error: "network", message: String(e) };
  }

  if (issueRes.status === 401) return { error: "auth" };
  if (issueRes.status === 403) {
    const rem = issueRes.headers.get("x-ratelimit-remaining");
    return rem === "0" ? { error: "rate" } : { error: "auth" };
  }
  if (issueRes.status === 404) {
    // Private repos return 404 when unauthenticated / no access.
    if (!token) return { error: "auth" };
    // Distinguish "token can't see this repo" from "issue number doesn't exist".
    try {
      const repoRes = await fetch(base, { headers });
      if (repoRes.status === 404 || repoRes.status === 403) return { error: "noaccess" };
    } catch (_) {
      /* fall through to notfound */
    }
    return { error: "notfound" };
  }
  if (!issueRes.ok) return { error: "http", status: issueRes.status };

  const issue = await issueRes.json();

  let pull = null;
  if (issue.pull_request) {
    try {
      const pullRes = await fetch(`${base}/pulls/${ref.number}`, { headers });
      if (pullRes.ok) pull = await pullRes.json();
    } catch (_) {
      /* fall back to issue data */
    }
  }

  const c = classify(issue, pull);
  return { ok: true, title: issue.title, url: issue.html_url, ...c };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return; // no async response
  }

  if (msg && msg.type === "GH_STATUS") {
    const key = `${msg.ref.owner}/${msg.ref.repo}#${msg.ref.number}`;
    const cached = CACHE.get(key);
    if (cached && Date.now() - cached.ts < TTL) {
      sendResponse(cached.data);
      return true;
    }
    fetchStatus(msg.ref)
      .then((data) => {
        if (data && data.ok) CACHE.set(key, { data, ts: Date.now() });
        sendResponse(data);
      })
      .catch((e) => sendResponse({ error: "exception", message: String(e) }));
    return true; // keep the message channel open for the async response
  }
});
