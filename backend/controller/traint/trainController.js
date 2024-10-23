const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const AWS = require('aws-sdk');
const path = require('path');
const TrainingApi = require('@azure/cognitiveservices-customvision-training');
const msRest = require('@azure/ms-rest-js');

const endpoint = process.env.VISION_TRAINING_ENDPOINT || '';
const trainingKey = process.env.VISION_TRAINING_KEY || '';
const projectId = process.env.VISION_PROJECT_ID || '';
const modelId = process.env.CUSTOM_VISION_MODEL_ID || '';
const bucketName = process.env.AWS_S3_BUCKET_NAME || '';

if (!endpoint || !trainingKey || !projectId || !modelId || !bucketName) {
  throw new Error('Missing required environment variables');
}

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const uploadToS3 = async (filePath, key, bucketName) => {
  const fileStream = fs.createReadStream(filePath);
  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
    ACL: 'public-read',
  };
  return s3.upload(uploadParams).promise();
};

// Retry wrapper function
const retryOperation = async (fn, retries = 5, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.statusCode === 429 && attempt < retries) {
        console.log(`Rate limit hit. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

const trainController = {
  trainImage: async (req, res) => {
    try {
      const credentials = new msRest.ApiKeyCredentials({
        inHeader: { 'Training-key': trainingKey },
      });
      const trainer = new TrainingApi.TrainingAPIClient(credentials, endpoint);
      const videoFile = req.file;
      const tagValue = req.body.tagValue.toUpperCase();
      const videoPath = videoFile.path;
      const currentDateTime = new Date().toISOString().replace(/:/g, '-');
      const publishName = `Iteration${currentDateTime}`;
      const framesDir = path.join(__dirname, '..', 'frames', tagValue);
      let newtagFlag = false;

      if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
      }

      ffmpeg.setFfmpegPath(ffmpegStatic);

      ffmpeg(videoPath)
        .on('filenames', (filenames) => {
          console.log('Frames will be saved as:', filenames);
        })
        .on('end', async () => {
          console.log('Frames extracted successfully.');

          const frameFiles = fs.readdirSync(framesDir);
          const trainImages = [];
          const uploadPromises = frameFiles.map(async (file) => {
            const filePath = path.join(framesDir, file);
            const s3Key = `frames/${tagValue}/${file}`;
            const s3result = await uploadToS3(filePath, s3Key, bucketName);
            trainImages.push(
              `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`
            );
          });

          await Promise.all(uploadPromises);

          // Retry fetching tags
          const listTags = async () => {
            try {
              const tags = await retryOperation(() => trainer.getTags(projectId));
              console.log('List of Tags:', tags);
              return tags;
            } catch (err) {
              console.error('Error retrieving tags:', err);
              return res.status(500).json({ message: 'Error retrieving tags', err });
            }
          };
          
          const tags_total = await listTags();


          // Iterate through tags and clear those with not enough images
          for (const tag of tags_total) {
            const tagImages = await retryOperation(() =>
              trainer.getTaggedImages(projectId, { tagIds: [tag.id], take: 256 })
            );
            if (tagImages.length < 5) {
              await retryOperation(() => trainer.deleteTag(projectId, tag.id));
            }
          }

          let tagId = '';
          const existingTag = tags_total.find((t) => t.name === tagValue);

          if (existingTag) {
            console.log('Tag Name already exists');
            tagId = existingTag.id;
          } else {
            console.log('Creating a new tag');
            const newTag = await retryOperation(() => trainer.createTag(projectId, tagValue));
            tagId = newTag.id;
            newtagFlag = true;
          }

          if (trainImages.length >= 5) {
            try {
              console.log('Started uploading images');
              // Retry uploading images
              for (const file of frameFiles) {
                const image = fs.readFileSync(path.join(framesDir, file));
                await retryOperation(async () => {
                  await trainer.createImagesFromData(projectId,image, {tagIds:[tagId]});
                });
            
                // Introduce a delay between each upload to avoid hitting the rate limit
                await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
              }

              const tagImages = await retryOperation(() =>
                trainer.getTaggedImages(projectId, { tagIds: [tagId], take: 256 })
              );

              console.log(`${tagImages.length} images Tagged`);

              if (tagImages.length >= 5) {
                console.log('Triggering training...');

                const iteration = await retryOperation(() => trainer.trainProject(projectId));
                let iterationStatus = 'Training';
                const POLLING_INTERVAL = 5000;

                while (iterationStatus === 'Training' || iterationStatus === 'InProgress') {
                  console.log(`Waiting for iteration to complete, current status: ${iterationStatus}`);
                  await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));

                  const currentIteration = await retryOperation(() =>
                    trainer.getIteration(projectId, iteration.id)
                  );
                  iterationStatus = currentIteration.status;

                  if (iterationStatus === 'Completed') {
                    console.log('Training completed, publishing the iteration.');
                    await retryOperation(() =>
                      trainer.publishIteration(projectId, iteration.id, publishName, process.env.PREDICTION_RESOURCE_ID)
                    );
                    frameFiles.forEach((file) =>
                      fs.unlinkSync(path.join(framesDir, file))
                    );
                    fs.rmdirSync(framesDir);
                    return res.status(200).json({
                      message: 'Video processed, images trained successfully, and model published.',
                    });
                  }

                  if (iterationStatus === 'Failed') {
                    return res.status(400).json({ message: 'Training Failed for iteration.' });
                  }
                }
              } else {
                if (newtagFlag) await retryOperation(() => trainer.deleteTag(projectId, tagId));
                return res.status(400).json({
                  message: `Not enough valid images uploaded. You uploaded ${trainImages.length}, but only ${tagImages.length} images were accepted.`,
                });
              }
            } catch (error) {
              console.error('Error during training or image upload:', error);
              return res.status(500).json({ message: 'Training Not Completed.' });
            }
          } else {
            if (newtagFlag) await retryOperation(() => trainer.deleteTag(projectId, tagId));
            return res.status(400).json({
              message: `Not enough images for training. You uploaded ${trainImages.length}, but at least 5 images are required.`,
            });
          }
        })
        .on('error', (err) => {
          console.error('Error processing video:', err);
          return res.status(500).json({ message: 'Error processing video' });
        })
        .save(path.join(framesDir, 'frame-%03d.png'));
    } catch (error) {
      console.error('Error handling upload:', error);
      return res.status(500).json({ message: 'Error uploading video', error });
    }
  },
};

module.exports = trainController;
