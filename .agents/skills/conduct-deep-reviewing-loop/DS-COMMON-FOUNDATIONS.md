# Data Science Common Foundations: Leakage, Splits, Numerics & Reproducibility

Universal statistical validity, leakage boundaries, split topology, inductive-bias-matched feature hygiene, numerical/tensor stability, and pipeline reproducibility across all ML tracks.

## 1. Zero Data, Target & Transductive Leakage

- [ ] **Fold-Isolated Stateful Preprocessing (`fit` on Train Only)**: Fit all stateful transformers (scalers, imputers, PCA/SVD, quantile binners, target/frequency encoders, feature selectors) strictly inside training splits (`fit(X_train)`), calling `.transform()` on validation and test splits. Reject `.fit_transform()` before splitting.
- [ ] **Inductive vs. Transductive Boundary**:
  - In production/serving or inductive evaluation pipelines, reject using test/inference-batch cross-row statistics (`concat([train, test])`, batch-global normalization, test-time clustering, or group lookups) that depend on multiple test samples and fail on single-sample inference.
  - In offline batch/transductive settings where unlabeled feature access is explicitly permitted by `Context.md`, still enforce zero target leakage and identical train/test feature transformations.
- [ ] **Out-of-Fold (OOF) Encodings & Dynamic Fold Scaling**: Compute supervised target encodings or Stage-1 meta-features strictly out-of-fold with regularization/smoothing ($m > 0$). Accumulate test-set encodings dividing by dynamic fold count (`float(cv.get_n_splits())`), NEVER a hardcoded literal (`/ 5.0` or `/ 10.0`).
- [ ] **Causal Temporal Gates**: For longitudinal, event-log, or panel sequences, require entity-scoped strict causal ordering (`.shift(1)` per entity or strict timestamp `< t_cutoff`) before rolling, expanding, or window aggregations. Ban future lookaheads (`shift(-k)`, `.diff(-k)`, future group summaries).
- [ ] **Post-Split Resampling & Augmentation**: Apply oversampling (`SMOTE`), class weighting samplers, mixup, or synthetic perturbations strictly to in-fold training splits (`X_train, y_train`). NEVER alter validation or test splits.

## 2. Validation Topology Alignment

- [ ] **Group / Entity Isolation (`GroupKFold` / `StratifiedGroupKFold`)**: When multiple rows belong to the same entity (user, device, patient, session, source document, time window cluster), mandate group-aware splitting so identical entities never span train and validation.
- [ ] **Chronological Ordering & Purge/Embargo**: For time-series or forecasting tasks, mandate chronological splits (`TimeSeriesSplit` or expanding/sliding walk-forward) with purge/embargo gaps covering maximum feature lag and label horizon.
- [ ] **Stratification & Matched Reference Frame**: Use stratified splits on skewed classification/multiclass targets unless temporal/group constraints dominate. Compare all candidate models across the identical split topology and seed (never mix 1-fold holdout scores with K-fold OOF metrics).

## 3. Feature Matrix & Inductive-Bias Hygiene

- [ ] **Inductive-Bias-Matched Feature Representations**: Match preprocessing to active model families without distorting data semantics across distinct model inputs:

  | Model Family | Preprocessing & Feature View Invariants |
  | :--- | :--- |
  | **Tree Ensembles (LightGBM, XGBoost, CatBoost, RF/ET)** | Preserve informative `NaN`s where native missing routing is beneficial; use native categorical handling (`enable_categorical` / `cat_features`) rather than arbitrary integer ordinal casts when ordering is absent. Note column dilution risk in heavily subsampled random-cut trees (`colsample_bytree` << 1). |
  | **Neural, Linear & Kernel Models** | Provide finite imputation paired with explicit `*_is_missing` binary indicators where missingness carries signal; standardize or rank/quantile-normalize heavy-tailed features inside each fold; prune exact linear dependencies (`|r| ~ 1`) when solvers lack regularization. |
  | **Additive / Smooth Models (GAM, EBM)** | Keep main effects identifiable by separating raw features from collinear redundant clones or overlapping composite sums when attribution clarity is required. |

