require('dotenv').config()
const util = require('util');
const ApiError = require("../../utils/ApiError")
const ApiResponse = require("../../utils/ApiResponse")
const path = require("path")
const PredictionApi = require("@azure/cognitiveservices-customvision-prediction");

const TrainingApi = require('@azure/cognitiveservices-customvision-training');
const msRest = require("@azure/ms-rest-js");
const sharp = require('sharp'); // Add sharp for image processing
const fs = require('fs');
const AWS = require('aws-sdk');

// retrieve environment variables
const endpoint = process.env.VISION_PREDICTION_ENDPOINT || '';
const trainingKey = process.env.VISION_TRAINING_KEY || '';
const train_endpoint = process.env.VISION_TRAINING_ENDPOINT || '';
const predictionKey = process.env.VISION_PREDICTION_KEY || '';
const projectId = process.env.VISION_PROJECT_ID || '';
const modelId = process.env.CUSTOM_VISION_MODEL_ID || '';
const bucketName = process.env.AWS_S3_BUCKET_NAME || ''; // Corrected: Added the bucketName variable

if (!endpoint || !predictionKey || !projectId || !modelId || !trainingKey || !train_endpoint) {
    throw new Error('Missing required environment variables');
}

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const uploadToS3 = (filePath, key) => {
    const fileStream = fs.createReadStream(filePath);
    const uploadParams = {
      Bucket: bucketName,  // Ensure we're using the bucketName here
      Key: key,
      Body: fileStream,
      ACL: 'public-read',
    };
  
    return s3.upload(uploadParams).promise();
  };
  

const predictController = {

    predictImage: async (req, res, next) => {
        const image = req.file;

        if (!image || image === undefined) {
            return next(new ApiError(400, 'No image file provided'));
        }

        try {
            const predictor_credentials = new msRest.ApiKeyCredentials({ inHeader: { "Prediction-key": predictionKey } });
            const predictor = new PredictionApi.PredictionAPIClient(predictor_credentials, endpoint);

            
            const credentials = new msRest.ApiKeyCredentials({
                inHeader: { 'Training-key': trainingKey },
            });
            const trainer = new TrainingApi.TrainingAPIClient(credentials, train_endpoint);

            const iterations = await trainer.getIterations(projectId);

            // Filter iterations that have been published (have a publishName)
            const publishedIterations = iterations.filter(iteration => iteration.publishName);
    
            let lastPublishName = '';
            if (publishedIterations.length > 0) {
              // Get the most recent published iteration
              const latestPublished = publishedIterations[0];        
              lastPublishName = latestPublished.publishName;  // Return the last published iteration's publishName
              console.log(lastPublishName);
            } else {
                console.error('Error during image processing:', error);
                
                res.status(404).json({ message: 'Iteration not found' });
            }

            // Build the full path to the uploaded image file
            const imagePath = path.join(__dirname, '../../', image.path);

            // Compress and resize the image using sharp
            const compressedImagePath = path.join(__dirname, '../../compressed_image.jpg');
            const currentDateTime = new Date().toISOString().replace(/:/g, '-');
            const s3Key = `prediction/image${currentDateTime}`;
            await uploadToS3(imagePath, s3Key);

            console.log("Compressing Image......");
            await sharp(imagePath)
                .resize({ width: 1920 }) // Optionally resize (e.g., max width of 1920px)
                .jpeg({ quality: 80 }) // Compress using JPEG format and set quality (reduce as needed)
                .toFile(compressedImagePath); // Output the compressed image to a new file

            // Get the file size to ensure it's under 4MB
            const stats = fs.statSync(compressedImagePath);
            const fileSizeInBytes = stats.size;
            const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

            // If the file is larger than 4MB, adjust the quality further or resize it
            console.log("Checking Image......");
            if (fileSizeInMB > 4) {
                throw new Error('Unable to reduce image to 4MB. Try adjusting quality or resizing further.');
            }

            // Read the compressed image as a buffer
            const imageData = fs.readFileSync(compressedImagePath);
            console.log("Image Data before Sending.....");

            // Pass the image buffer to the classifyImageWithNoStore method
            const results = await predictor.classifyImageWithNoStore(projectId, lastPublishName, imageData);

            // Show results
            console.log("Results:");
            results.predictions.forEach(predictedResult => {
                console.log(`\t ${predictedResult.tagName}: ${(predictedResult.probability * 100.0).toFixed(2)}%`);
            });

            const wheelId = results.predictions.length > 0 ? results.predictions[0].tagName : null;

            if (wheelId) {
                res.status(200).json({ wheelId });
            } else {
                res.status(404).json({ message: 'Wheel not found' });
            }

        } catch (error) {
            console.error('Error during image processing:', error);
            return next(new ApiError(500, "Error during image processing"));
        }
    }
};

module.exports = predictController;

