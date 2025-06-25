// server/server.ts

import express, { Request, Response } from 'express';
import cors from 'cors';
import JSZip from 'jszip';
import { generatePdf } from './pdfGenerator.js';
import { buildPsd } from './psdBuilder.js';
import { buildIdml } from './idmlBuilder.js';
import { buildInteriorIdml } from './buildInteriorIdml.js';
import { generateDocx } from './wordGenerator.js';
import { generateSummary } from './summaryGenerator.js';

const app = express();

// --- CHANGE 1: REMOVE the hardcoded port from here ---
// const port = 3001; 

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

app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
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
    
    // 1. Prepare list of files to generate based on packageType
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

    // 2. Generate all files in parallel
    const generatedFiles = await Promise.all(
      filesToGenerate.map(file => file.generator.then(content => ({ name: file.name, content })))
    );

    // 3. Create and send the ZIP file using JSZip
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

// --- CHANGE 2: Define PORT dynamically here ---
// This will use Render's port when deployed, OR port 3001 on your computer.
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  // --- CHANGE 3: Update the log message slightly ---
  console.log(`✅ Server is running on port: ${PORT}`);
});