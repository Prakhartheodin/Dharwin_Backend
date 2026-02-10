import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files');
