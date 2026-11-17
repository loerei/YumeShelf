# Custom Deep Learning, Training Loops & ONNX Export/Runtime Parity

Audits custom neural architectures, training loop stability, graph export semantics (ONNX / compiled graphs), quantization bounds, and train-export-serve parity across runtimes.

## 1. ONNX Export & Runtime Numerical Parity

- [ ] **Mode Lock & Checkpoint Restoration Before Export**: Mandate restoring the best validation checkpoint and calling `model.eval()` inside a `torch.no_grad()` context *before* exporting or tracing. Exporting in `.train()` mode freezes stochastic `Dropout` masks and uses/updates active `BatchNorm` batch statistics instead of running moments.
- [ ] **Reference-to-Runtime Numerical Equivalence**: Reject ONNX/runtime plans that only assert output array shapes or zero exceptions. Mandate numerical equivalence verification comparing the reference framework output against the target inference engine (`onnxruntime.InferenceSession` on the target Execution Provider) using explicit tolerances (`np.testing.assert_allclose(..., rtol=..., atol=...)`) across:
  - Single-item (`B = 1`) vs. batched (`B > 1`) inference,
  - Variable sequence lengths or spatial dimensions (where dynamic axes are supported),
  - Edge cases (zeros, extreme magnitudes, all-masked/max-padding inputs, boundary categories).
- [ ] **Quantization & Reduced Precision Guard (`FP16` / `INT8`)**: When exporting or quantizing to `FP16`/`INT8`, require representative calibration data (strictly from the training/calibration split, NEVER the test set) and downstream metric/parity validation confirming quantization drift stays within task bounds (catching `fp16` overflow $> 65504$ in `exp`/`softmax`/large attention logits or `int8` range saturation).

## 2. Graph Capture, Dynamic Shapes & Operator Portability

- [ ] **Dynamic Axis & Symbolic Shape Contracts**: Reject static dummy-input export when runtime handles variable batch sizes, sequence lengths, or input resolutions. Require explicit `dynamic_axes` (or `dynamic_shapes` with `torch.export` / dynamo exporter) and test inference with at least two shapes distinct from the export dummy tensor.
- [ ] **Zero Trace-Frozen Data-Dependent Control Flow**: Reject Python conditional branching (`if tensor.sum() > 0:`, `.item()`, Python `range(tensor.size(0))`, or `.numpy()` casts) inside trace-captured `forward()` methods. Tracing executes only the branch hit by the dummy input and silently bakes that branch into a constant graph. Replace with symbolic tensor operations (`torch.where`, vectorized masking) or verified scripted/dynamo dynamic control flow tested across opposing branch inputs.
- [ ] **Avoid Hardcoded Reshape Constants**: Reject `x.view(batch_literal, -1)` or computed Python `int` constants derived from dummy tensor dimensions inside `forward()`. Use dynamic shape ops (`x.flatten(1)`, `x.view(x.shape[0], -1)`).
- [ ] **Opset Version, Model Validation & Execution Provider Compatibility**: Verify all operators (custom activations, `ScatterND`, `GridSample`, `TopK`, `Resize` coordinate modes, `Einsum`) are supported in the pinned target opset and target Execution Provider (`CPU`, `CUDA`, `TensorRT`, `DirectML`, `WebGPU`, ORT-Mobile) without unintended silent CPU fallback splits or interpolation/padding coordinate mismatches (`align_corners`, asymmetric padding). Validate exported graphs (`onnx.checker.check_model`) and preserve sidecar external-weight files (`.onnx.data` for models $> 2\text{GB}$). Custom ops must specify exact symbolic/kernel bindings and runtime tests.

## 3. Train-Export-Serve Preprocessing & Postprocessing Seam

- [ ] **Zero Preprocessing Skew Across Language/Runtime Boundaries**: When an ONNX model is executed outside its training codebase (C++, Rust, TypeScript/Web, mobile), ensure image channel order (`RGB` vs `BGR`), value scaling (`[0, 1]` vs `[-1, 1]`, mean/std constants), resizing interpolation filter, tokenization/padding side, tabular transforms, and postprocessing activations/temperatures match training identically.
  - Prefer embedding deterministic tensor preprocessing/postprocessing inside the ONNX graph, OR export a single versioned preprocessing config verified by cross-runtime golden test fixtures.

## 4. Custom Architecture & Training Loop Integrity

