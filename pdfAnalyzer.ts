// pdfAnalyzer.ts – Analyze PDF: page count, dimensions, boxes, document title.

import { PDFDocument } from 'pdf-lib';

const POINTS_PER_INCH = 72;

export interface PageDimensionInches {
  widthInches: number;
  heightInches: number;
}

/** Box dimensions in inches (width × height). */
export interface BoxInches {
  widthInches: number;
  heightInches: number;
}

/** First page Bleed and Trim box dimensions in inches. */
export interface FirstPageBoxes {
  bleedBox: BoxInches;
  trimBox: BoxInches;
}

export interface PdfAnalysisResult {
  pageCount: number;
  pageDimensions: PageDimensionInches[];
  /** First page dimensions (convenience when all pages same size). */
  firstPageWidthInches: number;
  firstPageHeightInches: number;
  /** True if every page has the same dimensions. */
  consistentSize: boolean;
  /** Document title from PDF metadata, when present. */
  title?: string;
  /** First page Media/Crop/Bleed/Trim boxes in inches. */
  firstPageBoxes?: FirstPageBoxes;
}

function pointsToInches(w: number, h: number): BoxInches {
  return {
    widthInches: Math.round((w / POINTS_PER_INCH) * 1000) / 1000,
    heightInches: Math.round((h / POINTS_PER_INCH) * 1000) / 1000,
  };
}

/**
 * Analyze a PDF buffer: page count, dimensions, first-page boxes, and document title.
 * Dimensions are in inches (converted from PDF points, 72 pt = 1 inch).
 */
export async function analyzePdfBuffer(pdfBuffer: Buffer): Promise<PdfAnalysisResult> {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = doc.getPages();

  const pageDimensions: PageDimensionInches[] = [];
  let firstWidth: number | null = null;
  let firstHeight: number | null = null;
  let consistentSize = true;

  for (const page of pages) {
    const w = page.getWidth();
    const h = page.getHeight();
    const widthInches = Math.round((w / POINTS_PER_INCH) * 1000) / 1000;
    const heightInches = Math.round((h / POINTS_PER_INCH) * 1000) / 1000;
    pageDimensions.push({ widthInches, heightInches });
    if (firstWidth === null) {
      firstWidth = widthInches;
      firstHeight = heightInches;
    } else if (consistentSize && (widthInches !== firstWidth || heightInches !== firstHeight)) {
      consistentSize = false;
    }
  }

  // Document title (metadata)
  const title = doc.getTitle()?.trim() || undefined;

  // First page Bleed and Trim boxes in inches
  let firstPageBoxes: FirstPageBoxes | undefined;
  if (pages.length > 0) {
    const first = pages[0];
    const bleed = first.getBleedBox();
    const trim = first.getTrimBox();
    firstPageBoxes = {
      bleedBox: pointsToInches(bleed.width, bleed.height),
      trimBox: pointsToInches(trim.width, trim.height),
    };
  }

  return {
    pageCount: pages.length,
    pageDimensions,
    firstPageWidthInches: firstWidth ?? 0,
    firstPageHeightInches: firstHeight ?? 0,
    consistentSize,
    ...(title && { title }),
    ...(firstPageBoxes && { firstPageBoxes }),
  };
}
