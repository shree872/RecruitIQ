/**
 * bias.js — Bias Lab dashboard
 * Same fixes as results.js: DOMContentLoaded + Chart.js readiness guard
 */

document.addEventListener("DOMContentLoaded", function () {

  var data = loadScreeningData();

  var noDataState   = document.getElementById("noDataState");
  var biasDashboard = document.getElementById("biasDashboard");

  // Load demo button (shown when no data)
  var loadDemoBtn = document.getElementById("loadDemoBtn");
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener("click", function () {
      showLoader("Generating demo data…");
      fetch("/api/generate_sample", { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          hideLoader();
          if (d.success) { saveScreeningData(d); location.reload(); }
        })
        .catch(function (e) { hideLoader(); alert(e.message); });
    });
  }

  if (!data || !data.biased_results || data.biased_results.length === 0) {
    noDataState.classList.remove("hidden");
    biasDashboard.classList.add("hidden");
    return;
  }

  noDataState.classList.add("hidden");
  biasDashboard.classList.remove("hidden");

  waitForChartJs(function () { initBiasLab(data); });

});

// Same polling guard used in results.js
function waitForChartJs(cb) {
  if (typeof Chart !== "undefined") { cb(); return; }
  window.__chartJsReady = cb;
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (typeof Chart !== "undefined") { clearInterval(t); cb(); }
    else if (tries > 100) {
      clearInterval(t);
      document.querySelectorAll(".gauge-card,.breakdown-card").forEach(function (el) {
        el.innerHTML =
          '<p style="padding:1rem;color:var(--ink3);font-size:.85rem;text-align:center">' +
          "⚠️ Chart.js couldn't load. Refresh and check your internet connection.</p>";
      });
    }
  }, 100);
}

var biasCharts = {};

function mkChart(id, type, data, options) {
  if (biasCharts[id]) { biasCharts[id].destroy(); delete biasCharts[id]; }
  var canvas = document.getElementById(id);
  if (!canvas) return;
  canvas.style.display = "block";
  biasCharts[id] = new Chart(canvas.getContext("2d"), { type:type, data:data, options:options });
}

var C = {
  selected:"#22c55e", rejected:"#ef4444",
  biased:"#f59e0b",   unbiased:"#3b82f6",
  male:"#6366f1",     female:"#ec4899",  other:"#14b8a6",
  phd:"#8b5cf6",      masters:"#3b82f6", bachelors:"#10b981",
  associate:"#f59e0b",highschool:"#ef4444",
};

function opts(extra) {
  var base = {
    responsive:true, maintainAspectRatio:true, animation:{duration:400},
    plugins:{
      legend:{labels:{color:"#8a837a",font:{family:"'DM Mono',monospace",size:11},padding:12}},
      tooltip:{backgroundColor:"#1a1714",titleColor:"#f0ebe0",bodyColor:"#a0988a",borderColor:"#3a3530",borderWidth:1}
    },
    scales:{
      x:{ticks:{color:"#8a837a",font:{family:"'DM Mono',monospace",size:11}},grid:{color:"rgba(150,140,130,.12)"}},
      y:{ticks:{color:"#8a837a",font:{family:"'DM Mono',monospace",size:11}},grid:{color:"rgba(150,140,130,.12)"}}
    }
  };
  if (extra) Object.assign(base, extra);
  return base;
}

// ─── Init ──────────────────────────────────────────────────────────────────────
function initBiasLab(d) {
  var biased   = d.biased_results   || [];
  var unbiased = d.unbiased_results || [];
  var cmp      = d.comparison       || {};

  renderMetrics(cmp);
  renderGaugeChart(cmp.disparate_impact);
  renderRateChart(cmp);
  renderGenderCharts(biased, unbiased);
  renderEduCharts(biased, unbiased);
  renderFlipTable(biased, unbiased);

  document.getElementById("dlBiased").addEventListener("click", function () {
    downloadResults(biased, "biased_results.csv");
  });
  document.getElementById("dlUnbiased").addEventListener("click", function () {
    downloadResults(unbiased, "unbiased_results.csv");
  });
}

// ─── Metric cards ──────────────────────────────────────────────────────────────
function renderMetrics(c) {
  var b=c.biased||{}, u=c.unbiased||{};
  var di=c.disparate_impact;
  var diColor="#22c55e", diLabel="Fair";
  if (di!=null) {
    if      (di<0.80){diColor="#ef4444";diLabel="Biased ⚠️";}
    else if (di<0.90){diColor="#f59e0b";diLabel="Borderline";}
  }
  document.getElementById("biasMetrics").innerHTML =
    mc("Total Candidates",   b.total||0,    "") +
    mc("Biased Selection",   b.selected||0, (b.rate||0)+"% selection rate") +
    mc("Unbiased Selection", u.selected||0, (u.rate||0)+"% selection rate") +
    mc("Rate Difference",    (c.selection_rate_diff||0)+"%", "biased vs. unbiased") +
    mc("Disparate Impact",   di!=null?di.toFixed(3):"N/A",
       '<span style="color:'+diColor+'">'+diLabel+'</span>');
}

function mc(label,value,sub) {
  return '<div class="metric-card"><div class="mc-label">'+label+'</div>'+
    '<div class="mc-value">'+value+'</div><div class="mc-sub">'+sub+'</div></div>';
}