- [ ] **Mode Restoration & Detached Metric Logging**: Call `model.train()` cleanly at training-step/epoch start after validation or mid-training ONNX evaluation (so `Dropout`/`BatchNorm` do not remain frozen in `.eval()`), and accumulate metrics via `loss.detach()` / `.item()` rather than retaining autograd graphs across steps (`total_loss += loss` OOMs real epochs while passing tiny fixture tests).
- [ ] **Gradient Accumulation, Unscaling & Optimizer Step Cadence**: Verify `optimizer.zero_grad(set_to_none=True)` flushes once per accumulation window (never on every micro-batch), losses scale by `1 / accum_steps` before `.backward()`, trailing partial steps flush at epoch end, `GradScaler.unscale_(optimizer)` is invoked before `clip_grad_norm_` under `fp16` AMP, and `lr_scheduler.step()` aligns cleanly with actual optimizer steps (handling scaler-skipped overflow steps).
- [ ] **Mixed Precision & Loss Reduction Safety**: Keep softmax denominators, large reductions, and log-likelihood/KL losses in `float32` (`autocast` safe regions). For masked sequences/labels, normalize loss by the count of valid unmasked tokens (`mask.sum().clamp(min=1)`) rather than `batch * seq_len`.
- [ ] **Attention & Padding Mask Polarity Consistency**: Verify exact boolean vs additive (`-inf` / `-1e9`) convention across custom encoder/decoder modules (`key_padding_mask=True` means *ignore* in PyTorch `MultiheadAttention`, whereas `attention_mask=1` means *keep* in many transformer APIs), and guard all-masked rows (where every token masked produces `softmax([-inf, ...]) = NaN` in `MultiheadAttention` backward). Add a unit test asserting masked tail positions contribute zero gradient/output change to valid prefix tokens.
- [ ] **Normalization Layer Match**: Flag `BatchNorm` layers when training uses micro-batch `1` under gradient accumulation or online serving receives single samples without batch accumulation; prefer `LayerNorm`, `GroupNorm`, or `RMSNorm` for sequence/micro-batch stability.
- [ ] **DataLoader & Worker Determinism**: Require worker seeding (`worker_init_fn` + explicit `torch.Generator`) for reproducible shuffling/augmentations across multi-worker pipelines.

## Concrete Anti-Patterns

### Anti-Pattern 1: Leaky Trace-Frozen ONNX Export vs. Dynamic Parity-Tested Export

```python
# BAD: Exports in train mode with static dummy shape, Python branch baked into trace,
# and "verifies" using the identical dummy tensor on CPU only.
def export_bad(model, dummy_x):
    # Bug 1: model still in train() mode (Dropout active, BatchNorm stats unstable)
    # Bug 2: forward() contains `if x.mean() > 0: ...` frozen to dummy_x's outcome
    torch.onnx.export(model, dummy_x, "model.onnx", opset_version=17)
    sess = ort.InferenceSession("model.onnx")
    out = sess.run(None, {"input": dummy_x.numpy()})[0]
    assert out.shape == (dummy_x.shape[0], 10)  # Shape check misses numerical/branch drift!

# GOOD: Lock eval + no_grad, dynamic shapes, symbolic ops, multi-shape/branch parity check
def export_and_verify_safe(model: torch.nn.Module, dummy_x: torch.Tensor, path: str) -> None:
    model.eval()
    with torch.no_grad():
        torch.onnx.export(
            model,
            dummy_x,
            path,
            opset_version=17,
            input_names=["input"],
            output_names=["logits"],
            dynamic_axes={"input": {0: "batch", 1: "seq_len"}, "logits": {0: "batch"}},
        )

    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    # Test multiple shapes and opposite sign/branch regimes on dummy_x's device/dtype
    for probe in [
        torch.full((1, 5, dummy_x.shape[-1]), -10.0, device=dummy_x.device, dtype=dummy_x.dtype),
        torch.full((4, 19, dummy_x.shape[-1]), 10.0, device=dummy_x.device, dtype=dummy_x.dtype),
        torch.zeros((2, 1, dummy_x.shape[-1]), device=dummy_x.device, dtype=dummy_x.dtype),
    ]:
        with torch.no_grad():
            ref = model(probe).detach().cpu().numpy()
        ort_out = sess.run(["logits"], {"input": probe.detach().cpu().numpy()})[0]
        np.testing.assert_allclose(ref, ort_out, rtol=1e-4, atol=1e-5)
```

### Anti-Pattern 2: Accumulation Flush Bug & Polarity-Inverted Mask

```python
# BAD: Zeros gradients every micro-batch (destroying accumulation), skips tail step,
# and feeds keep-mask (1=valid, 0=pad) into PyTorch key_padding_mask (True=ignore)!
for step, batch in enumerate(loader):
    optimizer.zero_grad()  # BUG: wipes prior accumulated micro-steps!
    out = model(batch["ids"], src_key_padding_mask=batch["valid_mask"].bool())  # BUG: masks valid tokens!
    loss = loss_fn(out, batch["y"])
    loss.backward()
    if (step + 1) % accum_steps == 0:
        optimizer.step()

# GOOD: Scale loss, flush once per window (+ remainder), invert mask cleanly when Bool ignore is expected
optimizer.zero_grad(set_to_none=True)
for step, batch in enumerate(loader):
    pad_ignore_mask = ~batch["valid_mask"].bool()  # True explicitly marks padding to ignore
    out = model(batch["ids"], src_key_padding_mask=pad_ignore_mask)
    loss = loss_fn(out, batch["y"]) / accum_steps
    loss.backward()
    if (step + 1) % accum_steps == 0 or (step + 1) == len(loader):
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)
```
