// server/pdfGenerator.ts
import { PDFDocument, PDFPage, rgb, StandardFonts, degrees } from 'pdf-lib';
import { TemplatePayload, BindingType } from './server.js';
import fs from 'fs/promises';
import path from 'path';
import * as fontkit from 'fontkit';
import { fileURLToPath } from 'url';

// --- FINAL, SIMPLIFIED ROBUST PATHING ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// After our build step, the 'Assets' folder will be directly
// inside the 'dist' folder, right next to this running file.
const FONT_REGULAR_PATH = path.join(__dirname, 'Assets', 'Poppins-Regular.ttf');
const FONT_BOLD_PATH = path.join(__dirname, 'Assets', 'Poppins-Bold.ttf');
const LOGO_PATH = path.join(__dirname, 'Assets', 'logo.png');

// ... (the rest of your pdfGenerator.ts file stays exactly the same)
// --- CONSTANTS ---

const COLORS = {
  background: rgb(0.125, 0.294, 0.498),
  bleedArea: rgb(0.004, 0.525, 0.522),
  spine: rgb(0.925, 0.455, 0.424),
  page: rgb(1, 1, 1),
  textPrimary: rgb(0.1, 0.1, 0.1),
  textSecondary: rgb(0.4, 0.4, 0.4),
  white: rgb(1, 1, 1),
  indicator: {
      bleed: rgb(0.004, 0.525, 0.522),
      safety: rgb(0.125, 0.294, 0.498),
      barcode: rgb(0.98, 0.83, 0.45),
      docSize: rgb(0.004, 0.525, 0.522),
      trim: rgb(0.125, 0.294, 0.498),
      spine: rgb(0.925, 0.455, 0.424),
      fold: rgb(0.75, 0.65, 0.55),
      punchHole: rgb(0.6, 0.6, 0.6),
  },
  fold: rgb(0.75, 0.65, 0.55), // 0.125" folding area on both sides of flaps
};
const DPI = 72;

export async function generatePdf(payload: TemplatePayload): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit as any);
    const fontBytes = await fs.readFile(FONT_REGULAR_PATH);
    const boldFontBytes = await fs.readFile(FONT_BOLD_PATH);
    const logoBytes = await fs.readFile(LOGO_PATH);
    const poppinsRegular = await pdfDoc.embedFont(fontBytes);
    const poppinsBold = await pdfDoc.embedFont(boldFontBytes);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const assets = { poppinsRegular, poppinsBold, logoImage };

    switch (payload.bindingName) {
        case BindingType.PERFECT_BIND:
        case BindingType.SADDLE_STITCH:
            await drawPerfectBind(pdfDoc, payload, assets);
            break;
        case BindingType.CASE_BIND:
            await drawCaseBind(pdfDoc, payload, assets);
            break;
        case BindingType.COIL_WIRE_O_SOFTCOVER:
            await drawCoilWire(pdfDoc, payload, assets, false);
            break;
        case BindingType.COIL_WIRE_O_HARDCOVER:
            await drawCoilWire(pdfDoc, payload, assets, true);
            break;
        default:
            const page = pdfDoc.addPage([500, 100]);
            page.drawText(`Template for ${payload.bindingName} coming soon!`, { x: 50, y: 50, font: assets.poppinsRegular });
    }
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

// --- DRAWING FUNCTIONS ---

