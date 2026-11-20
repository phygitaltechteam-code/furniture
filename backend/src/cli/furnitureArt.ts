/**
 * Product illustrations for the demo catalog: clean flat drawings of each
 * furniture type in the variant's finish, rendered to PNG with sharp. They
 * are generated locally, so the demo needs no downloaded or licensed photos.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export type ArtKind =
    | 'sofa'
    | 'armchair'
    | 'bed'
    | 'wardrobe'
    | 'dining'
    | 'coffeeTable'
    | 'officeChair'
    | 'bookshelf'
    | 'tvUnit'
    | 'studyDesk'
    | 'sideboard'
    | 'diningChair'
    | 'fan'
    | 'pendantLamp'
    | 'floorLamp'
    | 'cookware'
    | 'kitchenCabinet'
    | 'plywood'
    | 'hardware'
    | 'foam'
    | 'polish';

/** Finish name -> colours (main, dark shade, light shade) */
export const FINISHES: Record<string, [string, string, string]> = {
    Walnut: ['#6B4430', '#4A2E20', '#8A5B41'],
    'Teak Natural': ['#A06A3B', '#7A4E2A', '#C48A55'],
    Honey: ['#C08A4A', '#9A6A33', '#DDAA6E'],
    'Wenge Dark': ['#3E2C24', '#2A1D17', '#57423A'],
    Oak: ['#C9A577', '#A6845A', '#E0C49C'],
    'Matte White': ['#EDEAE4', '#CFCAC1', '#FFFFFF'],
    'Grey Fabric': ['#8A8D91', '#66696D', '#A9ACB0'],
    'Navy Velvet': ['#2D3A5C', '#1E2740', '#41507A'],
    'Olive Fabric': ['#6E7347', '#4F5333', '#8B915D'],
    'Rust Fabric': ['#A5532F', '#7C3D22', '#C26C45'],
    'Beige Fabric': ['#D7C6A8', '#B8A685', '#EADDC5'],
    'Tan Leather': ['#9C6B43', '#76502F', '#B88457'],
    'Black Leather': ['#2B2B2E', '#18181A', '#45454A'],
    'Matte Black': ['#2E2E30', '#1A1A1C', '#47474A'],
    'Brushed Steel': ['#A8ADB3', '#7F858C', '#C9CDD2'],
    Gold: ['#C9A24A', '#9E7C30', '#E1C175'],
    Copper: ['#B8703F', '#8D522B', '#D18E5E'],
    Natural: ['#D9B98C', '#B79669', '#EBD3B0'],
    Standard: ['#B0896A', '#8C6A4F', '#CDA98A'],
};

const shade = (finish: string) => FINISHES[finish] ?? FINISHES.Standard;

/** Wood used for legs and frames under fabric pieces */
const WOOD = ['#6B4430', '#4A2E20'] as const;

const frame = (body: string, bg = '#F6F1EA') => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#E9E1D6"/>
  </linearGradient>
  <radialGradient id="sh" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
<rect y="610" width="800" height="190" fill="#E4DACC"/>
<ellipse cx="400" cy="640" rx="300" ry="34" fill="url(#sh)"/>
${body}
</svg>`;

const ART: Record<ArtKind, (f: string) => string> = {
    sofa: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="150" y="300" width="500" height="190" rx="36" fill="${d}"/>
<rect x="170" y="315" width="225" height="150" rx="28" fill="${m}"/>
<rect x="405" y="315" width="225" height="150" rx="28" fill="${m}"/>
<rect x="120" y="400" width="560" height="120" rx="30" fill="${m}"/>
<rect x="150" y="420" width="245" height="60" rx="18" fill="${l}"/>
<rect x="405" y="420" width="245" height="60" rx="18" fill="${l}"/>
<rect x="90" y="360" width="80" height="190" rx="34" fill="${d}"/>
<rect x="630" y="360" width="80" height="190" rx="34" fill="${d}"/>
<rect x="130" y="545" width="18" height="70" rx="6" fill="${WOOD[1]}"/>
<rect x="652" y="545" width="18" height="70" rx="6" fill="${WOOD[1]}"/>
<rect x="390" y="545" width="18" height="60" rx="6" fill="${WOOD[1]}"/>`);
    },
    armchair: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="260" y="250" width="280" height="240" rx="50" fill="${d}"/>
