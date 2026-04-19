/**
 * app.js — Shared utilities for RecruitIQ
 */

// ── Theme toggle ─────────────────────────────────────────────────────────────
const themeToggle = document.getElementById("themeToggle");
const savedTheme  = localStorage.getItem("riq-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

themeToggle?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next    = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("riq-theme", next);
});

// ── Loading overlay ──────────────────────────────────────────────────────────
function showLoader(msg = "Processing…") {
  const overlay = document.getElementById("loadingOverlay");
  const msgEl   = document.getElementById("loaderMsg");
  if (overlay) { overlay.classList.add("active"); }
  if (msgEl)   { msgEl.textContent = msg; }
}

function hideLoader() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) { overlay.classList.remove("active"); }
}

// ── Feature-card entrance animation ─────────────────────────────────────────
document.querySelectorAll(".feature-card").forEach(card => {
  const delay = card.dataset.delay || 0;
  card.style.opacity    = "0";
  card.style.transform  = "translateY(20px)";
  card.style.transition = `opacity .4s ease ${delay}ms, transform .4s ease ${delay}ms`;
  setTimeout(() => {
    card.style.opacity   = "1";
    card.style.transform = "translateY(0)";
  }, 80 + Number(delay));
});

// ── Session storage helpers ──────────────────────────────────────────────────
function saveScreeningData(data) {
  sessionStorage.setItem("screeningData", JSON.stringify(data));
}
function loadScreeningData() {
  const raw = sessionStorage.getItem("screeningData");
  return raw ? JSON.parse(raw) : null;
}

// ── Chart default config ─────────────────────────────────────────────────────
const CHART_COLORS = {
  selected:   "#22c55e",
  rejected:   "#ef4444",
  biased:     "#f59e0b",
  unbiased:   "#3b82f6",
  male:       "#6366f1",
  female:     "#ec4899",
  other:      "#14b8a6",
  phd:        "#8b5cf6",
  masters:    "#3b82f6",
  bachelors:  "#10b981",
  associate:  "#f59e0b",
  highschool: "#ef4444",
};

function chartDefaults() {
  return {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: getComputedStyle(document.documentElement)
                  .getPropertyValue("--ink2").trim() || "#4a453d",
          font: { family: "'DM Mono', monospace", size: 11 },
        }
      },
      tooltip: {
        backgroundColor: "#1a1714",
        titleColor: "#f0ebe0",
        bodyColor:  "#a0988a",
        borderColor:"#3a3530",
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        ticks: {
          color: getComputedStyle(document.documentElement)
                  .getPropertyValue("--ink3").trim() || "#8a837a",
          font: { family: "'DM Mono', monospace", size: 11 },
        },
        grid: { color: "rgba(150,140,130,.15)" }
      },
      y: {
        ticks: {
          color: getComputedStyle(document.documentElement)
                  .getPropertyValue("--ink3").trim() || "#8a837a",
          font: { family: "'DM Mono', monospace", size: 11 },
        },
        grid: { color: "rgba(150,140,130,.15)" }
      }
    }
  };
}

// ── Download helper ──────────────────────────────────────────────────────────
async function downloadResults(results, filename = "results.csv") {
  const response = await fetch("/api/download_results", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ results }),
  });
  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
