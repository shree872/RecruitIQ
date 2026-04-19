/**
 * results.js — Results dashboard
 *
 * Fixes vs. original:
 *  1. All code runs inside DOMContentLoaded → elements guaranteed to exist
 *  2. Chart.js readiness guard → waits for Chart to be defined before drawing
 *  3. sessionStorage read happens inside DOMContentLoaded (not at parse time)
 *  4. Charts destroyed before re-creation → no "canvas already in use" error
 *  5. Inline fallback message if Chart.js never loads
 */

document.addEventListener("DOMContentLoaded", function () {

  // ── 1. Load data ────────────────────────────────────────────────────────────
  var data = loadScreeningData();

  var noDataState      = document.getElementById("noDataState");
  var resultsDashboard = document.getElementById("resultsDashboard");

  if (!data || !data.biased_results || data.biased_results.length === 0) {
    noDataState.classList.remove("hidden");
    resultsDashboard.classList.add("hidden");
    return;
  }

  noDataState.classList.add("hidden");
  resultsDashboard.classList.remove("hidden");

  // ── 2. Wait for Chart.js then init ──────────────────────────────────────────
  waitForChartJs(function () { initDashboard(data); });

});

// Poll until window.Chart is available (loaded async by base.html)
function waitForChartJs(cb) {
  if (typeof Chart !== "undefined") { cb(); return; }
  window.__chartJsReady = cb;          // hook called by base.html's onload
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (typeof Chart !== "undefined") { clearInterval(t); cb(); }
    else if (tries > 100) {            // 10 s timeout
      clearInterval(t);
      document.querySelectorAll(".chart-card").forEach(function (el) {
        el.innerHTML =
          '<p style="padding:1.5rem;color:var(--ink3);font-size:.85rem;text-align:center">' +
          "⚠️ Chart.js couldn't load. Check your internet connection and refresh.</p>";
      });
    }
  }, 100);
}

// ─── State ─────────────────────────────────────────────────────────────────────
var currentMode     = "biased";
var biasedResults   = [];
var unbiasedResults = [];
var activeResults   = [];
var charts          = {};   // {id: Chart instance}

// ─── Init ──────────────────────────────────────────────────────────────────────
function initDashboard(d) {
  biasedResults   = d.biased_results   || [];
  unbiasedResults = d.unbiased_results || [];
  activeResults   = biasedResults;

  renderSummaryCards();
  drawAllCharts("biased");
  renderTable(activeResults);

  document.getElementById("btnBiased")  .addEventListener("click", function () { setMode("biased"); });
  document.getElementById("btnUnbiased").addEventListener("click", function () { setMode("unbiased"); });
  document.getElementById("btnBoth")    .addEventListener("click", function () { setMode("both"); });

  document.getElementById("searchInput")   .addEventListener("input",  applyFilters);
  document.getElementById("filterDecision").addEventListener("change", applyFilters);

  document.getElementById("downloadBtn").addEventListener("click", function () {
    downloadResults(activeResults,
      "recruitiq_" + (currentMode === "unbiased" ? "unbiased" : "biased") + "_results.csv");
  });
}

function setMode(mode) {
  currentMode   = mode;
  activeResults = (mode === "unbiased") ? unbiasedResults : biasedResults;
  document.querySelectorAll(".toggle-btn").forEach(function (b) { b.classList.remove("active"); });
  ({ biased: "btnBiased", unbiased: "btnUnbiased", both: "btnBoth" });
  var ids = { biased: "btnBiased", unbiased: "btnUnbiased", both: "btnBoth" };
  document.getElementById(ids[mode]).classList.add("active");
  renderSummaryCards();
  drawAllCharts(mode);
  renderTable(activeResults);
}

