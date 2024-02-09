const faceapi = require('@vladmandic/face-api');
const express = require('express')
const path = require('node:path');
const fetch = require('cross-fetch');
//const request = require('request');
const canvas = require("canvas");
const urllib = require('urllib')
//const tf = require('@tensorflow/tfjs');
var cors = require('cors')
// const https = require('https');
const http = require('http');
const fs = require('fs');
const base64 = require('node-base64-image')
const savedData = require("./savedFaceSearch.json");
const { cos, image } = require('@tensorflow/tfjs');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
//require('@tensorflow/tfjs-node');
const app = express()
let port = process.env.PORT || 3000
app.use(cors())
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
  }
});
let hasErrors = false
server.listen(port, () => {
  console.log('listening on *:' + port);
});
io.on('connection', async (socket) => {
  console.log('connected... Hello!')
  socket.on('disconnect', function (event) {
    console.log('disconnected... Bye!')
    let data = [{ error: 'disconnected' }]
    var wstream = fs.createWriteStream('errorLog.json');
    wstream.write(JSON.stringify(data));
    wstream.end();
  })
  socket.on("updateFaces", async (from) => {
    console.log('INCOMING REQUEST FROM: ' + from.from)
    faceapi.tf.engine().startScope();
    await faceapi.nets.faceRecognitionNet.loadFromDisk(path.join(__dirname, 'models'));
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(path.join(__dirname, 'models'));
    await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(path.join(__dirname, 'models'));
    let url = from.from
    let allFaceData = []
    const data = await fetch(url + '/wp-json/acf/v3/options/face-library').then((data) => data.json());
    const images = await data.acf['face-library']
    let total = 0
    socket.emit("totalFaces", images.length - 1);
    socket.emit("countDown", images.length - 1);
    let countdown = images.length
    socket.on("received", async (i) => {
      if (countdown > 0) {
        console.log('processing!' + countdown)
        countdown--
        let label = images[countdown]
        if (label.image.filesize > 0 && label.image.mime_type == 'image/jpeg') {
          canvas.loadImage(label.image.url).then(async (img) => {
            console.log(img)
            const detections = await faceapi.detectSingleFace(img).withFaceLandmarks(true).withFaceDescriptor()
            if (detections != undefined && detections.descriptor != undefined && label.name != undefined) {
              let descriptions = []

              descriptions.push(detections.descriptor)
              allFaceData.push(new faceapi.LabeledFaceDescriptors(label.name, descriptions));
            } else {
              socket.emit('warningMessage', `Can't process ` + label.image.filename)
            }
          }).catch((er) => {
            socket.emit('errorMessage', `Can't load ` + label.image.filename)

          }).then(() => {
            socket.emit('countDown', countdown)
          }).catch((er) => {
            //socket('errorMessage', `Can't load ` + label.filename)
            console.log(er)
          })
        }
      }
      else {

        ProcessFaceData(allFaceData, socket)
      }
    })
  })
});
async function ProcessFaceData(labeledFaceDescriptors, socket) {
  let filtered = []
  labeledFaceDescriptors.forEach(face => {
    if (face != undefined) {
      console.log(face._label)
      filtered.push(face)
    }
  });

  // faceapi.tf.engine().endScope();
  hasErrors = false
  console.log('all done!')
  socket.emit("complete", true);
  setTimeout(() => {
    saveToFile(filtered)
  }, 1000);
}
app.get('/seedata', async (req, res) => {

  let data = await savedData
  // fetch file details
  await fs.stat("./savedFaceSearch.json", (err, stats) => {
    if (err) {
      console.log(err)
      throw err;
    }
    var event = new Date(stats.mtime);
    let date = { lastModified: event.toLocaleString('en-GB', { timeZone: 'Europe/London' }) }
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify([date, ...data]));
  });


})
// FIND FACES
app.get('/find', async (req, res) => {
  faceapi.tf.engine().startScope();
  const url = req.query.imgUrl
  const format = url.split('.').pop()


  if (format == 'jpg' || format == 'jpeg') {
    // if memory leak continiues. try moving these models out of function
    let faceRecognitionNet = await faceapi.nets.faceRecognitionNet.loadFromDisk(path.join(__dirname, 'models'));
    let ssdMobilenetv1 = await faceapi.nets.ssdMobilenetv1.loadFromDisk(path.join(__dirname, 'models'));
    let faceLandmark68TinyNet = await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(path.join(__dirname, 'models'));
    let data = await savedData
    const image = await canvas.loadImage(url);
    let content = data
    const labeledFaceDescriptors = await Promise.all(content.map(className => {
      if (className) {
        const descriptors = [];
        for (var i = 0; i < className.descriptors.length; i++) {
          descriptors.push(new Float32Array(className.descriptors[i]));
        }
        return new faceapi.LabeledFaceDescriptors(className.label, descriptors);
      }
    }))
    const faceMatcher = new faceapi.FaceMatcher(
      labeledFaceDescriptors.filter(x => x != undefined)
    );
    const displaySize = { width: image.width, height: image.height }
    let faceDetectorOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    faceapi.matchDimensions(canvas, displaySize)
    const detections = await faceapi.detectAllFaces(image, faceDetectorOptions).withFaceLandmarks(true).withFaceDescriptors()
    const resizedDetections = await faceapi.resizeResults(detections, displaySize)
    const results = await resizedDetections.map((d) => faceMatcher.findBestMatch(d.descriptor))
    console.log('found:' + results)
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(results));
    faceapi.tf.engine().endScope();
  } else {
    res.send(false);
    res.end();
  }
})

async function saveToFile(data) {
  var wstream = fs.createWriteStream('savedFaceSearch.json');
  wstream.write(JSON.stringify(data));
  wstream.end();
}


// Search page functonality 
app.get('/search-shows', async (req, res) => {
  let searchedShows = []
  let searchedImages = []
  let searchedEpisodes = []
  const keyword = req.query.keyword ? req.query.keyword.toLowerCase() : ''
  let url = 'https://press.limepictures.com'
  console.log('Searching for:' + keyword)
  let shows = await fetch(url + '/wp-json/wp/v2/shows?_embed&_fields=title.rendered,acf.epsodes,acf.epsodes').then((data) => data.json()).catch((error) => {
    console.error(error);
  });
  if (shows)
    searchedShows = [...searchedShows, ...shows.filter(x => x.title.rendered.toLowerCase().includes(keyword))]
  searchedShows.forEach((x) => {
    x.acf.epsodes.forEach((y) => {
      y.episode['show'] = x.title.rendered
      y.episode['url'] = x.link
      searchedEpisodes.push({ episode_image: y.episode.episode_image.sizes?.medium_large, url: y.episode.url, series: y.episode.series, episode_title: y.episode.episode_title, episode_number: y.episode.episode_number })
      let images = y.episode.images
      if (images)
        images.forEach((z) => {
          searchedImages.push({ id: z['id'], episode: y.episode.episode_title, thumb: z['sizes']['medium_large'] ? ['sizes']['medium_large'] : '', show: y.episode.show, episode_number: y.episode.episode_number })
        })
    })
  })

  let searchedShowsFiltered = searchedShows.map(({ title, _embedded, link }) => ({ title, _embedded, link }));
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ episodes: searchedEpisodes, shows: searchedShowsFiltered, images: searchedImages }));
})

