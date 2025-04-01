import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';
import Redis from 'ioredis';

const PROJECT_ID: string = process.env.PROJECT_ID || 'default_project_id';
const S3_BUCKET_NAME = 'deploytclone';

const redisUrl = process.env.REDIS_URL || ''; // Load from env
const publisher = new Redis(redisUrl);

const s3Client = new S3Client({
    region: process.env.AWS_REGION || '',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

function publishLog(log: string): void {
    console.log(log);
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

async function uploadFilesToS3(distFolderPath: string, projectId: string) {
    const distFolderContents = fs.readdirSync(distFolderPath, { withFileTypes: true })
        .filter(dirent => !dirent.isDirectory())
        .map(dirent => dirent.name);

    publishLog(`Starting to upload ${distFolderContents.length} files...`);

    const uploadPromises = distFolderContents.map(async (file) => {
        const filePath = path.join(distFolderPath, file);
        if (fs.lstatSync(filePath).isDirectory()) return;

        publishLog(`Uploading ${file}...`);

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `__outputs/${projectId}/${file}`,
            Body: fs.createReadStream(filePath),
            ContentType: mime.lookup(filePath) || undefined
        });

        await s3Client.send(command);
        publishLog(`Uploaded ${file}`);
    });

    await Promise.all(uploadPromises);
    publishLog(`Upload complete.`);
}

async function init(): Promise<void> {
    console.log('Executing script.js');
    publishLog('Build Started...');

    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout?.on('data', (data) => {
        publishLog(data.toString());
    });

    p.stderr?.on('data', (data) => {
        publishLog(`Error: ${data.toString()}`);
    });

    p.on('error', (err) => {
        publishLog(`Exec Error: ${err.message}`);
    });

    p.on('close', async (code) => {
        publishLog(`Build process exited with code ${code}`);

        if (code !== 0) {
            publishLog('Build failed, stopping process.');
            return;
        }

        publishLog('Build Complete. Starting Upload...');
        const distFolderPath = path.join(outDirPath, 'dist');

        await uploadFilesToS3(distFolderPath, PROJECT_ID);

        publishLog('Done.');
        publisher.quit(); // Close Redis connection
    });
}

init();
