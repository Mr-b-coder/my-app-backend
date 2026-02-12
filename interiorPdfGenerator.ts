// server/interiorPdfGenerator.ts
import { PDFDocument, PDFPage, PDFFont, PDFImage, StandardFonts, rgb, degrees } from 'pdf-lib';
import { TemplatePayload } from './server.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.join(__dirname, 'Assets', 'logo.png');

const POINTS_PER_INCH = 72;

/** Standard bleed for interior pages (0.125" on all sides). */
const INTERIOR_BLEED_INCHES = 0.125;

/** Top, bottom, and outside (non-gutter) safety margin in inches. */
const INTERIOR_TOP_BOTTOM_OUTSIDE_MARGIN_INCHES = 0.5;

/** Number of template pages in the interior PDF. */
const INTERIOR_PDF_PAGE_COUNT = 3;

/**
 * Recommended gutter (inside) margin in inches by page count.
 * Top, bottom, and outside remain 0.5"; gutter varies by count.
 */
export function getGutterMarginInches(pageCount: number): number {
  if (pageCount < 61) return 0.5;
  if (pageCount <= 150) return 0.675;
  if (pageCount <= 400) return 0.75;
  if (pageCount <= 600) return 1;
  return 1.25;
}

/** Color separation: bleed = teal, trim = blue (same as cover), safety = full white rectangle. */
const COLORS = {
  bleedArea: rgb(0.004, 0.525, 0.522),
  background: rgb(0.125, 0.294, 0.498), // blue trim area (same as cover)
  page: rgb(1, 1, 1), // white safety/content area
  textPrimary: rgb(0.1, 0.1, 0.1),
  textSecondary: rgb(0.4, 0.4, 0.4),
  /** Light text for ref text drawn on blue (page number, template notice). */
  textOnBlue: rgb(1, 1, 1),
  indicator: {
    bleed: rgb(0.004, 0.525, 0.522),
    safety: rgb(0.125, 0.294, 0.498),
    trim: rgb(0.125, 0.294, 0.498),
    docSize: rgb(0.004, 0.525, 0.522),
  },
};

/**
 * Safety margin calculation for interior pages. Top, bottom, and outside = 0.5";
 * gutter (inside) = getGutterMarginInches(pageCount). Use after PDF generation (e.g. IDML, DOCX).
 */
export interface InteriorSafetyMarginValues {
  /** Bleed in inches (0.125). */
  bleedIn: number;
  /** Top and bottom margin in inches (0.5). */
  topIn: number;
  bottomIn: number;
  /** Outside (non-gutter) margin in inches (0.5). */
  outsideIn: number;
  /** Gutter (inside) margin in inches (by page count). */
  gutterIn: number;
  /** Trim width/height in inches. */
  trimWidthIn: number;
  trimHeightIn: number;
  trimWidthPt: number;
  trimHeightPt: number;
  /** Content (safe) width/height in points (same for all pages). */
  safeWidthPt: number;
  safeHeightPt: number;
  /** Content size in inches. */
  safeWidthIn: number;
  safeHeightIn: number;
  totalPageWidthPt: number;
  totalPageHeightPt: number;
}

