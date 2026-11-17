# Exploratory Data Analysis & Analytical Reporting

Audits statistical EDA rigor, epistemic separation of measurements from claims, producer-to-consumer aggregated data contracts, and publication/diagnostic figure integrity.

> **Role Boundary**: Frontend UI layout stability (`CLS`), React/DOM component lifecycles, focus management, and browser event handling belong exclusively to `UXUI` and `Performance`. This subdocument audits statistical soundness, serialization contracts, and chart/report data fidelity.

## 1. Epistemic Hygiene & Statistical Validity

- [ ] **Strict Facts vs. Hypotheses Partition**: In EDA reports and analytical summaries, segregate directly measured **Empirical Facts** (citing exact sample size $N$, filter scope, missingness rates, and calculation definitions) from **Interpretations** and **Testable Hypotheses** (stating explicit verification criteria).
- [ ] **Denominator, Missingness & Stratification Integrity**: Never report relative percentages or cohort rates without sample counts ($n / N$). Check subgroup stratification to guard against Simpson's paradox, survivorship/censoring bias, and zero-exclusion distortion when `NaN` vs `0` mean distinct domain states.
- [ ] **Target-Leakage Discipline in EDA Claims**: Distinguish variables measured prior to prediction time from concurrent/post-outcome proxy fields before elevating EDA correlations into modeling hypotheses.

## 2. Analytical Producer-to-Consumer Data Contracts

- [ ] **Upstream Pre-Aggregation Over Raw-Row Client Parsing**: Aggregate large datasets ($>10^4$ rows) in analytical engines (Python/DuckDB/SQL/Spark) and emit compact summary statistics (histograms, quantiles, binned deciles, correlation matrices) rather than streaming unaggregated multi-megabyte CSVs into client/UI memory.
- [ ] **RFC 8259 JSON-Safe Serialization (`NaN` / `Inf` Ban)**: Explicitly map `NaN`, `+Inf`, and `-Inf` floats to valid `null` or explicit status markers before writing JSON artifacts. Python's default `json.dumps` emits non-standard `NaN`/`Infinity` literals that crash strict JSON parsers (`JSON.parse`, Zod, Rust/Go decoders).
- [ ] **Versioned Summary Schema & Bounded Precision**: Wrap analytical exports with explicit metadata (`schema_version`, `generated_at`, slice/filter parameters, denominator counts alongside rates) and bound floating-point precision where full IEEE-754 decimals bloat payloads without analytical value.

## 3. Diagnostic & Publication Figure Integrity

- [ ] **Honest Scales, Units & Uncertainty**: Every generated plot must display clear axis labels with physical/currency/percentage units, explicit log vs linear axis scale annotations, uncertainty indicators (error bars, confidence/prediction intervals, sample counts per bin), and distortion-free bar/baseline ranges.
- [ ] **Headless Reproducible Figure Exports**: Generate static/publication ML plots (calibration curves, confusion matrices with clear domain class labels, loss/residual diagnostics, attribution summaries) via scripted, deterministic exporters rather than ad-hoc manual screenshots, preferring self-contained vector formats (`.svg`/`.pdf`) or explicit high-DPI raster output matching target media.

## Concrete Anti-Pattern

### Anti-Pattern 1: Unserialized NaN JSON Crash & Denominator-Free Aggregations

```python
# BAD: Emits invalid RFC 8259 JSON (`NaN`/`Infinity`), drops sample counts n,
# and risks division-by-zero / missingness confusion.
def export_slice_summary_bad(df: pd.DataFrame, out_path: str) -> None:
    grouped = df.groupby("segment")["target"].mean().to_dict()
    with open(out_path, "w") as f:
        json.dump(grouped, f)  # Writes `{"rare_seg": NaN}` -> crashes browser JSON.parse!

# GOOD: Preserves counts + missing segment rows (dropna=False), converts non-finite floats to None (`null`),
# and wraps payload with schema metadata via strict allow_nan=False check.
from datetime import datetime, timezone

def export_slice_summary_safe(df: pd.DataFrame, slice_name: str, out_path: str) -> None:
    stats = (
        df.groupby("segment", observed=True, dropna=False)["target"]
        .agg(count="size", valid_count="count", rate="mean")
        .reset_index()
    )
    rows = []
    for row in stats.itertuples(index=False):
        rate_val = float(row.rate) if pd.notna(row.rate) and np.isfinite(row.rate) else None
        seg_label = "__MISSING__" if pd.isna(row.segment) else str(row.segment)
        rows.append({
            "segment": seg_label,
            "total_rows": int(row.count),
            "valid_rows": int(row.valid_count),
            "target_rate": round(rate_val, 6) if rate_val is not None else None,
        })
    envelope = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "slice": slice_name,
        "total_n": int(len(df)),
        "segments": rows,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(envelope, f, allow_nan=False, indent=2)
```
