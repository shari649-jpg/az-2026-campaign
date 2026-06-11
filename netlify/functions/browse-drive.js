// netlify/functions/browse-drive.js
// Browses Google Drive media folder using API key (public folder access).
// Folder must be shared as "Anyone with the link - Viewer".
// Modes:
//   folders  — list subfolders of a given folderId
//   files    — list image/video/gif files in a folder

const { google } = require('googleapis');

const ROOT_FOLDER_ID = '1Kt2ytgpZEy8NWPfuuY6j9M6QZuHVelw_';

const IMAGE_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
  'image/svg+xml', 'image/bmp', 'image/tiff',
];
const VIDEO_MIMES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/mpeg', 'video/x-matroska',
];
const GIF_MIME = 'image/gif';
const ALL_MEDIA_MIMES = [...IMAGE_MIMES, GIF_MIME, ...VIDEO_MIMES];

function getDrive() {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_DRIVE_API_KEY env var not set');
  return google.drive({ version: 'v3', auth: apiKey });
}

function mapFile(f) {
  const isVideo = VIDEO_MIMES.includes(f.mimeType);
  const isGif   = f.mimeType === GIF_MIME;
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

    const drive = getDrive();

    if (mode === 'folders') {
      const res = await drive.files.list({
        q: `'${targetFolder}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'name',
        pageSize: 100,
      });

      const folders = (res.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      }));

      console.log(`[browse-drive] folders found: ${folders.length}`);

      let folderName = 'Media';
      try {
        const meta = await drive.files.get({
          fileId: targetFolder,
          fields: 'name',
        });
        folderName = meta.data.name;
      } catch(e) {
        console.log(`[browse-drive] folder name lookup failed: ${e.message}`);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, folders, folderName }),
      };
    }

    if (mode === 'files') {
      const mimeFilter = ALL_MEDIA_MIMES
        .map(m => `mimeType = '${m}'`)
        .join(' or ');

      const res = await drive.files.list({
        q: `'${targetFolder}' in parents and (${mimeFilter}) and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, thumbnailLink)',
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
        });
        folderName = meta.data.name;
      } catch(e) {
        console.log(`[browse-drive] folder name lookup failed: ${e.message}`);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, files, folderName, total: files.length }),
      };
    }

    // debug mode — list everything visible
    if (mode === 'debug') {
      const res = await drive.files.list({
        fields: 'files(id, name, mimeType, parents)',
        pageSize: 20,
        q: 'trashed = false',
        orderBy: 'modifiedTime desc',
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          debug: true,
          visibleFiles: res.data.files || [],
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
