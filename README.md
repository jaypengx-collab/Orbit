# Orbit Color — GitHub Pages deployment

This folder is the complete hosted version of Orbit Color. It includes the local, browser-based Traditional Chinese OCR assets under `ocr/`.

The package includes `tesseract.min.js`, `worker.min.js`, the core WASM files, and the `eng` plus `chi_tra` language models. Keep the folder structure and capitalization unchanged.

The entrypoint is `index.html`. Upload the contents of this folder, including `.nojekyll`, directly to the repository root.

## Deploy

1. Create a new GitHub repository, for example `orbit-color`.
2. Upload every item in **this folder** to the repository root. Keep the `ocr/` directory and all its contents unchanged.
3. On GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select branch `main` and folder `/(root)`, then save.
6. Wait for GitHub to show the published URL, then open it using Safari on iPhone.

The expected URL is `https://YOUR-GITHUB-NAME.github.io/orbit-color/`.

## Important

- Do not open `index.html` from the iPhone Files app; use the GitHub Pages URL.
- The image remains in the visitor's browser. It is sent neither to GitHub nor to an OCR API.
- On first OCR use, the browser downloads the bundled worker and language models from this GitHub Pages site, then caches them locally. No image is uploaded.
