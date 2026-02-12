// server/wordGenerator.ts
import { Document, Packer, Paragraph, TextRun, IStylesOptions, UnderlineType } from 'docx';
import { TemplatePayload } from './server.js';

// This is a standard setup for modern docx versions
const styles: IStylesOptions = {
    default: {
        document: {
            run: {
                font: "Calibri",
                size: "22pt", // 11pt
            },
        },
    },
    characterStyles: [
        {
            id: "MyStandardStyle",
            name: "My Standard Style",
            run: {
                font: "Calibri",
                size: "22pt",
            },
        },
        {
            id: 'heading1',
            name: 'Heading 1',
            basedOn: 'MyStandardStyle',
            next: 'MyStandardStyle',
            quickFormat: true,
            run: {
                size: '32pt', // 16pt
                bold: true,
                color: '000000',
            },
        },
    ],
};

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
    styles: styles,
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
          style: 'heading1',
          text: "Book Interior Template",
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