// ─── Disparate Impact gauge ─────────────────────────────────────────────────────
function renderGaugeChart(di) {
  var val   = (di!=null && !isNaN(di)) ? Math.min(Math.max(Number(di),0),1) : 0.5;
  var color = val<0.80 ? "#ef4444" : val<0.90 ? "#f59e0b" : "#22c55e";

  mkChart("gaugeChart","doughnut",{
    datasets:[{
      data:[val, 1-val],
      backgroundColor:[color,"rgba(150,140,130,.15)"],
      borderWidth:0,
      circumference:180,
      rotation:270
    }]
  },{
    responsive:false,
    cutout:"75%",
    plugins:{legend:{display:false},tooltip:{enabled:false}}
  });

  var gv = document.getElementById("gaugeValue");
  if (gv) {
    gv.textContent = (di!=null && !isNaN(di)) ? Number(di).toFixed(2) : "N/A";
    gv.style.color = color;
  }
}

// ─── Rate comparison bar ────────────────────────────────────────────────────────
function renderRateChart(c) {
  var b=c.biased||{}, u=c.unbiased||{};
  mkChart("rateChart","bar",{
    labels:["Biased","Unbiased"],
    datasets:[{
      label:"Selection Rate %",
      data:[b.rate||0, u.rate||0],
      backgroundColor:[C.biased, C.unbiased],
      borderRadius:6
    }]
  }, opts({plugins:{legend:{display:false},tooltip:opts().plugins.tooltip}}));
}

// ─── Gender breakdowns ──────────────────────────────────────────────────────────
function renderGenderCharts(biased, unbiased) {
  var order = ["Male","Female","Other","Unknown"];
  var gCol  = {Male:C.male,Female:C.female,Other:C.other,Unknown:"#9ca3af"};

  function gs(results) {
    var g={};
    results.forEach(function(r){
      var k=r.gender||"Unknown";
      if(!g[k]) g[k]={total:0,selected:0};
      g[k].total++; if(r.decision==="Selected") g[k].selected++;
    });
    return g;
  }

  function drawGC(canvasId, results) {
    var g=gs(results);
    var labs=order.filter(function(l){return g[l];});
    var noLeg=opts(); noLeg.plugins.legend={display:false};
    mkChart(canvasId,"bar",{
      labels:labs,
      datasets:[{
        label:"Selection %",
        data:labs.map(function(l){return +(g[l].selected/g[l].total*100).toFixed(1);}),
        backgroundColor:labs.map(function(l){return gCol[l]||"#9ca3af";}),
        borderRadius:5
      }]
    }, noLeg);
  }

  drawGC("genderBiasedChart",   biased);
  drawGC("genderUnbiasedChart", unbiased);
}

// ─── Education breakdowns ───────────────────────────────────────────────────────
function renderEduCharts(biased, unbiased) {
  var order=["PhD","Master's","Bachelor's","Associate","High School","Other"];
  var eCol={"PhD":C.phd,"Master's":C.masters,"Bachelor's":C.bachelors,"Associate":C.associate,"High School":C.highschool,"Other":"#9ca3af"};

  function drawEC(canvasId, results) {
    var g={};
    results.forEach(function(r){
      var k=r.education||"Other";
      if(!g[k]) g[k]={total:0,selected:0};
      g[k].total++; if(r.decision==="Selected") g[k].selected++;
    });
    var labs=order.filter(function(l){return g[l];});
    var hOpts=opts(); hOpts.indexAxis="y"; hOpts.plugins.legend={display:false};
    mkChart(canvasId,"bar",{
      labels:labs,
      datasets:[{
        label:"Selection %",
        data:labs.map(function(l){return +(g[l].selected/g[l].total*100).toFixed(1);}),
        backgroundColor:labs.map(function(l){return eCol[l]||"#9ca3af";}),
        borderRadius:5
      }]
    }, hOpts);
  }

  drawEC("eduBiasedChart",   biased);
  drawEC("eduUnbiasedChart", unbiased);
}

// ─── Decision flip table ────────────────────────────────────────────────────────
function renderFlipTable(biased, unbiased) {
  var flips = biased.filter(function(r,i){
    return unbiased[i] && r.decision !== unbiased[i].decision;
  });

  var fc = document.getElementById("flipCount");
  if (fc) fc.textContent = flips.length + " flip" + (flips.length!==1?"s":"");

  var tbody = document.getElementById("flipBody");
  tbody.innerHTML = "";

  if (flips.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ink3);padding:2rem">No decision flips — both modes agreed on all candidates.</td></tr>';
    return;
  }

  flips.forEach(function (b) {
    var u   = unbiased.find(function(r){return r.name===b.name;}) || {};
    var bBadge = b.decision==="Selected"
      ? '<span class="badge-selected">Selected</span>'
      : '<span class="badge-rejected">Rejected</span>';
    var uBadge = u.decision==="Selected"
      ? '<span class="badge-selected">Selected</span>'
      : '<span class="badge-rejected">Rejected</span>';
    var row = document.createElement("tr");
    row.innerHTML =
      "<td><strong>"+(b.name||"—")+"</strong></td>"+
      "<td>"+(b.gender||"—")+"</td>"+
      "<td>"+(b.education||"—")+"</td>"+
      "<td>"+(b.experience_years!=null?b.experience_years+"  yrs":"—")+"</td>"+
      "<td><span style='font-family:var(--font-mono)'>"+b.score+"%</span></td>"+
      "<td><span style='font-family:var(--font-mono)'>"+(u.score!=null?u.score+"%":"—")+"</span></td>"+
      "<td>"+bBadge+"</td>"+
      "<td>"+uBadge+"</td>";
    tbody.appendChild(row);
  });
}
