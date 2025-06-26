# my-app-backend
# Acutrack Template Generator - Backend

This is the backend server for the Acutrack Template Generator. It's a Node.js/Express application built with TypeScript that handles all the heavy lifting of creating PDF, PSD, IDML, and DOCX files.

**Live URL:** [https://my-template-server.onrender.com](https://my-template-server.onrender.com)
**Hosted On:** Render

---

### 🚀 How to Run Locally

1.  Navigate into this folder: `cd my-app-backend`
2.  Install all required packages: `npm install`
3.  Start the development server (with auto-reloading): `npm run dev`

The server will be running at `http://localhost:3001`.

---

### ⚙️ Core Files & How to Make Changes

#### **`server.ts`**
This is the main entry point for the server. It:
- Sets up the Express app and CORS permissions.
- Defines the main API route: `/api/generate-template`.
- Calls the appropriate generator function based on the request from the frontend.
- **To temporarily disable a feature (like interior generation), comment out the relevant lines inside the `app.post(...)` block in this file.**

#### **Generator Files**
These files contain the core logic for creating each template.
-   `pdfGenerator.ts`
-   `psdBuilder.ts`
-   `idmlBuilder.ts`
-   `docxGenerator.ts`
-   `summaryGenerator.ts`

#### **Assets**
-   The `Assets/` folder contains fonts and logos used by the generators.
-   `template.idml` is the base template file used by the IDML builder.

**⚠️ Important:** If you add a **new asset** to this project, you must also update the `package.json` build script to ensure it gets copied during deployment!

-   **File to Edit:** `package.json`
-   **Script to Update:** `"build"`