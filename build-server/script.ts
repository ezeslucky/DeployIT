import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';

const s3Client = new S3Client({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

const PROJECT_ID = process.env.PROJECT_ID || '';

async function init(): Promise<void> {
    console.log('Executing script.ts');
    const outDirPath: string = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout?.on('data', (data: string) => {
        console.log(data.toString());
    });

    p.stderr?.on('data', (data: string) => {
        console.error('Error:', data.toString());
    });

    p.on('close', async () => {
        console.log('Build Complete');
        const distFolderPath: string = path.join(__dirname, 'output', 'dist');

        if (!fs.existsSync(distFolderPath)) {
            console.error('Dist folder does not exist.');
            return;
        }
//@ts-ignore
        const distFolderContents: string[] = fs.readdirSync(distFolderPath, { recursive: true });

        for (const filePath of distFolderContents) {
            const fullPath = path.join(distFolderPath, filePath);
            if (fs.lstatSync(fullPath).isDirectory()) continue;

            console.log('Uploading', filePath);

            const command = new PutObjectCommand({
                Bucket: 'deploy-it-project',
                Key: `__outputs/${PROJECT_ID}/${filePath}`,
                Body: fs.createReadStream(fullPath),
                ContentType: mime.lookup(fullPath) || 'application/octet-stream'
            });

            try {
                await s3Client.send(command);
                console.log('Uploaded', filePath);
            } catch (error) {
                console.error('Upload error:', error);
            }
        }

        console.log('Done...');
    });
}

init();
