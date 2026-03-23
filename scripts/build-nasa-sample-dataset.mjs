import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const targetDir = path.join(rootDir, 'sample-files');

const themeConfigs = [
  {
    slug: 'apollo',
    label: 'Apollo 11',
    summary: 'Moon mission imagery and launch-era media anchored on Apollo 11.',
    imageQueries: ['apollo 11 spacecraft', 'apollo 11 launch', 'apollo 11 moon landing'],
    videoQuery: null,
  },
  {
    slug: 'artemis',
    label: 'Artemis',
    summary: 'Current lunar program media centered on Orion, SLS, and Artemis II.',
    imageQueries: ['artemis ii launch pad', 'orion artemis', 'sls artemis'],
    videoQuery: 'artemis ii',
  },
  {
    slug: 'webb',
    label: 'James Webb',
    summary: 'James Webb telescope hardware, optics, and mission visuals.',
    imageQueries: ['james webb telescope', 'webb telescope mirrors', 'webb observatory'],
    videoQuery: null,
  },
  {
    slug: 'hubble',
    label: 'Hubble',
    summary: 'Hubble telescope imagery and observatory-related visuals.',
    imageQueries: ['hubble telescope', 'hubble deep field', 'hubble galaxy'],
    videoQuery: 'hubble telescope',
  },
  {
    slug: 'mars',
    label: 'Mars',
    summary: 'Mars rover imagery and Mars exploration documents.',
    imageQueries: ['mars rover', 'perseverance rover', 'mars landing'],
    videoQuery: null,
  },
  {
    slug: 'earth',
    label: 'Earth',
    summary: 'Earth observation imagery from orbit and Earth science media.',
    imageQueries: ['earth from space', 'earth observatory', 'aurora earth'],
    videoQuery: 'earth observatory',
  },
];

const audioConfigs = [
  {
    slug: 'artemis-audio',
    label: 'Artemis audio',
    query: 'artemis ii crew',
  },
];

const pdfConfigs = [
  {
    slug: 'artemis-i-press-kit',
    theme: 'artemis',
    label: 'Artemis I Press Kit',
    url: 'https://www.nasa.gov/wp-content/uploads/static/artemis-i-press-kit/img/Artemis%20I_Press%20Kit.pdf',
  },
  {
    slug: 'artemis-i-reference-guide',
    theme: 'artemis',
    label: 'Artemis I Reference Guide',
    url: 'https://www.nasa.gov/wp-content/uploads/static/artemis-i-press-kit/img/Artemis%20I%20Reference%20Guide_Inter.pdf',
  },
  {
    slug: 'artemis-ii-press-kit',
    theme: 'artemis',
    label: 'Artemis II Press Kit',
    url: 'https://www.nasa.gov/wp-content/uploads/2026/01/artemis-ii-press-kit.pdf',
  },
  {
    slug: 'earth-observations-mini-book',
    theme: 'earth',
    label: 'Earth Observations Mini Book',
    url: 'https://www.nasa.gov/wp-content/uploads/2020/01/earth-observation-mini-book-042814-508.pdf',
  },
  {
    slug: 'maven-fact-sheet',
    theme: 'mars',
    label: 'MAVEN Fact Sheet',
    url: 'https://www.nasa.gov/wp-content/uploads/2015/03/mavenfactsheet_final20130610.pdf',
  },
];

