import fs from 'fs';
import { PurgeCSS } from 'purgecss';

const stylesFiles = fs.readdirSync('./src/styles').filter(file => file.endsWith('.css'));
for (const file of stylesFiles) {
    (async () => {
    const purgeCSSResult = await new PurgeCSS().purge({
        content: ['./src/**/*.tsx', './src/**/*.ts', './index.html'],
        css: [`./src/styles/${file}`],
    });

    fs.writeFileSync(`./src/styles/${file}`, purgeCSSResult[0].css, 'utf-8');
    console.log('Unused CSS removed successfully.');
    })();
} 