/*
TODO:

[x] Brush tool -- add respect selection
[x] Pan/move tool -- move the whole pattern along the chain (or only just selection?)
[x] Select tool
[x] Eye dropper tool
[x] Gradient
[x] Globally adjust saturation, lightness
[x] Preview mode for global adjustment
[x] Other chain display configurations
[-] Timeline and Keyframes
[x] Animation modes
[x] Undo/Redo
[x] Communication with server
[x] Allow disabling live server connection
[x] Split toolbox and toolbar
[x] Saving selections
[x] Save/load in general -- on server? Locally?
[.] More responsive design
[x] Toolbox & toolbar position: sticky
[ ] Allow upload of 16 x 16 PNG images
[x] Multiplayer -- selective update of only changed data -- on server
Bugs:
[x] warn when folder name not filled in
[ ] move thumbnail making code to ledManager
[ ] split ledManager and communicator to separate modules
[ ] undo should transmit state
[x] allow load from other folders
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
    const sizeConfig = [
        { LED_RADIUS: 16, LED_X_SPACE: 12, LED_Y_SPACE: 20, LED_SELECT_WIDTH: 3 },
        { LED_RADIUS: 11, LED_X_SPACE: 8, LED_Y_SPACE: 12, LED_SELECT_WIDTH: 2 }
    ]
    const LED_RADIUS = 16
    const LED_SELECT_WIDTH = 3
    const N_LEDS = 200

    const _undoQueue = []
    const _redoQueue = []
    let _isSelection = false
    const _leds = []
    let _weakSave = null
    let _weakSelectionSave = null
    let _positionMode = ""
    let _activeConfig = 0

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
                    (sizeConfig[_activeConfig].LED_RADIUS + sizeConfig[_activeConfig].LED_SELECT_WIDTH) * manager.pixelRatio, 0, 2*Math.PI)
                ctx.fill()
            }
            ctx.fillStyle = led._colour.getString()
            ctx.beginPath()
            ctx.arc(led._canvasPosition.x, led._canvasPosition.y, sizeConfig[_activeConfig].LED_RADIUS * manager.pixelRatio, 0, 2*Math.PI)
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

    function saveSelection() {
        const state = new Uint8Array(N_LEDS)
        for(let i = 0; i < N_LEDS; i++) {
            state[i] = _leds[i].selected
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
     * Load selection state from array
     * @param state {Uint8Array}
     */
    function loadSelection(state) {
        for(let i = 0; i < N_LEDS; i++) {
            _leds[i].selected = state[i]
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
     * @param {boolean} wrap
     * @param {boolean} selectedOnly
     * @param {HSLColour} wrapColor if wrap==false, the colour to assign to leds at the beginning
     */
    function moveColours({amount, wrap = true,
                         selectedOnly = true, wrapColour = makeHSL(0, 0, 0)}) {
        saveUndoRedo()
        selectedOnly &&= _isSelection
        let fromIndex = 0
        let toIndex = N_LEDS - 1
        let dir = +1
        if(amount < 0) {
            let temp = fromIndex
            fromIndex = toIndex
            toIndex = temp
            dir = -1
        }

        // We have to store _amount_ of leds in temp array, so that we can overwrite them with the
        // leds that will move to this position. We copy _amount_ leds at the end, then we move
        // leds in direction opposite to _dir_, i.e. when going right, we start at the right end
        // and copy from left
        /** @type {HSLColour[]} */
        const colourBuff = []
        /**  @type {boolean[]} */
        const selectBuff = []

        // This is copying to the temp array
        if(wrap) {
            for(let i = toIndex - amount + dir; i !== (toIndex + dir); i += dir) {
                colourBuff.push(_leds[i]._colour)
                selectBuff.push(_leds[i].selected)
            }
        }
        else {
            for(let i = 0; i < dir * amount; i++) {
                colourBuff.push(wrapColour.copy())
            }
            selectBuff.push(...Array(dir * amount).fill(false))
        }

        let unmoved = []

        // When we are moving only selected leds, we ideally don't move the
        // unselected leds at all, but sometimes we have to move them out of the
        // way so that the selected ones can move. We store those moved and unselected
        // leds in the _unmoved_ array.
        const moveWithSelectedOnly = (targetIndex, sourceSelected, sourceColour, updateUnmoved=true) => {
            let targetSelected = _leds[targetIndex].selected
            if (sourceSelected && targetSelected) {
                //just copy
                _leds[targetIndex]._colour = sourceColour
            }
            if (sourceSelected && !targetSelected) {
                //save target to unmoved
                //copy
                if(updateUnmoved) unmoved.push(_leds[targetIndex]._colour);
                _leds[targetIndex]._colour = sourceColour
            }
            if (!sourceSelected && targetSelected) {
                //shift unmoved and use it
                _leds[targetIndex]._colour = unmoved.shift()
            }
            if (!sourceSelected && !targetSelected) {
                //do nothing if unmoved is empty
                //otherwise push to unmoved and shift unmoved
                if(unmoved.length > 0) {
                    unmoved.push(_leds[targetIndex]._colour);
                    _leds[targetIndex]._colour = unmoved.shift()
                }
            }
        }

        // When moving selected leds only, we have to check the area we
        // stored in the temp array whether it contains some unmoved leds
        // (i.e. unselected leds that will be replaced by the selected ones)
        if(selectedOnly) {
            for(let i = dir * amount - 1; i >= 0 ; i--) {
                if (selectBuff[i] && !_leds[fromIndex + dir * i].selected) {
                    unmoved.push(_leds[fromIndex + dir * i]._colour)
                }
            }
        }

        // Move all the leds, except the _amount_ toward the _toIndex_
        for(let ledIndex = toIndex; ledIndex !== fromIndex + amount - dir; ledIndex -= dir) {
            if(selectedOnly) {
                moveWithSelectedOnly(ledIndex, _leds[ledIndex - amount].selected, _leds[ledIndex - amount]._colour)
            }
            else {
                _leds[ledIndex]._colour = _leds[ledIndex - amount]._colour
            }
            _leds[ledIndex].selected = _leds[ledIndex - amount].selected
        }
        // Move the _amount_ leds from temp array to the beginning
        for(let i = dir * amount - 1; i >= 0 ; i--) {
            if(selectedOnly) {
                moveWithSelectedOnly(fromIndex + dir * i, selectBuff[i], colourBuff[i], false)
            }
            else {
                _leds[fromIndex + dir * i]._colour = colourBuff[i]
            }
            _leds[fromIndex + dir * i].selected = selectBuff[i]
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
        let steps = toIndex - fromIndex
        const sign = Math.sign(steps)
        steps = Math.abs(steps)
        const hueDelta = (toColour.h - fromColour.h) / steps
        const saturationDelta =  (toColour.s - fromColour.s) / steps
        const lightnessDelta = (toColour.l - fromColour.l) / steps
        for(let i = 0; i <= steps; i++) {
            if(!selectedOnly || _leds[fromIndex + i * sign].selected) {
                _leds[fromIndex + i * sign]._colour.h = fromColour.h + hueDelta * i
                _leds[fromIndex + i * sign]._colour.s = fromColour.s + saturationDelta * i
                _leds[fromIndex + i * sign]._colour.l = fromColour.l + lightnessDelta * i
            }
        }
    }

    function transmitState() {
        _currentState = saveState()
        comm.transmitState(_currentState)
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

    manager.selectSize = function (sizeIndex) {
        if(sizeIndex < sizeConfig.length && sizeIndex >= 0) {
            _activeConfig = sizeIndex
        }
    }

    manager.positionLEDs = function(mode="") {
        const w = canvas.offsetWidth
        manager.pixelRatio = 1 / window.visualViewport.scale //window.devicePixelRatio

        const LED_X_SPACE = sizeConfig[_activeConfig].LED_X_SPACE * manager.pixelRatio
        const LED_Y_SPACE = sizeConfig[_activeConfig].LED_Y_SPACE * manager.pixelRatio
        const LED_RADIUS = sizeConfig[_activeConfig].LED_RADIUS * manager.pixelRatio

        const ledWidth = Math.floor(2 * LED_RADIUS + LED_X_SPACE)
        const ledHeight = Math.floor(2 * LED_RADIUS + LED_Y_SPACE)
        const effectiveWidth = Math.floor(w / ledWidth) * ledWidth
        const ledsPerRow = effectiveWidth / ledWidth
        manager.canvas.width = effectiveWidth
        manager.canvas.style.width = effectiveWidth + "px"
        /* console.log("w", effectiveWidth, "h", h,
            "led distance^2", (ledWidth + ledHeight) * (ledWidth + ledHeight) / 4,
            "radius^2", led_radius * led_radius) */

        let calcPosition = (i) => { return [0, 0] }
        if(mode === "") {
            mode = _positionMode
        }
        switch(mode) {
            case "LINE_L2R":
                /*  |  radius
                    |  vvv
                    |..___c___....___c___..| => width = 22, x_space = 4, radius = 3.5
                    |^^
                    |x_space /2
                */
                calcPosition = (l) => {
                    const x = Math.floor((l * ledWidth) % effectiveWidth + ledWidth / 2)
                    const y = Math.floor(l * ledWidth / effectiveWidth) * ledHeight + ledHeight / 2
                    return [x, y]
                }
                manager.canvas.height = ledHeight * Math.ceil(N_LEDS / ledsPerRow)
                break
            case "LINE_WRAP":
                /*  - 0 1 2    all leds are shifted by 1, so that 0th led needs not to be shifted up
                            3
                      6 5 4
                    7
                      8 9 ... odd rows are left to right, even are right to left, first and last led is offset down by half row
                 because of that we can fit only (ledsPerRow - 1) leds
                 */
                calcPosition = (l) => {
                    let ll = l + 1
                    const row = Math.floor(ll / (ledsPerRow - 1))
                    ll += row
                    const col = (row % 2 === 0) ? ll % ledsPerRow : ledsPerRow - (ll % ledsPerRow) - 1
                    const x = col * ledWidth + ledWidth / 2
                    const y = row * ledHeight + ledHeight / 2 - ((col === 0 || col === ledsPerRow - 1) ? ledHeight / 2 : 0)
                    return [x, y]
                }
                manager.canvas.height = ledHeight * Math.ceil((N_LEDS + 1) / (ledsPerRow - 1))
                break
            default:
                console.log("Positioning not implemented " + mode)
        }
        for(let l = 0; l < N_LEDS; l++) {
            _leds[l].setPosition(...calcPosition(l))
        }
        _positionMode = mode
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
        const led_radius = sizeConfig[_activeConfig].LED_RADIUS * manager.pixelRatio
        //console.log(distance, index, (led_radius + touchWidth) * (led_radius + touchWidth))
        if(ignoreRadius || distance < (led_radius + touchWidth) * (led_radius + touchWidth)) {
            return index
        }
        return -1
    }

    manager.setColour = function(point, pointWidth, colour, selectedOnly=true) {
        selectedOnly &&= _isSelection
        const index = getLED(point, pointWidth)
        console.log(index)
        if(index > -1 && !_leds[index].sameColour(colour) && (!selectedOnly || _leds[index].selected)) {
            saveUndoRedo()
            _leds[index].setColour(colour)
            transmitState()
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
            loadSelection(_weakSelectionSave)
        } else {
            _weakSave = saveState()
            _weakSelectionSave = saveSelection()
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

    manager.fill = function (colour) {
        paintLeds(0, N_LEDS - 1, colour)
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
        transmitState()
    }

    manager.getStateBase64 = () => {
        const binString = String.fromCodePoint(..._currentState);
        return btoa(binString)
    }

    manager.loadFromState = function(state) {
        saveUndoRedo()
        loadState(state)
        transmitState()
    }

    manager.setFromState = function (state) {
        loadState(state)
    }

    manager.saveToServer = function (folder, file_name) {
        const state = saveState()
        comm.saveToServer(folder, file_name, state)
    }

    manager.paintCanvas = () => {
        //const canvas = document.getElementById("treeCanvas")
        const ctx = manager.canvas.getContext("2d");
        ctx.fillStyle = "#888"
        ctx.fillRect(0, 0, manager.canvas.width, manager.canvas.height)
        for(let l = 0; l < N_LEDS; l++) {
            _leds[l].paint(ctx)
        }
    }

    manager.setAnimation = function (mode, speed) {
        comm.setAnimation(mode, speed)
    }

    manager.n_leds = function ()  {
        return N_LEDS
    }

    return manager
}

function makeCommunicator() {
    const UPDATE_INTERVAL = 250 //ms
    let folderName = ""

    function saveLocally() {
        console.log("saving locally")
        localStorage.setItem("state", String.fromCodePoint(...lastState))
    }

    function sendToServer({ action='set', folder='', fileName='', state=null,
                            mode=0, speed=0, callback=(x)=>{} } = {}) {
        if(!isLive && action === "set")
            return

        // /msg/set?<base64 encoded state>
        // /save?save_as&folder=<folder>&name=<name>&state=<base64encoded state>
        // /save?get_names&folder=<folder> -> get save names for folder
        let msg = ""
        switch (action) {
            case 'set':
                msg = "/paint?state=" + btoa(String.fromCodePoint(...lastState))
                break
            case 'get':
                msg = "/paint"
                break
            case "save":
                msg = "/save?save_as&folder=" + folder + "&name=" + fileName + "&state=" + btoa(String.fromCodePoint(...state))
                break
            case "names":
                msg = "/save?get_names&folder=" +folder
                break
            case "load":
                msg = "/save?load&folder=" +folder
                break
            case "anim":
                msg = "/msg/anim?" + mode + "=" + speed
                break
            default:
                console.log("Unknown action " + action)
                return
        }
        fetch( msg, {
            method: 'GET',
        })
        .then(response => response.json())
        .then(data => {
            if(data.result !== "ok") {
                console.log("Error sending state to sever")
            }
            else {
                console.log("State sent to server")
                callback(data)
            }
        }).catch((error) => {
            console.log('Error:' + error);
        });
    }

    function updateLeds(data) {
        if(data.hasOwnProperty("state")) {
            const binString = atob(data.state);
            ledsManger.setFromState(Uint8Array.from(binString, (m) => m.codePointAt(0)))
            requestAnimationFrame(ledsManger.paintCanvas)
        }
    }

    function saveState() {
        saveLocally()
        sendToServer({ callback: updateLeds })
        updateQueued = false
        lastUpdate = Date.now()
    }

    function loadLocally() {
        console.log("Attempting to read state from local storage")
        const sFolder = localStorage.getItem("folder")
        if(sFolder !== "undefined") {
            folderName = sFolder
        }
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
    let isLive = true

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
        loadLocalState: () => { return loadLocally() },
        setLiveConnection: (value) => { isLive = value },
        saveToServer: (folder, fileName, state) => { sendToServer({ action:'save', folder, fileName, state }) },
        getFileNameCandidates: (folder, callback) => { sendToServer({ action: 'names', folder, callback }) },
        getFolderName: () => { return folderName },
        setFolderName: (s) => { folderName = s; localStorage.setItem("folder", s); console.log(s) },
        loadSaves: (folder, callback) => { sendToServer({ action: "load", folder, callback }) },
        loadCurrentState: () => { sendToServer({action: "get", callback: updateLeds})},
        setAnimation: (mode, speed) => { sendToServer({action: "anim", mode, speed}) }
    }
    return comm
}

const comm = makeCommunicator()
const ledsManger = makeLedManager(document.getElementById("treeCanvas"))


/*
function testLedMovement() {
    const m = (c, s) => {
        return {
            _colour: c,
            selected: s
        }
    }

    let fromIndex = 0
    let toIndex = 9
    let _leds = Array(toIndex + 1).fill(0).map((v, i) => m(i, false))
    _leds[4].selected = true
    _leds[5].selected = true
    _leds[6].selected = true

    console.log(_leds.reduce((acc, l) => acc + (l.selected ? ">" + l._colour : " " + l._colour), ""))

    let amount = -5
    let wrap = true
    let selectedOnly = true

    let dir = +1
    if(amount < 0) {
        let temp = fromIndex
        fromIndex = toIndex
        toIndex = temp
        dir = -1
    }

    // We have to store _amount_ of leds in temp array, so that we can overwrite them with the
    // leds that will move to this position. We copy _amount_ leds at the end, then we move
    // leds in direction opposite to _dir_, i.e. when going right, we start at the right end
    // and copy from left
    const colourBuff = []
    const selectBuff = []

    // This is copying to the temp array
    if(wrap) {
        for(let i = toIndex - amount + dir; i !== (toIndex + dir); i += dir) {
            colourBuff.push(_leds[i]._colour)  //position in buffer is ledIndex - fromIndex
            selectBuff.push(_leds[i].selected)
        }
    }
    else {
        for(let i = 0; i < dir * amount; i++) {
            //colourBuff.push(wrapColour.copy())
            colourBuff.push('W')
        }
        selectBuff.push(...Array(dir * amount).fill(false))
    }

    let unmoved = []

    // When we are moving only selected leds, we ideally don't move the
    // unselected leds at all, but sometimes we have to move them out of the
    // way so that the selected ones can move. We store those moved and unselected
    // leds in the _unmoved_ array.
    const moveWithSelectedOnly = (targetIndex, sourceSelected, sourceColour, updateUnmoved=true) => {
        let targetSelected = _leds[targetIndex].selected
        if (sourceSelected && targetSelected) {
            //just copy
            _leds[targetIndex]._colour = sourceColour
        }
        if (sourceSelected && !targetSelected) {
            //save target to unmoved
            //copy
            if(updateUnmoved) unmoved.push(_leds[targetIndex]._colour);
            _leds[targetIndex]._colour = sourceColour
        }
        if (!sourceSelected && targetSelected) {
            //shift unmoved and use it
            _leds[targetIndex]._colour = unmoved.shift()
        }
        if (!sourceSelected && !targetSelected) {
            //do nothing if unmoved is empty
            //otherwise push to unmoved and shift unmoved
            if(unmoved.length > 0) {
                unmoved.push(_leds[targetIndex]._colour);
                _leds[targetIndex]._colour = unmoved.shift()
            }
        }
    }

    // When moving selected leds only, we have to check the area we
    // stored in the temp array whether it contains some unmoved leds
    // (i.e. unselected leds that will be replaced by the selected ones)
    if(selectedOnly) {
        for(let i = dir * amount - 1; i >= 0 ; i--) {
            if (selectBuff[i] && !_leds[fromIndex + dir * i].selected) {
                unmoved.push(_leds[fromIndex + dir * i]._colour)
            }
        }
    }

    // Move all the leds, except the _amount_ toward the _toIndex_
    for(let ledIndex = toIndex; ledIndex !== fromIndex + amount - dir; ledIndex -= dir) {
        if(selectedOnly) {
            moveWithSelectedOnly(ledIndex, _leds[ledIndex - amount].selected, _leds[ledIndex - amount]._colour)
        }
        else {
            _leds[ledIndex]._colour = _leds[ledIndex - amount]._colour
        }
        _leds[ledIndex].selected = _leds[ledIndex - amount].selected
    }
    // Move the _amount_ leds from temp array to the beginning
    for(let i = dir * amount - 1; i >= 0 ; i--) {
        if(selectedOnly) {
            moveWithSelectedOnly(fromIndex + dir * i, selectBuff[i], colourBuff[i], false)
        }
        else {
            _leds[fromIndex + dir * i]._colour = colourBuff[i]
        }
        _leds[fromIndex + dir * i].selected = selectBuff[i]
    }
    console.log(_leds.reduce((acc, l) => acc + (l.isSelected ? ">" + l._colour : " " + l._colour), ""))
}
//*/

function start() {
    const toolbox = makeToolBox(ledsManger, comm)
    document.getElementById("save_folder").addEventListener("change", (ev) => {
        comm.setFolderName(ev.target.value)
    }) 
    //ledsManger.positionLEDs('LINE_L2R')
    ledsManger.positionLEDs('LINE_WRAP')
    ledsManger.paintCanvas()
    const logDiv = document.getElementById("log")
    logDiv.innerHTML += "<p>pixel ratio " + window.devicePixelRatio + "</p>"
    logDiv.innerHTML += "<p>Window innerWidth " + window.innerWidth + "</p>"
    logDiv.innerHTML += "<p>Viewport width " + window.visualViewport.width + "</p>"
    logDiv.innerHTML += "<p>Viewport scale " + window.visualViewport.scale + "</p>"
    logDiv.innerHTML += "<p>canvas width " + document.getElementById("treeCanvas").offsetWidth + "</p>"
    //testLedMovement()
}