<rect x="280" y="270" width="240" height="190" rx="40" fill="${m}"/>
<rect x="240" y="420" width="320" height="110" rx="30" fill="${m}"/>
<rect x="270" y="430" width="260" height="55" rx="18" fill="${l}"/>
<rect x="215" y="370" width="70" height="180" rx="30" fill="${d}"/>
<rect x="515" y="370" width="70" height="180" rx="30" fill="${d}"/>
<polygon points="250,545 268,545 255,620 240,620" fill="${WOOD[0]}"/>
<polygon points="532,545 550,545 560,620 545,620" fill="${WOOD[0]}"/>`);
    },
    bed: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="110" y="210" width="580" height="300" rx="22" fill="${d}"/>
<rect x="130" y="230" width="540" height="200" rx="16" fill="${m}"/>
<rect x="150" y="250" width="160" height="160" rx="10" fill="${l}" opacity="0.5"/>
<rect x="320" y="250" width="160" height="160" rx="10" fill="${l}" opacity="0.5"/>
<rect x="490" y="250" width="160" height="160" rx="10" fill="${l}" opacity="0.5"/>
<rect x="80" y="440" width="640" height="120" rx="16" fill="${m}"/>
<rect x="100" y="400" width="600" height="70" rx="20" fill="#F4F1EC"/>
<rect x="150" y="365" width="190" height="60" rx="26" fill="#FFFFFF"/>
<rect x="460" y="365" width="190" height="60" rx="26" fill="#FFFFFF"/>
<rect x="100" y="440" width="600" height="40" rx="10" fill="#C9BBA7"/>
<rect x="100" y="555" width="22" height="60" rx="5" fill="${d}"/>
<rect x="678" y="555" width="22" height="60" rx="5" fill="${d}"/>`);
    },
    wardrobe: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="200" y="110" width="400" height="500" rx="10" fill="${d}"/>
<rect x="212" y="122" width="184" height="476" rx="6" fill="${m}"/>
<rect x="404" y="122" width="184" height="476" rx="6" fill="${m}"/>
<rect x="230" y="140" width="148" height="300" rx="4" fill="${l}" opacity="0.35"/>
<rect x="422" y="140" width="148" height="300" rx="4" fill="${l}" opacity="0.35"/>
<rect x="378" y="300" width="8" height="70" rx="4" fill="#C9A24A"/>
<rect x="414" y="300" width="8" height="70" rx="4" fill="#C9A24A"/>
<rect x="212" y="470" width="376" height="128" rx="6" fill="${d}" opacity="0.25"/>
<rect x="215" y="610" width="20" height="18" fill="${d}"/>
<rect x="565" y="610" width="20" height="18" fill="${d}"/>`);
    },
    dining: (f) => {
        const [m, d, l] = shade(f);
        const chair = (x: number, flip = false) => `
<g transform="translate(${x},0) ${flip ? 'scale(-1,1)' : ''}">
<rect x="0" y="300" width="22" height="200" rx="6" fill="${d}"/>
<rect x="0" y="300" width="90" height="22" rx="6" fill="${d}"/>
<rect x="0" y="340" width="90" height="16" rx="5" fill="${m}"/>
<rect x="0" y="470" width="110" height="26" rx="8" fill="${m}"/>
<rect x="6" y="496" width="14" height="110" rx="4" fill="${d}"/>
<rect x="92" y="496" width="14" height="110" rx="4" fill="${d}"/>
</g>`;
        return frame(`
${chair(100)}${chair(700, true)}
<rect x="190" y="400" width="420" height="34" rx="8" fill="${m}"/>
<rect x="190" y="430" width="420" height="12" rx="4" fill="${d}"/>
<rect x="220" y="440" width="26" height="175" rx="6" fill="${d}"/>
<rect x="554" y="440" width="26" height="175" rx="6" fill="${d}"/>
<rect x="250" y="370" width="60" height="30" rx="12" fill="#FFFFFF"/>
<rect x="480" y="370" width="60" height="30" rx="12" fill="#FFFFFF"/>
<circle cx="400" cy="365" r="26" fill="${l}"/>
<rect x="393" y="320" width="14" height="30" rx="4" fill="#6E7347"/>`);
    },
    coffeeTable: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<ellipse cx="400" cy="440" rx="270" ry="70" fill="${d}"/>
<ellipse cx="400" cy="425" rx="270" ry="70" fill="${m}"/>
<ellipse cx="400" cy="420" rx="230" ry="52" fill="${l}" opacity="0.4"/>
<rect x="250" y="470" width="20" height="140" rx="6" fill="${d}"/>
<rect x="530" y="470" width="20" height="140" rx="6" fill="${d}"/>
<rect x="390" y="490" width="20" height="125" rx="6" fill="${d}"/>
<ellipse cx="400" cy="560" rx="170" ry="26" fill="${d}" opacity="0.6"/>
<rect x="330" y="380" width="90" height="16" rx="4" fill="#2D3A5C"/>
<rect x="335" y="366" width="80" height="14" rx="4" fill="#C26C45"/>`);
    },
    officeChair: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="290" y="130" width="220" height="270" rx="60" fill="${d}"/>
