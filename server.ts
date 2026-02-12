// server/server.ts

import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors'; // <-- Import CorsOptions type
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOOK_CREATION_GUIDE_ZIP_NAME = 'Book Creation Guide.pdf';

/** Filenames to try (user may add book-creation-guide.pdf or Book Creation Guide.pdf). */
const BOOK_CREATION_GUIDE_FILENAMES = ['book-creation-guide.pdf', 'Book Creation Guide.pdf'];

/** Possible locations for the guide PDF (dev vs prod, different cwd). */
function getBookCreationGuidePaths(): string[] {
  const dirs = [
    path.join(__dirname, 'Assets'),
    path.join(process.cwd(), 'Assets'),
    path.join(process.cwd(), 'my-app-backend', 'Assets'),
    path.join(process.cwd(), 'my-app-frontend', 'src', 'Assets'),
  ];
  const paths: string[] = [];
  for (const dir of dirs) {
    for (const name of BOOK_CREATION_GUIDE_FILENAMES) {
      paths.push(path.join(dir, name));
    }
  }
  return paths;
}
import { generatePdf } from './pdfGenerator.js';
import { buildPsd } from './psdBuilder.js';
import { buildIdml } from './idmlBuilder.js';
import { generateSummary } from './summaryGenerator.js';
import { generateInteriorPdf } from './interiorPdfGenerator.js';
import { analyzePdfBuffer } from './pdfAnalyzer.js';

const app = express();

// ✅ This is now the single source of truth for BindingType
export enum BindingType {
  PERFECT_BIND = "Perfect Bind / Softcover",
  CASE_BIND = "Case Bind / Hardcover",
  SADDLE_STITCH = "Saddle Stitch",
  COIL_WIRE_O_SOFTCOVER = "Coil / Wire-O - Softcover",
  COIL_WIRE_O_HARDCOVER = "Coil / Wire-O - Hardcover",
}

// This interface defines the data structure we expect from the frontend
export interface TemplatePayload {
  packageType: 'all' | 'cover' | 'interior';
  bindingName: string;
  bindingType: string;
  bookTitle?: string;
  pageCount: number;
  paperStock: string;
  totalWidth: number;
  totalHeight: number;
  trimWidth: number;
  trimHeight: number;
  spineWidth?: number;
  bleed?: number;
  wrapAmount?: number;
  hingeWidth?: number;
  boardWidth?: number;
  boardHeight?: number;
  boardExtension?: number;
  frontPanelBoardWidth?: number;
  safetyMargin?: number;
  safetyMarginTopBottom?: number;
  safetyMarginBindingEdge?: number;
  safetyMarginOutsideEdge?: number;
  isHardcoverCoilWire?: boolean;
}

// --- START OF CHANGES ---

// 1. Define a list of origins that are allowed to make requests
const allowedOrigins = [
  'https://acutemplate.netlify.app', // Your production frontend
  'http://localhost:5173',            // Your local development frontend
  'http://localhost:5174',            // Alternative local development port
  'http://localhost:5175'             // Alternative local development port
];

// 2. Create dynamic CORS options
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like Postman or server-to-server) or from allowed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  exposedHeaders: ['Content-Disposition'], // This is important for your file download!
};

// 3. Use the new dynamic options
app.use(cors(corsOptions));

// --- END OF CHANGES ---


// 1GB for PDF analyze (base64 adds ~33% size); other endpoints use small payloads. File is not stored—only in-memory for analysis then discarded.
app.use(express.json({ limit: '1gb' }));

/**
 * Build candidate direct URLs for known providers that commonly return HTML "view" pages.
 * We try these in order until one returns actual PDF bytes.
 */
function getPdfCandidateUrls(url: string): string[] {
  const trimmed = url.trim();
  const candidates: string[] = [trimmed];

  // Google Drive: view URL -> direct download URLs (try usercontent first; works for shared "anyone with link" files as of 2024)
  const driveMatch = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
  if (driveMatch) {
    const id = driveMatch[1];
    candidates.unshift(
      `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${id}`
    );
  }

  // ShareFile public share: /share/view/<id> may need a direct endpoint
  const shareFileMatch = /^https?:\/\/([^/]+\.sharefile\.com)\/share\/view\/([a-zA-Z0-9]+)/i.exec(trimmed);
  if (shareFileMatch) {
    const host = shareFileMatch[1];
    const shareId = shareFileMatch[2];
    candidates.unshift(
      `https://${host}/share/download/${shareId}`,
      `https://${host}/share/get/${shareId}`,
      `https://${host}/d-s${shareId}`
    );
  }

  // Remove duplicates while preserving order
  return [...new Set(candidates)];
}

