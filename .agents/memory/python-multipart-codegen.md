---
name: Python multipart codegen
description: TypeScript library builds need browser globals when Orval generates multipart upload validation.
---

When OpenAPI multipart schemas generate `File`/`Blob` in the Zod library, include the DOM library in that library's TypeScript compiler options even if the runtime is server-side.

**Why:** Orval's generated upload validators reference browser globals at typecheck time; without DOM types, codegen succeeds but the workspace library build fails.

**How to apply:** For future multipart upload contracts, regenerate codegen and verify the composite library typecheck before wiring the frontend.