const express = require('express');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const {
  DynamoDBClient,
  ScanCommand,
  PutCommand,
  GetCommand,
} = require('@aws-sdk/client-dynamodb');
const multer = require('multer');
const multerS3 = require('multer-s3');
const cors = require('cors');
const ejs = require('ejs');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const app = express();
app.use(cors());

const s3Client = new S3Client({ region: 'ap-northeast-1' });
const dynamoDBClient = new DynamoDBClient({ region: 'ap-northeast-1' });

app.set('view engine', 'ejs');
app.use(express.static('public'));

// S3 upload configuration
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: 'cloud-internship-project3-s3',
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req, file, cb) => cb(null, file.originalname),
  }),
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Home page
app.get('/', async (req, res) => {
  const params = {
    TableName: 'S3MetadataTable',
  };

  try {
    const data = await dynamoDBClient.send(new ScanCommand(params));
    console.log('Raw DynamoDB data:', data);

    // Check if data.Items is an array and has elements
    if (!data.Items || !Array.isArray(data.Items)) {
      throw new Error('Unexpected DynamoDB response structure');
    }

    // Transform and filter the data
    const files = data.Items.map((item) => ({
      fileName: item.filename ? item.filename.S : null,
      uploadDate: item.uploadTime ? item.uploadTime.S : null,
      s3Uri: item.s3Uri ? item.s3Uri.S : null,
    })).filter((file) => file.fileName && file.uploadDate && file.s3Uri); // Filter out items with null values

    console.log('Filtered data:', files);
    res.render('index', { files });
  } catch (error) {
    console.error('Error retrieving from DynamoDB:', error);
    res.status(500).send(`Error retrieving from DynamoDB: ${error.message}`);
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  console.log(req.file);
  const fileData = {
    key: req.file.originalname,
    fileName: req.file.originalname,
    s3Url: req.file.location,
    uploadDate: new Date().toISOString(),
  };

  const params = {
    TableName: 'S3MetadataTable',
    Item: fileData,
  };

  try {
    await dynamoDBClient.send(new PutCommand(params));
    res.send(`File uploaded successfully! URL: ${req.file.location}`);
  } catch (error) {
    console.error('Error saving to DynamoDB:', error);
    res.status(500).send(`Error saving to DynamoDB: ${error.message}`);
  }
});

app.get('/files/:filename', async (req, res) => {
  const filename = req.params.filename;

  // Query DynamoDB to get file info
  const params = {
    TableName: 'S3MetadataTable',
    Key: {
      key: { S: filename },
    },
  };

  try {
    const data = await dynamoDBClient.send(new GetCommand(params));
    console.log(data);

    if (!data.Item) {
      return res.status(404).send('File not found in DynamoDB');
    }
    console.log(data.Item);

    // Extract S3 key from DynamoDB data
    const s3Key = data.Item.key.S;

    // Get the file from S3
    const s3Params = {
      Bucket: 'cloud-internship-project3-s3',
      Key: s3Key,
    };

    try {
      const command = new GetObjectCommand(s3Params);
      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      }); // URL expiration time in seconds
      res.redirect(signedUrl); // Redirect to S3 URL
    } catch (err) {
      console.error('Error fetching file from S3:', err);
      res.status(500).send(`Error fetching file from S3: ${err.message}`);
    }
  } catch (error) {
    console.error('Error fetching file information:', error);
    res.status(500).send(`Error fetching file information: ${error.message}`);
  }
});

app.listen(80, '0.0.0.0', () => console.log('Server running on port 80'));
