import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files');

/** For module create: cover image + optional playlist item files (video/PDF) + form fields */
export const uploadModuleCover = upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'playlistItemFiles', maxCount: 50 },
]);