async function drawPerfectBind(pdfDoc: PDFDocument, p: TemplatePayload, assets: any) {
    const { totalWidth, totalHeight, trimWidth, trimHeight, bleed, spineWidth, safetyMargin, pageCount, paperStock } = p;
    const page = pdfDoc.addPage([totalWidth * DPI, totalHeight * DPI]);
    const { poppinsRegular, poppinsBold, logoImage } = assets;
    const bleedPt = (bleed ?? 0) * DPI, spinePt = (spineWidth ?? 0) * DPI, trimWidthPt = trimWidth * DPI, trimHeightPt = trimHeight * DPI, safetyPt = (safetyMargin ?? 0.375) * DPI;
    const leftSpineFoldX = bleedPt + trimWidthPt, rightSpineFoldX = leftSpineFoldX + spinePt;
    page.drawRectangle({ x: 0, y: 0, width: totalWidth * DPI, height: totalHeight * DPI, color: COLORS.bleedArea });
    page.drawRectangle({ x: bleedPt, y: bleedPt, width: totalWidth * DPI - 2 * bleedPt, height: trimHeightPt, color: COLORS.background });
    page.drawRectangle({ x: leftSpineFoldX, y: 0, width: spinePt, height: totalHeight * DPI, color: COLORS.spine });
    page.drawRectangle({ x: bleedPt + safetyPt, y: bleedPt + safetyPt, width: trimWidthPt - 2 * safetyPt, height: trimHeightPt - 2 * safetyPt, color: COLORS.page });
    page.drawRectangle({ x: rightSpineFoldX + safetyPt, y: bleedPt + safetyPt, width: trimWidthPt - 2 * safetyPt, height: trimHeightPt - 2 * safetyPt, color: COLORS.page });
    const logoDims = logoImage.scale(0.30);
    const logoY = bleedPt + trimHeightPt - safetyPt - logoDims.height - 20;
    const backCoverCenterX = bleedPt + safetyPt + (trimWidthPt - 2 * safetyPt) / 2;
    page.drawImage(logoImage, { x: backCoverCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawText('BACK COVER', { x: backCoverCenterX - 40, y: logoY - 50, font: poppinsRegular, size: 16, color: COLORS.textPrimary });
    const frontCoverCenterX = rightSpineFoldX + safetyPt + (trimWidthPt - 2 * safetyPt) / 2;
    page.drawImage(logoImage, { x: frontCoverCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawText('FRONT COVER', { x: frontCoverCenterX - 40, y: logoY - 50, font: poppinsRegular, size: 16, color: COLORS.textPrimary });
    const leftColumnX = bleedPt + safetyPt + 20;
    let currentY = totalHeight * DPI / 2 + 80, lineHeight = 50, infoHeaderSize = 13, infoDescSize = 10, headerToDescSpacing = 3;
    const drawInfoLine = (y: number, color: any, val: string, desc: string) => {
        page.drawRectangle({ x: leftColumnX, y, width: 4, height: 25, color });
        page.drawText(val, { x: leftColumnX + 12, y: y + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: leftColumnX + 12, y: y, font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    };
    drawInfoLine(currentY, COLORS.indicator.bleed, `${(bleed ?? 0).toFixed(3)} in`, 'Bleed Area - Extend your color or BG till bleed area'); currentY -= lineHeight;
    drawInfoLine(currentY, COLORS.indicator.safety, `${(safetyMargin ?? 0).toFixed(3)} in`, 'Safety Margin Keep all your important text inside it'); currentY -= lineHeight;
    drawInfoLine(currentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional');
    const barcodeW = 1.75 * DPI, barcodeH = 1 * DPI;
    const barcodeX = leftSpineFoldX - safetyPt - barcodeW - 5, barcodeY = bleedPt + safetyPt + 5;
    page.drawRectangle({ x: barcodeX, y: barcodeY, width: barcodeW, height: barcodeH, color: rgb(0.98, 0.83, 0.45), opacity: 0.8 });
    const rightColumnX = rightSpineFoldX + safetyPt + 20;
    currentY = totalHeight * DPI / 2 + 80;
    const drawRightInfoLine = (y: number, color: any, val: string, desc: string, descSize: number = infoDescSize) => {
        page.drawRectangle({ x: rightColumnX, y, width: 4, height: 25, color });
        page.drawText(val, { x: rightColumnX + 12, y: y + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: rightColumnX + 12, y: y, font: poppinsRegular, size: descSize, color: COLORS.textSecondary });
    };
    drawRightInfoLine(currentY, COLORS.indicator.docSize, `${totalWidth.toFixed(3)} x ${totalHeight.toFixed(3)} in`, 'Total Document Size with bleed'); currentY -= lineHeight;
    drawRightInfoLine(currentY, COLORS.indicator.trim, `${trimWidth} x ${trimHeight} in`, 'Trim Size'); currentY -= lineHeight;
    page.drawRectangle({ x: rightColumnX, y: currentY, width: 4, height: 25, color: COLORS.indicator.spine });
    page.drawText(`${(spineWidth ?? 0).toFixed(3)}`, { x: rightColumnX + 12, y: currentY + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
    if ((spineWidth ?? 0) < 0.125) {
        page.drawText(`(Do not add text on Spine if it's below 0.125")`, { x: rightColumnX + 12, y: currentY, font: poppinsRegular, size: infoDescSize - 1, color: COLORS.textSecondary });
        page.drawText(`Spine Text Area for ${p.pageCount} pages using ${p.paperStock}`, { x: rightColumnX + 12, y: currentY - (infoDescSize), font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    } else {
        page.drawText(`Spine Text Area for ${p.pageCount} pages using ${p.paperStock}`, { x: rightColumnX + 12, y: currentY, font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    }
}

async function drawCaseBind(pdfDoc: PDFDocument, p: TemplatePayload, assets: any) {
    const { totalWidth, totalHeight, trimWidth, trimHeight, wrapAmount, spineWidth, safetyMargin, pageCount, paperStock } = p;
    const page = pdfDoc.addPage([totalWidth * DPI, totalHeight * DPI]);
    const { poppinsRegular, poppinsBold, logoImage } = assets;
    const wrapPt = (wrapAmount ?? 0.75) * DPI;
    const spinePt = (spineWidth ?? 0) * DPI;
    const safetyPt = (safetyMargin ?? 0.5) * DPI;
    const totalWidthPt = totalWidth * DPI, totalHeightPt = totalHeight * DPI;
    const backgroundWidth = totalWidthPt - 2 * wrapPt, backgroundHeight = totalHeightPt - 2 * wrapPt;
    const leftCoverWidth = (backgroundWidth - spinePt) / 2;
    const spineStartX = wrapPt + leftCoverWidth;

    page.drawRectangle({ x: 0, y: 0, width: totalWidthPt, height: totalHeightPt, color: COLORS.bleedArea });
    page.drawRectangle({ x: wrapPt, y: wrapPt, width: backgroundWidth, height: backgroundHeight, color: COLORS.background });
    page.drawRectangle({ x: spineStartX, y: 0, width: spinePt, height: totalHeightPt, color: COLORS.spine });
    page.drawRectangle({ x: wrapPt + safetyPt, y: wrapPt + safetyPt, width: leftCoverWidth - 2 * safetyPt, height: backgroundHeight - 2 * safetyPt, color: COLORS.page });
    page.drawRectangle({ x: spineStartX + spinePt + safetyPt, y: wrapPt + safetyPt, width: leftCoverWidth - 2 * safetyPt, height: backgroundHeight - 2 * safetyPt, color: COLORS.page });

    const logoDims = logoImage.scale(0.30);
    const logoY = wrapPt + backgroundHeight - safetyPt - logoDims.height - 20;
    const backCoverCenterX = wrapPt + safetyPt + (leftCoverWidth - 2 * safetyPt) / 2;
    page.drawImage(logoImage, { x: backCoverCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawText('BACK COVER', { x: backCoverCenterX - 40, y: logoY - 50, font: poppinsRegular, size: 16, color: COLORS.textPrimary });
    const frontCoverCenterX = spineStartX + spinePt + safetyPt + (leftCoverWidth - 2 * safetyPt) / 2;
    page.drawImage(logoImage, { x: frontCoverCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawText('FRONT COVER', { x: frontCoverCenterX - 40, y: logoY - 50, font: poppinsRegular, size: 16, color: COLORS.textPrimary });
    
    const leftColumnX = wrapPt + safetyPt + 20, lineHeight = 50, infoHeaderSize = 13, infoDescSize = 10, headerToDescSpacing = 3;
    let currentY = totalHeightPt / 2 + 80;
    const drawInfoLine = (y: number, color: any, val: string, desc: string) => {
        page.drawRectangle({ x: leftColumnX, y, width: 4, height: 25, color });
        page.drawText(val, { x: leftColumnX + 12, y: y + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: leftColumnX + 12, y: y, font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    };
    drawInfoLine(currentY, COLORS.indicator.bleed, `${(wrapAmount ?? 0).toFixed(3)} in`, 'Wrap Area - Extend your color or BG till here'); currentY -= lineHeight;
    drawInfoLine(currentY, COLORS.indicator.safety, `${(safetyMargin ?? 0).toFixed(3)} in`, 'Safety Margin Keep all your important text inside it'); currentY -= lineHeight;
    drawInfoLine(currentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional');
    const barcodeW = 1.75 * DPI, barcodeH = 1 * DPI;
    const barcodeX = spineStartX - safetyPt - barcodeW, barcodeY = wrapPt + safetyPt;
    page.drawRectangle({ x: barcodeX - 10, y: barcodeY + 10, width: barcodeW, height: barcodeH, color: rgb(0.98, 0.83, 0.45), opacity: 0.8 });
    
    const rightColumnX = spineStartX + spinePt + safetyPt + 20;
    currentY = totalHeightPt / 2 + 80;
    const drawRightInfoLine = (y: number, color: any, val: string, desc: string, descSize: number = infoDescSize) => {
        page.drawRectangle({ x: rightColumnX, y, width: 4, height: 25, color });
        page.drawText(val, { x: rightColumnX + 12, y: y + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: rightColumnX + 12, y: y, font: poppinsRegular, size: descSize, color: COLORS.textSecondary });
    };
    drawRightInfoLine(currentY, COLORS.indicator.docSize, `${totalWidth.toFixed(3)} x ${totalHeight.toFixed(3)} in`, 'Total Document Size with wrap'); currentY -= lineHeight;
    drawRightInfoLine(currentY, COLORS.indicator.trim, `${trimWidth} x ${trimHeight} in`, 'Trim Size'); currentY -= lineHeight;
    let spineDescription = `Spine Text Area for ${p.pageCount} pages using ${p.paperStock}`;
    if ((spineWidth ?? 0) < 0.25) { spineDescription = `(Spine text not recommended if below 0.25")`; }
    drawRightInfoLine(currentY, COLORS.indicator.spine, `${(spineWidth ?? 0).toFixed(3)}`, spineDescription, infoDescSize - 1);
}

const DUST_JACKET_BLEED_INCHES = 0.125;

async function drawDustJacket(pdfDoc: PDFDocument, p: TemplatePayload, assets: any) {
    const { dustJacketTotalWidth, dustJacketTotalHeight, trimWidth, trimHeight, spineWidth, safetyMargin, pageCount, paperStock } = p;
    const flapWidth = (p.dustJacketFlapWidthInches ?? 3);
    const foldInches = (p.dustJacketFoldInches ?? DUST_JACKET_BLEED_INCHES);
    const flapWithFold = flapWidth + foldInches;
    const BOARD_SIZE_INCHES = 0.098;
    const panelW = (trimWidth ?? 0) + BOARD_SIZE_INCHES + 0.125;
    const spinePt = (spineWidth ?? 0) * DPI;
    const bleedPt = DUST_JACKET_BLEED_INCHES * DPI;
    const safetyPt = (safetyMargin ?? 0.5) * DPI;
    const totalW = (dustJacketTotalWidth ?? 0) * DPI;
    const totalH = (dustJacketTotalHeight ?? 0) * DPI;
    const innerW = totalW - 2 * bleedPt;
    const innerH = totalH - 2 * bleedPt;
    const flapPt = flapWithFold * DPI;
    const foldPt = foldInches * DPI;
    const flapWidthPt = (flapWidth ?? 3) * DPI; // main flap width (user selection: 3 or 4 in)
    const panelWPt = panelW * DPI;
    // Flap white (safety) rect width: 2.87" for 3" flap, 3.87" for 4" flap (1" difference), centered in main flap only (excluding fold)
    const flapWhiteRectWidthInches = flapWidth === 4 ? 3.87 : 2.87;
    const flapWhiteRectPt = flapWhiteRectWidthInches * DPI;
    const flapWhiteRectCenterInMainFlap = (flapWidthPt - flapWhiteRectPt) / 2; // center white in main flap (not fold)
    // White (safety) area height: from trim height so it scales with user trim size (e.g. 6x9 → 9", 5x8 → 8"); clamp to inner height
    const innerHInches = innerH / DPI;
    const whiteAreaHeightInches = Math.min(trimHeight ?? 9, Math.max(1, innerHInches - 0.02));
    const whiteAreaHeightPt = whiteAreaHeightInches * DPI;
    const whiteAreaYOffset = (innerH - whiteAreaHeightPt) / 2;
    const whiteAreaY = bleedPt + whiteAreaYOffset;
    // Flap white area inset: reduce by 0.125" on all sides; x positions center white in main flap only
    const flapInsetInches = 0.125;
    const flapInsetPt = flapInsetInches * DPI;
    const backFlapWhiteRectInsetX = flapWhiteRectCenterInMainFlap + flapInsetPt;
    const frontFlapWhiteRectInsetX = foldPt + flapWhiteRectCenterInMainFlap + flapInsetPt;
    const flapWhiteRectInsetW = flapWhiteRectPt - 2 * flapInsetPt;
    const flapWhiteRectInsetY = whiteAreaY + flapInsetPt;
    const flapWhiteRectInsetH = whiteAreaHeightPt - 2 * flapInsetPt;

    // Panel positions left to right: Back flap | Back Cover | Spine | Front Cover | Front Flap
    const backFlapX = bleedPt;
    const backPanelX = backFlapX + flapPt;
    const spineX = backPanelX + panelWPt;
    const frontPanelX = spineX + spinePt;
    const frontFlapX = frontPanelX + panelWPt;

    const page = pdfDoc.addPage([totalW, totalH]);
    const { poppinsRegular, poppinsBold, logoImage } = assets;

    // 1. Base layer: full rectangle teal (bleed area – calculated size)
    page.drawRectangle({ x: 0, y: 0, width: totalW, height: totalH, color: COLORS.bleedArea });

    // 2. Blue background: 0.125" (bleed) inset on all sides (same as perfect bind)
    page.drawRectangle({ x: bleedPt, y: bleedPt, width: innerW, height: innerH, color: COLORS.background });

    // 3. Spine strip (full height of inner area)
    page.drawRectangle({ x: spineX, y: bleedPt, width: spinePt, height: innerH, color: COLORS.spine });

    // 4. Back cover white rect (safety area) – full height
    page.drawRectangle({ x: backPanelX + safetyPt, y: bleedPt + safetyPt, width: panelWPt - 2 * safetyPt, height: innerH - 2 * safetyPt, color: COLORS.page });

    // 5. Front cover white rect (safety area) – full height
    page.drawRectangle({ x: frontPanelX + safetyPt, y: bleedPt + safetyPt, width: panelWPt - 2 * safetyPt, height: innerH - 2 * safetyPt, color: COLORS.page });

    // 6. Logos and panel labels (logo top-centered; label below logo on back and front cover)
    const logoDims = logoImage.scale(0.25);
    const backCenterX = backPanelX + panelWPt / 2;
    const frontCenterX = frontPanelX + panelWPt / 2;
    const logoY = bleedPt + innerH - safetyPt - logoDims.height - 16;
    const labelGap = 12;
    const labelSize = 14;
    const labelY = logoY - labelGap - labelSize; // baseline for text below logo
    page.drawImage(logoImage, { x: backCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawImage(logoImage, { x: frontCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawText('BACK COVER', { x: backCenterX - 42, y: labelY, font: poppinsBold, size: labelSize, color: COLORS.textPrimary });
    page.drawText('FRONT COVER', { x: frontCenterX - 48, y: labelY, font: poppinsBold, size: labelSize, color: COLORS.textPrimary });
    page.drawText('SPINE', { x: spineX + spinePt / 2 - 18, y: bleedPt + innerH / 2 - 8, font: poppinsRegular, size: 12, color: COLORS.textPrimary });

    // 7. Back flap – main flap (flap width) + fold (0.125") with separate colors, then white safety rect + label
    page.drawRectangle({ x: backFlapX, y: bleedPt, width: flapWidthPt, height: innerH, color: COLORS.spine });
    page.drawRectangle({ x: backFlapX + flapWidthPt, y: bleedPt, width: foldPt, height: innerH, color: COLORS.fold });
    page.drawRectangle({ x: backFlapX + backFlapWhiteRectInsetX, y: flapWhiteRectInsetY, width: flapWhiteRectInsetW, height: flapWhiteRectInsetH, color: COLORS.page });
    page.drawText('BACK FLAP', { x: backFlapX + flapPt / 2 - 38, y: bleedPt + innerH / 2 - 8, font: poppinsRegular, size: 14, color: COLORS.textPrimary });

    // 8. Front flap – fold (0.125") + main flap (flap width) with separate colors, then white safety rect + label
    page.drawRectangle({ x: frontFlapX, y: bleedPt, width: foldPt, height: innerH, color: COLORS.fold });
    page.drawRectangle({ x: frontFlapX + foldPt, y: bleedPt, width: flapWidthPt, height: innerH, color: COLORS.spine });
    page.drawRectangle({ x: frontFlapX + frontFlapWhiteRectInsetX, y: flapWhiteRectInsetY, width: flapWhiteRectInsetW, height: flapWhiteRectInsetH, color: COLORS.page });
    page.drawText('FRONT FLAP', { x: frontFlapX + flapPt / 2 - 40, y: bleedPt + innerH / 2 - 8, font: poppinsRegular, size: 14, color: COLORS.textPrimary });

    // Info on BACK COVER (left column): bleed, safety, barcode placeholder
    const lineHeight = 44;
    const infoHeaderSize = 13;
    const infoDescSize = 10;
    const headerToDescSpacing = 3;
    const backColumnX = backPanelX + safetyPt + 20;
    let currentY = totalH / 2 + 80;
    const drawInfoLine = (x: number, y: number, color: any, val: string, desc: string) => {
        page.drawRectangle({ x, y, width: 4, height: 25, color });
        page.drawText(val, { x: x + 12, y: y + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: x + 12, y, font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    };
    drawInfoLine(backColumnX, currentY, COLORS.indicator.bleed, `${DUST_JACKET_BLEED_INCHES} in`, 'Bleed - Extend your color or BG till here'); currentY -= lineHeight;
    drawInfoLine(backColumnX, currentY, COLORS.indicator.safety, `${(safetyMargin ?? 0).toFixed(3)} in`, 'Safety Margin - Keep important text inside'); currentY -= lineHeight;
    drawInfoLine(backColumnX, currentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional');
    const barcodeW = 1.75 * DPI;
    const barcodeH = 1 * DPI;
    // Barcode in bottom-right of back cover white (safety) area (PDF y=0 at bottom, so bottom edge of white is bleedPt + safetyPt)
    const backWhiteRight = backPanelX + panelWPt - safetyPt;
    const barcodeX = backWhiteRight - barcodeW;
    const barcodeY = bleedPt + safetyPt; // white area bottom edge = visual bottom-right
    page.drawRectangle({ x: barcodeX, y: barcodeY, width: barcodeW, height: barcodeH, color: rgb(0.98, 0.83, 0.45), opacity: 0.8 });

    // Info on FRONT COVER (right column): total size, trim size, spine, flap + fold
    const frontColumnX = frontPanelX + safetyPt + 20;
    currentY = totalH / 2 + 80;
    const drawRightInfoLine = (y: number, color: any, val: string, desc: string, descSize: number = infoDescSize) => {
        page.drawRectangle({ x: frontColumnX, y, width: 4, height: 25, color });
        page.drawText(val, { x: frontColumnX + 12, y: y + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: frontColumnX + 12, y, font: poppinsRegular, size: descSize, color: COLORS.textSecondary });
    };
    drawRightInfoLine(currentY, COLORS.indicator.docSize, `${(dustJacketTotalWidth ?? 0).toFixed(3)} x ${(dustJacketTotalHeight ?? 0).toFixed(3)} in`, 'Total Document Size'); currentY -= lineHeight;
    drawRightInfoLine(currentY, COLORS.indicator.trim, `${trimWidth ?? 0} x ${trimHeight ?? 0} in`, 'Trim Size'); currentY -= lineHeight;
    let spineDesc = `Spine for ${pageCount ?? 0} pages using ${paperStock ?? 'N/A'}`;
    if ((spineWidth ?? 0) < 0.25) { spineDesc = '(Spine text not recommended if below 0.25")'; }
    drawRightInfoLine(currentY, COLORS.indicator.spine, `${(spineWidth ?? 0).toFixed(3)} in`, spineDesc, infoDescSize - 1); currentY -= lineHeight;
    drawRightInfoLine(currentY, COLORS.indicator.spine, `${flapWidth} in`, 'Flap – Front and back flaps width', infoDescSize - 1); currentY -= lineHeight;
    drawRightInfoLine(currentY, COLORS.indicator.fold, `${foldInches} in`, 'Fold – Folding area on both sides of flaps', infoDescSize - 1);
}

export async function generateDustJacketPdf(payload: TemplatePayload): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit as any);
    const fontBytes = await fs.readFile(FONT_REGULAR_PATH);
    const boldFontBytes = await fs.readFile(FONT_BOLD_PATH);
    const logoBytes = await fs.readFile(LOGO_PATH);
    const poppinsRegular = await pdfDoc.embedFont(fontBytes);
    const poppinsBold = await pdfDoc.embedFont(boldFontBytes);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const assets = { poppinsRegular, poppinsBold, logoImage };
    await drawDustJacket(pdfDoc, payload, assets);
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

async function drawCoilWire(pdfDoc: PDFDocument, p: TemplatePayload, assets: any, isHardcover: boolean) {
  const frontPage = pdfDoc.addPage([p.totalWidth * DPI, p.totalHeight * DPI]);
  await drawCoilPage(frontPage, p, assets, true, isHardcover);
  const backPage = pdfDoc.addPage([p.totalWidth * DPI, p.totalHeight * DPI]);
  await drawCoilPage(backPage, p, assets, false, isHardcover);
}

async function drawCoilPage(page: PDFPage, p: TemplatePayload, assets: any, isFrontCover: boolean, isHardcover: boolean) {
    const { totalWidth, totalHeight, trimWidth, trimHeight, bleed, wrapAmount } = p;
    const { poppinsRegular, poppinsBold, logoImage } = assets;
    const pageW = totalWidth * DPI;
    const pageH = totalHeight * DPI;
    
    // Define safety margins based on cover type
    let topMargin, bottomMargin, outsideMargin, bindingMargin;

    if (isHardcover) {
        // Use the specific margins for Hardcover Coil/Wire-O
        topMargin = 0.375 * DPI;
        bottomMargin = 0.375 * DPI;
        outsideMargin = 0.375 * DPI;
        bindingMargin = 0.625 * DPI;
    } else {
        // Use the existing margins for Softcover
        topMargin = (p.safetyMarginTopBottom ?? 0.375) * DPI;
        bottomMargin = (p.safetyMarginTopBottom ?? 0.375) * DPI;
        outsideMargin = (p.safetyMarginOutsideEdge ?? 0.375) * DPI;
        bindingMargin = (p.safetyMarginBindingEdge ?? 0.75) * DPI;
    }

    const leftMargin = isFrontCover ? bindingMargin : outsideMargin;
    const rightMargin = isFrontCover ? outsideMargin : bindingMargin;

    page.drawRectangle({x: 0, y: 0, width: pageW, height: pageH, color: COLORS.bleedArea});
    
    let trimAreaX = 0, trimAreaY = 0, trimAreaW = 0, trimAreaH = 0;
    
    if(isHardcover) {
      const wrapPt = (wrapAmount ?? 0) * DPI;
      trimAreaX = wrapPt; trimAreaY = wrapPt;
      trimAreaW = pageW - 2 * wrapPt; trimAreaH = pageH - 2 * wrapPt;
    } else {
      const bleedPt = (bleed ?? 0) * DPI;
      trimAreaX = bleedPt; trimAreaY = bleedPt;
      trimAreaW = pageW - 2 * bleedPt; trimAreaH = pageH - 2 * bleedPt;
    }
    
    page.drawRectangle({x: trimAreaX, y: trimAreaY, width: trimAreaW, height: trimAreaH, color: COLORS.background});
    page.drawRectangle({x: trimAreaX + leftMargin, y: trimAreaY + bottomMargin, width: trimAreaW - leftMargin - rightMargin, height: trimAreaH - topMargin - bottomMargin, color: COLORS.page});

    const logoDims = logoImage.scale(0.30);
    const logoY = trimAreaY + trimAreaH - topMargin - logoDims.height - 20;
    const coverCenterX = trimAreaX + leftMargin + (trimAreaW - leftMargin - rightMargin) / 2;
    page.drawImage(logoImage, { x: coverCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    const coverText = isFrontCover ? 'FRONT COVER' : 'BACK COVER';
    page.drawText(coverText, { x: coverCenterX - 40, y: logoY - 50, font: poppinsRegular, size: 16, color: COLORS.textPrimary });

    const punchHoleRadius = 0.075 * DPI, punchHoleSpacing = 0.375 * DPI, punchHoleCenterOffset = 0.375 * DPI;
    const punchHoleStartX = isFrontCover ? trimAreaX + punchHoleCenterOffset : trimAreaX + trimAreaW - punchHoleCenterOffset;
    for (let y = trimAreaY + punchHoleSpacing / 2; y <= trimAreaY + trimAreaH; y += punchHoleSpacing) {
        page.drawCircle({ x: punchHoleStartX, y, size: punchHoleRadius, color: rgb(0.5, 0.5, 0.5), opacity: 0.3 });
    }

    const lineHeight = 50, infoHeaderSize = 13, infoDescSize = 10, headerToDescSpacing = 3;
    const drawInfoLine = (colX: number, y: number, indicatorColor: any, val: string, desc: string) => {
        page.drawRectangle({ x: colX, y, width: 4, height: 25, color: indicatorColor });
        page.drawText(val, { x: colX + 12, y: y + 10 + headerToDescSpacing, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: colX + 12, y: y, font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    };
    
    let currentY = pageH / 2 + 30;

    if (isFrontCover) {
        const columnX = trimAreaX + leftMargin + 20; 
        drawInfoLine(columnX, currentY, COLORS.indicator.docSize, `${totalWidth.toFixed(3)} x ${totalHeight.toFixed(3)} in`, isHardcover ? 'Total Document Size with wrap' : 'Total Document Size with bleed');
        currentY -= lineHeight;
        drawInfoLine(columnX, currentY, COLORS.indicator.trim, `${trimWidth} x ${trimHeight} in`, 'Trim Size');
        currentY -= lineHeight;
        drawInfoLine(columnX, currentY, COLORS.indicator.punchHole, `0.375" punchhole`, 'leave extra margin on left side');
    } else { // Back Cover
        const columnX = trimAreaX + leftMargin + 20;
        const val = isHardcover ? `${(wrapAmount ?? 0).toFixed(3)} in` : `${(bleed ?? 0).toFixed(3)} in`;
        const desc = isHardcover ? 'Wrap Area - Extend your color or BG till here' : 'Bleed Area - Extend your color or BG till bleed area';
        drawInfoLine(columnX, currentY, COLORS.indicator.bleed, val, desc);
        currentY -= lineHeight;
        const safetyValue = (p.safetyMarginOutsideEdge ?? p.safetyMargin ?? 0.375).toFixed(3);
        drawInfoLine(columnX, currentY, COLORS.indicator.safety, `${safetyValue} in`, 'Safety Margin Keep all your important text inside it');
        currentY -= lineHeight;
        drawInfoLine(columnX, currentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional');
        currentY -= lineHeight;
        drawInfoLine(columnX, currentY, COLORS.indicator.punchHole, `0.375" punchhole`, 'leave extra margin on Right side');
        
        const barcodeW = 1.75 * DPI, barcodeH = 1 * DPI;
        page.drawRectangle({ x: trimAreaX + trimAreaW - rightMargin - barcodeW, y: trimAreaY + bottomMargin, width: barcodeW, height: barcodeH, color: rgb(0.98, 0.83, 0.45), opacity: 0.8 });
    }
}