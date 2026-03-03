# Acutrack Template Generator - Backend Server

This is the backend server for the Acutrack Template Generator. It's a Node.js/Express application built with TypeScript that handles all the heavy lifting of creating PDF, PSD, IDML, and DOCX files.

**Live URL:** [https://my-template-server.onrender.com](https://my-template-server.onrender.com)
**Hosted On:** Render

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [How to Run Locally](#how-to-run-locally)
4. [API Endpoints](#api-endpoints)
5. [Deployment](#deployment)

---

<h2 id="tech-stack">Tech Stack</h2>

- **Environment:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Core Libraries:**
  - `cors`: For enabling cross-origin requests from the frontend.
  - `jszip`: For creating ZIP archives of downloadable files.
  - `pdf-lib`, `ag-psd`, `docx`, `xmldom`: For generating the various template file formats.
  - `canvas`, `fontkit`: For handling fonts and graphics in file generation.

<h2 id="project-structure">Project Structure</h2>

All source files are located in the root of this repository.
Use code with caution.
Markdown
/my-app-backend
├── /Assets/ # Contains fonts, logos, and other static files needed by the server.
├── /dist/ # The compiled JavaScript output folder (created by the build process).
├── /node_modules/
├── server.ts # The main Express server entry point; includes /api/generate-dust-jacket.
├── pdfGenerator.ts # Logic for creating PDF files (covers, dust jacket via drawDustJacket).
├── psdBuilder.ts # Logic for creating PSD files.
├── idmlBuilder.ts # Logic for creating IDML files.
├── wordGenerator.ts # DOCX generation.
├── template.idml # The base template file for IDML generation.
├── package.json # Project dependencies and scripts.
└── tsconfig.json # TypeScript compiler configuration.
<h2 id="how-to-run-locally">How to Run Locally</h2>

1.  **Navigate into this folder:**
    ```bash
    cd my-app-backend
    ```
2.  **Install all required packages:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    This command uses `tsx` to run the TypeScript code directly and watch for changes.
    ```bash
    npm run dev
    ```
The server will be running at `http://localhost:3001`. For the full application to work, the frontend must also be running.

<h2 id="api-endpoints">API Endpoints</h2>

### Generate Template Package
- **Endpoint:** `POST /api/generate-template`
- **Description:** Receives book specification data from the frontend, generates all the necessary template files, zips them, and sends the zip file back to the user for download. When Case Bind with “Include dust jacket” is selected, the ZIP also includes the dust jacket PDF.
- **Request Body:** Expects a JSON object matching the `TemplatePayload` interface defined in `server.ts`.

### Generate Dust Jacket PDF Only
- **Endpoint:** `POST /api/generate-dust-jacket`
- **Description:** Generates only the dust jacket PDF for Case Bind. Same payload shape as the main template (must include `bindingName: "Case Bind"`, `includeDustJacket: true`, `dustJacketTotalWidth`, `dustJacketTotalHeight`, `dustJacketFlapWidthInches`, trim, spine, etc.).
- **Response:** PDF file (application/pdf) for download.

<h3 id="dust-jacket-pdf-layout">Dust Jacket PDF Layout (pdfGenerator.ts)</h3>

- **Panel order (left to right):** Back flap | Back cover | Spine | Front cover | Front flap.
- **Colors:** Teal bleed; blue inner background; spine color for main flap and spine strip; separate **fold color** for the 0.125" folding strip on each flap; white safety/content areas.
- **Back / Front cover:** Full-height white safety rect; logo and “BACK COVER” / “FRONT COVER” below logo; barcode placeholder (yellow) in **bottom-right** of back cover white area.
- **Flaps:** Main flap width (3" or 4" from user) + 0.125" fold. White content area on flaps: width 2.87" (3" flap) or 3.87" (4" flap), height = trim height (dynamic), **centered in main flap only** (excluding fold), then **inset 0.125" on all sides**.
- **Front cover details:** Total size, Trim size, Spine width, Flap width (in), Fold (0.125 in) with short descriptions.

<h2 id="deployment">Deployment</h2>

This backend is continuously deployed to **Render** from the `main` branch of this repository.

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

The `build` script (`"build": "tsc && cp -R Assets dist/ && cp template.idml dist/"`) is critical. It compiles the TypeScript code into the `dist` folder and copies all necessary assets (`Assets/`, `template.idml`) into `dist` so the production server can find them.

**⚠️ Important:** If you add a **new asset** to the root of this project (like a new template file), you **must** update the `"build"` script in `package.json` to copy it into the `dist` folder.

---

## Recent changes (Dust Jacket)

- **`drawDustJacket`** in `pdfGenerator.ts`: single-page dust jacket PDF with bleed, blue inner area, spine strip; back/front cover white areas (full height), logo + label below logo, barcode in bottom-right of back cover; flaps split into main flap (spine color) and 0.125" fold (fold color); flap white area width 2.87"/3.87", height = trim height, centered in main flap, 0.125" inset; front cover info lines: total size, trim size, spine, flap width (in), fold (0.125 in).
- **`POST /api/generate-dust-jacket`** in `server.ts`: returns dust jacket PDF only; payload same as main template with dust jacket fields set.
