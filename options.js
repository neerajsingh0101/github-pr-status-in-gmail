const tokenEl = document.getElementById("token");
const statusEl = document.getElementById("status");

chrome.storage.local.get("githubToken", ({ githubToken }) => {
  if (githubToken) tokenEl.value = githubToken;
});

const saveBtn = document.getElementById("save");
let saveTimer = null;
saveBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ githubToken: tokenEl.value.trim() });
  statusEl.textContent = "";
  saveBtn.textContent = "Saved ✓";
  saveBtn.classList.add("saved");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveBtn.textContent = "Save";
    saveBtn.classList.remove("saved");
  }, 2000);
});

document.getElementById("test").addEventListener("click", async () => {
  const token = tokenEl.value.trim();
  if (!token) {
    statusEl.textContent = "Enter a token first.";
    return;
  }
  statusEl.textContent = "Testing…";
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.ok) {
      const u = await res.json();
      statusEl.textContent = `OK — authenticated as ${u.login}`;
    } else {
      statusEl.textContent = `Failed — HTTP ${res.status}`;
    }
  } catch (e) {
    statusEl.textContent = "Error: " + e;
  }
});
