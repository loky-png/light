const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function convertIcon() {
  try {
    const inputPath = path.join(__dirname, 'assets', 'light-logo.png');
    const outputPath = path.join(__dirname, 'assets', 'light-logo.ico');
    
    console.log('Converting PNG to ICO...');
    const icoBuffer = await pngToIco(inputPath);
    fs.writeFileSync(outputPath, icoBuffer);
    console.log('✅ Icon converted successfully:', outputPath);
  } catch (error) {
    console.error('❌ Error converting icon:', error);
    process.exit(1);
  }
}

convertIcon();
