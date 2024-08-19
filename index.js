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
    key: req.file.key,
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

// Serve the file content
app.get('/files/:filename', async (req, res) => {
  const filename = req.params.filename;

  // Query DynamoDB to get file info
  const params = {
    TableName: 'S3MetadataTable',
    Key: {
      key: filename, // Ensure this matches the partition key
    },
  };

  try {
    const data = await dynamoDB.get(params).promise();

    if (!data.Item) {
      return res.status(404).send('File not found in DynamoDB');
    }
    console.log(data.Item);

    // Extract S3 key from DynamoDB data
    const s3Key = data.Item.key;

    // Get the file from S3
    const s3Params = {
      Bucket: 'cloud-internship-project3-s3',
      Key: s3Key,
    };

    s3.getObject(s3Params, (err, data) => {
      if (err) {
        console.error('Error fetching file from S3:', err);
        return res
          .status(500)
          .send(`Error fetching file from S3: ${err.message}`);
      }

      // Set content type based on the file type
      res.setHeader('Content-Type', data.ContentType);
      res.send(data.Body);
    });
  } catch (error) {
    console.error('Error fetching file information:', error);
    res.status(500).send(`Error fetching file information: ${error.message}`);
  }
});

app.listen(3000, '0.0.0.0', () => console.log('Server running on port 3000'));
