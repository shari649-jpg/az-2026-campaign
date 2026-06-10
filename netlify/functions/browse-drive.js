// netlify/functions/browse-drive.js
// Browses Google Drive media folder for the AZ Coalition media library.
// Modes:
//   folders  — list subfolders of a given folderId (default: root media folder)
//   files    — list image/video/gif files in a folder
//   thumbnail — return thumbnail URL for a fileId

const { google } = require('googleapis');

const ROOT_FOLDER_ID = '1Kt2ytgpZEy8NWPfuuY6j9M6QZuHVelw_';

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/svg+xml', 'image/bmp', 'image/tiff',
]);
const VIDEO_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/mpeg', 'video/x-matroska',
]);
const GIF_MIME = 'image/gif';

function getAuthClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

async function listFolders(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'name',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  return (res.data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
  }));
}

async function listFiles(drive, folderId) {
  const mimeQuery = [
    ...Array.from(IMAGE_MIMES).map(m => `mimeType = '${m}'`),
    ...Array.from(VIDEO_MIMES).map(m => `mimeType = '${m}'`),
  ].join(' or ');

  const res = await drive.files.list({
    q: `'${folderId}' in parents and (${mimeQuery}) and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, thumbnailLink, imageMediaMetadata)',
    orderBy: 'name',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });

  return (res.data.files || []).map(f => {
    const isVideo = VIDEO_MIMES.has(f.mimeType);
    const isGif = f.mimeType === GIF_MIME;
    const isImage = IMAGE_MIMES.has(f.mimeType) && !isGif;

    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size) : null,
      modifiedTime: f.modifiedTime,
      type: isVideo ? 'video' : isGif ? 'gif' : 'image',
      // Drive thumbnail — works for images and videos
      thumbnailLink: f.thumbnailLink
        ? f.thumbnailLink.replace('=s220', '=s400')
        : null,
      // Direct download URL
      downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
      // View URL for lightbox
      viewUrl: isImage || isGif
        ? `https://drive.google.com/uc?export=view&id=${f.id}`
        : null,
    };
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { mode, folderId } = body;
    const targetFolder = folderId || ROOT_FOLDER_ID;

    console.log(`[browse-drive] mode=${mode} targetFolder=${targetFolder}`);

    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // ── DIAGNOSTIC: verify we can see the target folder at all ──
    try {
      const folderMeta = await drive.files.get({
        fileId: targetFolder,
        fields: 'id, name, mimeType, owners',
        supportsAllDrives: true,
      });
      console.log(`[browse-drive] folder meta: ${JSON.stringify(folderMeta.data)}`);
    } catch (metaErr) {
      console.error(`[browse-drive] CANNOT ACCESS FOLDER: ${metaErr.message}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: `Cannot access folder: ${metaErr.message}`,
          folders: [], files: [], folderName: 'Error',
        }),
      };
    }

    // ── DIAGNOSTIC: list ALL items (no mime filter) to see what's there ──
    const allItemsRes = await drive.files.list({
      q: `'${targetFolder}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 20,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });
    console.log(`[browse-drive] ALL items in folder (first 20): ${JSON.stringify(allItemsRes.data.files)}`);

    if (mode === 'folders') {
      const folders = await listFolders(drive, targetFolder);
      console.log(`[browse-drive] found ${folders.length} subfolders`);
      let folderName = 'Media';
      if (folderId && folderId !== ROOT_FOLDER_ID) {
        try {
          const meta = await drive.files.get({ fileId: folderId, fields: 'name', supportsAllDrives: true });
          folderName = meta.data.name;
        } catch {}
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, folders, folderName }),
      };
    }

    if (mode === 'files') {
      const files = await listFiles(drive, targetFolder);
      console.log(`[browse-drive] found ${files.length} media files`);
      let folderName = 'Media';
      try {
        const meta = await drive.files.get({ fileId: targetFolder, fields: 'name', supportsAllDrives: true });
        folderName = meta.data.name;
      } catch {}
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, files, folderName, total: files.length }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid mode. Use: folders, files' }),
    };

  } catch (err) {
    console.error('browse-drive error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
