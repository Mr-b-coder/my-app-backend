// server/zipUtils.ts

import JSZip from 'jszip';

/**
 * Defines the structure for a single file to be added to the zip archive.
 * Each file needs a name (including its path in the zip) and its content as a Buffer.
 * Example: { name: 'Cover/template.pdf', content: <Buffer ...> }
 */
interface ZippableFile {
  name: string;
  content: Buffer;
}

/**
 * Creates a zip archive from an array of files.
 * @param files - An array of ZippableFile objects.
 * @returns A promise that resolves with the complete zip file as a Buffer.
 */
export async function zipFiles(files: ZippableFile[]): Promise<Buffer> {
  const zip = new JSZip();

  // Loop through each file object in the array
  for (const file of files) {
    // Add the file to the zip archive using its specified name and content.
    // JSZip automatically creates folders if the name includes a slash ('/').
    zip.file(file.name, file.content);
  }

  // Generate the final zip file as a Node.js Buffer.
  // 'DEFLATE' is the standard compression method, providing a good balance.
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}