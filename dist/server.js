// server/server.ts
// --- Imports ---
import express from 'express';
import cors from 'cors';
import { generatePdf } from './pdfGenerator.js';
import { buildPsd } from './psdBuilder.js';
import { buildIdml } from './idmlBuilder.js';
import { buildInteriorIdml } from './buildInteriorIdml.js';
import { generateDocx } from './wordGenerator.js';
import { generateSummary } from './summaryGenerator.js';
import { zipFiles } from './zipUtils.js';
// --- Main Express App Setup ---
const app = express();
const port = 3001;
// --- Middleware ---
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '10mb' }));
// --- API Endpoint ---
app.post('/api/generate-template', async (req, res) => {
    try {
        const payload = req.body;
        console.log(`Received request for package type: "${payload.packageType}"`);
        if (!payload || !payload.totalWidth) {
            return res.status(400).json({ error: 'Invalid template data.' });
        }
        const filesToZip = [];
        const { packageType } = payload;
        // 1. Generate Summary (always included)
        const summaryContent = generateSummary(payload);
        filesToZip.push({ name: 'summary.txt', content: Buffer.from(summaryContent) });
        // 2. Conditionally generate Cover files
        if (packageType === 'all' || packageType === 'cover') {
            const [coverPdf, coverPsd, coverIdml] = await Promise.all([
                generatePdf(payload),
                buildPsd(payload),
                buildIdml(payload),
            ]);
            filesToZip.push({ name: 'Cover/cover.pdf', content: coverPdf });
            filesToZip.push({ name: 'Cover/cover.psd', content: coverPsd });
            filesToZip.push({ name: 'Cover/cover.idml', content: coverIdml });
        }
        // 3. Conditionally generate Interior files
        if (packageType === 'all' || packageType === 'interior') {
            const [interiorDocx, interiorIdml] = await Promise.all([
                generateDocx(payload),
                buildInteriorIdml(payload),
            ]);
            filesToZip.push({ name: 'Interior/interior.docx', content: interiorDocx });
            filesToZip.push({ name: 'Interior/interior.idml', content: interiorIdml });
            const interiorPdf = Buffer.from('This is a placeholder for the interior PDF.');
            filesToZip.push({ name: 'Interior/interior.pdf', content: interiorPdf });
        }
        // 4. Create and send the ZIP file
        const zipBuffer = await zipFiles(filesToZip);
        const fileName = `Template_${payload.bindingName.replace(/\s/g, '')}_${packageType}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/zip');
        res.send(zipBuffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error('Error during template generation:', error);
        res.status(500).json({ error: `Failed to generate template package: ${errorMessage}` });
    }
});
// --- Start the Server ---
app.listen(port, () => {
    console.log(`✅ Server is running and correctly structured at http://localhost:${port}`);
});