<rect x="305" y="145" width="190" height="240" rx="52" fill="${m}"/>
<rect x="325" y="170" width="150" height="40" rx="16" fill="${l}" opacity="0.5"/>
<rect x="270" y="400" width="260" height="70" rx="30" fill="${m}"/>
<rect x="240" y="370" width="40" height="90" rx="16" fill="#3A3A3D"/>
<rect x="520" y="370" width="40" height="90" rx="16" fill="#3A3A3D"/>
<rect x="388" y="470" width="24" height="90" fill="#7F858C"/>
<polygon points="400,560 230,600 240,612 400,578 560,612 570,600" fill="#3A3A3D"/>
<circle cx="236" cy="615" r="12" fill="#1A1A1C"/><circle cx="564" cy="615" r="12" fill="#1A1A1C"/>
<circle cx="400" cy="585" r="12" fill="#1A1A1C"/>`);
    },
    bookshelf: (f) => {
        const [m, d] = shade(f);
        const books = (y: number, seed: number) =>
            Array.from({length: 7}, (_, i) => {
                const colors = ['#2D3A5C', '#A5532F', '#6E7347', '#C9A24A', '#8A8D91', '#7A2232', '#41507A'];
                const h = 70 + ((i * 13 + seed) % 25);
                return `<rect x="${250 + i * 40}" y="${y - h}" width="${30 + ((i + seed) % 3) * 4}" height="${h}" rx="3" fill="${colors[(i + seed) % 7]}"/>`;
            }).join('');
        return frame(`
<rect x="220" y="110" width="360" height="500" rx="8" fill="${d}"/>
<rect x="236" y="126" width="328" height="468" fill="${m}"/>
${[230, 345, 460, 575].map((y) => `<rect x="236" y="${y}" width="328" height="14" fill="${d}"/>`).join('')}
${books(230, 1)}${books(345, 3)}${books(460, 5)}
<rect x="430" y="525" width="80" height="50" rx="6" fill="#EDEAE4"/>`);
    },
    tvUnit: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="230" y="150" width="340" height="200" rx="10" fill="#1A1A1C"/>
<rect x="242" y="162" width="316" height="176" rx="4" fill="#2D3A5C"/>
<rect x="390" y="350" width="20" height="60" fill="#3A3A3D"/>
<rect x="110" y="420" width="580" height="150" rx="10" fill="${d}"/>
<rect x="124" y="434" width="176" height="122" rx="6" fill="${m}"/>
<rect x="312" y="434" width="176" height="122" rx="6" fill="${l}" opacity="0.6"/>
<rect x="500" y="434" width="176" height="122" rx="6" fill="${m}"/>
<rect x="200" y="490" width="30" height="8" rx="4" fill="#C9A24A"/>
<rect x="575" y="490" width="30" height="8" rx="4" fill="#C9A24A"/>
<rect x="130" y="570" width="16" height="45" fill="${d}"/><rect x="654" y="570" width="16" height="45" fill="${d}"/>`);
    },
    studyDesk: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="150" y="380" width="500" height="30" rx="6" fill="${m}"/>
<rect x="160" y="410" width="22" height="200" rx="5" fill="${d}"/>
<rect x="470" y="410" width="170" height="200" rx="6" fill="${d}"/>
<rect x="482" y="425" width="146" height="50" rx="4" fill="${m}"/>
<rect x="482" y="485" width="146" height="50" rx="4" fill="${m}"/>
<rect x="482" y="545" width="146" height="50" rx="4" fill="${m}"/>
${[450, 510, 570].map((y) => `<rect x="540" y="${y}" width="30" height="7" rx="3" fill="#C9A24A"/>`).join('')}
<rect x="250" y="250" width="180" height="120" rx="8" fill="#1A1A1C"/>
<rect x="260" y="260" width="160" height="100" rx="4" fill="${l}" opacity="0.7"/>
<rect x="330" y="368" width="20" height="14" fill="#3A3A3D"/>
<circle cx="560" cy="320" r="30" fill="#C9A24A"/><rect x="555" y="345" width="10" height="35" fill="#3A3A3D"/>`);
    },
    sideboard: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="130" y="320" width="540" height="250" rx="10" fill="${d}"/>
${[0, 1, 2, 3].map((i) => `<rect x="${144 + i * 130}" y="334" width="122" height="222" rx="6" fill="${i % 2 ? l : m}"/>
<circle cx="${i % 2 ? 150 + i * 130 + 12 : 144 + i * 130 + 106}" cy="445" r="6" fill="#C9A24A"/>`).join('')}
<polygon points="160,570 180,570 170,615 158,615" fill="${d}"/><polygon points="620,570 640,570 642,615 630,615" fill="${d}"/>
<rect x="200" y="270" width="60" height="50" rx="8" fill="#6E7347"/>
<ellipse cx="520" cy="300" rx="40" ry="22" fill="#EDEAE4"/>`);
    },
    diningChair: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="300" y="140" width="200" height="40" rx="10" fill="${d}"/>
