/*
TODO:

[.] Brush tool
[ ] Pan/move tool -- move the whole pattern along the chain (or only just selection?)
[ ] Select tool
[ ] Eye dropper tool
[ ] Gradient
[ ] Globally adjust saturation, lightness
[ ] Preview mode for global adjustment
[ ] Other chain display configurations
[ ] Timeline and Keyframes
[x] Undo/Redo
[.] Communication with server
[ ] Allow disabling live server connection
[ ] Split toolbox and toolbar
[ ] Saving selections
[.] Save/load in general -- on server? Locally?
[.] More responsive design
*/

import './iro.min.js'
import { makeToolBox } from './tree_painter_toolbox.js'
import { makeHSL, makePoint } from './tree_painter_utils.js'
document.addEventListener('DOMContentLoaded', start)

/* LED chain */
/**
 *
 * @param {HTMLCanvasElement} canvas
 * @return {{undoQueue: *[], canvas, redoQueue: *[], leds: *[]}}
 */
function makeLedManager(canvas) {

    /* Config */
    const LED_RADIUS = 16
    const LED_SELECT_WIDTH = 2
    const N_LEDS = 200


    const manager = {
        leds: [],
        undoQueue: [],
        redoQueue: [],
        canvas
    }

    function makeLED(index) {
        let led = {
            _canvasPosition: makePoint(),
            _colour: makeHSL(0, 0, 0),
            _index: index,
            selected: false,
            pixelRatio: 1
        }

        led.setPosition = (x,y) => {
            led._canvasPosition.x = x
            led._canvasPosition.y = y
        }
        led.setColour = (c) => { led._colour.update(c) }
        led.setColourRGB = (rgb) => { led._colour.setFromRGB(rgb) }
        led.getColour = () => { return led._colour.copy() }
        led.getColourRGB = () => { return led._colour.getRGB() }
        led.sameColour = (c) => { return led._colour.equal(c) }
        led.distanceSquared = (pt) => { return led._canvasPosition.dsq(pt) }
        led.index = () => { return led._index }
        led.paint = (ctx) => {
            if(led.selected) {
                ctx.fillStyle = led._colour.l > 50 ? "#777" : "#999"
                ctx.beginPath()
                ctx.arc(led._canvasPosition.x, led._canvasPosition.y,
                    (LED_RADIUS + LED_SELECT_WIDTH) * manager.pixelRatio, 0, 2*Math.PI)
                ctx.fill()
            }
            ctx.fillStyle = led._colour.getString()
            ctx.beginPath()
            ctx.arc(led._canvasPosition.x, led._canvasPosition.y, LED_RADIUS * manager.pixelRatio, 0, 2*Math.PI)
            ctx.fill()
        }
        return led
    }

    function getClosestSquared(point) {
        let minDist = 1e9
        let minIndex = 0
        for(let p = 0; p < N_LEDS; p++) {
            const d = manager.leds[p].distanceSquared(point)
            if(d < minDist) {
                minDist = d
                minIndex = p
            }
        }
        return [minDist, minIndex]
    }

    function saveState() {
        const state = new Uint8Array(3 * N_LEDS)
        for(let i = 0; i < N_LEDS; i++) {
            const c = manager.leds[i].getColourRGB()
            state[3*i+0] = c.r
            state[3*i+1] = c.g
            state[3*i+2] = c.b
        }
        return state
    }

    /**
     * Restore state created by saveState
     * @param state {Uint8Array}
     */
    function loadState(state) {
        for(let p = 0; p < N_LEDS; p++) {
            let rgb = {
                r: state[3*p+0],
                g: state[3*p+1],
                b: state[3*p+2]
            }
            manager.leds[p].setColourRGB(rgb)
        }
    }

    /**
     * This implements algorithm described here: https://github.com/zaboople/klonk/blob/master/TheGURQ.md
     * Let's assume that there are states 1,2,3,4,5 and that the user proceeded in the following manner:
     *  1 -> 2 -> 3 -> 4 (undo) 3 (undo) 2 -> 5
     *  The undo queue now should be: 2 3 4 3 2 1
     *  That is, first undo will get me to 2, next to 3, then 4, then back to 3 and so on
     *  Just before the user went from 2 to 5, the undo queue was: 1 and redo queue was: 3 4
     *  In other words, when redo queue is not empty, we have to:
     *      - push there current state
     *      - push there redo queue without the first (i.e. most advanced) state
     *      - push there redo queue reversed
     *      - push current state again
     *  What are we doing, is recreating the undo queue to the latest known state and then pushing enough undo
     *  operations to get the current state
     *
     *  When there is no redo queue, we just save the current state
     */
    function saveUndoRedo() {
        if(manager.redoQueue.length > 0) {
            manager.undoQueue.push(currentState)
            for (let i = manager.redoQueue.length - 1; i > 0; i--) {
                manager.undoQueue.push(manager.redoQueue[i])
            }
            while (manager.redoQueue.length > 0) {
                manager.undoQueue.push(manager.redoQueue.shift())
            }
        }
        manager.undoQueue.push(currentState)
    }


    manager.init = function() {
        for(let l = 0; l < N_LEDS; l++) {
            manager.leds.push(makeLED(l))
        }
        const state = comm.loadLocalState()
        if(state) {
            loadState(state)
        }
    }

    manager.init()
    let currentState = saveState()

    manager.positionLEDs = function(mode) {
        const w = canvas.offsetWidth
        manager.pixelRatio = window.devicePixelRatio

        const LED_X_SPACE = 20 * (1 + (manager.pixelRatio - 1) / 2)
        const LED_Y_SPACE = 30 * (1 + (manager.pixelRatio - 1) / 2)
        const led_radius = LED_RADIUS * manager.pixelRatio
        let calcPosition = (i) => { return [0, 0] }
        if(mode === "LINE_L2R") {
            /*  |  radius
                |  vvv
                |..___c___....___c___..| => width = 22, x_space = 4, radius = 3.5
                |^^
                |x_space /2
            */
            const ledWidth = 2 * led_radius + LED_X_SPACE
            const ledHeight = 2 * led_radius + LED_Y_SPACE
            const effectiveWidth = Math.floor(w / ledWidth) * ledWidth
            calcPosition = (l) => {
                const x = (l * ledWidth) % effectiveWidth + ledWidth / 2
                const y = Math.floor(l * ledWidth/effectiveWidth) * ledHeight + ledHeight / 2
                return [x, y]
            }
            const ledsPerRow = effectiveWidth / ledWidth
            const nRows = Math.ceil(N_LEDS / ledsPerRow)
            const h = nRows * ledHeight
            manager.canvas.width = effectiveWidth
            manager.canvas.height = h
            manager.canvas.style.width = effectiveWidth + "px"
            console.log("w", effectiveWidth, "h", h,
                "led distance^2", (ledWidth + ledHeight) * (ledWidth + ledHeight) / 4, "radius^2",  led_radius * led_radius)
        }
        else {
            console.log("Positioning not implemented " + mode)
        }
        for(let l = 0; l < N_LEDS; l++) {
            manager.leds[l].setPosition(...calcPosition(l))
        }
    }

    function getLED(point, pointWidth) {
        let [distance, index] = getClosestSquared(point)
        const touchWidth = pointWidth * manager.pixelRatio
        const led_radius = LED_RADIUS * manager.pixelRatio
        console.log(distance, index, (led_radius + touchWidth) * (led_radius + touchWidth))
        if(distance < (led_radius + touchWidth) * (led_radius + touchWidth)) {
            return index
        }
        return -1
    }

    manager.setColour = function(point, pointWidth, colour) {
        const index = getLED(point, pointWidth)
        if(index > -1 && !manager.leds[index].sameColour(colour)) {
            saveUndoRedo()
            manager.leds[index].setColour(colour)
            currentState = saveState()
            comm.transmitState(currentState)
        }
    }

    manager.getColour = function(point, pointWidth, colour) {
        const index = getLED(point, pointWidth)
        if(index > -1&& !manager.leds[index].sameColour(colour)) {
            return manager.leds[index].getColour()
        }
        return null
    }

    manager.selectLed = function (point, pointWidth) {
        const index = getLED(point, pointWidth)
        if(index > -1) {
            manager.leds[index].selected = true
        }
    }

    manager.undoStep = function() {
        if(manager.undoQueue.length === 0)
            return
        manager.redoQueue.push(currentState)
        currentState = manager.undoQueue.pop()
        loadState(currentState)
    }

    manager.redoStep = function () {
        if(manager.redoQueue.length === 0)
            return
        manager.undoQueue.push(currentState)
        currentState = manager.redoQueue.pop()
        loadState(currentState)
    }

    manager.getStateBase64 = () => {
        const binString = String.fromCodePoint(...currentState);
        return btoa(binString)
    }

    manager.paintCanvas = () => {
        //const canvas = document.getElementById("treeCanvas")
        const ctx = manager.canvas.getContext("2d");
        ctx.fillStyle = "#FFF"
        ctx.fillRect(0, 0, manager.canvas.width, manager.canvas.height)
        for(let l = 0; l < N_LEDS; l++) {
            manager.leds[l].paint(ctx)
        }
    }

    return manager
}

