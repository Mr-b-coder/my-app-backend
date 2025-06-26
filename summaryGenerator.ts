// server/summaryGenerator.ts

import { TemplatePayload } from './server.js'; // Import our payload type

/**
 * Generates a plain text summary of the book's specifications.
 * @param payload - The dimension and details payload from the frontend.
 * @returns A string containing the formatted summary.
 */
export function generateSummary(payload: TemplatePayload): string {
  const {
    bindingName,
    pageCount,
    paperStock, // Added
    trimWidth,
    trimHeight,
    spineWidth,
    bleed,
    totalWidth,
    totalHeight,
  } = payload;

  const summaryLines = [
    `BOOK SPECIFICATION SUMMARY`,
    `================================`,
    `Binding Type: ${bindingName}`,
    `Page Count: ${pageCount}`,
    `Paper Stock: ${paperStock}`, // Added
    ``,
    `--- Cover Dimensions ---`,
    `Trim Size (Single Page): ${trimWidth.toFixed(3)}" x ${trimHeight.toFixed(3)}"`,
    // ✅ FIX: Provide a default value of 0 if spineWidth is undefined
    `Spine Width: ${(spineWidth ?? 0).toFixed(3)}"`,
    // ✅ FIX: Provide a default value of 0 if bleed is undefined
    `Bleed: ${(bleed ?? 0).toFixed(3)}"`,
    `Total Cover Size (with bleed): ${totalWidth.toFixed(3)}" x ${totalHeight.toFixed(3)}"`,
    ``,
    `--- Interior Dimensions ---`,
    `Page Size: ${trimWidth.toFixed(3)}" x ${trimHeight.toFixed(3)}"`,
    `Recommended Margins: 0.5" - 0.75"`,
    ``,
    `Generated on: ${new Date().toUTCString()}`,
  ];

  return summaryLines.join('\n');
}