/** Analyze PDF: page count and dimensions. Body: { fileBase64?: string, pdfUrl?: string } */
app.post('/api/analyze-pdf', async (req: Request, res: Response) => {
  try {
    const { fileBase64, pdfUrl } = req.body as { fileBase64?: string; pdfUrl?: string };
    let buffer: Buffer | undefined;

    if (fileBase64 && typeof fileBase64 === 'string') {
      buffer = Buffer.from(fileBase64, 'base64');
    } else if (pdfUrl && typeof pdfUrl === 'string') {
      const inputUrl = pdfUrl.trim();
      if (!/^https?:\/\//i.test(inputUrl)) {
        return res.status(400).json({ error: 'Invalid PDF URL. Use http:// or https://.' });
      }
      const candidateUrls = getPdfCandidateUrls(inputUrl);
      let lastStatus: number | null = null;
      let sawHtmlPage = false;
      let fetchedPdf = false;
      const isDriveInput = /drive\.google\.com/i.test(inputUrl);
      const isShareFileInput = /\.sharefile\.com/i.test(inputUrl);

      for (const candidateUrl of candidateUrls) {
        const response = await fetch(candidateUrl, {
          headers: {
            Accept: 'application/pdf',
            'User-Agent': 'Mozilla/5.0 (compatible; PdfAnalyzer/1.0)',
          },
          redirect: 'follow',
        });
        lastStatus = response.status;
        if (!response.ok) {
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const candidateBuffer = Buffer.from(arrayBuffer);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        const startsWithPdfSignature =
          candidateBuffer.length >= 4 &&
          candidateBuffer[0] === 0x25 &&
          candidateBuffer[1] === 0x50 &&
          candidateBuffer[2] === 0x44 &&
          candidateBuffer[3] === 0x46; // %PDF
        const looksLikeHtml =
          candidateBuffer.length >= 5 &&
          !startsWithPdfSignature &&
          ((candidateBuffer[0] === 0x3c && (candidateBuffer[1] === 0x21 || candidateBuffer[1] === 0x3f)) || // <! or <?
            candidateBuffer.toString('utf8', 0, 15).toLowerCase().startsWith('<!doctype') ||
            candidateBuffer.toString('utf8', 0, 6).toLowerCase() === '<html ');

        if (startsWithPdfSignature || contentType.includes('pdf')) {
          buffer = candidateBuffer;
          fetchedPdf = true;
          break;
        }

        if (looksLikeHtml || contentType.includes('html')) {
          sawHtmlPage = true;
          continue;
        }
      }

      if (!fetchedPdf) {
        if (isShareFileInput && sawHtmlPage) {
          return res.status(400).json({
            error: 'ShareFile returned a web page (not direct PDF bytes). In ShareFile, open the file and use Download to get a direct file link, or use "Upload PDF" in this tool.',
          });
        }
        if (isDriveInput && sawHtmlPage) {
          return res.status(400).json({
            error: 'Google Drive returned a page instead of the file. Use "Upload PDF" and select the file, or share the file so "Anyone with the link" can view.',
          });
        }
        if (lastStatus != null) {
          return res.status(400).json({
            error: `Could not fetch PDF (${lastStatus}). Use "Upload PDF" or a direct link to the PDF file.`,
          });
        }
        return res.status(400).json({
          error: 'Could not fetch PDF from URL. Use "Upload PDF" or a direct link to the PDF file.',
        });
      }
    } else {
      return res.status(400).json({
        error: 'Provide either fileBase64 (base64-encoded PDF) or pdfUrl (URL to a PDF).',
      });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'PDF data is empty.' });
    }

    const result = await analyzePdfBuffer(buffer);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('PDF analysis error:', err);
    return res.status(400).json({ error: `PDF analysis failed: ${msg}` });
  }
});

app.post('/api/generate-template', async (req: Request, res: Response) => {
  try {
    const payload = req.body as TemplatePayload;
    console.log(`Received request for package type: "${payload.packageType}" for binding: "${payload.bindingName}"`);

    if (!payload || !payload.totalWidth) {
      return res.status(400).json({ error: 'Invalid template data received.' });
    }

    const filesToGenerate: { name: string; generator: Promise<Buffer> }[] = [];
    const { packageType } = payload;
    
    filesToGenerate.push({ name: 'summary.txt', generator: Promise.resolve(Buffer.from(generateSummary(payload))) });

    if (packageType === 'all' || packageType === 'cover') {
      console.log('Preparing cover file generation...');
      filesToGenerate.push({ name: 'Cover/cover.pdf', generator: generatePdf(payload) });
      filesToGenerate.push({ name: 'Cover/cover.psd', generator: buildPsd(payload) });
      filesToGenerate.push({ name: 'Cover/cover.idml', generator: buildIdml(payload) });
    }
    
    if (packageType === 'all' || packageType === 'interior') {
      console.log('Preparing interior file generation...');
      // IDML and DOCX deferred to next version
      filesToGenerate.push({ name: 'Interior/interior.pdf', generator: generateInteriorPdf(payload) });
    }

    const generatedFiles = await Promise.all(
      filesToGenerate.map(file => file.generator.then(content => ({ name: file.name, content })))
    );

    console.log('Zipping all files...');
    const zip = new JSZip();
    for (const file of generatedFiles) {
        zip.file(file.name, file.content);
    }
    // Add Book Creation Guide.pdf from Assets (try multiple locations for dev vs prod)
    const guidePaths = getBookCreationGuidePaths();
    let guideAdded = false;
    for (const guidePath of guidePaths) {
      try {
        const guidePdf = await fs.readFile(guidePath);
        zip.file(BOOK_CREATION_GUIDE_ZIP_NAME, guidePdf);
        guideAdded = true;
        break;
      } catch {
        continue;
      }
    }
    if (!guideAdded) {
      console.warn('Book Creation Guide.pdf not found. Tried:', guidePaths.join(', '));
    }
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }); 
    
    const fileName = `Template_${payload.bindingName.replace(/[\s/]/g, '')}_${packageType}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
    console.log(`Successfully sent ${fileName} to the client.`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error('Error during template generation:', error);
    res.status(500).json({ error: `Failed to generate template package: ${errorMessage}` });
  }
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  // This log message is crucial for debugging.
  // It will now print the port Render gave us (e.g., 10000).
  console.log(`✅ Server is running on port: ${PORT}`);
});