- [ ] **Pandas Index-Alignment NaN Collapse**: Slicing a `pd.Series` (`s[n:]`) retains source index labels. Assigning it into a `pd.DataFrame` whose index differs (`index=test_df.index`) silently inserts **100% `NaN`s**. Extract positional arrays (`.to_numpy()`) or `.reset_index(drop=True)` and assert `not df[col].isna().all()`.
- [ ] **Boundary Denominator Collisions (`k = 0` vs. `k = 1`)**: Reject guards like `val / np.maximum(1.0, count)` when `count` takes discrete integers ($0, 1, 2, \dots$), which collapse zero and one to the same ratio. Use masked division (`np.divide(val, count, out=np.full_like(..., np.nan), where=count > 0)`) or smooth offsets (`val / (count + 1.0)`). Avoid eager `np.where(count > 0, val / count, ...)` because `val / count` evaluates before selection and raises zero-division warnings/errors.
- [ ] **Duplicate & Affine Column Pruning**: Flag unintended exact duplicate columns ($\max |f_A - f_B| = 0$) and uninformative constant columns that dilute feature subsampling or distort regularization.

## 4. Mathematical Formulation & Numerical Stability

- [ ] **Explicit Tensor Rank & Shape Contracts (Preventing Implicit Broadcasting)**: Squeeze only explicit trailing singletons (`preds.squeeze(-1)` when `preds.ndim == targets.ndim + 1 and preds.shape[-1] == 1`) and assert exact rank/shape equality (`assert preds.shape == targets.shape`). Reject unvalidated arithmetic between `(B, 1)` and `(B,)` (or `(B, T, 1)` and `(B, T)`) that silently broadcasts into pairwise matrices before `.mean()`, and reject flattening both operands before checking shape (which hides `(M, N)` vs `(N, M)` transpose bugs).
- [ ] **Domain Clamping & Log-Space Stability**:
  - Use fused logit losses or log-sigmoid (`BCEWithLogitsLoss`, `CrossEntropyLoss`, `torch.nn.functional.logsigmoid`, `scipy.special.log_expit`) instead of `log(sigmoid(x))` / `np.log(expit(x))`, which underflow at large negative logits.
  - Clamp inputs to inverse trig functions (`arccos`, `arcsin`) to `[-1 + eps, 1 - eps]` to avoid `NaN` gradients at $\pm 1$.
  - Clamp probabilities to `[eps, 1 - eps]` before computing `log`, `logit`, or Probit ($\Phi^{-1}$).
