//https://www.codehim.com/vanilla-javascript/javascript-color-wheel-picker/

import { makeHSL } from './tree_painter_utils.js'

/**
 *
 * @param {any} id
 * @param {HSLColour} colour
 * @param {HTMLElement} pickerDiv
 * @return {{colour: *, pickerDiv: HTMLElement}}
 */
export function makeColourPicker(id, colour, pickerDiv) {

    const size = 256
    let image = new Image
    let canvasWheel = null
    let ctxWheel = null
    let canvasSlider= null
    let ctxSlider = null
    let sampler = null

    const colorPicker = {
        pickerDiv,
        colour: colour.copy()
    }

    function loadImage() {
        canvasWheel = document.getElementById("pickerCanvas" + id)
        canvasWheel.width = size
        canvasWheel.height = size
        ctxWheel = canvasWheel.getContext('2d',  { willReadFrequently: true })
        image.src = './include/wheel.png'
        image.onload = () => {
            ctxWheel.drawImage(image, 0, 0, size, size);
        }
    }

    function makeSlider() {
        canvasSlider = document.getElementById("pickerSlider" + id)
        canvasSlider.style.width = 2 * size + "px"
        canvasSlider.style.height = size / 2 + "px"
        canvasSlider.width = 2 * size
        canvasSlider.height = size / 2
        ctxSlider = canvasSlider.getContext('2d',  { willReadFrequently: true })
        sampler = document.getElementById("pickerSampler" + id)
        sampler.style.width = size + "px"
        sampler.style.height = size + "px"
    }

    function updateSamplerAndSlider() {
        sampler.style.backgroundColor = colorPicker.colour.getString()
        const sliderColour = colorPicker.colour.copy()
        sliderColour.l = 50
        const gradient = ctxSlider.createLinearGradient(0, 0, size * 2, 0)
        gradient.addColorStop(0, "white")
        gradient.addColorStop(0.5, sliderColour.getString())
        gradient.addColorStop(1, "black")
        ctxSlider.fillStyle = gradient
        ctxSlider.fillRect(0, 0, 2 * size, size / 2)

        //colorPicker.slider.style.background = 'linear-gradient(90deg, white,' + sliderColour.getString() + ", black)"
    }

    function updateColourFromContext(ctx, ev) {
        if("buttons" in ev && ev.buttons !== 1)
            return
        ev.preventDefault();
        const x = Math.round(ev.offsetX)
        const y = Math.round(ev.offsetY)
        let imageData = ctx.getImageData(x, y, 1, 1);
        const r = imageData.data[0]
        const g = imageData.data[1]
        const b = imageData.data[2]
        colorPicker.colour = makeHSL(0,0,0)
        colorPicker.colour.setFromRGB({r, g, b})
        updateSamplerAndSlider()
    }

    function selectHS(ev) {
        updateColourFromContext(ctxWheel, ev)
    }

    function selectL(ev) {
        updateColourFromContext(ctxSlider, ev)
    }

    colorPicker.init = function () {
        pickerDiv.innerHTML =
            '<div style="display: flex;">' +
                '<div><canvas id="pickerCanvas' + id + '"></canvas></div>' +
                '<div id="pickerSampler' + id + '" class="pickerSampler"></div>' +
            '</div>' +
            '<canvas id="pickerSlider' + id  +'" class="pickerSlider"></canvas>'
        loadImage()
        makeSlider()
        updateSamplerAndSlider()
        canvasWheel.addEventListener("pointerdown", selectHS)
        canvasWheel.addEventListener("pointermove", selectHS)
        canvasSlider.addEventListener("pointerdown", selectL)
        canvasSlider.addEventListener("pointermove", selectL)
    }

    return colorPicker
}