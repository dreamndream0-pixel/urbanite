/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lucide = require('lucide-react');

(async () => {
  const source = process.argv[2];
  if (!source) throw new Error('Pass the extracted membership_cards directory');
  const target = path.resolve(__dirname, '../public/membership');
  await fs.mkdir(path.join(target, 'cards'), { recursive: true });
  await fs.mkdir(path.join(target, 'icons'), { recursive: true });
  const files = (await fs.readdir(source)).filter((file) => /^\d\d_[a-z_]+\.png$/.test(file)).sort();
  if (files.length !== 10) throw new Error('Expected ten original PNG backgrounds');
  for (const file of files) {
    const name = path.basename(file, '.png');
    const input = path.join(source, file);
    await sharp(input).webp({ lossless: true }).toFile(path.join(target, 'cards', `${name}.webp`));
    await sharp(input).resize({ width: 320 }).webp({ quality: 85 }).toFile(path.join(target, 'cards', `${name}.thumb.webp`));
  }
  for (const [name, component] of Object.entries({ coins: 'Coins', gift: 'Gift', diamond: 'Diamond', crown: 'Crown', calendar: 'CalendarDays', heart: 'Heart', star: 'Star', percent: 'Percent', headset: 'Headset' })) {
    const svg = renderToStaticMarkup(React.createElement(lucide[component], { width: 48, height: 48, color: '#e4bd79', strokeWidth: 1.6 }));
    await fs.writeFile(path.join(target, 'icons', `${name}.svg`), `${svg}\n`);
  }
  await fs.copyFile(path.resolve(__dirname, '../node_modules/lucide-react/LICENSE'), path.join(target, 'icons/LICENSE.txt'));
  console.log(`Prepared ${files.length} lossless backgrounds, thumbnails and 9 Lucide SVG icons`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