// ─── Summary cards ────────────────────────────────────────────────────────────
function renderSummaryCards() {
  var bSel  = biasedResults.filter(function (r) { return r.decision === "Selected"; }).length;
  var uSel  = unbiasedResults.filter(function (r) { return r.decision === "Selected"; }).length;
  var total = biasedResults.length;
  var bRate = total ? (bSel / total * 100).toFixed(1) : 0;
  var uRate = total ? (uSel / total * 100).toFixed(1) : 0;
  var flips = biasedResults.filter(function (r, i) {
    return unbiasedResults[i] && r.decision !== unbiasedResults[i].decision;
  }).length;

  document.getElementById("summaryCards").innerHTML =
    mkCard("Total Screened",      total, "candidates uploaded") +
    mkCard("Selected (Biased)",   bSel,  bRate + "% rate · ⚠️ biased mode") +
    mkCard("Selected (Unbiased)", uSel,  uRate + "% rate · ✅ fair mode") +
    mkCard("Decision Flips",      flips, Math.abs(uRate - bRate).toFixed(1) + "% rate gap");
}

function mkCard(label, value, sub) {
  return '<div class="summary-card">' +
    '<div class="sc-label">' + label + '</div>' +
    '<div class="sc-value">' + value + '</div>' +
    '<div class="sc-sub">'   + sub   + '</div>' +
    '</div>';
}

// ─── Colour palette ────────────────────────────────────────────────────────────
var C = {
  selected:"#22c55e", rejected:"#ef4444",
  biased:"#f59e0b",   unbiased:"#3b82f6",
  male:"#6366f1",     female:"#ec4899",  other:"#14b8a6",
  phd:"#8b5cf6",      masters:"#3b82f6", bachelors:"#10b981",
  associate:"#f59e0b",highschool:"#ef4444",
};

// ─── Safe chart factory ────────────────────────────────────────────────────────
function mkChart(canvasId, type, data, options) {
  // Destroy old instance so canvas can be reused
  if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
  var canvas = document.getElementById(canvasId);
  if (!canvas) { console.warn("Canvas not found:", canvasId); return; }
  canvas.style.display = "block";   // make sure it's visible
  charts[canvasId] = new Chart(canvas.getContext("2d"), { type: type, data: data, options: options });
}

// ─── Shared chart options ──────────────────────────────────────────────────────
function opts(extra) {
  var base = {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 400 },
    plugins: {
      legend: {
        labels: { color: "#8a837a", font: { family: "'DM Mono',monospace", size: 11 }, padding: 12 }
      },
      tooltip: {
        backgroundColor:"#1a1714", titleColor:"#f0ebe0",
        bodyColor:"#a0988a", borderColor:"#3a3530", borderWidth:1
      }
    },
    scales: {
      x: { ticks:{ color:"#8a837a", font:{family:"'DM Mono',monospace",size:11} }, grid:{ color:"rgba(150,140,130,.12)" } },
      y: { ticks:{ color:"#8a837a", font:{family:"'DM Mono',monospace",size:11} }, grid:{ color:"rgba(150,140,130,.12)" } }
    }
  };
  if (extra) Object.assign(base, extra);
  return base;
}

function optsNoScale(extra) {
  var o = opts(extra);
  delete o.scales;
  return o;
}

// ─── Draw all 4 charts ─────────────────────────────────────────────────────────
function drawAllCharts(mode) {
  drawSelection(mode);
  drawGender(mode);
  drawEducation(mode);
  drawScores(mode);
}