<rect x="312" y="180" width="24" height="230" rx="6" fill="${d}"/>
<rect x="464" y="180" width="24" height="230" rx="6" fill="${d}"/>
<rect x="336" y="210" width="128" height="18" rx="6" fill="${m}"/>
<rect x="336" y="260" width="128" height="18" rx="6" fill="${m}"/>
<rect x="280" y="400" width="240" height="44" rx="14" fill="${m}"/>
<rect x="292" y="404" width="216" height="24" rx="10" fill="${l}" opacity="0.5"/>
<rect x="296" y="440" width="22" height="175" rx="6" fill="${d}"/>
<rect x="482" y="440" width="22" height="175" rx="6" fill="${d}"/>`);
    },
    fan: (f) => {
        const [m, d] = shade(f);
        const blade = (deg: number) =>
            `<g transform="rotate(${deg} 400 330)"><path d="M400 318 C 470 300, 640 300, 690 320 C 640 345, 470 345, 400 342 Z" fill="${m}" stroke="${d}" stroke-width="3"/></g>`;
        return frame(
            `
<rect x="392" y="60" width="16" height="200" fill="${d}"/>
<rect x="370" y="55" width="60" height="18" rx="6" fill="${d}"/>
${blade(0)}${blade(120)}${blade(240)}
<circle cx="400" cy="330" r="62" fill="${d}"/><circle cx="400" cy="330" r="46" fill="${m}"/>
<circle cx="400" cy="330" r="14" fill="#F6F1EA"/>`,
            '#EEF1F3',
        );
    },
    pendantLamp: (f) => {
        const [m, d, l] = shade(f);
        return frame(
            `
<rect x="396" y="40" width="8" height="250" fill="#3A3A3D"/>
<path d="M270 470 Q 400 230 530 470 Z" fill="${m}"/>
<path d="M300 470 Q 400 270 500 470 Z" fill="${l}" opacity="0.35"/>
<rect x="262" y="462" width="276" height="16" rx="8" fill="${d}"/>
<ellipse cx="400" cy="490" rx="60" ry="22" fill="#FFF2C6"/>
<ellipse cx="400" cy="600" rx="230" ry="40" fill="#FFF2C6" opacity="0.35"/>`,
            '#EFEAE2',
        );
    },
    floorLamp: (f) => {
        const [m, d] = shade(f);
        return frame(`
<polygon points="300,150 500,150 540,320 260,320" fill="#EADDC5"/>
<polygon points="300,150 500,150 520,230 280,230" fill="#FFF2C6" opacity="0.4"/>
<rect x="394" y="320" width="12" height="270" fill="${m}"/>
<ellipse cx="400" cy="600" rx="90" ry="20" fill="${d}"/>
<ellipse cx="400" cy="335" rx="150" ry="18" fill="#FFF2C6" opacity="0.6"/>`);
    },
    cookware: (f) => {
        const [m, d, l] = shade(f);
        return frame(
            `