export function getInteriorSafetyMarginValues(
  trimWidthIn: number,
  trimHeightIn: number,
  pageCount: number
): InteriorSafetyMarginValues {
  const bleedIn = INTERIOR_BLEED_INCHES;
  const topIn = INTERIOR_TOP_BOTTOM_OUTSIDE_MARGIN_INCHES;
  const bottomIn = INTERIOR_TOP_BOTTOM_OUTSIDE_MARGIN_INCHES;
  const outsideIn = INTERIOR_TOP_BOTTOM_OUTSIDE_MARGIN_INCHES;
  const gutterIn = getGutterMarginInches(pageCount);
  const bleedPt = bleedIn * POINTS_PER_INCH;
  const topPt = topIn * POINTS_PER_INCH;
  const bottomPt = bottomIn * POINTS_PER_INCH;
  const outsidePt = outsideIn * POINTS_PER_INCH;
  const gutterPt = gutterIn * POINTS_PER_INCH;
  const trimWidthPt = trimWidthIn * POINTS_PER_INCH;
  const trimHeightPt = trimHeightIn * POINTS_PER_INCH;
  const totalPageWidthPt = trimWidthPt + 2 * bleedPt;
  const totalPageHeightPt = trimHeightPt + 2 * bleedPt;
  const safeWidthPt = trimWidthPt - gutterPt - outsidePt;
  const safeHeightPt = trimHeightPt - topPt - bottomPt;
  return {
    bleedIn,
    topIn,
    bottomIn,
    outsideIn,
    gutterIn,
    trimWidthIn,
    trimHeightIn,
    trimWidthPt,
    trimHeightPt,
    safeWidthPt,
    safeHeightPt,
    safeWidthIn: safeWidthPt / POINTS_PER_INCH,
    safeHeightIn: safeHeightPt / POINTS_PER_INCH,
    totalPageWidthPt,
    totalPageHeightPt,
  };
}

/** Safe area for one page: x, y, width, height in points (from bleed origin). Right = odd 1-based page (index 0, 2, …). */
export function getInteriorSafeRectForPage(
  values: InteriorSafetyMarginValues,
  pageIndexZeroBased: number
): { xPt: number; yPt: number; widthPt: number; heightPt: number } {
  const bleedPt = values.bleedIn * POINTS_PER_INCH;
  const topPt = values.topIn * POINTS_PER_INCH;
  const bottomPt = values.bottomIn * POINTS_PER_INCH;
  const outsidePt = values.outsideIn * POINTS_PER_INCH;
  const gutterPt = values.gutterIn * POINTS_PER_INCH;
  const isRightPage = pageIndexZeroBased % 2 === 0;
  const xPt = isRightPage
    ? bleedPt + gutterPt
    : bleedPt + outsidePt;
  const yPt = bleedPt + topPt;
  const widthPt = values.safeWidthPt;
  const heightPt = values.safeHeightPt;
  return { xPt, yPt, widthPt, heightPt };
}

/**
 * Draws one interior page: bleed (teal), trim = blue, safety = white rect with top/bottom/outside 0.5" and gutter by page count.
 */
