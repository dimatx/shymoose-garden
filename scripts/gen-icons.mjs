import sharp from 'sharp';
import fs from 'fs';

const svgPath = 'public/favicon.svg';
const sizes = [192, 512, 180]; // 192x192 for Android, 512x512 for Android, 180x180 for iOS

const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  for (const size of sizes) {
    const outputPath = `public/icon-${size}x${size}.png`;
    await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'fill',
        background: { r: 39, g: 89, b: 44, alpha: 1 } // #27592c
      })
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated ${outputPath}`);
  }
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
