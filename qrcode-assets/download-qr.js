const fs = require('fs');
const https = require('https');
const path = require('path');

const pngUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&data=https%3A%2F%2Fsarascan.zeabur.app%2F&ecc=H';
const svgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&data=https%3A%2F%2Fsarascan.zeabur.app%2F&ecc=H&format=svg';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  try {
    console.log('Downloading PNG QR code...');
    await downloadFile(pngUrl, path.join(__dirname, 'sarascan-qr.png'));
    console.log('PNG QR code downloaded successfully.');

    console.log('Downloading SVG QR code...');
    await downloadFile(svgUrl, path.join(__dirname, 'sarascan-qr.svg'));
    console.log('SVG QR code downloaded successfully.');
  } catch (err) {
    console.error('Error downloading QR codes:', err);
    process.exit(1);
  }
}

main();
