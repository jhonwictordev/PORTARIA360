const tabs = document.querySelectorAll(".segment-tab");
const panels = document.querySelectorAll(".segment-tab-panel");

function setActiveTab(tabId) {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabId);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabId);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
  });
});
