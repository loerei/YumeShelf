# Readiness Subdocument: Native Toolchains & Cross-Platform Prerequisites

## Domain Audit Checklist

### 1. Dynamic Linking & Target ABIs
- [ ] Target C-Library Compatibility: Verify binary compilation explicitly targets expected system C-libraries (`glibc` vs. `musl`). Reject static binaries built against `glibc` targeted for minimal Linux environments without explicit validation.
- [ ] Architecture Flags: Ensure build flags explicitly account for target CPU architectures (`x86_64`, `aarch64`) and endianness.

### 2. Foreign Function Interface (FFI) Safety
- [ ] Cgo/FFI Memory Boundaries: Confirm all memory allocations crossing FFI boundaries explicitly assign ownership and free allocation memory within the source runtime allocator.
- [ ] Pointer Pinning: Verify dynamic language garbage collection pointers passed to native functions remain pinned in memory during native execution.

## Concrete Anti-Patterns

### Anti-Pattern 1: Leaking FFI Memory Allocations

```go
// BAD: Allocation of C string inside Go function without cleanup free execution.
// Causes permanent process memory leakage on every execution call.
/*
#include <stdlib.h>
*/
import "C"

func ConvertAndProcess(val string) {
    cStr := C.CString(val)
    C.process_string(cStr)
    // Missing C.free(unsafe.Pointer(cStr))!
}

// GOOD: Enforce defer C.free immediately following allocation.
func ConvertAndProcess(val string) {
    cStr := C.CString(val)
    defer C.free(unsafe.Pointer(cStr))
    C.process_string(cStr)
}
```

## Failure Modes & Mitigations

- Segmentation Faults via ABI Mismatch: Execute automated integration testing within targeted Docker containers matching exact production OS distributions.
- Go Pointer Passing Rule Violations: Run static analysis tools (`go vet`) with pointer passing checks enabled in CI pipelines.
