let imageUpload;
let imageWrapper;
let loadedMessage;
let container;
let currentId = null
let btn;
let loadedFaces = []
window.jQuery = window.$ = jQuery;

$(document).on('click', '.searchFace', function (e) {
  getFaces()
});

//if(appParams.currentPage == 'upload.php'){

wp.media.view.Modal.prototype.on('escape', function () {
  btn = null
  // currentId = null
  // loadedFaces = []
  // imageUpload = null
  // imageWrapper = null
  // loadedMessage = null
  // container = imageWrapper
  const url = new URL(window.location);
  url.searchParams.delete('item');
  history.replaceState(null, null, url)
});
wp.media.view.Modal.prototype.on('open', function () {
  if (loadedFaces.length) {
    setTimeout(() => {
      $('.searchFace').html('Search for faces')

    }, 200);
  }
})
imageUpload = document.getElementsByClassName('details-image')
imageWrapper = document.getElementsByClassName('thumbnail-image')[0]
loadedMessage = document.getElementById('attachments-73-userselect')
container = imageWrapper
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
currentId = urlParams.get('item')
btn = $('#searchFace')[0]
async function getFaces() {

  const imageUpload = document.getElementsByClassName('details-image')
  const imageWrapper = document.getElementsByClassName('thumbnail-image')[0]
  const container = imageWrapper
  const faceMatcher = new faceapi.FaceMatcher(loadedFaces, 0.6)
  let image
  let canvas
  // loadedMessage.append('Loaded')
  // imageUpload.addEventListener('loaded', async () => {
  if (image) image.remove()
  if (canvas) canvas.remove()
  let blob = await fetch(imageUpload[0].src).then(r => r.blob());
  image = await faceapi.bufferToImage(blob)
  //    container.append(image)
  canvas = faceapi.createCanvasFromMedia(image)
  canvas.style.position = 'fixed'
  console.log(imageUpload[0].getBoundingClientRect())
  canvas.style.top = imageUpload[0].getBoundingClientRect().y + 'px'
  canvas.style.left = imageUpload[0].getBoundingClientRect().x + 'px'
  canvas.style.width = imageUpload[0].getBoundingClientRect().width + 'px'
  canvas.style.height = imageUpload[0].getBoundingClientRect().height + 'px'
  canvas.classList.add('imageCanvas')
  imageWrapper.append(canvas)
  const displaySize = { width: image.width, height: image.height }
  faceapi.matchDimensions(canvas, displaySize)
  const detections = await faceapi.detectAllFaces(image).withFaceLandmarks().withFaceDescriptors()
  const resizedDetections = faceapi.resizeResults(detections, displaySize)
  const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor))
  let string = ''
  let count = 0
  let tagField = $('#featured_cast .acf-input textarea')
  let currentValue = tagField.val()
  var e = jQuery.Event("keypress", {
    which: 13
  });
  results.forEach((result, i) => {
    const box = resizedDetections[i].detection.box
    const drawBox = new faceapi.draw.DrawBox(box, { label: result.toString(), boxColor: '#D03D8F', lineWidth: 1 })
    drawBox.draw(canvas)
    if (result._label != 'unknown') {
      if (tagField.val().includes(result._label)) {
      } else {
        count++
        tagField.val(tagField.val().concat(tagField.val().length ? ', ' : '', result._label))
      }
    }
    if (i == results.length - 1) {
      $(tagField).change().trigger({ type: 'keypress', which: 13, keyCode: 13 });
    }
  })
}
console.log('loading all faces')
Promise.all([
  faceapi.nets.faceRecognitionNet.loadFromUri(appParams.themeUrl + '/src/js/face-recognition/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri(appParams.themeUrl + '/src/js/face-recognition/models'),
  faceapi.nets.ssdMobilenetv1.loadFromUri(appParams.themeUrl + '/src/js/face-recognition/models')
]).then(loadLabeledImages).then(() => {

  $('.searchFace').html('Search for faces')
})
async function loadLabeledImages() {
  console.log('loading faces')
  const data = await fetch(appParams.siteUrl + '/wp-json/acf/v3/options/face-library').then((data) => data.json());
  const images = await data.acf['face-library']
  
  
  return Promise.all(
    images.map(async label => {
      const descriptions = []
      try {
        const img = await faceapi.fetchImage(label.image.sizes.medium)
        const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
        if (detections != undefined && detections.descriptor != undefined) {
          console.log(label.name)
          descriptions.push(detections.descriptor)
          loadedFaces.push(new faceapi.LabeledFaceDescriptors(label.name, descriptions))
        }
      } catch (error) {
        console.log('face error', error)
      }
    })
  )
}

//}

