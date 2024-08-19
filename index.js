const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');

const app = express();
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

app.set('view engine', 'ejs');
app.use(express.static('public'));

// S3 upload configuration
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'cloud-internship-project3-s3',
    acl: 'public-read',
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req, file, cb) =>
      cb(null, Date.now().toString() + '-' + file.originalname),
  }),
});

// Home page
app.get('/', (req, res) => {
  res.render('index');
});

// Upload file
app.post('/upload', upload.single('file'), async (req, res) => {
  const fileData = {
    fileName: req.file.originalname,
    s3Url: req.file.location,
    uploadDate: new Date().toISOString(),
  };

  const params = {
    TableName: 'S3MetadataTable',
    Item: fileData,
  };

  try {
    await dynamoDB.put(params).promise();
    res.send(`File uploaded successfully! URL: ${req.file.location}`);
  } catch (error) {
    res.status(500).send(`Error saving to DynamoDB: ${error.message}`);
  }
});

// List files
app.get('/files', async (req, res) => {
  const params = {
    TableName: 'S3MetadataTable',
  };

  try {
    const data = await dynamoDB.scan(params).promise();
    res.render('files', { files: data.Items });
  } catch (error) {
    res.status(500).send(`Error retrieving from DynamoDB: ${error.message}`);
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
