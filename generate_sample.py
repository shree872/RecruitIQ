"""
generate_sample.py
==================
Run this once to regenerate the demo CSV in data/sample_resumes.csv.

Usage:
    python generate_sample.py
    python generate_sample.py --rows 50
"""
import argparse
import os
import sys

# Allow running from any working directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.screener import ResumeScreener

parser = argparse.ArgumentParser()
parser.add_argument("--rows", type=int, default=30, help="Number of synthetic resumes to generate")
args = parser.parse_args()

os.makedirs("data", exist_ok=True)

screener = ResumeScreener()
df       = screener.generate_sample_data(n=args.rows)
out_path = os.path.join("data", "sample_resumes.csv")
df.to_csv(out_path, index=False)

print(f"✓ Generated {args.rows} synthetic resumes → {out_path}")
print(df.to_string(index=False))