function drawInteriorPage(
  page: PDFPage,
  opts: {
    totalPageWidthPt: number;
    totalPageHeightPt: number;
    bleedPt: number;
    trimWidthPt: number;
    trimHeightPt: number;
    trimWidth: number;
    trimHeight: number;
    bindingName?: string;
    pageCount: number;
    pageIndex: number; // 0-based
    safetyValues: InteriorSafetyMarginValues;
    font: PDFFont;
    fontBold: PDFFont;
    logoImage: PDFImage;
  }
) {
  const {
    totalPageWidthPt,
    totalPageHeightPt,
    bleedPt,
    trimWidthPt,
    trimHeightPt,
    trimWidth,
    trimHeight,
    bindingName,
    pageCount,
    pageIndex,
    safetyValues,
    font,
    fontBold,
    logoImage,
  } = opts;

  const rect = getInteriorSafeRectForPage(safetyValues, pageIndex);
  const safeX = rect.xPt;
  const safeY = rect.yPt;
  const safeW = rect.widthPt;
  const safeH = rect.heightPt;

  // 1. Full page = bleed area (color separation)
  page.drawRectangle({
    x: 0,
    y: 0,
    width: totalPageWidthPt,
    height: totalPageHeightPt,
    color: COLORS.bleedArea,
  });

  // 2. Trim rectangle (inside bleed) = blue, same as cover
  page.drawRectangle({
    x: bleedPt,
    y: bleedPt,
    width: trimWidthPt,
    height: trimHeightPt,
    color: COLORS.background,
  });

  // 3. Safety margin = full white rectangle (content area)
  page.drawRectangle({
    x: safeX,
    y: safeY,
    width: safeW,
    height: safeH,
    color: COLORS.page,
  });

  // Gutter / Binding side label: white text, 90° rotation, on the gutter side
  const gutterPt = safetyValues.gutterIn * POINTS_PER_INCH;
  const gutterLabel = 'Gutter / Binding Side';
  const gutterFontSize = 8;
  const isRightPage = pageIndex % 2 === 0;
  const gutterLabelX = isRightPage
    ? bleedPt + gutterPt / 2 - gutterFontSize
    : bleedPt + trimWidthPt - gutterPt / 2 - gutterFontSize;
  const gutterLabelY = bleedPt + trimHeightPt / 2;
  page.drawText(gutterLabel, {
    x: gutterLabelX,
    y: gutterLabelY,
    size: gutterFontSize,
    font: font,
    color: COLORS.textOnBlue,
    rotate: degrees(isRightPage ? 90 : -90),
  });

  // Legend (same style as cover) — skip on page 2 so requirements content has full space
  const lineHeight = 50;
  const infoHeaderSize = 13;
  const infoDescSize = 10;
  const headerToDescSpacing = 3;
  const leftColumnX = safeX + 20;
  let currentY = bleedPt + trimHeightPt / 2 + 80;

  const drawInfoLine = (
    y: number,
    color: ReturnType<typeof rgb>,
    val: string,
    desc: string
  ) => {
    page.drawRectangle({ x: leftColumnX, y, width: 4, height: 25, color });
    page.drawText(val, {
      x: leftColumnX + 12,
      y: y + 10 + headerToDescSpacing,
      font: fontBold,
      size: infoHeaderSize,
      color: COLORS.textPrimary,
    });
    page.drawText(desc, {
      x: leftColumnX + 12,
      y: y,
      font: font,
      size: infoDescSize,
      color: COLORS.textSecondary,
    });
  };

  if (pageIndex !== 1) {
    drawInfoLine(
      currentY,
      COLORS.indicator.bleed,
      `${INTERIOR_BLEED_INCHES.toFixed(3)} in`,
      'Bleed Area - Extend your color or BG till bleed area'
    );
    currentY -= lineHeight;

    drawInfoLine(
      currentY,
      COLORS.indicator.safety,
      `${safetyValues.outsideIn.toFixed(3)} in`,
      'Top / Bottom / Outside margin - Keep text inside'
    );
    currentY -= lineHeight;

    drawInfoLine(
      currentY,
      COLORS.indicator.safety,
      `${safetyValues.gutterIn.toFixed(3)} in`,
      `Gutter (inside) - By page count (${pageCount} pp)`
    );
    currentY -= lineHeight;

    drawInfoLine(
      currentY,
      COLORS.indicator.docSize,
      `${(totalPageWidthPt / POINTS_PER_INCH).toFixed(3)} x ${(totalPageHeightPt / POINTS_PER_INCH).toFixed(3)} in`,
      'Total Document Size (with bleed)'
    );
    currentY -= lineHeight;

    drawInfoLine(
      currentY,
      COLORS.indicator.trim,
      `${trimWidth.toFixed(3)} x ${trimHeight.toFixed(3)} in`,
      'Trim Size'
    );
  }

  // Acutrack logo at top center of safe area (same style as cover)
  const logoDims = logoImage.scale(0.30);
  const logoY = safeY + safeH - logoDims.height - 20;
  const logoCenterX = safeX + safeW / 2 - logoDims.width / 2;
  page.drawImage(logoImage, {
    x: logoCenterX,
    y: logoY,
    width: logoDims.width,
    height: logoDims.height,
  });

  const contentStartY = logoY - 20;
  const bodyFontSize = 10;
  const titleFontSize = 12;
  const contentLineHeight = 14;

  if (pageIndex === 1) {
    // Page 2: Interior file requirements and instructions
    const requirementsTitle = 'Interior File Requirements';
    page.drawText(requirementsTitle, {
      x: safeX + 4,
      y: contentStartY,
      size: titleFontSize,
      font: fontBold,
      color: COLORS.textPrimary,
    });
    let y = contentStartY - lineHeight - 4;
    const introLines = [
      'For your book, please provide a single PDF that encompasses all interior',
      'elements, including the title, copyright pages, and any desired blank pages.',
    ];
    for (const line of introLines) {
      page.drawText(line, { x: safeX + 4, y, size: bodyFontSize, font: font, color: COLORS.textPrimary });
      y -= contentLineHeight;
    }
    y -= 6;
    const bulletLines = [
      '• Margins:',
      '• Minimum 0.5 in Safety Margin',
      '• Minimum 0.5 in Gutter Margin (more to be added if pages exceeds 150 pages; refer gutter section)',
      '• Exclusions: Do NOT include trim, bleed, or margin Marks',
      '• Font Embedding: All fonts must be embedded',
      '• Flatten Transparent Layers: Ensure transparency layers and vector objects are flattened',
      '• Security: Do NOT use any security or password file protection.',
    ];
    for (const line of bulletLines) {
      page.drawText(line, { x: safeX + 4, y, size: bodyFontSize, font: font, color: COLORS.textPrimary });
      y -= contentLineHeight;
    }
  } else {
    // Page 1 & 3: Placeholder title and template info
    const titleY = contentStartY - 4;
    page.drawText('Interior Page Template', {
      x: safeX + 4,
      y: titleY,
      size: 14,
      font: fontBold,
      color: COLORS.textPrimary,
    });
    page.drawText(
      `${trimWidth.toFixed(2)}" × ${trimHeight.toFixed(2)}" • ${bindingName || 'Book'}`,
      {
        x: safeX + 4,
        y: titleY - 16,
        size: bodyFontSize,
        font: font,
        color: COLORS.textSecondary,
      }
    );
    page.drawText(
      'Replace with your content. Top/bottom/outside: 0.5". Gutter by page count.',
      {
        x: safeX + 4,
        y: titleY - 32,
        size: bodyFontSize,
        font: font,
        color: COLORS.textSecondary,
      }
    );
  }

  // Page number and template ref (drawn on blue trim area — use light color)
  const pageNum = pageIndex + 1;
  page.drawText(`Page ${pageNum} of ${INTERIOR_PDF_PAGE_COUNT}`, {
    x: safeX + 4,
    y: safeY - 14,
    size: 9,
    font: font,
    color: COLORS.textOnBlue,
  });

  if (pageCount != null && pageCount > 1) {
    page.drawText(
      `Template for ${pageCount}-page interior. Add more pages in your layout software.`,
      {
        x: safeX + 4,
        y: safeY - 28,
        size: 8,
        font: font,
        color: COLORS.textOnBlue,
      }
    );
  }
}

