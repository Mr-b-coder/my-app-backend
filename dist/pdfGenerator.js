// server/pdfGenerator.ts
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import * as fontkit from 'fontkit';
const assetsDir = path.join(process.cwd(), 'assets');
const FONT_REGULAR_PATH = path.join(assetsDir, 'Poppins-Regular.ttf');
const FONT_BOLD_PATH = path.join(assetsDir, 'Poppins-Bold.ttf');
const LOGO_PATH = path.join(assetsDir, 'logo.png');
var BindingType;
(function (BindingType) {
    BindingType["PERFECT_BIND"] = "Perfect Bind / Softcover";
    // ... other types
})(BindingType || (BindingType = {}));
const COLORS = {
    background: rgb(0.125, 0.294, 0.498), // Dark Blue
    bleedArea: rgb(0.004, 0.525, 0.522), // Teal
    spine: rgb(0.925, 0.455, 0.424), // Salmon/Coral
    page: rgb(1, 1, 1), // White
    textPrimary: rgb(0.1, 0.1, 0.1),
    textSecondary: rgb(0.4, 0.4, 0.4),
    white: rgb(1, 1, 1),
    indicator: {
        bleed: rgb(0.004, 0.525, 0.522), // Teal
        // ✨ FIX: Changed safety and trim indicators to be blue
        safety: rgb(0.125, 0.294, 0.498), // Dark Blue
        barcode: rgb(0.98, 0.83, 0.45), // Yellow
        docSize: rgb(0.004, 0.525, 0.522), // Teal
        trim: rgb(0.125, 0.294, 0.498), // Dark Blue
        spine: rgb(0.925, 0.455, 0.424), // Salmon/Coral
    }
};
const DPI = 72;
export async function generatePdf(payload) {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
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
        // ... Other cases ...
    }
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
// --- DRAWING FUNCTION ---
async function drawPerfectBind(pdfDoc, p, assets) {
    const { totalWidth, totalHeight, trimWidth, trimHeight, bleed, spineWidth, safetyMargin, pageCount, paperStock } = p;
    const page = pdfDoc.addPage([totalWidth * DPI, totalHeight * DPI]);
    const { poppinsRegular, poppinsBold, logoImage } = assets;
    const bleedPt = (bleed ?? 0) * DPI;
    const spinePt = (spineWidth ?? 0) * DPI;
    const trimWidthPt = trimWidth * DPI;
    const trimHeightPt = trimHeight * DPI;
    const safetyPt = (safetyMargin ?? 0.375) * DPI;
    const leftSpineFoldX = bleedPt + trimWidthPt;
    const rightSpineFoldX = leftSpineFoldX + spinePt;
    page.drawRectangle({ x: 0, y: 0, width: totalWidth * DPI, height: totalHeight * DPI, color: COLORS.bleedArea });
    page.drawRectangle({ x: bleedPt, y: bleedPt, width: totalWidth * DPI - 2 * bleedPt, height: trimHeightPt, color: COLORS.background });
    page.drawRectangle({ x: leftSpineFoldX, y: 0, width: spinePt, height: totalHeight * DPI, color: COLORS.spine });
    page.drawRectangle({ x: bleedPt + safetyPt, y: bleedPt + safetyPt, width: trimWidthPt - 2 * safetyPt, height: trimHeightPt - 2 * safetyPt, color: COLORS.page });
    page.drawRectangle({ x: rightSpineFoldX + safetyPt, y: bleedPt + safetyPt, width: trimWidthPt - 2 * safetyPt, height: trimHeightPt - 2 * safetyPt, color: COLORS.page });
    const logoDims = logoImage.scale(0.35);
    const logoY = bleedPt + trimHeightPt - safetyPt - logoDims.height - 20;
    const backCoverCenterX = bleedPt + safetyPt + (trimWidthPt - 2 * safetyPt) / 2;
    page.drawImage(logoImage, { x: backCoverCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawText('BACK COVER', { x: backCoverCenterX, y: logoY - 50, font: poppinsRegular, size: 16, color: COLORS.textPrimary, xOffset: -40 });
    const frontCoverCenterX = rightSpineFoldX + safetyPt + (trimWidthPt - 2 * safetyPt) / 2;
    page.drawImage(logoImage, { x: frontCoverCenterX - logoDims.width / 2, y: logoY, width: logoDims.width, height: logoDims.height });
    page.drawText('FRONT COVER', { x: frontCoverCenterX, y: logoY - 50, font: poppinsRegular, size: 16, color: COLORS.textPrimary, xOffset: -45 });
    // ✨ FIX: Corrected the logic for conditional spine text.
    if ((spineWidth ?? 0) >= 0.125) {
        page.drawText(`Spine ${(spineWidth ?? 0).toFixed(3)} in`, {
            x: leftSpineFoldX + spinePt / 2 + 4,
            y: totalHeight * DPI / 2,
            font: poppinsBold,
            size: 12,
            color: COLORS.white,
            opacity: 0.9,
            rotate: degrees(-90),
            xOffset: -30,
        });
    }
    const leftColumnX = bleedPt + safetyPt + 20;
    let currentY = totalHeight * DPI / 2 + 80;
    const lineHeight = 50;
    const infoHeaderSize = 13;
    const infoDescSize = 10;
    const drawInfoLine = (y, color, val, desc) => {
        page.drawRectangle({ x: leftColumnX, y: y, width: 4, height: 25, color });
        page.drawText(val, { x: leftColumnX + 12, y: y + 10, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: leftColumnX + 12, y: y, font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    };
    drawInfoLine(currentY, COLORS.indicator.bleed, `${(bleed ?? 0).toFixed(3)} in`, 'Bleed Area - Extend your color or BG till bleed area');
    currentY -= lineHeight;
    drawInfoLine(currentY, COLORS.indicator.safety, `${(safetyMargin ?? 0).toFixed(3)} in`, 'Safety Margin Keep all your important text inside it');
    currentY -= lineHeight;
    drawInfoLine(currentY, COLORS.indicator.barcode, '1.75 x 1 in', 'Barcode optional');
    const barcodeW = 1.75 * DPI;
    const barcodeH = 1 * DPI;
    const barcodeX = leftSpineFoldX - safetyPt - barcodeW - 5;
    const barcodeY = bleedPt + safetyPt + 5;
    page.drawRectangle({ x: barcodeX, y: barcodeY, width: barcodeW, height: barcodeH, color: rgb(0.98, 0.83, 0.45), opacity: 0.8 });
    const rightColumnX = rightSpineFoldX + safetyPt + 20;
    currentY = totalHeight * DPI / 2 + 80;
    const drawRightInfoLine = (y, color, val, desc) => {
        page.drawRectangle({ x: rightColumnX, y: y, width: 4, height: 25, color });
        page.drawText(val, { x: rightColumnX + 12, y: y + 10, font: poppinsBold, size: infoHeaderSize, color: COLORS.textPrimary });
        page.drawText(desc, { x: rightColumnX + 12, y: y, font: poppinsRegular, size: infoDescSize, color: COLORS.textSecondary });
    };
    drawRightInfoLine(currentY, COLORS.indicator.docSize, `${totalWidth.toFixed(3)} x ${totalHeight.toFixed(3)} in`, 'Total Document Size with bleed');
    currentY -= lineHeight;
    drawRightInfoLine(currentY, COLORS.indicator.trim, `${trimWidth} x ${trimHeight} in`, 'Trim Size');
    currentY -= lineHeight;
    drawRightInfoLine(currentY, COLORS.indicator.spine, `${(spineWidth ?? 0).toFixed(3)}`, `Spine Text Area for ${p.pageCount} pages using ${p.paperStock}`);
}
async function drawCaseBind(pdfDoc, p, assets) {
    const page = pdfDoc.addPage();
    page.drawText('Case Bind Template Coming Soon!', { font: assets.poppinsRegular });
}
async function drawCoilWire(pdfDoc, p, assets, isHardcover) {
    const page = pdfDoc.addPage();
    page.drawText('Coil/Wire-O Template Coming Soon!', { font: assets.poppinsRegular });
}
