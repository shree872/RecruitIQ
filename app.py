"""
Resume Screening Web Application
=================================
A full-stack Flask app that screens resumes using ML,
and demonstrates bias vs. unbiased hiring outcomes.
"""

import os
import json
import io
import csv
import re
import random
import string

import numpy as np
import pandas as pd
from flask import (Flask, render_template, request,
                   jsonify, send_file, session)
from werkzeug.utils import secure_filename

from models.screener import ResumeScreener

# ─── App Setup ────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(24))

UPLOAD_FOLDER = os.path.join("static", "uploads")
ALLOWED_EXT   = {"csv", "pdf", "txt"}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024   # 16 MB

screener = ResumeScreener()

# ─── Helpers ──────────────────────────────────────────────────────────────────
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT

def extract_text_from_pdf(filepath):
    """Extract plain text from a PDF using PyMuPDF (fitz)."""
    try:
        import fitz
        doc  = fitz.open(filepath)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    except Exception as e:
        return f"[PDF extraction error: {e}]"

def parse_resume_text(text):
    """
    Lightweight heuristic parser.
    Returns a dict of extracted features.
    """
    text_lower = text.lower()

    # ── Skills detection ──────────────────────────────────────────────────────
    skill_keywords = [
        "python","java","javascript","typescript","c++","c#","sql","r",
        "machine learning","deep learning","nlp","data analysis","flask",
        "django","react","angular","vue","node.js","aws","azure","gcp",
        "docker","kubernetes","git","tableau","power bi","excel","spark",
        "tensorflow","pytorch","keras","scikit-learn","pandas","numpy",
    ]
    found_skills = [s for s in skill_keywords if s in text_lower]

    # ── Education ─────────────────────────────────────────────────────────────
    edu_map = {
        "phd": "PhD", "ph.d": "PhD",
        "master": "Master's", "msc": "Master's", "m.s.": "Master's",
        "bachelor": "Bachelor's", "b.s.": "Bachelor's", "b.tech": "Bachelor's",
        "associate": "Associate",
    }
    education = "Other"
    for kw, label in edu_map.items():
        if kw in text_lower:
            education = label
            break

    # ── Experience (years) ────────────────────────────────────────────────────
    exp_patterns = [
        r"(\d+)\+?\s*years?\s+(?:of\s+)?experience",
        r"experience[:\s]+(\d+)\+?\s*years?",
    ]
    experience_years = 0
    for pat in exp_patterns:
        m = re.search(pat, text_lower)
        if m:
            experience_years = int(m.group(1))
            break

    # ── Gender (biased mode only) ─────────────────────────────────────────────
    gender = "Unknown"
    male_words   = ["he ", "him ", "his ", "mr.", "mr "]
    female_words = ["she ", "her ", "hers ", "ms.", "ms ", "mrs.", "mrs "]
    if any(w in text_lower for w in female_words):
        gender = "Female"
    elif any(w in text_lower for w in male_words):
        gender = "Male"

    # ── Name extraction (first line heuristic) ────────────────────────────────
    first_line = text.strip().split("\n")[0].strip()
    name = first_line if len(first_line) < 60 else "Unknown"

    return {
        "name":             name,
        "skills":           ", ".join(found_skills),
        "num_skills":       len(found_skills),
        "education":        education,
        "experience_years": experience_years,
        "gender":           gender,
        "raw_text":         text[:500],
    }

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload")
def upload_page():
    return render_template("upload.html")

@app.route("/results")
def results_page():
    return render_template("results.html")

@app.route("/bias")
def bias_page():
    return render_template("bias.html")

