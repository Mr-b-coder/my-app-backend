// server/server.ts

import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors'; // <-- Import CorsOptions type
import JSZip from 'jszip';
import { generatePdf } from './pdfGenerator.js';
import { buildPsd } from './psdBuilder.js';
import { buildIdml } from './idmlBuilder.js';
import { buildInteriorIdml } from './buildInteriorIdml.js';
import { generateDocx } from './wordGenerator.js';
import { generateSummary } from './summaryGenerator.js';

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
  'http://localhost:5173'             // Your local development frontend
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


app.use(express.json({ limit: '10mb' }));

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
      filesToGenerate.push({ name: 'Interior/interior.docx', generator: generateDocx(payload) });
      filesToGenerate.push({ name: 'Interior/interior.idml', generator: buildInteriorIdml(payload) });
      filesToGenerate.push({ name: 'Interior/interior.pdf', generator: Promise.resolve(Buffer.from('Placeholder for Interior PDF')) });
    }

    const generatedFiles = await Promise.all(
      filesToGenerate.map(file => file.generator.then(content => ({ name: file.name, content })))
    );

    console.log('Zipping all files...');
    const zip = new JSZip();
    for (const file of generatedFiles) {
        zip.file(file.name, file.content);
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