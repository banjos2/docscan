import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // PaddleOCR.js starts its worker via new URL("./assets/…", import.meta.url): pre-bundling would break that path.
  // Its CommonJS dependencies still have to be pre-bundled.
  optimizeDeps: {
    exclude: ["@paddleocr/paddleocr-js"],
    include: [
      "@paddleocr/paddleocr-js > @techstark/opencv-js",
      "@paddleocr/paddleocr-js > clipper-lib",
      "@paddleocr/paddleocr-js > js-yaml",
    ],
  },
})