const imageCountPerTheme = 6;
const maxVideoBytes = 30 * 1024 * 1024;
const maxAudioBytes = 20 * 1024 * 1024;
const rejectTitle = /poster|logo|patch|graphic|insignia|icon|vector|wallpaper|anniversary celebration|media event/i;
const rejectVideoTitle = /news conference|briefing|media event/i;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toHttps(url) {
  return url.replace(/^http:/, 'https:');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'cdrive-nasa-sample-builder/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function search(query, mediaType, page = 1) {
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=${mediaType}&page=${page}`;
  const json = await fetchJson(url);
  return json.collection?.items ?? [];
}

async function downloadFile(url, destination) {
  const response = await fetch(toHttps(url), {
    headers: {
      'user-agent': 'cdrive-nasa-sample-builder/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, bytes);
  return bytes.length;
}

async function getRemoteSize(url) {
  try {
    const response = await fetch(toHttps(url), {
      method: 'HEAD',
      headers: {
        'user-agent': 'cdrive-nasa-sample-builder/1.0',
      },
    });
    if (!response.ok) {
      return 0;
    }

    const length = response.headers.get('content-length');
    return length ? Number(length) : 0;
  } catch {
    return 0;
  }
}

function chooseImageVariant(item) {
  const links = (item.links ?? []).filter((entry) => entry.render === 'image');
  return (
    links.find((entry) => /~medium\./.test(entry.href)) ??
    links.find((entry) => /~small\./.test(entry.href)) ??
    links[0] ??
    null
  );
}

async function chooseVideoVariant(item) {
  if (!item.href) {
    return null;
  }

  const manifest = await fetchJson(toHttps(item.href));
  const assets = manifest.filter((entry) => typeof entry === 'string').map(toHttps);
  return (
    assets.find((entry) => /~preview\.mp4$/.test(entry)) ??
    assets.find((entry) => /~small\.mp4$/.test(entry)) ??
    assets.find((entry) => /~mobile\.mp4$/.test(entry)) ??
    assets.find((entry) => /~orig\.mp4$/.test(entry)) ??
    null
  );
}

async function chooseAudioVariant(item) {
  if (!item.href) {
    return null;
  }

  const manifest = await fetchJson(toHttps(item.href));
  const assets = manifest.filter((entry) => typeof entry === 'string').map(toHttps);
  return (
    assets.find((entry) => /~64k\.mp3$/.test(entry)) ??
    assets.find((entry) => /~64k\.m4a$/.test(entry)) ??
    assets.find((entry) => /~128k\.mp3$/.test(entry)) ??
    assets.find((entry) => /~128k\.m4a$/.test(entry)) ??
    assets.find((entry) => /~orig\.mp3$/.test(entry)) ??
    null
  );
}

async function collectImages(theme, seenIds, seenTitles) {
  const results = [];

  for (const query of theme.imageQueries) {
    for (const page of [1, 2]) {
      const items = await search(query, 'image', page);
      for (const item of items) {
        const data = item.data?.[0];
        const title = data?.title?.trim();
        const nasaId = data?.nasa_id;
        const titleSlug = title ? slugify(title) : '';

        if (!title || !nasaId || rejectTitle.test(title) || seenIds.has(nasaId) || seenTitles.has(titleSlug)) {
          continue;
        }

        const variant = chooseImageVariant(item);
        if (!variant) {
          continue;
        }

        seenIds.add(nasaId);
        seenTitles.add(titleSlug);
        results.push({
          kind: 'image',
          theme: theme.slug,
          query,
          nasaId,
          title,
          description: data.description ?? '',
          sourceUrl: toHttps(item.href ?? variant.href),
          downloadUrl: toHttps(variant.href),
          ext: path.extname(new URL(variant.href).pathname).replace('.', '') || 'jpg',
        });

        if (results.length === imageCountPerTheme) {
          return results;
        }
      }
    }
  }

  throw new Error(`Only found ${results.length} images for theme ${theme.slug}`);
}

async function collectVideo(theme, seenIds, seenTitles) {
  if (!theme.videoQuery) {
    return null;
  }

  for (const page of [1, 2]) {
    const items = await search(theme.videoQuery, 'video', page);
    for (const item of items) {
      const data = item.data?.[0];
      const title = data?.title?.trim();
      const nasaId = data?.nasa_id;
      const titleSlug = title ? slugify(title) : '';

      if (!title || !nasaId || rejectVideoTitle.test(title) || seenIds.has(nasaId) || seenTitles.has(titleSlug)) {
        continue;
      }

      const variant = await chooseVideoVariant(item);
      if (!variant) {
        continue;
      }

      const remoteSize = await getRemoteSize(variant);
      if (remoteSize > maxVideoBytes) {
        continue;
      }

      seenIds.add(nasaId);
      seenTitles.add(titleSlug);
      return {
        kind: 'video',
        theme: theme.slug,
        query: theme.videoQuery,
        nasaId,
        title,
        description: data.description ?? '',
        sourceUrl: toHttps(item.href ?? variant),
        downloadUrl: variant,
        ext: 'mp4',
      };
    }
  }

  throw new Error(`No video found for theme ${theme.slug}`);
}

async function collectAudio(config, seenIds, seenTitles) {
  for (const page of [1, 2]) {
    const items = await search(config.query, 'audio', page);
    for (const item of items) {
      const data = item.data?.[0];
      const title = data?.title?.trim();
      const nasaId = data?.nasa_id;
      const titleSlug = title ? slugify(title) : '';

      if (!title || !nasaId || seenIds.has(nasaId) || seenTitles.has(titleSlug)) {
        continue;
      }

      const variant = await chooseAudioVariant(item);
      if (!variant) {
        continue;
      }

      const remoteSize = await getRemoteSize(variant);
      if (remoteSize > maxAudioBytes) {
        continue;
      }

      seenIds.add(nasaId);
      seenTitles.add(titleSlug);
      return {
        kind: 'audio',
        theme: 'audio',
        query: config.query,
        nasaId,
        title,
        description: data.description ?? '',
        sourceUrl: toHttps(item.href ?? variant),
        downloadUrl: variant,
        ext: path.extname(new URL(variant).pathname).replace('.', '') || 'mp3',
      };
    }
  }

  throw new Error(`No audio found for query ${config.query}`);
}

function buildThemeNote(theme, entries, pdfEntries) {
  const lines = [
    `# ${theme.label}`,
    '',
    theme.summary,
    '',
    'This note was generated from NASA metadata for the CDRIVE demo bundle.',
    '',
    '## Included assets',
    '',
  ];

  for (const entry of entries) {
    lines.push(`- ${entry.kind}: ${entry.title}`);
    if (entry.description) {
      lines.push(`  ${entry.description.replace(/\s+/g, ' ').trim().slice(0, 240)}`);
    }
    lines.push(`  Query: ${entry.query}`);
    lines.push(`  NASA ID: ${entry.nasaId}`);
  }

  if (pdfEntries.length > 0) {
    lines.push('', '## Related PDFs', '');
    for (const entry of pdfEntries) {
      lines.push(`- ${entry.title}`);
      lines.push(`  Source: ${entry.sourceUrl}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const seenIds = new Set();
  const seenTitles = new Set();

  const imageEntries = [];
  for (const theme of themeConfigs) {
    const themeImages = await collectImages(theme, seenIds, seenTitles);
    imageEntries.push(...themeImages);
  }

  const videoEntries = [];
  for (const theme of themeConfigs) {
    const videoEntry = await collectVideo(theme, seenIds, seenTitles);
    if (videoEntry) {
      videoEntries.push(videoEntry);
    }
  }

  const audioEntries = [];
  for (const config of audioConfigs) {
    audioEntries.push(await collectAudio(config, seenIds, seenTitles));
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  const allEntries = [];
  const counters = new Map();

  for (const entry of [...imageEntries, ...videoEntries, ...audioEntries]) {
    const counterKey = `${entry.theme}:${entry.kind}`;
    const index = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, index);
    const fileName = `${entry.theme}-${entry.kind}-${String(index).padStart(2, '0')}-${slugify(entry.title)}.${entry.ext}`;
    const filePath = path.join(targetDir, fileName);
    const bytes = await downloadFile(entry.downloadUrl, filePath);
    allEntries.push({
      ...entry,
      fileName,
      bytes,
    });
  }

  const pdfEntries = [];
  for (const [index, config] of pdfConfigs.entries()) {
    const fileName = `pdf-${String(index + 1).padStart(2, '0')}-${config.slug}.pdf`;
    const filePath = path.join(targetDir, fileName);
    const bytes = await downloadFile(config.url, filePath);
    pdfEntries.push({
      kind: 'pdf',
      theme: config.theme,
      title: config.label,
      fileName,
      sourceUrl: config.url,
      bytes,
    });
  }

  const noteEntries = [];
  for (const theme of themeConfigs) {
    const themeAssets = allEntries.filter((entry) => entry.theme === theme.slug);
    const themePdfs = pdfEntries.filter((entry) => entry.theme === theme.slug);
    const fileName = `${theme.slug}-note.md`;
    const filePath = path.join(targetDir, fileName);
    const content = buildThemeNote(theme, themeAssets, themePdfs);
    await fs.writeFile(filePath, content, 'utf8');
    noteEntries.push({
      kind: 'note',
      theme: theme.slug,
      title: `${theme.label} note`,
      fileName,
      bytes: Buffer.byteLength(content, 'utf8'),
    });
  }

  const datasetEntries = [...allEntries, ...pdfEntries, ...noteEntries];
  const totalBytes = datasetEntries.reduce((sum, entry) => sum + entry.bytes, 0);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: {
      summary: 'Curated subset from NASA Image and Video Library plus official NASA PDF documents.',
      libraryScale: 'NASA states the Image and Video Library includes more than 140,000 images, videos, and audio files from across the agency.',
      libraryReference: 'https://www.nasa.gov/news-release/nasa-unveils-new-searchable-video-audio-and-imagery-library-for-the-public/',
      usageGuidelines: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    },
    counts: {
      images: imageEntries.length,
      videos: videoEntries.length,
      audios: audioEntries.length,
      pdfs: pdfEntries.length,
      notes: noteEntries.length,
      totalFiles: datasetEntries.length,
    },
    totalBytes,
    totalMegabytes: Number((totalBytes / (1024 * 1024)).toFixed(1)),
    entries: datasetEntries.map((entry) => ({
      kind: entry.kind,
      theme: entry.theme,
      title: entry.title,
      fileName: entry.fileName,
      bytes: entry.bytes,
      nasaId: entry.nasaId ?? null,
      query: entry.query ?? null,
      sourceUrl: entry.sourceUrl ?? null,
      downloadUrl: entry.downloadUrl ?? null,
    })),
  };

  const readmeLines = [
    '# NASA Sample Dataset',
    '',
    'This folder replaces the previous mixed synthetic sample bundle with a curated NASA-only demo dataset for CDRIVE.',
    '',
    '## Why this size',
    '',
    'The full NASA Image and Video Library is not a single packaged dataset. NASA describes it as a searchable library with more than 140,000 images, videos, and audio files from more than 60 collections.',
    '',
    'For the demo, this repo uses a curated subset instead of mirroring the full library. The chosen size aims to keep the repo lightweight while still producing a visually interesting embedding space and enough cross-modal variety for search demos.',
    '',
    '## Bundle counts',
    '',
    `- Images: ${imageEntries.length}`,
    `- Videos: ${videoEntries.length}`,
    `- Audio files: ${audioEntries.length}`,
    `- PDFs: ${pdfEntries.length}`,
    `- Theme notes: ${noteEntries.length}`,
    `- Total demo assets: ${manifest.counts.totalFiles}`,
    `- Total size: ${manifest.totalMegabytes} MB`,
    '',
    '## Themes',
    '',
    ...themeConfigs.map((theme) => `- ${theme.label}: ${theme.summary}`),
    '',
    '## Sources',
    '',
    '- NASA library scale statement: https://www.nasa.gov/news-release/nasa-unveils-new-searchable-video-audio-and-imagery-library-for-the-public/',
    '- NASA media usage guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/',
    '- Detailed file-level provenance is in sources.json.',
    '',
  ];

  await fs.writeFile(path.join(targetDir, 'README.md'), `${readmeLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(targetDir, 'sources.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        totalFiles: manifest.counts.totalFiles,
        totalMegabytes: manifest.totalMegabytes,
        counts: manifest.counts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});