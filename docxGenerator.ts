// server/docxGenerator.ts  (Note the new filename)

import { Document, Packer, Paragraph, TextRun } from 'docx';
import { TemplatePayload } from './server.js';

export async function generateDocx(payload: TemplatePayload): Promise<Buffer> {
  const { trimWidth, trimHeight, bindingName } = payload;
  
  const pageMargins = {
    top: 0.75,
    right: 0.5,
    bottom: 0.75,
    left: 0.5,
  };
  
  const inchToDXA = (inches: number) => Math.round(inches * 1440);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: {
            width: inchToDXA(trimWidth),
            height: inchToDXA(trimHeight),
          },
          margin: {
            top: inchToDXA(pageMargins.top),
            right: inchToDXA(pageMargins.right),
            bottom: inchToDXA(pageMargins.bottom),
            left: inchToDXA(pageMargins.left),
          },
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

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}