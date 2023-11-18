/*
TODO:

[ ] Brush tool
[ ] Pan/move tool -- move the whole pattern along the chain (or only just selection?)
[ ] Select tool
[ ] Eye dropper tool
[ ] Globally adjust saturation, lightness
[ ] Preview mode for global ajustment
[ ] Other chain display configurations
[ ] Timeline and Keyframes
[ ] Undo/Redo

*/
import './iro.min.js'
document.addEventListener('DOMContentLoaded', start)

/* Config */

const LED_RADIUS = 16
const N_LEDS = 200


/* Factories */

function makePoint(x=0, y=0) {
    let point = {
        x: x,
        y: y,
        distanceSquared: (other) => {
            return (other.x - point.x) * (other.x - point.x) + (other.y - point.y) * (other.y - point.y)
        }
    }
    return point
}

function makeHSL(h, s, l) {
    let hsl = {
        h: h,
        s: s,
        l: l,
        update: (other) => {
            hsl.h = other.h
            hsl.s = other.s
            hsl.l = other.l
        },
        copy: () => {
            return makeHSL(hsl.h, hsl.s, hsl.l)
        },
        equal: (other) => {
            return (hsl.h === other.h) && (hsl.s === other.s) && (hsl.l === other.l)
        },
        getString: () => {
            return "hsl(" + hsl.h + " " + hsl.s + "% " + hsl.l + "%)"
        }
    }
    return hsl
}


/* LED chain */

function makeLedManager() {

    function makeLED(index) {
        let led = {
            _canvasPosition: makePoint(),
            _colour: makeHSL(0, 0, 0),
            _index: index,
            setPosition: (x,y) => {
                led._canvasPosition.x = x
                led._canvasPosition.y = y
            },
            setColour: (c) => { led._colour.update(c) },
            getColour: () => { return led._colour.copy() },
            sameColour: (c) => { return led._colour.equal(c) },
            distanceSquared: (pt) => { return led._canvasPosition.distanceSquared(pt) },
            index: () => { return led._index },
            paint: (ctx) => {
                ctx.fillStyle = led._colour.getString()
                ctx.beginPath()
                ctx.arc(led._canvasPosition.x, led._canvasPosition.y, LED_RADIUS, 0, 2*Math.PI)
                ctx.fill()
            }
        }
        return led
    }

    function getClosestSquared(point) {
        let minDist = 1000
        let minIndex = 0
        for(let p = 0; p < N_LEDS; p++) {
            const d = leds[p].distanceSquared(point)
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
            //h is 0..360, s is 0..100, therefore we need one more bit in h and one less bit in s, so we shall borrow it
            const c = leds[i].getColour()
            let h = c.h
            let s = c.s
            if(h > 255) {
                h &= 255
                s |= 128
            }
            state[3*i+0] = h
            state[3*i+1] = s
            state[3*i+2] = c.l
        }
        return state
    }

    const leds = []
    const manager = {}
    const undoQueue = []

    manager.init = function() {
        for(let l = 0; l < N_LEDS; l++) {
            leds.push(makeLED(l))
        }
    }

    manager.init()

    manager.positionLEDs = function(mode, width, height) {
        const LED_X_SPACE = 30
        const LED_Y_SPACE = 20
        let calcPosition = (i) => { return [0, 0] }
        if(mode === "LINE_L2R") {
            /*  |  radius
                |  vvv
                |..___c___....___c___..| => width = 22, x_space = 4, radius = 3.5
                |^^
                |x_space /2
            */
            const ledWidth = 2 * LED_RADIUS + LED_X_SPACE
            const ledHeight = 2 * LED_RADIUS + LED_Y_SPACE
            const effectiveWidth = Math.floor(width / ledWidth) * ledWidth
            calcPosition = (l) => {
                const x = (l * ledWidth) % effectiveWidth + ledWidth / 2
                const y = Math.floor(l * ledWidth/effectiveWidth) * ledHeight + ledHeight / 2
                return [x, y]
            }
        }
        else {
            console.log("Positioning not implemented " + mode)
        }
        for(let l = 0; l < N_LEDS; l++) {
            leds[l].setPosition(...calcPosition(l))
        }
    }

    manager.paint = function(i, ctx) {
        leds[i].paint(ctx)
    }

    manager.setColour = function(point, pointWidth, colour) {
        let [distance, index] = getClosestSquared(point)
        if(distance < (LED_RADIUS + pointWidth) * (LED_RADIUS + pointWidth) && !leds[index].sameColour(colour)) {
            undoQueue.push(saveState())
            leds[index].setColour(colour)
        }
    }

    return manager
}


