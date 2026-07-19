// Genera assets/icon.ico (multi-resolucion) a partir de assets/icon.png.
// Requiere que assets/icon.png exista (>= 256x256).
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const assets = path.join(__dirname, '..', 'assets');
const pngPath = path.join(assets, 'icon.png');
const icoPath = path.join(assets, 'icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error('Falta assets/icon.png. Genera primero el PNG (256x256 minimo).');
  process.exit(1);
}

pngToIco(pngPath)
  .then((buf) => {
    fs.writeFileSync(icoPath, buf);
    console.log('icon.ico generado en', icoPath);
  })
  .catch((err) => {
    console.error('Error generando icon.ico:', err.message);
    process.exit(1);
  });
