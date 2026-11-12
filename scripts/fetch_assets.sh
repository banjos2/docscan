#!/usr/bin/env bash
# Downloads the OCR model tars and the self-hosted ONNX Runtime WASM files that a fresh clone
# needs but git does not track (see README.md). Safe to re-run: existing files are kept, and checked again.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/models public/ort

# These files run in the browser next to a passport photo, and come from hosts this project does not control: each one
# must be the exact file that was reviewed. A mismatch stops the build; after a deliberate upgrade, update the sums.
sha() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1; }
verify() { # verify <expected sha256> <name>, file on stdin
  local got
  got=$(sha)
  [ "$got" = "$1" ] || { echo "checksum mismatch: $2 is $got, expected $1" >&2; exit 1; }
}
sum_of() {
  case "$1" in
    PP-OCRv5_mobile_det/inference.onnx) echo a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d ;;
    PP-OCRv5_mobile_det/inference.yml) echo 98069072e1b6b37d727fd9d9f11725faa46d6ea0de012f2ed26caea011c37699 ;;
    en_PP-OCRv5_mobile_rec/inference.onnx) echo b5f833dfc5d0eb71da397b4efa06ebeee9b431b690a47d6af40d77d8eabc557f ;;
    en_PP-OCRv5_mobile_rec/inference.yml) echo 27e91d0582f40168aa218303c76e184bc78fa7a5d105aad0cfbad8458b441067 ;;
    ort-wasm-simd-threaded.jsep.mjs) echo 9a99acd12acc495184c9ea4d458ac9424f8180aacfbc7b8371ed64f9351e4a81 ;;
    ort-wasm-simd-threaded.jsep.wasm) echo 2e0a3d0e3f6b7c13ecfaba38c13691fd19c9ed470e72f9d7d8416ca59ab6dbcd ;;
    *) echo "no checksum recorded for $1" >&2; exit 1 ;;
  esac
}

# PP-OCRv5 mobile detector + English recogniser, ONNX build (Baidu's default host, bcebos.com, is
# unreachable from this network; PaddlePaddle mirrors the same inference.onnx/inference.yml pair
# on Hugging Face). PaddleOCR.js wants an uncompressed ustar tar of the two files.
for m in PP-OCRv5_mobile_det en_PP-OCRv5_mobile_rec; do
  out="public/models/${m}_onnx_infer.tar"
  if [ ! -f "$out" ]; then
    tmp=$(mktemp -d)
    for f in inference.onnx inference.yml; do
      curl -fsSL -o "$tmp/$f" "https://huggingface.co/PaddlePaddle/${m}_onnx/resolve/main/$f"
    done
    # COPYFILE_DISABLE stops macOS tar from sneaking in AppleDouble "._*" entries.
    COPYFILE_DISABLE=1 tar --format=ustar -cf "$out" -C "$tmp" inference.onnx inference.yml
    rm -rf "$tmp"
    echo "fetched: $out"
  fi
  for f in inference.onnx inference.yml; do
    tar -xOf "$out" "$f" | verify "$(sum_of "$m/$f")" "$out:$f"
  done
done

# onnxruntime-web WASM runtime, pinned to the version PaddleOCR.js's worker bundle embeds
# (grep node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-*.js for the version if the
# package is ever upgraded). Self-hosting keeps this off cdn.jsdelivr.net.
ort_version=1.24.3
for f in ort-wasm-simd-threaded.jsep.mjs ort-wasm-simd-threaded.jsep.wasm; do
  out="public/ort/$f"
  if [ ! -f "$out" ]; then
    curl -fsSL -o "$out" "https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort_version}/dist/$f"
    echo "fetched: $out"
  fi
  verify "$(sum_of "$f")" "$out" < "$out"
done

# pdf.js decodes JBIG2 and JPEG 2000 scans with these; it asks for them by name under /pdfjs/.
mkdir -p public/pdfjs
cp node_modules/pdfjs-dist/wasm/{jbig2,openjpeg,qcms_bg}.wasm public/pdfjs/

# The MRZ decoder needs more from the OCR worker than the SDK returns.
node scripts/patch-ocr-worker.mjs