<rect x="170" y="330" width="280" height="220" rx="24" fill="${m}"/>
<rect x="170" y="330" width="280" height="40" rx="14" fill="${d}"/>
<ellipse cx="310" cy="325" rx="150" ry="22" fill="${l}"/>
<rect x="290" y="282" width="40" height="22" rx="8" fill="#2B2B2E"/>
<rect x="100" y="380" width="80" height="22" rx="10" fill="#2B2B2E"/>
<rect x="440" y="380" width="80" height="22" rx="10" fill="#2B2B2E"/>
<ellipse cx="560" cy="540" rx="120" ry="34" fill="${d}"/>
<ellipse cx="560" cy="528" rx="120" ry="34" fill="${m}"/>
<ellipse cx="560" cy="522" rx="98" ry="24" fill="#2B2B2E"/>
<rect x="660" y="510" width="120" height="20" rx="10" fill="#2B2B2E"/>`,
            '#F1EEE9',
        );
    },
    kitchenCabinet: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<rect x="100" y="120" width="600" height="150" rx="8" fill="${d}"/>
${[0, 1, 2, 3].map((i) => `<rect x="${112 + i * 147}" y="132" width="139" height="126" rx="4" fill="${m}"/><rect x="${170 + i * 147}" y="240" width="24" height="6" rx="3" fill="#A8ADB3"/>`).join('')}
<rect x="90" y="380" width="620" height="24" rx="4" fill="#3A3A3D"/>
<rect x="100" y="404" width="600" height="206" rx="8" fill="${d}"/>
${[0, 1, 2].map((i) => `<rect x="${112 + i * 196}" y="416" width="188" height="182" rx="4" fill="${i === 1 ? l : m}"/><rect x="${190 + i * 196}" y="430" width="34" height="6" rx="3" fill="#A8ADB3"/>`).join('')}
<rect x="350" y="300" width="100" height="80" rx="6" fill="#A8ADB3"/>`);
    },
    plywood: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
${[0, 1, 2, 3, 4].map((i) => `<polygon points="${170 + i * 6},${520 - i * 36} ${560 + i * 6},${520 - i * 36} ${640 + i * 6},${450 - i * 36} ${250 + i * 6},${450 - i * 36}" fill="${i % 2 ? m : l}" stroke="${d}" stroke-width="3"/>
<polygon points="${170 + i * 6},${520 - i * 36} ${560 + i * 6},${520 - i * 36} ${560 + i * 6},${548 - i * 36} ${170 + i * 6},${548 - i * 36}" fill="${d}"/>`).join('')}`);
    },
    hardware: (f) => {
        const [m, d] = shade(f);
        return frame(
            `
<rect x="180" y="250" width="150" height="260" rx="14" fill="${m}" stroke="${d}" stroke-width="5"/>
${[300, 380, 460].map((y) => `<circle cx="255" cy="${y}" r="14" fill="${d}"/>`).join('')}
<rect x="380" y="320" width="260" height="40" rx="20" fill="${m}" stroke="${d}" stroke-width="5"/>
<rect x="420" y="360" width="20" height="60" fill="${d}"/><rect x="580" y="360" width="20" height="60" fill="${d}"/>
<rect x="400" y="460" width="220" height="70" rx="10" fill="${m}" stroke="${d}" stroke-width="5"/>
<rect x="430" y="482" width="160" height="26" rx="6" fill="${d}"/>`,
            '#EEF1F3',
        );
    },
    foam: (f) => {
        const [m, d, l] = shade(f);
        return frame(`
<polygon points="160,470 520,470 640,380 280,380" fill="${l}"/>
<polygon points="160,470 520,470 520,560 160,560" fill="${m}"/>
<polygon points="520,470 640,380 640,470 520,560" fill="${d}"/>
${Array.from({length: 40}, (_, i) => `<circle cx="${180 + (i * 37) % 320}" cy="${490 + ((i * 23) % 60)}" r="3" fill="${d}" opacity="0.4"/>`).join('')}`);
    },
    polish: (f) => {
        const [m, d] = shade(f);
        return frame(`
<rect x="260" y="260" width="200" height="330" rx="18" fill="${m}"/>
<rect x="260" y="330" width="200" height="160" fill="#F6F1EA"/>
<rect x="280" y="370" width="160" height="22" rx="6" fill="${d}"/>
<rect x="280" y="410" width="120" height="14" rx="6" fill="${d}" opacity="0.5"/>
<rect x="320" y="220" width="80" height="46" rx="8" fill="${d}"/>
<rect x="500" y="420" width="120" height="170" rx="14" fill="${d}"/>
<rect x="520" y="390" width="80" height="36" rx="8" fill="#2B2B2E"/>`);
    },
};

/** Write the PNG for a product image once; returns the file name */
export const renderArt = async (dir: string, kind: ArtKind, finish: string, view = 0) => {
    fs.mkdirSync(dir, {recursive: true});
    const file = `${kind}-${finish.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${view ? `-${view}` : ''}.png`;
    const out = path.join(dir, file);
    if (!fs.existsSync(out)) {
        let svg = ART[kind](finish);
        // Second view: a slightly closer crop for the gallery
        if (view) svg = svg.replace('viewBox="0 0 800 800"', 'viewBox="80 80 640 640"');
        await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toFile(out);
    }
    return file;
};
