const { dir } = require('console');
const express = require('express');
const fs = require('fs');
const http = require('http')
const app = express();
const path = require('path');
const url = require('url')
const PORT = process.env.PORT || 3000;


// Đường dẫn lưu file upload, chunk và download
const uploadDir = path.join(__dirname, 'uploads');
const chunkDir = path.join(__dirname, 'chunks');
const downloadDir = path.join(__dirname, 'downloads');  // Thêm thư mục downloads để lưu file đã ghép

// Tạo thư mục nếu chưa tồn tại
[uploadDir, chunkDir, downloadDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});
// Set timeout using Express
app.use((req, res, next) => {
    res.setTimeout(600000, () => { // 600,000ms = 10 minutes
        console.log('Request timed out');
        res.sendStatus(408); // Request Timeout
    });
    next();
});
app.use(express.static(uploadDir));

// 📝 Route upload file
app.post('/upload', (req, res) => {
    const fileName = req.headers['file-name'] || 'uploaded-file';
    const filePath = path.join(uploadDir, fileName);
    const writeStream = fs.createWriteStream(filePath);

    console.log(`Đang nhận file: ${fileName}`);

    req.pipe(writeStream);

    req.on('end', () => {
        console.log('File đã được tải lên thành công.');
        res.status(200).json({ message: 'File uploaded successfully' });
    });

    req.on('error', (err) => {
        console.error('Lỗi trong quá trình tải lên:', err);
        res.status(500).json({ message: 'Error during file upload' });
    });
});


// 🧩 Hàm chia file thành các chunk
function splitFile(filePath, fileName, chunkSize = 10 * 1024 * 1024) { // 10MB
    const fileStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
    let chunkIndex = 0;

    fileStream.on('data', (chunk) => {
        const chunkPath = path.join(chunkDir, `${fileName}.part${chunkIndex}`);
        fs.writeFileSync(chunkPath, chunk);
        console.log(`Chunk ${chunkIndex} đã được lưu: ${chunkPath}`);
        chunkIndex++;
    });

    fileStream.on('end', () => {
        console.log('Quá trình chia file hoàn tất.');
    });

    fileStream.on('error', (err) => {
        console.error('Lỗi khi chia file:', err);
    });
}



// Tạo phương thức tải xuống file (ghép các chunk lại)
app.get('/download/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const chunks = [];
    let chunkIndex = 0;
    const filePath = path.join(uploadDir, fileName);

    // Đảm bảo file đã được chia thành các chunk
    while (fs.existsSync(path.join(chunkDir, `${fileName}.part${chunkIndex}`))) {
        chunks.push(path.join(chunkDir, `${fileName}.part${chunkIndex}`));
        chunkIndex++;
    }

    // Nếu không tìm thấy các chunk, trả về lỗi
    if (chunks.length === 0) {
        return res.status(404).send('No chunks found for the requested file');
    }

    // Tạo file tạm thời để ghép các chunk lại
    const tempFilePath = path.join(uploadDir, `temp-${fileName}`);
    const writeStream = fs.createWriteStream(tempFilePath);

    // Ghép các chunk lại với nhau
    chunks.forEach(chunkPath => {
        const chunkStream = fs.createReadStream(chunkPath);
        chunkStream.pipe(writeStream, { end: false });
        chunkStream.on('end', () => {
            if (chunkPath === chunks[chunks.length - 1]) {
                writeStream.end();
            }
        });
    });

    // Khi tất cả các chunk đã được ghép xong, gửi file tới client
    writeStream.on('finish', () => {
        res.download(tempFilePath, fileName, (err) => {
            if (err) {
                console.error('Error during download:', err);
                res.status(500).send('Error downloading file');
            } else {
                console.log('Download complete');
                // Sau khi tải xong, xóa file tạm
                fs.unlinkSync(tempFilePath);
            }
        });
    });

    // Lỗi nếu không thể ghép các chunk
    writeStream.on('error', (err) => {
        console.error('Error during file merging:', err);
        res.status(500).send('Error merging chunks');
    });
});

app. listen(PORT,()=>{
    console.log('Server running on http://localhost:3000');
})
