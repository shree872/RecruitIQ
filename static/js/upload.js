/**
 * upload.js — Upload page logic
 */

// ── Mode tabs ─────────────────────────────────────────────────────────────────
const tabs = document.querySelectorAll(".mode-tab");
const panels = {
  csv:    document.getElementById("panel-csv"),
  single: document.getElementById("panel-single"),
  demo:   document.getElementById("panel-demo"),
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.mode;
    Object.keys(panels).forEach(k => {
      panels[k].classList.toggle("hidden", k !== mode);
    });
  });
});

// ── CSV Upload ────────────────────────────────────────────────────────────────
const csvDropzone  = document.getElementById("csvDropzone");
const csvInput     = document.getElementById("csvInput");
const csvUploadBtn = document.getElementById("csvUploadBtn");
let csvFile = null;

// Click to open
csvDropzone.addEventListener("click", () => csvInput.click());

// Drag-and-drop events
["dragover","dragenter"].forEach(e =>
  csvDropzone.addEventListener(e, ev => { ev.preventDefault(); csvDropzone.classList.add("dragging"); })
);
["dragleave","dragend"].forEach(e =>
  csvDropzone.addEventListener(e, () => csvDropzone.classList.remove("dragging"))
);
csvDropzone.addEventListener("drop", ev => {
  ev.preventDefault();
  csvDropzone.classList.remove("dragging");
  const f = ev.dataTransfer.files[0];
  if (f && f.name.endsWith(".csv")) handleCsvFile(f);
  else alert("Please drop a .csv file.");
});
csvInput.addEventListener("change", () => {
  if (csvInput.files[0]) handleCsvFile(csvInput.files[0]);
});

function handleCsvFile(f) {
  csvFile = f;
  csvDropzone.querySelector(".dz-text").textContent = `✓ ${f.name}`;
  csvDropzone.querySelector(".dz-hint").textContent = `${(f.size/1024).toFixed(1)} KB`;
  csvDropzone.style.borderColor = "var(--accent)";
  csvDropzone.style.background  = "var(--accent-light)";
  csvUploadBtn.disabled = false;
}

csvUploadBtn.addEventListener("click", async () => {
  if (!csvFile) return;
  const fd = new FormData();
  fd.append("file", csvFile);
  showLoader("Uploading & screening resumes…");
  try {
    const r    = await fetch("/api/upload_csv", { method: "POST", body: fd });
    const data = await r.json();
    hideLoader();
    if (data.error) { alert("Error: " + data.error); return; }
    saveScreeningData(data);
    window.location.href = "/results";
  } catch (e) {
    hideLoader();
    alert("Upload failed: " + e.message);
  }
});

// ── Single resume upload ──────────────────────────────────────────────────────
const singleDropzone  = document.getElementById("singleDropzone");
const singleInput     = document.getElementById("singleInput");
const singleUploadBtn = document.getElementById("singleUploadBtn");
let singleFile = null;

singleDropzone.addEventListener("click", () => singleInput.click());
["dragover","dragenter"].forEach(e =>
  singleDropzone.addEventListener(e, ev => { ev.preventDefault(); singleDropzone.classList.add("dragging"); })
);
["dragleave","dragend"].forEach(e =>
  singleDropzone.addEventListener(e, () => singleDropzone.classList.remove("dragging"))
);
singleDropzone.addEventListener("drop", ev => {
  ev.preventDefault();
  singleDropzone.classList.remove("dragging");
  const f = ev.dataTransfer.files[0];
  if (f) handleSingleFile(f);
});
singleInput.addEventListener("change", () => {
  if (singleInput.files[0]) handleSingleFile(singleInput.files[0]);
});

function handleSingleFile(f) {
  singleFile = f;
  singleDropzone.querySelector(".dz-text").textContent = `✓ ${f.name}`;
  singleDropzone.querySelector(".dz-hint").textContent = `${(f.size/1024).toFixed(1)} KB`;
  singleDropzone.style.borderColor = "var(--accent)";
  singleUploadBtn.disabled = false;
}

