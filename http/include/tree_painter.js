/*
TODO:

[.] Brush tool -- add respect selection
[x] Pan/move tool -- move the whole pattern along the chain (or only just selection?)
[ ] Select tool
[x] Eye dropper tool
[ ] Gradient
[x] Globally adjust saturation, lightness
[-] Preview mode for global adjustment
[ ] Other chain display configurations
[ ] Timeline and Keyframes
[x] Undo/Redo
[.] Communication with server
[ ] Allow disabling live server connection
[x] Split toolbox and toolbar
[ ] Saving selections
[.] Save/load in general -- on server? Locally?
[.] More responsive design
[x] Toolbox & toolbar position: sticky
*/

import './iro.min.js'
import { makeToolBox } from './tree_painter_toolbox.js'
import { makeHSL, makePoint } from './tree_painter_utils.js'
document.addEventListener('DOMContentLoaded', start)

/* LED chain */
/**
 *
 * @param {HTMLCanvasElement} canvas
 * @return {{canvas}}
 */
function makeLedManager(canvas) {

    /* Config */
    const LED_RADIUS = 16
    const LED_SELECT_WIDTH = 3
    const N_LEDS = 200

    const _undoQueue = []
    const _redoQueue = []
    let _isSelection = false
    const _leds = []
    let _weakSave = null

    const manager = {
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
                ctx.fillStyle = led._colour.l > 50 ? "#993333" : "#cc6666"
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
            const d = _leds[p].distanceSquared(point)
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
            const c = _leds[i].getColourRGB()
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
            _leds[p].setColourRGB(rgb)
        }
    }

    /**
     * This implements algorithm described here: https://github.com/zaboople/klonk/blob/master/TheGURQ.md
     * Let's assume that there are states 1,2,3,4,5 and that the user proceeded in the following manner:
     *  1 -> 2 -> 3 -> 4 (undo) 3 (undo) 2 -> 5
     *  The undo queue now should be: 2 3 4 3 2 1
     *  That is, first undo will get me to 2, next to 3, then 4, then back to 3 and so on
     *  Just before the user went from 2 to 5, the undo queue was: 1 and redo queue was: 3 4
     *  In other words, when redo queue is not empty, we have to push to the undo queue:
     *      - current state
     *      - redo queue without the first (i.e. most advanced) state
     *      - redo queue reversed
     *      - current state again
     *  What are we doing, is recreating the undo queue to the latest known state and then pushing enough undo
     *  operations to get the current state
     *
     *  When there is no redo queue, we just save the current state
     */
    function saveUndoRedo() {
        if(_redoQueue.length > 0) {
            _undoQueue.push(_currentState)
            for (let i = _redoQueue.length - 1; i > 0; i--) {
                _undoQueue.push(_redoQueue[i])
            }
            while (_redoQueue.length > 0) {
                _undoQueue.push(_redoQueue.shift())
            }
        }
        _undoQueue.push(_currentState)
    }

    /**
     *                     selection:      _ _   _   _
     *                         start:  0 1 2 3 4 5 6 7 8 9
     *  From = 0, to = 9, amount = 2:  8 9 0 1 2 3 4 5 6 7  -- wrap=true, selectedOnly=false
     *  From = 1, to = 5, amount = 2:  0 4 5 1 2 3 6 7 8 9  -- wrap=true, selectedOnly=false
     *  From = 1, to = 9, amount = 1:  0 1 4 2 3 6 5 8 7 9  -- wrap=true, selectedOnly=true
     *                                       ^ ^   ^   ^       selection moves as well
     *                                 0 1 4 6 2 3 8 5 9 7
     *                                         ^ ^   ^   ^

                             selection:      _ _   _   _
                                 start:  0 1 2 3 4 5 6 7 8 9
                                                           9  unmoved = []
                                                         7 9  unmoved = [8]
                                                       8 7 9  unmoved = []
                                                     5 8 7 9  unmoved = [6]
                                                   6 5 8 7 9  unmoved = []
                                                 3 6 5 8 7 9  unmoved = [4], etc.
          From = 1, to = 9, amount = 1:  0 1 4 2 3 6 5 8 7 9  -- wrap=true, selectedOnly=true

     * @param {number} amount
     * @param {number} fromIndex
     * @param {number} toIndex
     * @param {boolean} wrap
     * @param {boolean} selectedOnly
     * @param {HSLColour} wrapColor if wrap==false, the colour to assign to leds at the beginning
     */
    function moveColours({amount, fromIndex = 0, toIndex = N_LEDS, wrap = true,
                         selectedOnly = true, wrapColour = makeHSL(0, 0, 0)}) {
        saveUndoRedo()
        selectedOnly &&= _isSelection
        if(amount < 0) {
            amount += N_LEDS
        }

        /** @type {HSLColour[]} */
        const colourBuff = []
        /**  @type {boolean[]} */
        const selectBuff = []
        // 0 1 2 3 4 5 6; from = 2, to = 5, amount = 2 => buff = [3, 4]
        // 0 1 3 4 2 5 6; ledIndex = 4 -> leds[2], ledIndex = 3 -> buff[1], ledIndex = 2 -> buff[0]
        if(wrap) {
            for(let i = toIndex - amount; i < toIndex; i++) {
                colourBuff.push(_leds[i]._colour)  //position in buffer is ledIndex - fromIndex
                selectBuff.push(_leds[i].selected)
            }
        }
        else {
            colourBuff.concat(Array(amount).fill(wrapColour))
            selectBuff.concat(Array(amount).fill(false))
        }

        /** @type {HSLColour[]} */
        const unmoved = []
        let ledIndex = toIndex - 1
        while(ledIndex >= fromIndex) {
            const sourceSelected = !selectedOnly || ((ledIndex - amount >= fromIndex) ?
                _leds[ledIndex - amount].selected : selectBuff[ledIndex - fromIndex])
            const selfSelected = !selectedOnly || _leds[ledIndex].selected
            if(sourceSelected) {
                if(!selfSelected) {
                    unmoved.push(_leds[ledIndex]._colour)
                }
                _leds[ledIndex]._colour = (ledIndex - amount >= fromIndex) ?
                    _leds[ledIndex - amount]._colour : colourBuff[ledIndex - fromIndex]
            }
            else {
                if(selfSelected) {
                    _leds[ledIndex]._colour = (unmoved.length > 0) ? unmoved.pop() : _leds[fromIndex]._colour
                }
            }
            _leds[ledIndex].selected = (ledIndex - amount >= fromIndex) ?
                _leds[ledIndex - amount].selected : selectBuff[ledIndex - fromIndex]
            ledIndex--
        }
    }

    function shiftLedsHLS(amount, selectedOnly, shiftFunction) {
        selectedOnly &&= _isSelection
        for(let i = 0; i < N_LEDS; i++) {
            if(!selectedOnly || _leds[i].selected) {
                shiftFunction(i, amount)
            }
        }
    }

    function paintLeds(fromIndex, toIndex, colour, selectedOnly=true) {
        selectedOnly &&= _isSelection
        fromIndex = Math.max(0, fromIndex)
        toIndex = Math.min(N_LEDS - 1, toIndex)
        for(let i = fromIndex; i <= toIndex; i++) {
            if(!selectedOnly || _leds[i].selected) {
                _leds[i]._colour.update(colour)
            }
        }
    }

    /**
     * fromIndex = 0, toIndex = 3 => steps = 3
     * fromColor = 20, toColour = 50 => delta = 10
     * @param {number} fromIndex
     * @param {number} toIndex
     * @param {HSLColour} fromColour
     * @param {HSLColour} toColour
     * @param {boolean} selectedOnly
     */
    function paintGradient(fromIndex, toIndex, fromColour, toColour, selectedOnly=true) {
        selectedOnly &&= _isSelection
        fromIndex = Math.max(0, fromIndex)
        toIndex = Math.min(N_LEDS - 1, toIndex)
        const steps = Math.abs(toIndex - fromIndex)
        const hueDelta = (toColour.h - fromColour.h) / steps
        const saturationDelta =  (toColour.s - fromColour.s) / steps
        const lightnessDelta = (toColour.l - fromColour.l) / steps
        for(let i = 0; i <= steps; i++) {
            if(!selectedOnly || _leds[fromIndex + i].selected) {
                _leds[fromIndex + i]._colour.h = fromColour.h + hueDelta * i
                _leds[fromIndex + i]._colour.s = fromColour.s + saturationDelta * i
                _leds[fromIndex + i]._colour.l = fromColour.l + lightnessDelta * i
            }
        }
    }

    manager.init = function() {
        for(let l = 0; l < N_LEDS; l++) {
            _leds.push(makeLED(l))
        }
        const state = comm.loadLocalState()
        if(state) {
            loadState(state)
        }
    }

    manager.init()
    let _currentState = saveState()

    manager.positionLEDs = function(mode) {
        const w = canvas.offsetWidth
        manager.pixelRatio = 1 / window.visualViewport.scale //window.devicePixelRatio

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
            const ledWidth = Math.floor(2 * led_radius + LED_X_SPACE)
            const ledHeight = Math.floor(2 * led_radius + LED_Y_SPACE)
            const effectiveWidth = Math.floor(w / ledWidth) * ledWidth
            calcPosition = (l) => {
                const x = Math.floor((l * ledWidth) % effectiveWidth + ledWidth / 2)
                const y = Math.floor(l * ledWidth/effectiveWidth) * ledHeight + ledHeight / 2
                return [x, y]
            }
            const ledsPerRow = effectiveWidth / ledWidth
            const nRows = Math.ceil(N_LEDS / ledsPerRow)
            const h = nRows * ledHeight
            manager.canvas.width = effectiveWidth
            manager.canvas.height = h
            manager.canvas.style.width = effectiveWidth + "px"
            /* console.log("w", effectiveWidth, "h", h,
                "led distance^2", (ledWidth + ledHeight) * (ledWidth + ledHeight) / 4,
                "radius^2", led_radius * led_radius) */
        }
        else {
            console.log("Positioning not implemented " + mode)
        }
        for(let l = 0; l < N_LEDS; l++) {
            _leds[l].setPosition(...calcPosition(l))
        }
    }

    /**
     *
     * @param {Point} point
     * @param {number} pointWidth
     * @param {boolean} ignoreRadius if true, returns the closest led, regardless of the led radius and touch width
     * @return {number}
     */
    function getLED(point, pointWidth, ignoreRadius=false) {
        let [distance, index] = getClosestSquared(point)
        const touchWidth = pointWidth * manager.pixelRatio
        const led_radius = LED_RADIUS * manager.pixelRatio
        //console.log(distance, index, (led_radius + touchWidth) * (led_radius + touchWidth))
        if(ignoreRadius || distance < (led_radius + touchWidth) * (led_radius + touchWidth)) {
            return index
        }
        return -1
    }

    manager.setColour = function(point, pointWidth, colour) {
        const index = getLED(point, pointWidth)
        if(index > -1 && !_leds[index].sameColour(colour)) {
            saveUndoRedo()
            _leds[index].setColour(colour)
            _currentState = saveState()
            comm.transmitState(_currentState)
        }
    }

    manager.getColour = function(point, pointWidth) {
        const index = getLED(point, pointWidth)
        if(index > -1) {
            return _leds[index].getColour()
        }
        return null
    }

    manager.selectLed = function (point, pointWidth, addToSelection=true) {
        const index = getLED(point, pointWidth)
        if(index > -1) {
            _leds[index].selected = addToSelection
            if(!addToSelection) { //if subtracting, we have to check if there is any selected led remaining
                _isSelection = false
                for(let i = 0; i < N_LEDS; i++) {
                    if(_leds[i].selected) {
                        _isSelection = true
                        break
                    }
                }
            }
            else {
                _isSelection = true
            }
        }
    }

    manager.selectNone = function () {
        for(let i = 0; i < N_LEDS; i++) {
            _leds[i].selected = false
        }
        _isSelection = false
    }

    manager.unifySelection = function () {
        if(!_isSelection)
            return
        let startIndex = -1
        while(!_leds[++startIndex].selected) {}
        let endIndex = N_LEDS
        while(!_leds[--endIndex].selected) {}
        for(let i = startIndex; i < endIndex; i++) {
            _leds[i].selected = true
        }
    }

    /**
     *
     * @param {Point} pointFrom
     * @param {Point} pointTo
     * @param {number} touchWidth
     * @param {boolean} selectedOnly
     * @param {boolean} wrap
     * @param {HSLColour} wrapColour
     * @return {number}
     */
    manager.move = function (pointFrom, pointTo, touchWidth, selectedOnly, wrap, wrapColour) {
        const fromIndex = getLED(pointFrom, touchWidth, true)
        const toIndex = getLED(pointTo, touchWidth, true)
        const amount = toIndex - fromIndex

        if(amount === 0) {
            return 0
        }
        if(_weakSave !== null) {
            loadState(_weakSave)
        } else {
            _weakSave = saveState()
        }
        moveColours({amount, wrap, selectedOnly, wrapColour})
        return Math.abs(amount)
    }

    /**
     * The behaviour depends on the presence of selection: without selection, only gradient is created between
     * fromPoint and toPoint; with selection, the selected leds before fromPoint get the fromColour, and selected
     * leds after toPoint get toColour
     * @param {Point} pointFrom
     * @param {Point} pointTo
     * @param {number} touchWidth
     * @param {HSLColour} colourFrom
     * @param {HSLColour} colourTo
     * @return {number}
     */
    manager.gradient = function (pointFrom, pointTo, touchWidth, colourFrom, colourTo) {
        const indexFrom = getLED(pointFrom, touchWidth, true)
        const indexTo = getLED(pointTo, touchWidth, true)
        const amount = indexTo - indexFrom

        if(amount === 0) {
            return 0
        }
        if(_weakSave !== null) {
            loadState(_weakSave)
        } else {
            _weakSave = saveState()
        }
        if(_isSelection) {
            paintLeds(0, indexFrom, colourFrom)
            paintLeds(indexTo, N_LEDS - 1, colourTo)
        }
        paintGradient(indexFrom, indexTo, colourFrom, colourTo)
        return Math.abs(amount)
    }

    manager.shiftHue = function (amount, selectedOnly=true) {
        shiftLedsHLS(amount, selectedOnly, (i, amount) => {
            _leds[i]._colour.shiftHue(amount)
        })
    }

    manager.shiftSaturation = function (amount, selectedOnly=true) {
        shiftLedsHLS(amount, selectedOnly, (i, amount) => {
            _leds[i]._colour.shiftSaturation(amount)
        })
    }

    manager.shiftLightness = function (amount, selectedOnly=true) {
        shiftLedsHLS(amount, selectedOnly, (i, amount) => {
            _leds[i]._colour.shiftLightness(amount)
        })
    }

    manager.undoStep = function() {
        //console.log("undo queue " + _undoQueue.length + " redo queue " + _redoQueue.length)
        if(_undoQueue.length === 0)
            return
        _redoQueue.push(_currentState)
        _currentState = _undoQueue.pop()
        loadState(_currentState)
    }

    manager.redoStep = function () {
        if(_redoQueue.length === 0)
            return
        _undoQueue.push(_currentState)
        _currentState = _redoQueue.pop()
        loadState(_currentState)
    }

    manager.applyState = function () {
        _weakSave = null
        saveUndoRedo()
        _currentState = saveState()
        comm.transmitState(_currentState)
    }

    manager.getStateBase64 = () => {
        const binString = String.fromCodePoint(..._currentState);
        return btoa(binString)
    }

    manager.paintCanvas = () => {
        //const canvas = document.getElementById("treeCanvas")
        const ctx = manager.canvas.getContext("2d");
        ctx.fillStyle = "#FFF"
        ctx.fillRect(0, 0, manager.canvas.width, manager.canvas.height)
        for(let l = 0; l < N_LEDS; l++) {
            _leds[l].paint(ctx)
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
const ledsManger = makeLedManager(document.getElementById("treeCanvas"))

function start() {
    const toolbox = makeToolBox(ledsManger)
    ledsManger.positionLEDs('LINE_L2R')
    ledsManger.paintCanvas()
    const logDiv = document.getElementById("log")
    logDiv.innerHTML += "<p>pixel ratio " + window.devicePixelRatio + "</p>"
    logDiv.innerHTML += "<p>Window innerWidth " + window.innerWidth + "</p>"
    logDiv.innerHTML += "<p>Viewport width " + window.visualViewport.width + "</p>"
    logDiv.innerHTML += "<p>Viewport scale " + window.visualViewport.scale + "</p>"
    logDiv.innerHTML += "<p>canvas width " + document.getElementById("treeCanvas").offsetWidth + "</p>"
}
