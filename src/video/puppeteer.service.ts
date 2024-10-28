import { Injectable, StreamableFile } from '@nestjs/common';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import puppeteer from 'puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import ROG_URL from './ROG_URL.json';

// Enter your storage account name and shared key
const account = process.env.AZURE_BLOB_ACCOUNT;
const accountKey = process.env.AZURE_BLOB_KEY

// Use StorageSharedKeyCredential with storage account and account key
// StorageSharedKeyCredential is only available in Node.js runtime, not in browsers
const sharedKeyCredential = new StorageSharedKeyCredential(account, accountKey);
const blobServiceClient = new BlobServiceClient(
  `https://nestlottiespace.blob.core.windows.net/`,
  sharedKeyCredential,
);

@Injectable()
export class PuppeteerService {
  async exportVideo(opts) {
    const {
      output = '/app/puppeteer/videoPupp.mp4',
      type = 'png',
      animationData = ROG_URL,
      path: animationPath = undefined,
      jpegQuality = 90,
      quiet = false,
      deviceScaleFactor = 1,
      renderer = 'svg',
      rendererSettings = {},
      style = {},
      inject = {},
      puppeteerOptions = {},
      ffmpegOptions = {
        crf: 20,
        profileVideo: 'main',
        preset: 'medium',
      },
      gifskiOptions = {
        quality: 80,
        fast: false,
      },
      progress = undefined,
      frameNumber = 70,
    } = opts;

    let { width = undefined, height = undefined } = opts;

    const lottieData = animationData;
    const fps = ~~lottieData.fr;
    const { w = 640, h = 480 } = lottieData;
    const aR = w / h;

    console.log('fps', fps, animationData.fr);

    if (!(width && height)) {
      if (width) {
        height = width / aR;
      } else if (height) {
        width = height * aR;
      } else {
        width = w;
        height = h;
      }
    }

    width = width | 0;
    height = height | 0;

    const containerName = `puppeteer`;
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const lottieScript = fs.readFileSync(
      require.resolve('lottie-web/build/player/lottie.min'),
      'utf8',
    );
    const injectLottie = `
<script>
  ${lottieScript}
</script>
`;

    const animation = null;

    const html = `
<html>
<head>
  <meta charset="UTF-8">

  ${inject.head || ''}
 ${injectLottie}

  <style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: transparent;

  ${width ? 'width: ' + width + 'px;' : ''}
  ${height ? 'height: ' + height + 'px;' : ''}

  overflow: hidden;
}

#root {
  ${style}
}

  ${inject.style || ''}
  </style>
</head>

<body>
${inject.body || ''}

<div id="root"></div>

<script>
  const animationData = ${JSON.stringify(ROG_URL)}
  
  let duration
  let numFrames

  function onReady () {
    animation = lottie.loadAnimation({
      container: document.getElementById('root'),
      renderer: '${renderer}',
      loop: false,
      autoplay: false,
      rendererSettings: ${JSON.stringify(rendererSettings)},
      animationData
    })

    duration = animation.getDuration()
    numFrames = animation.getDuration(true)

    const div = document.createElement('div')
    div.className = 'ready'
    document.body.appendChild(div)
  }

  document.addEventListener('DOMContentLoaded', onReady)
</script>

</body>
</html>
`;
    console.log('generato il body');

    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome-stable',
      args: ['--no-sandbox'],
      ...puppeteerOptions,
    });
    const page = await browser.newPage();
    console.log('apro il browser');

    await page.setContent(html);
    await page.waitForSelector('.ready');
    const duration = await page.evaluate(() => duration);
    const numFrames = await page.evaluate(() => numFrames);
    console.log('numFrames', numFrames);

    const pageFrame = page.mainFrame();
    const rootHandle = await pageFrame.$('#root');

    if (type === 'png') {
      console.log('frame richiesto', frameNumber);

      await page.evaluate(
        (frame) => animation.goToAndStop(frame, true),
        frameNumber,
      );

      const name = `test_${frameNumber}.png`;
      const tmpFile = path.join('app', 'puppeteer', name);

      console.log('tmp', tmpFile);

      const screenshot = await rootHandle.screenshot({
        path: tmpFile,
        omitBackground: true,
        type: 'png',
      });
      // const blockBlobClient = containerClient.getBlockBlobClient(name);
      // const uploadBlobResponse = await blockBlobClient.uploadData(screenshot);
      // console.log(
      //   `Upload ${name} successfully`,
      //   uploadBlobResponse.requestId,
      //   blockBlobClient.url,
      // );

      await rootHandle.dispose();
      if (opts.browser) {
        await page.close();
      } else {
        await browser.close();
      }
      const file = fs.createReadStream(tmpFile);
      return new StreamableFile(file, {
        type: 'image/png',
        disposition: `attachment; filename="${name}"`,
        // If you want to define the Content-Length value to another value instead of file's length:
        // length: 123,
      });
    } else {
      let ffmpeg;
      let ffmpegStdin;

      const ffmpegP = new Promise<void>((resolve, reject) => {
        const ffmpegArgs = ['-v', 'error', '-stats', '-hide_banner', '-y'];

        let scale = `scale=${width}:-2`;

        if (width % 2 !== 0) {
          if (height % 2 === 0) {
            scale = `scale=-2:${height}`;
          } else {
            scale = `scale=${width + 1}:-2`;
          }
        }

        ffmpegArgs.push(
          '-f',
          'lavfi',
          '-i',
          `color=c=black:size=${width}x${height}`,
          '-f',
          'image2pipe',
          '-c:v',
          'png',
          '-r',
          `${fps}`,
          '-i',
          '-',
          '-filter_complex',
          `[0:v][1:v]overlay[o];[o]${scale}:flags=bicubic[out]`,
          '-map',
          '[out]',
          '-c:v',
          'libx264',
          '-profile:v',
          ffmpegOptions.profileVideo,
          '-preset',
          ffmpegOptions.preset,
          '-crf',
          ffmpegOptions.crf,
          '-movflags',
          'faststart',
          '-pix_fmt',
          'yuv420p',
          '-r',
          `${fps}`,
        );

        ffmpegArgs.push('-frames:v', `${numFrames}`, '-an', output);

        console.log(ffmpegArgs.join(' '));

        ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ffmpegArgs);
        const { stdin, stdout, stderr } = ffmpeg;

        if (!quiet) {
          stdout.pipe(process.stdout);
        }
        stderr.pipe(process.stderr);

        stdin.on('error', (err) => {
          if (err.code !== 'EPIPE') {
            return reject(err);
          }
        });

        ffmpeg.on('exit', async (status) => {
          if (status) {
            return reject(new Error(`FFmpeg exited with status ${status}`));
          } else {
            return resolve();
          }
        });

        ffmpegStdin = stdin;
      });

      for (let frame = 0; frame < numFrames; ++frame) {
        console.log('apro frame', frame);
        await page.evaluate(
          (frame) => animation.goToAndStop(frame, true),
          frame,
        );
        const screenshot = await rootHandle.screenshot({
          omitBackground: true,
          type: 'png',
        });

        if (progress) {
          progress(frame, numFrames);
        }

        // single screenshot

        if (ffmpegStdin.writable) {
          console.log('scrivo', frame);
          ffmpegStdin.write(screenshot);
        }
      }

      await rootHandle.dispose();
      if (opts.browser) {
        await page.close();
      } else {
        await browser.close();
      }

      ffmpegStdin.end();
      await ffmpegP;
      const file = fs.createReadStream(output);

      // const blockBlobClient = containerClient.getBlockBlobClient('video.mp4');
      // const uploadBlobResponse = await blockBlobClient.uploadStream(file);
      // console.log(
      //   `Upload video successfully`,
      //   uploadBlobResponse.requestId,
      //   blockBlobClient.url,
      // );

      return new StreamableFile(file, {
        type: 'video/mp4',
        disposition: `attachment; filename="videoPupp.mp4"`,
      });
    }
  }
}