singleUploadBtn.addEventListener("click", async () => {
  if (!singleFile) return;
  const fd = new FormData();
  fd.append("file", singleFile);
  showLoader("Parsing resume…");
  try {
    const r    = await fetch("/api/upload_resume", { method: "POST", body: fd });
    const data = await r.json();
    hideLoader();
    if (data.error) { alert("Error: " + data.error); return; }
    showSingleResult(data);
  } catch (e) {
    hideLoader();
    alert("Upload failed: " + e.message);
  }
});

function showSingleResult(data) {
  const { parsed, biased_result, unbiased_result } = data;

  // Show parsed fields
  const preview = document.getElementById("resumePreview");
  const fields  = document.getElementById("parsedFields");
  fields.innerHTML = `
    <div class="parsed-field"><label>Name</label><div>${parsed.name}</div></div>
    <div class="parsed-field"><label>Education</label><div>${parsed.education}</div></div>
    <div class="parsed-field"><label>Experience</label><div>${parsed.experience_years} yrs</div></div>
    <div class="parsed-field"><label>Skills Found</label><div>${parsed.num_skills}</div></div>
    <div class="parsed-field" style="grid-column:1/-1"><label>Skills</label><div style="font-size:.8rem;color:var(--ink2)">${parsed.skills || "—"}</div></div>
  `;
  preview.classList.remove("hidden");

  // Show modal
  const modal = document.getElementById("singleResultModal");
  const content = document.getElementById("singleResultContent");

  const biasedDecClass  = biased_result.decision  === "Selected" ? "badge-selected" : "badge-rejected";
  const unbiasedDecClass = unbiased_result.decision === "Selected" ? "badge-selected" : "badge-rejected";

  content.innerHTML = `
    <div class="result-comparison">
      <div class="result-box biased">
        <h4>⚠️ Biased Mode</h4>
        <div class="decision"><span class="${biasedDecClass}">${biased_result.decision}</span></div>
        <div class="score">Score: ${biased_result.score}%</div>
      </div>
      <div class="result-box unbiased">
        <h4>✅ Unbiased Mode</h4>
        <div class="decision"><span class="${unbiasedDecClass}">${unbiased_result.decision}</span></div>
        <div class="score">Score: ${unbiased_result.score}%</div>
      </div>
    </div>
    <p style="margin-top:1rem;font-size:.85rem;color:var(--ink3)">
      ${biased_result.decision !== unbiased_result.decision
        ? "⚠️ <strong>Decision differs</strong> between modes — bias may have affected this candidate."
        : "✓ Both modes agree on this candidate's outcome."}
    </p>
  `;
  modal.classList.remove("hidden");
}

// Modal close
document.getElementById("modalClose").addEventListener("click", () =>
  document.getElementById("singleResultModal").classList.add("hidden")
);

// ── Demo ──────────────────────────────────────────────────────────────────────
document.getElementById("demoBtn").addEventListener("click", async () => {
  showLoader("Generating 30 synthetic resumes…");
  try {
    const r    = await fetch("/api/generate_sample", { method: "POST" });
    const data = await r.json();
    hideLoader();
    if (data.success) {
      saveScreeningData(data);
      window.location.href = "/results";
    }
  } catch (e) {
    hideLoader();
    alert("Demo failed: " + e.message);
  }
});

// ── Sample CSV download ───────────────────────────────────────────────────────
document.getElementById("sampleDownloadLink").addEventListener("click", e => {
  e.preventDefault();
  const header = "name,gender,education,experience_years,skills,num_skills\n";
  const rows = [
    "Alice Smith,Female,Master's,5,\"python,machine learning,sql\",3",
    "Bob Jones,Male,Bachelor's,3,\"java,react,docker\",3",
    "Carol White,Female,PhD,8,\"deep learning,pytorch,tensorflow\",3",
    "David Brown,Male,Associate,1,\"excel,tableau\",2",
    "Eve Davis,Other,Bachelor's,4,\"python,pandas,data analysis\",3",
  ];
  const csv  = header + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = "resume_template.csv";
  a.click();
});
