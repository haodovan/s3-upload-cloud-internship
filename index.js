const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const cors = require('cors');
const ejs = require('ejs');
const app = express();
app.use(cors());

AWS.config.update({
  region: 'ap-northeast-1',
});

const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

app.set('view engine', 'ejs');
app.use(express.static('public'));

// S3 upload configuration
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'cloud-internship-project3-s3',
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req, file, cb) =>
      cb(null, Date.now().toString() + '-' + file.originalname),
  }),
});

// Home page
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/upload', upload.single('file'), async (req, res) => {
  console.log(req.file);
  const fileData = {
    key: req.file.originalname,
    fileName: req.file.originalname,
    s3Url: 's3://cloud-internship-project3-s3/' + req.file.originalname,
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
    console.error('Error saving to DynamoDB:', error);
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
    res.render('index', { files: data.Items });
  } catch (error) {
    res.status(500).send(`Error retrieving from DynamoDB: ${error.message}`);
  }
});

app.get('/files/:fileName', async (req, res) => {
  const fileName = req.params.fileName;

  // Query DynamoDB to get file info
  const params = {
    TableName: 'S3MetadataTable',
    Key: {
      fileName: fileName,
    },
  };

  try {
    const data = await dynamoDB.get(params).promise();

    if (!data.Item) {
      return res.status(404).send('File not found in DynamoDB');
    }

    // Extract S3 URL or key from DynamoDB data
    const s3Key = data.Item.s3Url.replace(
      `https://cloud-internship-project3-s3.s3.ap-northeast-1.amazonaws.com/`,
      ''
    );

    // Get the file from S3
    const s3Params = {
      Bucket: 'cloud-internship-project3-s3',
      Key: s3Key,
    };

    const fileStream = s3.getObject(s3Params).createReadStream();
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error fetching file information:', error);
    res.status(500).send(`Error fetching file information: ${error.message}`);
  }
});

app.listen(3000, '0.0.0.0', () => console.log('Server running on port 3000'));