/**
 * Generates an interior PDF template with:
 * - 0.125" bleed on all sides (teal)
 * - Trim area = blue rectangle inset 0.125" (same as cover)
 * - Safety margin = full white rectangle inset 0.5" from trim
 * - 3 pages
 * Use getInteriorSafetyMarginValues(trimWidth, trimHeight, pageCount) and getGutterMarginInches(pageCount) for calculations.
 */
export async function generateInteriorPdf(payload: TemplatePayload): Promise<Buffer> {
  const { trimWidth, trimHeight, pageCount: payloadPageCount, bindingName } = payload;
  const pageCount = payloadPageCount ?? 100;

  const safetyValues = getInteriorSafetyMarginValues(trimWidth, trimHeight, pageCount);
  const bleedPt = safetyValues.bleedIn * POINTS_PER_INCH;
  const {
    trimWidthPt,
    trimHeightPt,
    totalPageWidthPt,
    totalPageHeightPt,
  } = safetyValues;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await fs.readFile(LOGO_PATH);
  const logoImage = await pdfDoc.embedPng(logoBytes);

  const pageOpts = {
    totalPageWidthPt,
    totalPageHeightPt,
    bleedPt,
    trimWidthPt,
    trimHeightPt,
    trimWidth,
    trimHeight,
    bindingName,
    pageCount,
    safetyValues,
    font,
    fontBold,
    logoImage,
  };

  for (let i = 0; i < INTERIOR_PDF_PAGE_COUNT; i++) {
    const page = pdfDoc.addPage([totalPageWidthPt, totalPageHeightPt]);
    drawInteriorPage(page, { ...pageOpts, pageIndex: i });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
