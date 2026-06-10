// netlify/functions/browse-drive.js
// Browses Google Drive media folder for the AZ Coalition media library.
// Uses search-based approach to find files shared with the service account.
// Modes:
//   folders  — list subfolders of a given folderId
//   files    — list image/video/gif files in a folder

const { google } = require('googleapis');

const ROOT_FOLDER_ID = '1Kt2ytgpZEy8NWPfuuY6j9M6QZuHVelw_';

const IMAGE_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/svg+xml', 'image/bmp', 'image/tiff',
];
const VIDEO_MIMES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/mpeg', 'video/x-matroska',
];

function getAuthClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
  });
}

function mapFile(f) {
  const isVideo = VIDEO_MIMES.includes(f.mimeType);
  const isGif   = f.mimeType === 'image/gif';
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? parseInt(f.size) : null,
    modifiedTime: f.modifiedTime,
    type: isVideo ? 'video' : isGif ? 'gif' : 'image',
    thumbnailLink: f.thumbnailLink
      ? f.thumbnailLink.replace(/=s\d+/, '=s400')
      : null,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
    viewUrl: !isVideo
      ? `https://drive.google.com/uc?export=view&id=${f.id}`
      : null,
  };
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

    // Shared list params — try all corpora combinations
    const baseListParams = {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      fields: 'files(id, name, mimeType, size, modifiedTime, thumbnailLink, parents)',
      pageSize: 100,
    };

    if (mode === 'folders') {
      const res = await drive.files.list({
        ...baseListParams,
        q: `'${targetFolder}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        orderBy: 'name',
      });

      const folders = (res.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      }));

      console.log(`[browse-drive] folders found: ${folders.length}`);

      // Get folder name
      let folderName = 'Media';
      try {
        const meta = await drive.files.get({
          fileId: targetFolder,
          fields: 'name',
          supportsAllDrives: true,
        });
        folderName = meta.data.name;
      } catch(e) {
        console.log(`[browse-drive] could not get folder name: ${e.message}`);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, folders, folderName }),
      };
    }

    if (mode === 'files') {
      const mimeFilter = [
        ...IMAGE_MIMES.map(m => `mimeType = '${m}'`),
        ...VIDEO_MIMES.map(m => `mimeType = '${m}'`),
      ].join(' or ');

      const res = await drive.files.list({
        ...baseListParams,
        q: `'${targetFolder}' in parents and (${mimeFilter}) and trashed = false`,
        orderBy: 'name',
        pageSize: 200,
      });

      const files = (res.data.files || []).map(mapFile);
      console.log(`[browse-drive] files found: ${files.length}`);

      let folderName = 'Media';
      try {
        const meta = await drive.files.get({
          fileId: targetFolder,
          fields: 'name',
          supportsAllDrives: true,
        });
        folderName = meta.data.name;
      } catch(e) {
        console.log(`[browse-drive] could not get folder name: ${e.message}`);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, files, folderName, total: files.length }),
      };
    }

    // mode=debug — returns everything visible to the service account
    // useful for diagnosing permission issues
    if (mode === 'debug') {
      const res = await drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        fields: 'files(id, name, mimeType, parents)',
        pageSize: 20,
        q: 'trashed = false',
        orderBy: 'modifiedTime desc',
      });
      console.log(`[browse-drive] debug — visible files: ${JSON.stringify(res.data.files)}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          debug: true,
          visibleFiles: res.data.files || [],
          message: 'These are ALL files visible to the service account',
        }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid mode' }),
    };

  } catch (err) {
    console.error('[browse-drive] error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
