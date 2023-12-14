/* Toolbox */

import { makeHSL, makePoint } from './tree_painter_utils.js'
import { makeColourPicker } from './tree_painter_colour_picker.js'


/*
* Tools and their toolbox
*
*   Brush -> color1, color2, switch color, eye dropper, undo, redo
*   Gradient -> color1, color2, switch color, eye dropper, undo, redo
*   Move -> wrap/no-wrap, ignore selection yes/no, ???
*   Select -> all, none, add/subtract, unify, save?, load?
*   Adjust -> undo, redo
*   Menu -> clear, live, size (cycle), display (cycle), save?, load?, animation?
*
*   | Clr 1 | Clr 2 | Swap  | EyeDr | Undo  | Redo  |
*   =================================================
*   | Brush | Grad  | Move  | Slect | Adjst | File  |
*
*
*
* */

export function makeToolBox(leds) {
    let _selectedColour = [makeHSL(0, 100, 50), makeHSL(120, 100, 50)]
    let _activeColour = 0
    let _currentTool = 'brush'
    let _currentToolbar = []

    function makeCanvasTool(icon, processPoint, toolbarButtons) {
        const t = {
            icon: icon,
            handler: (e) => {
                if(e.buttons === 1) {
                    const point = makePoint(e.offsetX, e.offsetY)
                    processPoint(point, e.width)
                    requestAnimationFrame(leds.paintCanvas)
                }
            },
            startTool: () => {
                document.getElementById("treeCanvas").addEventListener("pointerdown", t.handler)
                document.getElementById("treeCanvas").addEventListener("pointermove", t.handler)
            },
            endTool: () => {
                document.getElementById("treeCanvas").removeEventListener("pointerdown", t.handler)
                document.getElementById("treeCanvas").removeEventListener("pointermove", t.handler)
            },
            toolbar: toolbarButtons,
            div: null
        }
        return t
    }

    /**
     * @type {Object.<string,{icon: string, handler: function, startTool: function, endTool: function, toolbar:[string], div: {HTMLDivElement}|null}>}
     */
    const toolbox = {
        brush: makeCanvasTool("paintbrush-2", (pt, w) => {
            leds.setColour(pt, w, _selectedColour[_activeColour].copy())
        }, ["colour0", "swapColours", "colour1", "eyeDropper", "undo", "redo"]),
        move: {
            icon: "arrow-move",
            startPoint: makePoint(-1,-1),
            handler: (e) => {
                if(e.buttons === 1) {
                    const point = makePoint(e.offsetX, e.offsetY)
                    if(toolbox.move.startPoint.x === -1) {
                        toolbox.move.startPoint = point
                        return
                    }
                    const moved = leds.move(toolbox.move.startPoint, point, e.width, true, true, _selectedColour[_activeColour])
                    if(moved > 0) {
                        toolbox.move.startPoint = point
                        requestAnimationFrame(leds.paintCanvas)
                    }
                }

            },
            startTool: () => {
                document.getElementById("treeCanvas").addEventListener("pointermove", toolbox.move.handler)
                toolbox.move.startPoint = makePoint(-1,-1)
            },
            endTool: () => {
                document.getElementById("treeCanvas").removeEventListener("pointermove", toolbox.move.handler)
            },
            toolbar: ["colour0", "swapColours", "colour1", "eyeDropper", "undo", "redo"],
            div: null
        },
        gradient: {
            icon: "",
            startTool: () => {

            },
            endTool: () => {

            },
            toolbar: ["colour0", "swapColours", "colour1", "eyeDropper", "undo", "redo"],
            div: null
        },
        select: makeCanvasTool("arrow-cursor-1", (pt, w) => {
            leds.selectLed(pt, w)
        }, ["selectNone", "selectMode"]),
        adjust: {
            icon: "",
            startTool: () => {

            },
            endTool: () => {

            },
            toolbar: [],
            div: null
        },

        //menu: {}
    }

    function makeColourAction(colourId) {
        return () => {
            const closePicker = (ev) => {
                //console.log(ev.target)
                if (ev.target instanceof HTMLElement) {
                    document.getElementById("picker").style.display = "none"
                    document.getElementById("main").removeEventListener("pointerdown", closePicker)
                }
            }
            document.getElementById("main").addEventListener("pointerdown", closePicker)
            document.getElementById("picker").style.display = "block"
            let colorPicker = makeColourPicker(colourId, _selectedColour[colourId], document.getElementById("picker"))
            colorPicker.onChange = (color) => {
                //console.log(color)
                _selectedColour[colourId].update(color)
                toolbar["colour" + colourId].div.style.backgroundColor = _selectedColour[colourId].getString()
                //console.log(selectedColour.getString())
            }
            colorPicker.onClose = () => {
                document.getElementById("picker").style.display = "none"
                document.getElementById("main").removeEventListener("pointerdown", closePicker)
            }
        }
    }

    /**
     * @type {Object.<string,{icon: string, action: function, div: {HTMLDivElement}|null}>}
     */
    const toolbar = {
        undo: {
            icon: "undo",
            action: () => {
                leds.undoStep()
                requestAnimationFrame(leds.paintCanvas)
            },
            div: null
        },
        redo: {
            icon: "redo",
            action: () => {
                leds.redoStep()
                requestAnimationFrame(leds.paintCanvas)
            },
            div: null
        },
        colour0: {
            icon: "",
            action: makeColourAction(0),
            div: null
        },
        colour1: {
            icon: "",
            action: makeColourAction(1),
            div: null
        },
        swapColours: {
            icon: "swap-color",
            action: () => {
                toolbar["colour" + _activeColour].div.classList.remove("colour_selected")
                _activeColour = (_activeColour + 1) % 2
                toolbar["colour" + _activeColour].div.classList.add("colour_selected")
            },
            div: null
        },
        eyeDropper: {
            icon: "color-picker",
            action: () => {
                const handler = (e) => {
                    if(e.buttons === 1) {
                        const colour = leds.getColour(makePoint(e.offsetX, e.offsetY), e.width)
                        if(colour) {
                            _selectedColour[_activeColour] = colour
                            setColours()
                        }
                        document.getElementById("treeCanvas").removeEventListener("pointerdown", handler)
                        toolbar.eyeDropper.div.style.backgroundImage = 'url("include/color-picker-line.svg")'
                        toolbox[_currentTool].startTool()
                    }
                }
                toolbox[_currentTool].endTool()
                document.getElementById("treeCanvas").addEventListener("pointerdown", handler)
                toolbar.eyeDropper.div.style.backgroundImage = 'url("include/color-picker-solid.svg")'
            },
            div: null
        },
        selectNone: {
            icon: "",
            action: () => {

            },
            div: null
        },
        selectMode: {
            icon: "",
            action: () => {

            },
            div: null
        },
    }

    function createToolbarForTool(tool) {
        const toolbarDiv = document.getElementById("toolbar")
        for(const button of _currentToolbar) {
            toolbar[button].div = null
        }
        toolbarDiv.innerHTML = "" //this should remove all event listeners
        for(const button of toolbox[tool].toolbar) {
            _currentToolbar.push(button)
            const buttonDef = toolbar[button]
            const buttonDiv = document.createElement("div")
            buttonDiv.className = "tool_item"
            if (buttonDef.icon !== "") {
                buttonDiv.style.backgroundImage = 'url("include/' + buttonDef.icon + '-line.svg")'
            }
            toolbarDiv.appendChild(buttonDiv)
            buttonDef.div = buttonDiv
            buttonDiv.addEventListener("click", buttonDef.action)
        }
        setColours()
    }

    function initToolbox() {
        for (const [toolName, toolDef] of Object.entries(toolbox)) {

            const toolDiv = document.createElement("div")
            toolDiv.className = "tool_item"
            if (toolDef.icon !== "") {
                toolDiv.style.backgroundImage = 'url("include/' + toolDef.icon + '-line.svg")'
            }
            document.getElementById("toolbox").appendChild(toolDiv)
            toolDiv.addEventListener("click", () => {
                if (toolbox[_currentTool].icon !== "") {
                    toolbox[_currentTool].div.style.backgroundImage = 'url("include/' + toolbox[_currentTool].icon + '-line.svg")'
                    toolbox[_currentTool].endTool()
                }
                toolbox[toolName].div.style.backgroundImage = 'url("include/' + toolDef.icon + '-solid.svg")'
                _currentTool = toolName
                createToolbarForTool(toolName)
                toolDef.startTool()
            })
            toolbox[toolName].div = toolDiv
        }
    }

    function setColours() {
        //colour has no icon, but shows just color
        if(toolbar["colour" + _activeColour].div) {
            toolbar["colour" + _activeColour].div.style.backgroundColor = _selectedColour[_activeColour].getString()
            toolbar["colour" + _activeColour].div.classList.add("colour_selected")
        }
            const inactive = (_activeColour + 1) % 2
        if(toolbar["colour" + inactive].div) {
            toolbar["colour" + inactive].div.style.backgroundColor = _selectedColour[inactive].getString()
        }
    }

    initToolbox()
    toolbox[_currentTool].div.dispatchEvent(new Event("click"))
    return toolbox
}
