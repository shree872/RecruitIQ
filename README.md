# RecruitIQ — AI Resume Screening Web App
🌐 **[Live Demo](https://recruiteiq-ys2y.onrender.com)**
A full-stack Flask web application that screens resumes using Machine Learning and demonstrates **bias vs. unbiased** hiring outcomes with interactive visualizations.

---

## 📁 Project Structure

```
resume_screener/
├── app.py                    # Main Flask application & API routes
├── requirements.txt          # Python dependencies
├── README.md
│
├── models/
│   ├── __init__.py
│   └── screener.py           # ML screening logic (biased + unbiased modes)
│
├── templates/
│   ├── base.html             # Base layout (navbar, loader, footer)
│   ├── index.html            # Home / landing page
│   ├── upload.html           # CSV & resume upload page
│   ├── results.html          # Screening results dashboard
│   └── bias.html             # Bias Lab comparison dashboard
│
├── static/
│   ├── css/
│   │   └── style.css         # Complete stylesheet (light + dark theme)
│   ├── js/
│   │   ├── app.js            # Shared utilities (loader, charts, theme)
│   │   ├── upload.js         # Upload page logic
│   │   ├── results.js        # Results dashboard + Chart.js charts
│   │   └── bias.js           # Bias Lab metrics + flip table
│   └── uploads/              # Auto-created: stores uploaded files
│
└── data/
    └── sample_resumes.csv    # 30-row demo dataset (auto-generated)
```

---

## ⚙️ Setup Instructions

### Step 1 — Prerequisites

Make sure you have **Python 3.9+** installed:
```bash
python3 --version
```

### Step 2 — Create a Virtual Environment

```bash
# Navigate to the project folder
cd resume_screener

# Create virtual environment
python3 -m venv venv

# Activate it
# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

### Step 3 — Install Dependencies

```bash
pip install -r requirements.txt
```

**What gets installed:**
| Package | Purpose |
|---|---|
| flask | Web framework |
| pandas | CSV parsing & data processing |
| scikit-learn | ML models (Logistic Regression) |
| numpy | Numerical operations |
| PyMuPDF | PDF text extraction |
| Werkzeug | Secure file uploads |
| xgboost | Extended ML classifier option |

> **Note:** If PyMuPDF fails to install (rare on some systems), PDF upload will fall back gracefully. All other features work normally.

### Step 4 — Run the App

```bash
python app.py
```

You should see:
```
 * Running on http://127.0.0.1:5000
 * Debug mode: on
```

Open **http://localhost:5000** in your browser.

---

## 🚀 Using the App

### Option A — Quick Demo (No upload needed)
1. Go to **Home** page (`/`)
2. Click **"⚡ Run Demo"**
3. 30 synthetic resumes are generated and screened instantly
4. You're redirected to the **Results Dashboard**
5. Navigate to **Bias Lab** to see the fairness analysis

### Option B — Upload a CSV File
1. Go to **Upload** page (`/upload`)
2. Select the **"CSV Batch"** tab
3. Upload your CSV (or use `data/sample_resumes.csv`)
4. Click **"Upload & Screen →"**

**Required CSV columns:**
```
name, skills, education, experience_years
```
**Optional columns (enable richer bias analysis):**
```
gender, num_skills
```

**Example row:**
```csv
name,gender,education,experience_years,skills,num_skills
Alice Smith,Female,Master's,5,"python,machine learning,sql",3
```

### Option C — Single Resume (PDF or TXT)
1. Go to **Upload** page, select **"Single Resume"** tab
2. Drop a PDF or plain-text resume file
3. The app parses it (extracts skills, education, experience)
4. See biased vs. unbiased decision side by side in a modal

---

## 🧠 How the ML Screening Works

### Feature Extraction
The screener extracts these features from each resume:

| Feature | Description |
|---|---|
| `experience_years` | Years of professional experience |
| `num_skills` | Number of technical skills listed |
| `edu_tier` | Education encoded 1–5 (High School → PhD) |
| `gender` | (biased mode only) Gender label |

### Scoring Models

**Unbiased Mode (Fair):**
```
score = sigmoid(2.5×exp + 2.0×skills + 1.5×education − intercept)
```
Decisions are based purely on merit: skills, experience, and education level.

**Biased Mode (Simulated Bias):**
```
score = unbiased_score
      + gender_penalty  (Female: −0.18, Other: −0.10)
      + edu_tier_bonus  (PhD: +0.10)
      + noise
```
Artificially penalises Female/Other candidates and over-rewards PhD holders — simulating documented proxy biases in real-world hiring systems.

### Decision Threshold
Candidates with `score ≥ 0.45` (45%) → **Selected**  
Candidates with `score < 0.45` → **Rejected**

---

## ⚖️ Bias Metrics Explained

### Disparate Impact Ratio
```
DI = (selection rate of least-selected group) / (selection rate of most-selected group)
```
- **< 0.80** → Significant bias ("4/5ths rule" from US EEOC guidelines)
- **0.80–0.90** → Borderline
- **> 0.90** → Considered fair

### Decision Flips
The number of candidates whose outcome **changed** between biased and unbiased modes. A flip from "Selected" (unbiased) to "Rejected" (biased) indicates a candidate harmed by bias.

---

## 📊 Dashboard Pages

### `/` — Home
- Hero section with animated stat cards
- Feature overview
- One-click demo button

### `/upload` — Upload
- CSV batch upload with drag-and-drop
- Single PDF/TXT resume upload with auto-parsing
- Quick demo generator
- Sample CSV template download

### `/results` — Results Dashboard
- Summary cards: total, selected (biased), selected (unbiased), decision flips
- Toggle between Biased / Unbiased / Compare views
- 4 Chart.js charts: selection distribution, by gender, by education, score histogram
- Sortable/searchable/filterable candidate table
- CSV download of results

### `/bias` — Bias Lab
- Explanatory banner
- 5 key fairness metrics
- Disparate Impact gauge (0–1 scale)
- Side-by-side selection rate comparison
- Gender breakdown: biased vs. unbiased (4 charts)
- Education breakdown: biased vs. unbiased
- Decision Flips table highlighting individual candidates affected by bias
- Download biased/unbiased results as separate CSVs

---

## 🧪 Simulating Bias vs. Unbiased Datasets

### Built-in Simulation
Click **"⚡ Run Demo"** or **"⚡ Generate & Screen"** on the Upload page. The app:
1. Creates 30 synthetic candidates with random genders, education levels (High School → PhD), skills (2–12), and experience (0–15 years)
2. Screens them in **biased mode** (with gender/edu-tier penalties)
3. Screens them in **unbiased mode** (merit only)
4. Shows the comparison

### Custom CSV Simulation
Create a CSV where you control the sensitive attributes:

```csv
name,gender,education,experience_years,skills,num_skills
"Strong Female Candidate",Female,PhD,10,"python,ml,leadership",12
"Weak Male Candidate",Male,High School,0,"excel",1
```

Upload to the app — biased mode will penalise the female candidate regardless of her qualifications.

### Adjusting Bias Intensity
Edit `models/screener.py`, line ~100:
```python
# Increase these to amplify gender bias
gender_penalty[df["gender"].str.lower() == "female"] = -0.18  # Change to -0.40 for stronger bias
gender_penalty[df["gender"].str.lower() == "other"]  = -0.10

# Increase edu_bonus to amplify credential bias
edu_bonus = np.where(df["edu_tier"].values == 5, 0.10, 0.0)   # Change to 0.30
```

---

## 🎨 UI Features

- **Dark / Light theme** — toggle with the ◑ button in the navbar (persisted in localStorage)
- **Loading animations** — spinner overlay on all API calls
- **Drag-and-drop** file upload zones
- **Responsive** — works on mobile, tablet, and desktop
- **Search & filter** on the results table
- **Score progress bars** in the results table
- **Animated hero** cards with floating effect

---

## 🔧 Troubleshooting

**Port already in use:**
```bash
python app.py --port 5001
# or kill the existing process:
lsof -ti:5000 | xargs kill
```

**CSV upload error "missing columns":**
Ensure your CSV has at minimum: `name`, `skills`, `education`, `experience_years`

**PDF not parsing well:**
Plain-text `.txt` resumes work more reliably. For PDFs, ensure text is selectable (not scanned images).

**Charts not showing:**
Make sure JavaScript is enabled and you're using a modern browser (Chrome, Firefox, Edge, Safari).

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.9+ · Flask 3.x |
| ML / Data | scikit-learn · pandas · numpy |
| PDF Parsing | PyMuPDF (fitz) |
| Frontend | Vanilla HTML/CSS/JS |
| Charts | Chart.js 4.x |
| Fonts | Syne (headings) · DM Mono · Inter |
| Styling | Custom CSS with CSS variables (no framework) |

---

## 📄 License

MIT — free for educational and commercial use.
