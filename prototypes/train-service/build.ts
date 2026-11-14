import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const destination = process.argv[2] ?? '.review/train-service';
const result = await Bun.build({
    entrypoints: [`${directory}app.ts`],
    target: 'browser',
    minify: false,
});
if (!result.success) throw new Error(result.logs.join('\n'));
const [template, css, script] = await Promise.all([
    readFile(`${directory}index.html`, 'utf8'),
    readFile(`${directory}prototype.css`, 'utf8'),
    result.outputs[0].text(),
]);
const html = template
    .replace(
        /<link rel="stylesheet" href="\.\/prototype\.css"\s*\/?>/,
        () => `<style>${css}</style>`
    )
    .replace(
        '<script type="module" src="./app.ts"></script>',
        () =>
            `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>`
    );
if (
    html.includes('href="./prototype.css"') ||
    html.includes('src="./app.ts"')
) {
    throw new Error('Prototype assets were not inlined.');
}
await mkdir(destination, { recursive: true });
await writeFile(`${destination}/index.html`, html);
console.log(`${destination}/index.html`);
