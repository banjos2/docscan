#!/usr/bin/env bash
# Downloads the OCR model tars and the self-hosted ONNX Runtime WASM files that a fresh clone
# needs but git does not track (see README.md). Safe to re-run: existing files are left alone.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/models public/ort

# PP-OCRv5 mobile detector + English recogniser, ONNX build (Baidu's default host, bcebos.com, is
# unreachable from this network; PaddlePaddle mirrors the same inference.onnx/inference.yml pair
# on Hugging Face). PaddleOCR.js wants an uncompressed ustar tar of the two files.
for m in PP-OCRv5_mobile_det en_PP-OCRv5_mobile_rec; do
  out="public/models/${m}_onnx_infer.tar"
  if [ -f "$out" ]; then
    echo "skip (exists): $out"
    continue
  fi
  tmp=$(mktemp -d)
  for f in inference.onnx inference.yml; do
    curl -fsSL -o "$tmp/$f" "https://huggingface.co/PaddlePaddle/${m}_onnx/resolve/main/$f"
  done
  # COPYFILE_DISABLE stops macOS tar from sneaking in AppleDouble "._*" entries.
  COPYFILE_DISABLE=1 tar --format=ustar -cf "$out" -C "$tmp" inference.onnx inference.yml
  rm -rf "$tmp"
  echo "fetched: $out"
done

# onnxruntime-web WASM runtime, pinned to the version PaddleOCR.js's worker bundle embeds
# (grep node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-*.js for the version if the
# package is ever upgraded). Self-hosting keeps this off cdn.jsdelivr.net.
ort_version=1.24.3
for f in ort-wasm-simd-threaded.jsep.mjs ort-wasm-simd-threaded.jsep.wasm; do
  out="public/ort/$f"
  if [ -f "$out" ]; then
    echo "skip (exists): $out"
    continue
  fi
  curl -fsSL -o "$out" "https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort_version}/dist/$f"
  echo "fetched: $out"
done