// Chart 1 — Selection distribution
function drawSelection(mode) {
  if (mode === "both") {
    var bS = biasedResults.filter(function(r){return r.decision==="Selected";}).length;
    var uS = unbiasedResults.filter(function(r){return r.decision==="Selected";}).length;
    mkChart("chartSelection", "bar", {
      labels: ["Selected","Rejected"],
      datasets: [
        { label:"Biased",   data:[bS, biasedResults.length-bS],   backgroundColor:C.biased,   borderRadius:5 },
        { label:"Unbiased", data:[uS, unbiasedResults.length-uS], backgroundColor:C.unbiased, borderRadius:5 }
      ]
    }, opts());
  } else {
    var src = (mode==="unbiased") ? unbiasedResults : biasedResults;
    var sel = src.filter(function(r){return r.decision==="Selected";}).length;
    mkChart("chartSelection", "doughnut", {
      labels: ["Selected","Rejected"],
      datasets: [{ data:[sel, src.length-sel], backgroundColor:[C.selected,C.rejected], borderWidth:3, borderColor:"transparent", hoverOffset:6 }]
    }, optsNoScale({ cutout:"65%" }));
  }
}

// Chart 2 — By gender
function drawGender(mode) {
  function gs(results) {
    var g={};
    results.forEach(function(r){
      var k=r.gender||"Unknown";
      if(!g[k]) g[k]={total:0,selected:0};
      g[k].total++;
      if(r.decision==="Selected") g[k].selected++;
    });
    return g;
  }
  var gCol={Male:C.male,Female:C.female,Other:C.other,Unknown:"#9ca3af"};

  if (mode==="both") {
    var bG=gs(biasedResults), uG=gs(unbiasedResults);
    var labs=Object.keys(Object.assign({},bG,uG));
    mkChart("chartGender","bar",{
      labels:labs,
      datasets:[
        {label:"Biased %",  data:labs.map(function(l){return bG[l]?+(bG[l].selected/bG[l].total*100).toFixed(1):0;}), backgroundColor:C.biased,   borderRadius:5},
        {label:"Unbiased %",data:labs.map(function(l){return uG[l]?+(uG[l].selected/uG[l].total*100).toFixed(1):0;}), backgroundColor:C.unbiased, borderRadius:5}
      ]
    }, opts());
  } else {
    var src2=(mode==="unbiased")?unbiasedResults:biasedResults;
    var g2=gs(src2); var l2=Object.keys(g2);
    mkChart("chartGender","bar",{
      labels:l2,
      datasets:[{label:"Selection %",data:l2.map(function(l){return +(g2[l].selected/g2[l].total*100).toFixed(1);}),
        backgroundColor:l2.map(function(l){return gCol[l]||"#9ca3af";}),borderRadius:5}]
    }, opts({plugins:{legend:{display:false},tooltip:opts().plugins.tooltip}}));
  }
}

// Chart 3 — By education
function drawEducation(mode) {
  var order=["PhD","Master's","Bachelor's","Associate","High School","Other"];
  var eCol={"PhD":C.phd,"Master's":C.masters,"Bachelor's":C.bachelors,"Associate":C.associate,"High School":C.highschool,"Other":"#9ca3af"};

  function es(results){
    var g={};
    results.forEach(function(r){
      var k=r.education||"Other";
      if(!g[k]) g[k]={total:0,selected:0};
      g[k].total++;
      if(r.decision==="Selected") g[k].selected++;
    });
    return g;
  }

  var hOpts = opts(); hOpts.indexAxis="y";

  if (mode==="both") {
    var bE=es(biasedResults),uE=es(unbiasedResults);
    var labs=order.filter(function(l){return bE[l]||uE[l];});
    var bOpts=opts(); bOpts.indexAxis="y";
    mkChart("chartEdu","bar",{
      labels:labs,
      datasets:[
        {label:"Biased %",  data:labs.map(function(l){return bE[l]?+(bE[l].selected/bE[l].total*100).toFixed(1):0;}),backgroundColor:C.biased,  borderRadius:5},
        {label:"Unbiased %",data:labs.map(function(l){return uE[l]?+(uE[l].selected/uE[l].total*100).toFixed(1):0;}),backgroundColor:C.unbiased,borderRadius:5}
      ]
    }, bOpts);
  } else {
    var src3=(mode==="unbiased")?unbiasedResults:biasedResults;
    var e3=es(src3); var l3=order.filter(function(l){return e3[l];});
    var sOpts=opts(); sOpts.indexAxis="y";
    sOpts.plugins.legend={display:false};
    mkChart("chartEdu","bar",{
      labels:l3,
      datasets:[{label:"Selection %",data:l3.map(function(l){return +(e3[l].selected/e3[l].total*100).toFixed(1);}),
        backgroundColor:l3.map(function(l){return eCol[l]||"#9ca3af";}),borderRadius:5}]
    }, sOpts);
  }
}

