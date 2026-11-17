# Competitive ML & Benchmarking: Ensembling, Metric Geometry & Submission Constraints

Audits Out-of-Fold (OOF) ensembling, metric-aligned post-processing, probability calibration, prior-shift adjustment, and runtime/submission constraints for competitive challenges and fixed-eval benchmarks.

> **Regime Isolation**: Techniques prioritizing pure metric maximization (deep stacking, multi-family latent blending, test-time distribution alignment) MUST NOT be forced onto `PRODUCTION_DECISION_ML` workflows when they violate declared latency, memory, or interpretability constraints.

## 1. Regularized & Nested Out-of-Fold Ensembling

Heuristic guess-blending (manually fixing arbitrary constants) overfits leaderboard noise or leaves ensemble diversity unexploited, while unconstrained optimization directly on full OOF predictions also overfits validation variance.

- [ ] **Regularized Optimization & Nested Evaluation**: Fit ensemble weights or Level-2 meta-learners inside out-of-fold splits (nested CV for validation estimation) with weight regularization (simplex constraints $w_i \ge 0, \sum w_i = 1$ plus Dirichlet/L2 shrinkage toward uniform/prior weights) to detect and prevent OOF over-allocation.
- [ ] **Match Blend Geometry to the Evaluation Metric**:
  - **Rank / Piecewise-Constant Step Metrics (`ROC-AUC`, `Spearman`, `F1`, `Accuracy`)**: Standard gradient solvers (`SLSQP`, `L-BFGS-B`) stall at iteration 0 because step-metric finite-difference gradients are zero almost everywhere. Mandate derivative-free solvers (`Nelder-Mead`, `Powell`, coordinate/hill-climb search) or differentiable convex surrogates (Log-Loss / pairwise ranking loss) regularized against OOF overfit.
  - **Probability & Continuous Error Metrics (`LogLoss`, `Brier`, `RMSE`, `MAE`)**: Blend in geometry compatible with the loss (e.g. weighted logits or calibrated log-odds for `LogLoss`; native or target-link space for regression). Reject rank-only or uncalibrated probit blending on strictly proper scoring metrics unless monotonically re-calibrated inside CV.
- [ ] **Inductive Scale Alignment for Heterogeneous Rank Blends**: When combining heterogeneous families (`GBDT`, `Neural`, `Linear`, `Kernel`) on rank/percentile metrics, align disparate probability dispersions via inductive ECDF / quantile / probit transforms fitted strictly on in-fold OOF training slices (never on held-out outer validation folds or unaligned test batches, which distort ranks under small or shifted slices).

## 2. Calibration, Thresholding & Prior-Shift Inversion

- [ ] **Nested OOF Threshold Optimization**: Optimize discrete decision cutoffs (`F1`, `MCC`, `Cohen Kappa`, multi-label thresholds) strictly inside out-of-fold validation loops (evaluating out-of-fold with per-fold optimal cutoffs) so threshold tuning does not inflate reported CV.
- [ ] **Unbounded Metric Clipping Guard**: For `LogLoss` / cross-entropy evaluations, bound final probability predictions to $[\epsilon, 1 - \epsilon]$ and reject raw unclipped `IsotonicRegression` outputs that emit exact `0.0`/`1.0` ($\infty$ loss penalty on a single test mismatch). Select regularized calibrators (`Venn-ABERS`, `Platt` / temperature scaling, smoothed isotonic) based on OOF proper-scoring improvement.
- [ ] **Bayes Prior-Shift Inversion**: When training with class weights (`scale_pos_weight = w`) or over/under-sampled training priors, invert the log-odds shift before reporting calibrated probabilities or evaluating probability metrics:
  $$p_{\text{true}} = \sigma\left(\text{logit}(p_{\text{weighted}}) - \ln(w)\right)$$

## 3. Code-Competition & Submission Execution Invariants

- [ ] **Order Independence & Alignment Integrity**: Assert test predictions never rely on test dataset row order, contiguous target clustering, or hardcoded ID sequence assumptions. Verify exact row count, non-null (`0 NaN`, `0 Inf`), ID alignment, and valid prediction domain bounds before writing submission files.
- [ ] **Compute, Time & Memory Ceiling Compliance**: When running under fixed execution/kernel limits, enforce batch chunking (bounded temporary matrix RAM), CPU/GPU budget tracking, and deterministic end-to-end execution from clean inputs to final submission artifact.

## Concrete Anti-Patterns

### Anti-Pattern 1: Gradient Solver Stalling on Step Metric & Non-Nested Weight Fitting

```python
# BAD: Uses gradient-based SLSQP on piecewise-constant ROC-AUC (zero gradients almost everywhere -> stalls),
# and evaluates blended AUC on the same OOF vector used for unconstrained weight fitting.
def blend_bad(y_oof: np.ndarray, preds_matrix: np.ndarray) -> np.ndarray:
    def loss(weights):
        w = np.clip(weights, 0.0, None)
        w /= w.sum()
        return -roc_auc_score(y_oof, preds_matrix @ w)  # Finite diff gradient = 0!
    res = scipy.optimize.minimize(loss, x0=np.ones(preds_matrix.shape[1]) / preds_matrix.shape[1], method="SLSQP")
    return res.x

# GOOD: Derivative-free softmax simplex optimization with L2 shrinkage toward uniform weights
# fitted strictly inside training folds and evaluated out-of-fold (nested CV).
def fit_blend_nested(y: np.ndarray, oof_matrix: np.ndarray, cv, reg_alpha: float = 1e-2):
    n_models = oof_matrix.shape[1]
    nested_oof = np.zeros(len(y), dtype=np.float64)
    fold_weights = []

    for tr_idx, va_idx in cv.split(oof_matrix, y):
        def objective(theta: np.ndarray) -> float:
            exp_t = np.exp(theta - np.max(theta))
            w = exp_t / np.sum(exp_t)
            auc = roc_auc_score(y[tr_idx], oof_matrix[tr_idx] @ w)
            reg = reg_alpha * float(np.sum((w - (1.0 / n_models)) ** 2))
            return -float(auc) + reg

        res = scipy.optimize.minimize(objective, x0=np.zeros(n_models), method="Nelder-Mead")
        opt_w = np.exp(res.x - np.max(res.x))
        opt_w /= np.sum(opt_w)
        fold_weights.append(opt_w)
        nested_oof[va_idx] = oof_matrix[va_idx] @ opt_w

    return np.mean(fold_weights, axis=0), float(roc_auc_score(y, nested_oof))
```
