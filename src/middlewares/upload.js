import multer from 'multer';
import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';

const storage = multer.memoryStorage();

const excelFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        httpStatus.BAD_REQUEST,
        `File type ${file.mimetype} is not allowed. Use Excel files (.xlsx, .xls)`
      ),
      false
    );
  }
};

const excelUpload = multer({
  storage,
  fileFilter: excelFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadSingle = (fieldName = 'file') => (req, res, next) => {
  excelUpload.single(fieldName)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(httpStatus.BAD_REQUEST, 'File size too large. Maximum 10MB.'));
        }
      }
      return next(err);
    }
    next();
  });
};

export { uploadSingle };