function makeCommunicator() {
    const UPDATE_INTERVAL = 250 //ms

    function saveLocally() {
        console.log("saving locally")
        localStorage.setItem("state", String.fromCodePoint(...lastState))
    }

    function sendToServer() {
        // /msg/set?<base64 encoded state>
        const msg = "/msg/set?" + btoa(String.fromCodePoint(...lastState))
        fetch( msg, {
            method: 'GET',
        })
        .then(response => response.json())
        .then(data => {
            if(data.result !== "ok") {
                alert("Error sending state to sever")
            }
            else {
                console.log("State sent to server")
            }
        }).catch((error) => {
            alert('Error:' + error);
        });
    }

    function saveState() {
        saveLocally()
        sendToServer()
        updateQueued = false
        lastUpdate = Date.now()
    }

    function loadLocally() {
        console.log("Attempting to read state from local storage")
        const binString = localStorage.getItem("state")
        if(binString) {
            console.log("State found in local storage")
            return Uint8Array.from(binString, (m) => m.codePointAt(0));
        }
        return null
    }

    let lastUpdate = 0
    let lastState
    let updateQueued = false

    const comm = {
        transmitState: (state) => {
            const now = Date.now()
            lastState = state
            if(now - lastUpdate > UPDATE_INTERVAL && !updateQueued) { //we can save now
                saveState()
                console.log("Saved immediately")
            }
            else if(!updateQueued) {
                updateQueued = true
                setTimeout(saveState, UPDATE_INTERVAL - (now - lastUpdate))
                console.log("queueing update")
            }
            else {
                console.log("update already queued")
            }
        },
        loadLocalState: () => { return loadLocally() }
    }
    return comm
}

const comm = makeCommunicator()
const leds = makeLedManager(document.getElementById("treeCanvas"))

function start() {
    const toolbox = makeToolBox(leds)
    leds.positionLEDs('LINE_L2R')
    leds.paintCanvas()
    const logDiv = document.getElementById("log")
    logDiv.innerHTML += "<p>pixel ratio " + window.devicePixelRatio + "</p>"
    logDiv.innerHTML += "<p>canvas width " + document.getElementById("treeCanvas").offsetWidth + "</p>"
}
