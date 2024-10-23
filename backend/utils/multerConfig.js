const multer = require('multer');
const fs = require('fs');

// Multer disk storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'uploads';

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();

        const originalName = file.originalname;
        const fileExtension = originalName.substring(originalName.lastIndexOf('.'));
        const fileNameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));

        // new filename with timestamp
        const newFilename = `${fileNameWithoutExt}-${timestamp}${fileExtension}`;

        cb(null, newFilename);
    }
});

const upload = multer({ storage: storage });

module.exports = upload;
