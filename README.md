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
├── server.ts # The main Express server entry point.
├── pdfGenerator.ts # Logic for creating PDF files.
├── psdBuilder.ts # Logic for creating PSD files.
├── idmlBuilder.ts # Logic for creating IDML files.
├── docxGenerator.ts # Logic for creating DOCX files.
├── template.idml # The base template file for IDML generation.
├── package.json # Project dependencies and scripts.
└── tsconfig.json # TypeScript compiler configuration.
Generated code
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
- **Description:** Receives book specification data from the frontend, generates all the necessary template files, zips them, and sends the zip file back to the user for download.
- **Request Body:** Expects a JSON object matching the `TemplatePayload` interface defined in `server.ts`.

<h2 id="deployment">Deployment</h2>

This backend is continuously deployed to **Render** from the `main` branch of this repository.

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

The `build` script (`"build": "tsc && cp -R Assets dist/ && cp template.idml dist/"`) is critical. It compiles the TypeScript code into the `dist` folder and copies all necessary assets (`Assets/`, `template.idml`) into `dist` so the production server can find them.

**⚠️ Important:** If you add a **new asset** to the root of this project (like a new template file), you **must** update the `"build"` script in `package.json` to copy it into the `dist` folder.# my-app-backend
