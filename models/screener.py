"""
models/screener.py
==================
Core ML logic for resume screening.

Two screening modes:
  biased   – includes gender & college-tier proxies in feature set
  unbiased – strips those sensitive columns, focuses on skills/experience
"""

import re
import random
import numpy as np
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.metrics import accuracy_score
import warnings
warnings.filterwarnings("ignore")


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic data generation helpers
# ─────────────────────────────────────────────────────────────────────────────
MALE_NAMES = [
    "James Miller","Robert Johnson","Michael Williams","William Brown",
    "David Jones","Richard Garcia","Joseph Martinez","Thomas Anderson",
    "Charles Taylor","Daniel Thomas","Christopher Lee","Matthew Wilson",
    "Anthony Harris","Mark Jackson","Donald White","Steven Martin",
]
FEMALE_NAMES = [
    "Mary Johnson","Patricia Williams","Jennifer Brown","Linda Jones",
    "Barbara Garcia","Susan Martinez","Jessica Anderson","Sarah Taylor",
    "Karen Thomas","Lisa White","Nancy Harris","Betty Martin",
    "Margaret Thompson","Sandra Lewis","Dorothy Walker","Ashley Robinson",
]
SKILLS_POOL = [
    "python","java","machine learning","deep learning","sql","r",
    "data analysis","nlp","flask","django","react","aws","docker",
    "tensorflow","pytorch","pandas","tableau","spark","kubernetes","git",
    "excel","power bi","javascript","typescript","c++","azure",
]
EDUCATION_LEVELS = ["High School","Associate","Bachelor's","Master's","PhD"]
GENDER_OPTIONS    = ["Male","Female","Other"]

EDU_TIER = {
    "PhD": 5, "Master's": 4, "Bachelor's": 3,
    "Associate": 2, "High School": 1, "Other": 2,
}

def _rand_skills(n):
    return ", ".join(random.sample(SKILLS_POOL, min(n, len(SKILLS_POOL))))


