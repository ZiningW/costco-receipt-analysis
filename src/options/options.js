const DEFAULT_SETTINGS = {
  regionPreference: "US"
};

function loadSettings() {
  if (!chrome?.storage?.sync) return;
  chrome.storage.sync.get(DEFAULT_SETTINGS, (res) => {
    const value = res.regionPreference || "US";
    const input = document.querySelector(`input[name="region"][value="${value}"]`);
    if (input) {
      input.checked = true;
    }
  });
}

function saveSettings(value) {
  if (!chrome?.storage?.sync) return;
  chrome.storage.sync.set({ regionPreference: value }, () => {
    console.log("Costcoholic: regionPreference set to", value);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  document.querySelectorAll('input[name="region"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        saveSettings(event.target.value);
      }
    });
  });
});
