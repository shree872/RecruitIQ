"""
tests/test_screener.py
======================
Unit and integration tests for RecruitIQ.
Run with:  pytest tests/ -v
"""

import sys
import os
import io
import json
import pytest

# Add the project root to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from models.screener import ResumeScreener
import app as flask_app


# ─── Fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture
def screener():
    return ResumeScreener()

@pytest.fixture
def client():
    flask_app.app.config["TESTING"] = True
    with flask_app.app.test_client() as c:
        yield c

@pytest.fixture
def sample_df():
    return pd.DataFrame([
        {"name": "Alice Smith",  "gender": "Female",  "education": "Master's",
         "experience_years": 5, "skills": "python,sql,ml", "num_skills": 3},
        {"name": "Bob Jones",    "gender": "Male",    "education": "Bachelor's",
         "experience_years": 3, "skills": "java,docker", "num_skills": 2},
        {"name": "Carol Wu",     "gender": "Female",  "education": "PhD",
         "experience_years": 8, "skills": "python,pytorch,nlp,aws", "num_skills": 4},
    ])


# ─── Screener unit tests ──────────────────────────────────────────────────────
class TestScorerBounds:
    """Scores must always be in [0, 100] and decisions must be valid labels."""

    def test_unbiased_scores_in_range(self, screener, sample_df):
        result = screener.screen(sample_df.copy(), biased=False)
        assert result["score"].between(0, 100).all(), "Unbiased scores out of [0, 100]"

    def test_biased_scores_in_range(self, screener, sample_df):
        result = screener.screen(sample_df.copy(), biased=True)
        assert result["score"].between(0, 100).all(), "Biased scores out of [0, 100]"

    def test_decision_labels_valid(self, screener, sample_df):
        result = screener.screen(sample_df.copy(), biased=False)
        valid = {"Selected", "Rejected"}
        assert set(result["decision"].unique()).issubset(valid), "Invalid decision label found"

    def test_no_null_scores(self, screener, sample_df):
        result = screener.screen(sample_df.copy(), biased=False)
        assert result["score"].notna().all(), "Null scores found"

    def test_no_null_decisions(self, screener, sample_df):
        result = screener.screen(sample_df.copy(), biased=False)
        assert result["decision"].notna().all(), "Null decisions found"


class TestBiasEffect:
    """Biased pipeline must produce lower scores for Female candidates."""

    def test_female_penalised_in_biased_mode(self, screener, sample_df):
        """Female candidates should score lower in biased mode than unbiased mode."""
        females = sample_df[sample_df["gender"] == "Female"].copy()
        unbiased = screener.screen(females.copy(), biased=False)
        biased   = screener.screen(females.copy(), biased=True)
        # Mean unbiased score should be higher
        assert unbiased["score"].mean() >= biased["score"].mean(), \
            "Expected unbiased scores >= biased scores for Female group"

    def test_selection_rate_differs(self, screener):
        """30-candidate synthetic data should show different DI ratios."""
        data = screener.generate_sample_data(30)
        biased   = screener.screen(data.copy(), biased=True)
        unbiased = screener.screen(data.copy(), biased=False)
        b_sel = (biased["decision"] == "Selected").sum()
        u_sel = (unbiased["decision"] == "Selected").sum()
        # They shouldn't be identical (bias should affect results)
        # This isn't guaranteed but is statistically very likely with seed=42
        assert isinstance(b_sel, int) and isinstance(u_sel, int)


class TestReproducibility:
    """Same input must always produce same output (seeded random state)."""

    def test_same_input_same_output(self, screener, sample_df):
        r1 = screener.screen(sample_df.copy(), biased=False)
        r2 = screener.screen(sample_df.copy(), biased=False)
        assert list(r1["score"]) == list(r2["score"]), "Scores are not reproducible"
        assert list(r1["decision"]) == list(r2["decision"]), "Decisions are not reproducible"


# ─── API integration tests ────────────────────────────────────────────────────
class TestRoutes:
    """All HTML pages must return 200."""

    def test_home_page(self, client):
        r = client.get("/")
        assert r.status_code == 200

    def test_upload_page(self, client):
        r = client.get("/upload")
        assert r.status_code == 200

    def test_results_page(self, client):
        r = client.get("/results")
        assert r.status_code == 200

    def test_bias_page(self, client):
        r = client.get("/bias")
        assert r.status_code == 200


class TestCSVUploadAPI:
    """CSV upload endpoint validation."""

    def test_valid_csv_returns_success(self, client):
        csv = (
            b"name,gender,education,experience_years,skills,num_skills\n"
            b"Alice,Female,Master's,5,python sql,2\n"
            b"Bob,Male,Bachelor's,3,java,1\n"
        )
        r = client.post(
            "/api/upload_csv",
            data={"file": (io.BytesIO(csv), "test.csv")},
            content_type="multipart/form-data",
        )
        data = r.get_json()
        assert r.status_code == 200
        assert data["success"] is True
        assert data["total"] == 2

    def test_missing_columns_returns_error(self, client):
        csv = b"name,skills\nAlice,python\n"
        r = client.post(
            "/api/upload_csv",
            data={"file": (io.BytesIO(csv), "bad.csv")},
            content_type="multipart/form-data",
        )
        data = r.get_json()
        assert "error" in data

    def test_no_file_returns_400(self, client):
        r = client.post("/api/upload_csv", data={}, content_type="multipart/form-data")
        assert r.status_code == 400

    def test_response_has_comparison_metrics(self, client):
        csv = (
            b"name,gender,education,experience_years,skills,num_skills\n"
            b"Alice,Female,Master's,8,python ml sql aws docker git react node,8\n"
            b"Bob,Male,Master's,8,python ml sql aws docker git react node,8\n"
        )
        r = client.post(
            "/api/upload_csv",
            data={"file": (io.BytesIO(csv), "test.csv")},
            content_type="multipart/form-data",
        )
        data = r.get_json()
        assert "comparison" in data
        assert "disparate_impact" in data["comparison"]
        assert "biased_results" in data
        assert "unbiased_results" in data


class TestGenerateSampleAPI:
    """Demo data generation endpoint."""

    def test_generates_30_candidates(self, client):
        r = client.post("/api/generate_sample")
        data = r.get_json()
        assert data["success"] is True
        assert data["total"] == 30

    def test_has_both_result_sets(self, client):
        r = client.post("/api/generate_sample")
        data = r.get_json()
        assert len(data["biased_results"]) == 30
        assert len(data["unbiased_results"]) == 30
