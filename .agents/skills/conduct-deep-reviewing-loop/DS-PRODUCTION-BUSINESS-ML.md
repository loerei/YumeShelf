# Production & Decision ML: Utility Alignment, Serving Integrity & Risk

Audits the translation of ML models into operational decisions, production serving reliability, baseline justification, and conditional causal/domain constraints matching `Context.md`.

## 1. Objective Alignment & Decision Calibration

- [ ] **Decision-Matched Metrics & Thresholds**: Ensure evaluation metrics and operating thresholds optimize the real operational objective (asymmetric FP/FN cost matrix $\arg\max_\tau \mathbb{E}[\text{Utility}(\tau)]$, top-$K$ precision under fixed capacity budgets, latency-constrained accuracy, or interval coverage) rather than defaulting blindly to threshold $\tau = 0.50$ or unweighted accuracy.
- [ ] **Calibration Reliability Verification**: Whenever predicted scores are used as probabilities (expected-value math, risk pricing, thresholding across shifted base rates, or downstream human triage), require reliability verification (`LogLoss`, `Brier Score`, calibration curve / ECE) rather than relying solely on rank order (`ROC-AUC`).
- [ ] **Decision Policy Boundary vs. Model Boundary**: Separate scoring outputs (calibrated probabilities, embeddings, regression estimates) from threshold/business rules so policy thresholds can adjust as capacity or unit costs evolve without retraining weights.

## 2. Baseline Justification & DA-Grounded Complexity

- [ ] **Baseline-Before-Complexity Benchmark**: Compare proposed ML pipelines against a clear, reproducible simple baseline (domain heuristic, prior rate, linear/ridge/logistic model, or simple single tree) on the exact same validation split to verify incremental lift justifies training and operational overhead.
- [ ] **Context-Grounded Model & Resource Constraints**: Enforce interpretability, latency, memory footprint, or hardware constraints strictly as declared by `Context.md` / the DA:
  - Require intrinsic/local feature attributions (e.g. coefficients, SHAP) or monotonic rules ONLY when regulated decisions, operator trust, or explicit DA requirements mandate explainability.
  - NEVER impose blanket bans on deep learning, neural networks, multi-stage pipelines, or ensembles unless those architectures violate stated latency, compute, compliance, or interpretability requirements in the DA.

## 3. Production Serving Integrity, Label Hygiene & Drift

- [ ] **Train-Serve Feature Parity**: Verify features computed in online APIs, streaming jobs, or inference microservices match offline training logic identically (time-window boundaries, timezone/unit conversions, missing-value codes, unknown-category hashing/fallback).
- [ ] **Label Availability, Delay & Survivorship Bias**: Verify that no feature leaks post-decision outcomes (e.g. refund flags or support resolution timestamps for pre-checkout risk prediction), and account for label maturation / right-censoring windows when defining training targets.
- [ ] **Out-of-Distribution (OOD) & Graceful Degradation**: Specify deterministic behavior on unseen categories, malformed/missing critical inputs, stale feature stores, or runtime timeouts (calibrated prior fallback, explicit abstention flag, or deterministic rule backup rather than silent `NaN`/0-score distortion).
- [ ] **Drift & Live Rollout Monitoring**: For live production ML workflows, require measurable post-deploy observability boundaries (input feature distribution/null-rate shifts, score calibration drift, shadow/canary rollout verification before full traffic cutover).

## 4. Causal & Intervention Actionability *(Conditional)*

*Apply this section ONLY when the DA uses model drivers to recommend real-world interventions, pricing/policy changes, or operational actions (skip for pure scoring/classification/routing pipelines).*

- [ ] **Actionable Levers vs. Correlational Context**: Separate **intervenable operational levers** (parameters the operator can change directly) from **immutable/contextual attributes** (fixed traits, historical totals, proxies). Reject recommendations claiming that changing a non-causal proxy will cause an outcome change.
- [ ] **Counterfactual & Experimental Validation**: Require intervention impact estimates to account for selection bias, acceptance rates, and capacity constraints, recommending randomized holdouts or uplift/A-B validation before full rollout.

## Concrete Anti-Pattern

### Anti-Pattern 1: Tuning Operational Decisions on Naive 0.5 / Unweighted F1

```python
# BAD: Picks cutoff optimizing unweighted F1 regardless of asymmetric FP/FN costs or budget
def select_cutoff_bad(y_val: np.ndarray, y_prob: np.ndarray) -> float:
    best_t, best_f1 = 0.5, -1.0
    for t in np.linspace(0.1, 0.9, 81):
        score = f1_score(y_val, y_prob >= t)
        if score > best_f1:
            best_f1, best_t = score, t
    return best_t

# GOOD: Optimizes expected utility under explicit unit payoffs/costs and checks capacity bounds
def select_cutoff_utility(
    y_val: np.ndarray,
    y_prob: np.ndarray,
    benefit_tp: float,
    cost_fp: float,
    cost_fn: float,
    max_action_rate: float = 1.0,
) -> float:
    best_t, best_util = None, -float("inf")
    candidates = np.append(np.linspace(0.01, 0.99, 99), 1.0 + 1e-12)  # Include abstain cutoff
    for t in candidates:
        flagged = y_prob >= t
        if flagged.mean() > max_action_rate:
            continue
        tp = int(np.sum(flagged & (y_val == 1)))
        fp = int(np.sum(flagged & (y_val == 0)))
        fn = int(np.sum(~flagged & (y_val == 1)))
        utility = (tp * benefit_tp) - (fp * cost_fp) - (fn * cost_fn)
        if utility > best_util:
            best_util, best_t = utility, float(t)
    if best_t is None:
        raise ValueError(f"No threshold satisfies max_action_rate={max_action_rate}")
    return best_t
```
