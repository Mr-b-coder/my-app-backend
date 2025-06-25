// server/wordGenerator.ts

import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageSize, PageMargin } from 'docx';
// Make sure to import with the .js extension
import { TemplatePayload } from './server.js';

/**
 * Builds a DOCX interior template with correct page size and margins.
 * @param payload - An object containing all necessary final dimensions from the frontend.
 * @returns A promise that resolves with the DOCX file as a Buffer.
 */
// ✅ RENAMED to "generateDocx" to match the import in server.ts
export async function generateDocx(payload: TemplatePayload): Promise<Buffer> {
  const { trimWidth, trimHeight, bindingName } = payload;
  
  // Define margins (standard for books)
  const pageMargins = {
    top: 0.75,
    right: 0.5,
    bottom: 0.75,
    left: 0.5,
  };
  
  // Convert inches to DXA (1/20th of a point). 1 inch = 1440 DXA.
  const inchToDXA = (inches: number) => Math.round(inches * 1440);

  const doc = new Document({
    sections: [{
      properties: {
        // Set the page size for the document
        pageSize: {
          width: inchToDXA(trimWidth),
          height: inchToDXA(trimHeight),
        },
        // Set the margins for the document
        pageMargin: {
          top: inchToDXA(pageMargins.top),
          right: inchToDXA(pageMargins.right),
          bottom: inchToDXA(pageMargins.bottom),
          left: inchToDXA(pageMargins.left),
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun("Book Interior Template"),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `This document is formatted for a ${trimWidth.toFixed(3)}" x ${trimHeight.toFixed(3)}" book with a "${bindingName}" binding.`,
              italics: true,
            }),
          ],
        }),
         new Paragraph({
          children: [
            new TextRun({
              text: "You can start writing your book's interior content here. The page size and margins are already set up for you.",
              break: 1, // Adds a line break before this paragraph
            }),
          ],
        }),
      ],
    }],
  });

  // Generate the buffer from the document
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}