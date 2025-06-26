// server/wordGenerator.ts
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { TemplatePayload } from './server.js';

/**
 * Builds a DOCX interior template with correct page size and margins.
 * @param payload - An object containing all necessary final dimensions from the frontend.
 * @returns A promise that resolves with the DOCX file as a Buffer.
 */
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
          children: [
            new TextRun({ text: "Book Interior Template", bold: true, size: 32 }),
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
              break: 1,
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