class ResumeScreener:
    """
    Trains two lightweight classifiers:
      - biased_model   : sees gender + education tier as features
      - unbiased_model : merit-only (skills count + experience)
    """

    def __init__(self):
        self.biased_model   = None
        self.unbiased_model = None
        self._fit_models()

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────
    def screen(self, df: pd.DataFrame, biased: bool = False) -> pd.DataFrame:
        """
        Adds 'score' and 'decision' columns to df.

        Parameters
        ----------
        df      : DataFrame with at least name, skills, education, experience_years
        biased  : if True, gender / college-tier proxies influence the decision
        """
        df = df.copy()
        df = self._preprocess(df)

        if biased:
            scores    = self._biased_score(df)
            threshold = 0.45
        else:
            scores    = self._unbiased_score(df)
            threshold = 0.45

        df["score"]    = np.round(scores * 100, 1)
        df["decision"] = np.where(scores >= threshold, "Selected", "Rejected")
        return df

    def generate_sample_data(self, n: int = 30) -> pd.DataFrame:
        """Generate n synthetic resumes for demo purposes."""
        random.seed(42)
        rows = []
        for i in range(n):
            gender  = random.choice(GENDER_OPTIONS)
            name    = random.choice(MALE_NAMES if gender == "Male" else FEMALE_NAMES)
            edu     = random.choice(EDUCATION_LEVELS)
            n_skills = random.randint(2, 12)
            exp      = random.randint(0, 15)
            skills   = _rand_skills(n_skills)

            rows.append({
                "name":             name,
                "gender":           gender,
                "education":        edu,
                "experience_years": exp,
                "skills":           skills,
                "num_skills":       n_skills,
            })
        return pd.DataFrame(rows)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal preprocessing
    # ──────────────────────────────────────────────────────────────────────────
    def _preprocess(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalise / fill columns so scoring never crashes."""
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

        # Ensure columns exist
        for col, default in [
            ("gender", "Unknown"),
            ("experience_years", 0),
            ("num_skills", 0),
            ("education", "Other"),
            ("skills", ""),
        ]:
            if col not in df.columns:
                df[col] = default

        df["experience_years"] = pd.to_numeric(
            df["experience_years"], errors="coerce"
        ).fillna(0)

        # Count skills from string if num_skills not provided
        if df["num_skills"].eq(0).all():
            df["num_skills"] = df["skills"].apply(
                lambda s: len([x for x in str(s).split(",") if x.strip()])
            )

        df["edu_tier"] = df["education"].map(
            lambda e: EDU_TIER.get(str(e).strip(), 2)
        )
        return df

    # ──────────────────────────────────────────────────────────────────────────
    # Scoring functions (rule-based sigmoid, trained-like feel)
    # ──────────────────────────────────────────────────────────────────────────
    def _sigmoid(self, x):
        return 1 / (1 + np.exp(-x))

    def _unbiased_score(self, df: pd.DataFrame) -> np.ndarray:
        """
        Merit-only score.
        Drives decisions purely on: experience, skills count, education tier.
        """
        exp_norm   = np.clip(df["experience_years"].values / 10.0, 0, 1)
        skill_norm = np.clip(df["num_skills"].values      / 15.0, 0, 1)
        edu_norm   = (df["edu_tier"].values - 1) / 4.0

        logit = (
            2.5 * exp_norm
          + 2.0 * skill_norm
          + 1.5 * edu_norm
          - 2.8                          # intercept (approx 50 % baseline)
        )
        noise = np.random.RandomState(0).normal(0, 0.15, size=len(df))
        return self._sigmoid(logit + noise)

    def _biased_score(self, df: pd.DataFrame) -> np.ndarray:
        """
        Biased score.
        Artificially penalises Female / Other candidates and rewards
        higher education tiers disproportionately (college-tier bias).
        This is intentionally unfair to illustrate the problem.
        """
        base = self._unbiased_score(df)

        # Gender bias: females get a -0.12 shift, others -0.06
        gender_penalty = np.zeros(len(df))
        gender_penalty[df["gender"].str.lower() == "female"] = -0.18
        gender_penalty[df["gender"].str.lower() == "other"]  = -0.10

        # Education-tier bias: PhDs get an extra bump
        edu_bonus = np.where(df["edu_tier"].values == 5, 0.10, 0.0)

        biased_logit = (
            base + gender_penalty + edu_bonus
          + np.random.RandomState(1).normal(0, 0.08, size=len(df))
        )
        return np.clip(biased_logit, 0.01, 0.99)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal model fit (kept for extensibility; scoring is rule-based above)
    # ──────────────────────────────────────────────────────────────────────────
    def _fit_models(self):
        """
        Pre-train simple sklearn classifiers on synthetic data.
        These are used to validate the approach; active scoring uses
        the interpretable rule-based methods above.
        """
        data = self.generate_sample_data(200)
        data = self._preprocess(data)

        # Unbiased labels
        unbiased_scores = self._unbiased_score(data)
        data["label_unbiased"] = (unbiased_scores >= 0.45).astype(int)

        # Biased labels
        biased_scores = self._biased_score(data)
        data["label_biased"] = (biased_scores >= 0.45).astype(int)

        feat_unbiased = data[["experience_years", "num_skills", "edu_tier"]].values
        feat_biased   = data[["experience_years", "num_skills", "edu_tier",
                               "gender"]].copy()
        feat_biased["gender_enc"] = LabelEncoder().fit_transform(
            feat_biased["gender"]
        )
        feat_biased = feat_biased[
            ["experience_years", "num_skills", "edu_tier", "gender_enc"]
        ].values

        self.unbiased_model = LogisticRegression(max_iter=500).fit(
            feat_unbiased, data["label_unbiased"]
        )
        self.biased_model = LogisticRegression(max_iter=500).fit(
            feat_biased, data["label_biased"]
        )