// Chart 4 — Score histogram
function drawScores(mode) {
  var bins=[0,10,20,30,40,50,60,70,80,90,100];
  var labs=bins.slice(0,-1).map(function(b,i){return b+"-"+bins[i+1];});
  function cb(results){
    var c=new Array(10).fill(0);
    results.forEach(function(r){c[Math.min(Math.floor(Number(r.score)/10),9)]++;});
    return c;
  }

  if (mode==="both") {
    mkChart("chartScores","bar",{
      labels:labs,
      datasets:[
        {label:"Biased",  data:cb(biasedResults),  backgroundColor:C.biased+"cc",  borderRadius:3},
        {label:"Unbiased",data:cb(unbiasedResults),backgroundColor:C.unbiased+"cc",borderRadius:3}
      ]
    }, opts());
  } else {
    var src4=(mode==="unbiased")?unbiasedResults:biasedResults;
    var nOpts=opts(); nOpts.plugins.legend={display:false};
    mkChart("chartScores","bar",{
      labels:labs,
      datasets:[{label:"Candidates",data:cb(src4),
        backgroundColor:(mode==="unbiased")?C.unbiased+"cc":C.biased+"cc",borderRadius:3}]
    }, nOpts);
  }
}

// ─── Candidate table ────────────────────────────────────────────────────────────
function renderTable(results) {
  var tbody = document.getElementById("resultsBody");
  tbody.innerHTML = "";
  results.forEach(function (r, i) {
    var dec  = r.decision === "Selected"
      ? '<span class="badge-selected">✓ Selected</span>'
      : '<span class="badge-rejected">✗ Rejected</span>';
    var sw   = Number(r.score) || 0;
    var bCol = sw >= 50 ? "var(--selected)" : "var(--rejected)";
    var row  = document.createElement("tr");
    row.dataset.name     = (r.name     || "").toLowerCase();
    row.dataset.skills   = (r.skills   || "").toLowerCase();
    row.dataset.decision =  r.decision || "";
    row.innerHTML =
      "<td>" + (i+1) + "</td>" +
      "<td><strong>" + (r.name||"—") + "</strong></td>" +
      "<td>" + (r.gender||"—") + "</td>" +
      "<td>" + (r.education||"—") + "</td>" +
      "<td>" + (r.experience_years!=null?r.experience_years:"—") + "</td>" +
      "<td>" + (r.num_skills!=null?r.num_skills:"—") + "</td>" +
      "<td><div style='display:flex;align-items:center;gap:.5rem'>" +
        "<div style='flex:1;background:var(--bg2);border-radius:4px;height:6px;overflow:hidden'>" +
          "<div style='height:100%;width:"+sw+"%;background:"+bCol+";border-radius:4px;transition:width .4s'></div>" +
        "</div>" +
        "<span style='font-family:var(--font-mono);font-size:.8rem;white-space:nowrap'>"+r.score+"%</span>" +
      "</div></td>" +
      "<td>" + dec + "</td>";
    tbody.appendChild(row);
  });
}

function applyFilters() {
  var s = document.getElementById("searchInput").value.toLowerCase();
  var d = document.getElementById("filterDecision").value;
  document.querySelectorAll("#resultsBody tr").forEach(function (row) {
    var ms = !s || row.dataset.name.includes(s) || row.dataset.skills.includes(s);
    var md = !d || row.dataset.decision === d;
    row.style.display = (ms && md) ? "" : "none";
  });
}