- [ ] **Transformed-Target Retransformation Bias**: Regressing on $z = \ln(y)$ with squared error estimates $\mathbb{E}[\ln Y \mid X]$, so naive inversion $\exp(\hat{z})$ predicts the conditional geometric mean rather than the arithmetic conditional mean $\mathbb{E}[Y \mid X]$ (Jensen's inequality). Fit a smearing multiplier ($\hat{S} = \frac{1}{N}\sum \exp(e_i)$) strictly on training/OOF residuals and apply $\hat{S}\exp(\hat{z})$, or use an appropriate log-link objective (Poisson/Tweedie) when unbiased mean/sum calibration is required.

## 5. Reproducibility & Artifact Completeness

- [ ] **Seed & Hardware Determinism Hygiene**: Seed Python `random`, `PYTHONHASHSEED`, `numpy`, and ML/DL engines (CPU/CUDA/worker seeds). Explicitly note hardware/algorithmic caveats where CUDA atomic scatter/reduction kernels require deterministic flags (`torch.use_deterministic_algorithms`) or remain hardware-sensitive.
- [ ] **Fail-Fast Data & Cache Lineage**: Reject silent fallback logic around missing optional cache files (`if os.path.exists(cache): load() else: empty`). Pipelines must compute missing artifacts deterministically from authoritative raw inputs or raise immediately.
- [ ] **Atomic Inference Bundle Serialization**: Persist fitted preprocessing state (scaler stats, imputer defaults, vocabularies/categorical dtypes, exact feature order/schema, and tuned thresholds) alongside model weights, verifying schema parity at inference load time.

## Concrete Anti-Patterns

### Anti-Pattern 1: Pre-Split Bleed, Hardcoded Fold Divisor & Pandas Index Collapse

```python
# BAD: Leaks test stats via concat, collapses count=0 and count=1, hardcodes divisor / 5.0,
# and triggers 100% NaN on test_df due to retained pandas Series index alignment.
def build_features_bad(train_df: pd.DataFrame, test_df: pd.DataFrame, y_train, cv):
    all_df = pd.concat([train_df, test_df], ignore_index=True)
    mean_x = all_df["x"].mean()  # Leaks test mean into training feature!
    ratio = (all_df["num"] / np.maximum(1.0, all_df["events"])).astype(np.float32)  # 0 == 1!

    te_test = np.zeros(len(test_df), dtype=np.float32)
    for tr_idx, _ in cv.split(train_df, y_train):
        means = train_df.iloc[tr_idx].assign(y=y_train[tr_idx]).groupby("grp")["y"].mean()
        te_test += test_df["grp"].map(means).fillna(0.0).to_numpy() / 5.0  # Breaks if n_splits != 5

    n_train = len(train_df)
    return pd.DataFrame(
        {"x_centered": train_df["x"] - mean_x},  # Separate train; below fails on test:
    ), pd.DataFrame(
        {"ratio": ratio[n_train:], "grp_te": te_test},  # Retained RangeIndex != test_df.index -> NaN!
        index=test_df.index,
    )

# GOOD: Train-isolated stats, masked division, smoothed OOF train/test encodings matching schemas
def build_features_safe(train_df: pd.DataFrame, test_df: pd.DataFrame, y_train, cv, smooth_m: float = 10.0):
    y_arr = np.asarray(y_train, dtype=np.float32)
    train_mean = float(train_df["x"].mean())

    def safe_ratio(df: pd.DataFrame) -> np.ndarray:
        events = df["events"].to_numpy(dtype=np.float32)
        num = df["num"].to_numpy(dtype=np.float32)
        return np.divide(num, events, out=np.full(len(df), np.nan, dtype=np.float32), where=events > 0)

    te_oof = np.zeros(len(train_df), dtype=np.float32)
    te_test_acc = np.zeros(len(test_df), dtype=np.float32)
    n_splits = 0.0
    for tr_idx, va_idx in cv.split(train_df, y_arr):
        n_splits += 1.0
        prior = float(np.mean(y_arr[tr_idx]))
        tr_stats = (
            pd.DataFrame({"grp": train_df.iloc[tr_idx]["grp"].to_numpy(), "y": y_arr[tr_idx]})
            .groupby("grp")["y"]
            .agg(["sum", "count"])
        )
        smoothed = (tr_stats["sum"] + smooth_m * prior) / (tr_stats["count"] + smooth_m)
        te_oof[va_idx] = train_df.iloc[va_idx]["grp"].map(smoothed).fillna(prior).to_numpy()
        te_test_acc += test_df["grp"].map(smoothed).fillna(prior).to_numpy()

    X_train = pd.DataFrame(
        {"x_centered": (train_df["x"] - train_mean).to_numpy(), "ratio": safe_ratio(train_df), "grp_te": te_oof},
        index=train_df.index,
    )
    X_test = pd.DataFrame(
        {"x_centered": (test_df["x"] - train_mean).to_numpy(), "ratio": safe_ratio(test_df), "grp_te": te_test_acc / n_splits},
        index=test_df.index,
    )
    assert list(X_train.columns) == list(X_test.columns), "Train/test feature schema mismatch"
    assert not X_test["ratio"].isna().all(), "Feature ratio collapsed to 100% NaN"
    return X_train, X_test
```

### Anti-Pattern 2: Implicit Tensor Broadcasting & Reshape-Hidden Transpose Bugs

```python
# BAD: Unflattened (B, 1) predictions silently subtract (B,) targets into a (B, B) pairwise matrix;
# blind .reshape(-1) on both operands would also silently pass on (M, N) vs (N, M) transposes.
loss = ((preds - targets) ** 2).mean()

# GOOD: Squeeze only explicit singleton feature dim and assert exact shape equality
if preds.ndim == targets.ndim + 1 and preds.shape[-1] == 1:
    preds = preds.squeeze(-1)
assert preds.shape == targets.shape, f"Shape mismatch: {preds.shape} vs {targets.shape}"
loss = ((preds - targets) ** 2).mean()
```