function paintCanvas() {
    const canvas = document.getElementById("treeCanvas")
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFF"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for(let l = 0; l < N_LEDS; l++) {
        leds.paint(l, ctx)
    }
}


/* Toolbox */

function makeToolBox() {
    let _selectedColour = makeHSL(0, 100, 50)
    let _currentTool = 'brush'
    const toolbox = {
        brush: {
            icon: "paintbrush-2",
            onclick: () => {
                document.getElementById("treeCanvas").addEventListener("pointermove", (e) => {
                    if(e.buttons === 1){
                        leds.setColour(makePoint(e.offsetX, e.offsetY), e.width / 2, toolbox.colour.getColour())
                        requestAnimationFrame(paintCanvas)
                    }
                })

            }
        },
        select: {
            icon: "arrow-cursor-1",
            onclick: () => {}
        },
        colour: {
            icon: "",
            getColour: () => {
                return _selectedColour.copy()
            },
            onclick: () => {
                const closePicker = (ev) => {
                    console.log(ev.target)
                    if(ev.target instanceof HTMLElement) {
                        document.getElementById("picker").style.display = "none"
                        document.getElementById("main").removeEventListener("pointerdown", closePicker)
                    }
                }
                document.getElementById("main").addEventListener("pointerdown", closePicker)

                let colorPicker
                document.getElementById("picker").style.display = "block"
                document.getElementById("picker").innerHTML = ''
                colorPicker = new iro.ColorPicker('#picker', {
                    width: 180,
                    layoutDirection: "horizontal",
                    layout: [
                        {
                            component: iro.ui.Wheel,
                            options: {
                                wheelLightness: false
                            }
                        },
                        {
                            component: iro.ui.Box,
                            options: {}
                        }
                    ]
                });
                colorPicker.color.set(_selectedColour.getString())
                colorPicker.on('color:change', function(color) {
                    //console.log(color)
                    _selectedColour.update(color.hsl)
                    toolbox.colour.div.style.backgroundColor = _selectedColour.getString()
                    //console.log(selectedColour.getString())
                })
            }
        }
    }
    for(const [toolName, toolDef] of Object.entries(toolbox)) {

        const toolDiv = document.createElement("div")
        toolDiv.className = "tool_item"
        if(toolDef.icon !== "") {
            toolDiv.style.backgroundImage = 'url("include/' +  toolDef.icon + '-line.svg")'
        }
        document.getElementById("tools").appendChild(toolDiv)
        toolDiv.addEventListener("click", () => {
            if(toolbox[_currentTool].icon !== "") {
                toolbox[_currentTool].div.style.backgroundImage = 'url("include/' + toolbox[_currentTool].icon + '-line.svg")'
            }
            toolbox[toolName].div.style.backgroundImage = 'url("include/' +  toolDef.icon + '-solid.svg")'
            _currentTool = toolName
            toolDef.onclick()
        })
        toolbox[toolName].div = toolDiv
    }
    //colour has no icon, but shows just color
    toolbox.colour.div.style.backgroundColor = _selectedColour.getString()
    return toolbox
}

const leds = makeLedManager()

function start() {
    const toolbox = makeToolBox()
    leds.positionLEDs('LINE_L2R', 800, 1200)
    paintCanvas()
}