# ── CSV upload & screening ────────────────────────────────────────────────────
@app.route("/api/upload_csv", methods=["POST"])
def upload_csv():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "" or not allowed_file(file.filename):
        return jsonify({"error": "Invalid file"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    try:
        df = pd.read_csv(filepath)
        # Normalize column names
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

        required = {"name", "skills", "education", "experience_years"}
        missing  = required - set(df.columns)
        if missing:
            return jsonify({
                "error": f"CSV missing columns: {missing}. "
                         f"Found: {list(df.columns)}"
            }), 400

        # Screen in both modes
        biased_results   = screener.screen(df.copy(), biased=True)
        unbiased_results = screener.screen(df.copy(), biased=False)

        # Build comparison summary
        comparison = build_comparison(biased_results, unbiased_results)

        return jsonify({
            "success":          True,
            "total":            len(df),
            "biased_results":   biased_results.to_dict("records"),
            "unbiased_results": unbiased_results.to_dict("records"),
            "comparison":       comparison,
            "columns":          list(df.columns),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Single resume upload ──────────────────────────────────────────────────────
@app.route("/api/upload_resume", methods=["POST"])
def upload_resume():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "" or not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    ext = filename.rsplit(".", 1)[1].lower()
    if ext == "pdf":
        text = extract_text_from_pdf(filepath)
    else:
        with open(filepath, "r", errors="ignore") as f:
            text = f.read()

    parsed = parse_resume_text(text)

    # Single-row dataframe for screening
    row_df = pd.DataFrame([{
        "name":             parsed["name"],
        "skills":           parsed["skills"],
        "num_skills":       parsed["num_skills"],
        "education":        parsed["education"],
        "experience_years": parsed["experience_years"],
        "gender":           parsed.get("gender", "Unknown"),
    }])

    biased_res   = screener.screen(row_df.copy(), biased=True)
    unbiased_res = screener.screen(row_df.copy(), biased=False)

    return jsonify({
        "success":         True,
        "parsed":          parsed,
        "biased_result":   biased_res.to_dict("records")[0],
        "unbiased_result": unbiased_res.to_dict("records")[0],
    })

# ── Generate sample data ──────────────────────────────────────────────────────
@app.route("/api/generate_sample", methods=["POST"])
def generate_sample():
    """Generate a sample CSV with 30 synthetic resumes for demo."""
    data = screener.generate_sample_data(n=30)
    csv_path = os.path.join(app.config["UPLOAD_FOLDER"], "sample_data.csv")
    data.to_csv(csv_path, index=False)

    biased_results   = screener.screen(data.copy(), biased=True)
    unbiased_results = screener.screen(data.copy(), biased=False)
    comparison       = build_comparison(biased_results, unbiased_results)

    return jsonify({
        "success":          True,
        "total":            len(data),
        "biased_results":   biased_results.to_dict("records"),
        "unbiased_results": unbiased_results.to_dict("records"),
        "comparison":       comparison,
    })

# ── Download results CSV ──────────────────────────────────────────────────────
@app.route("/api/download_results", methods=["POST"])
def download_results():
    body = request.get_json()
    rows = body.get("results", [])
    if not rows:
        return jsonify({"error": "No data"}), 400

    df  = pd.DataFrame(rows)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    return send_file(
        io.BytesIO(buf.getvalue().encode()),
        mimetype="text/csv",
        as_attachment=True,
        download_name="screening_results.csv",
    )

# ─── Helper ───────────────────────────────────────────────────────────────────
def build_comparison(biased_df, unbiased_df):
    """Compute high-level fairness comparison metrics."""
    def stats(df):
        total    = len(df)
        selected = (df["decision"] == "Selected").sum()
        rate     = round(selected / total * 100, 1) if total else 0

        by_gender = {}
        if "gender" in df.columns:
            for g, grp in df.groupby("gender"):
                sel = (grp["decision"] == "Selected").sum()
                by_gender[str(g)] = {
                    "total":    int(len(grp)),
                    "selected": int(sel),
                    "rate":     round(sel / len(grp) * 100, 1) if len(grp) else 0,
                }

        by_edu = {}
        if "education" in df.columns:
            for edu, grp in df.groupby("education"):
                sel = (grp["decision"] == "Selected").sum()
                by_edu[str(edu)] = {
                    "total":    int(len(grp)),
                    "selected": int(sel),
                    "rate":     round(sel / len(grp) * 100, 1) if len(grp) else 0,
                }

        return {
            "total":     int(total),
            "selected":  int(selected),
            "rejected":  int(total - selected),
            "rate":      rate,
            "by_gender": by_gender,
            "by_edu":    by_edu,
        }

    b = stats(biased_df)
    u = stats(unbiased_df)

    # Disparate-impact ratio per gender group (biased mode)
    di_ratio = None
    if "by_gender" in b and len(b["by_gender"]) >= 2:
        rates = [v["rate"] for v in b["by_gender"].values() if v["total"] > 0]
        if rates and max(rates) > 0:
            di_ratio = round(min(rates) / max(rates), 3)

    return {
        "biased":   b,
        "unbiased": u,
        "disparate_impact": di_ratio,
        "selection_rate_diff": round(abs(b["rate"] - u["rate"]), 1),
    }


if __name__ == "__main__":
    app.run(debug=True, port=5000)
