/* Toolbox */

import { makeHSL, makePoint } from './tree_painter_utils.js'
import { makeColourPicker } from './tree_painter_colour_picker.js'


/*
* Tools and their toolbox
*
*   Brush -> color1, color2, switch color, eye dropper, undo, redo
*   Gradient -> color1, color2, switch color, eye dropper, undo, redo
*   Move -> wrap/no-wrap, ignore selection yes/no, ???
*   Select -> all, none, add/subtract, unify, save?, load?, fill?
*   Adjust -> undo, redo
*   Menu -> clear, live, size (cycle), display (cycle), save?, load?, animation?
*
*   | Clr 1 | Clr 2 | Swap  | EyeDr | Undo  | Redo  |
*   =================================================
*   | Brush | Grad  | Move  | Slect | Adjst | File  |
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

    function makeDragTool(icon, dragAction, toolbarButtons) {
        const dragTool = {
            icon,
            startPoint: null,
            moveHandler: (ev) => {
                if(ev.buttons !== 1) {
                    return
                }
                const point = makePoint(ev.offsetX, ev.offsetY)
                if(dragTool.startPoint === null) {
                    dragTool.startPoint = point
                    return
                }
                const ledsAffected = dragAction(dragTool.startPoint, point, ev.width)
                if(ledsAffected > 0) {
                    requestAnimationFrame(leds.paintCanvas)
                }
            },
            endMoveHandler: (ev) => {
                dragTool.startPoint = null
                leds.applyState()
            },
            startTool: () => {
                document.getElementById("treeCanvas").addEventListener("pointermove", dragTool.moveHandler)
                document.getElementById("treeCanvas").addEventListener("pointerup", dragTool.endMoveHandler)
            },
            endTool: () => {
                document.getElementById("treeCanvas").removeEventListener("pointermove", dragTool.moveHandler)
                document.getElementById("treeCanvas").removeEventListener("pointerup", dragTool.endMoveHandler)
            },
            toolbar: toolbarButtons,
            div: null
        }
        return dragTool
    }

    /**
     * @type {Object.<string,{icon: string, handler: function, startTool: function, endTool: function, toolbar:[string], div: {HTMLDivElement}|null}>}
     */
    const toolbox = {
        brush: makeCanvasTool("paintbrush-2", (pt, w) => {
            leds.setColour(pt, w, _selectedColour[_activeColour].copy())
        }, ["colour0", "colour1", "eyeDropper", "undo", "redo"]),
        move: makeDragTool("arrow-move", (startPoint, endPoint, width) => {
            const wrap = toolbar.useWrap.value
            const selectedOnly = toolbar.useSelection.value
            return leds.move(startPoint, endPoint, width, selectedOnly, wrap, _selectedColour[0])
        }, ["colour0", "useSelection", "useWrap", "undo", "redo"]),
        gradient: makeDragTool("gradient", (startPoint, endPoint, width) => {
            return leds.gradient(startPoint, endPoint, width, _selectedColour[(_activeColour + 1) % 2], _selectedColour[_activeColour])
        }, ["colour0", "colour1", "eyeDropper", "undo", "redo"]),
        select: makeCanvasTool("arrow-cursor-1", (pt, w) => {
            leds.selectLed(pt, w, toolbar.selectMode.value)
        }, ["selectNone", "selectUnify", "selectMode"]),
        adjust: {
            icon: "horizontal-slider",
            startTool: () => {}, //all functionality is in the toolbar buttons
            endTool: () => {},
            toolbar: ["shiftHue", "shiftSaturation", "shiftLightness", "useSelection", "undo", "redo"],
            div: null
        },
        menu: {
            icon: "menu",
            startTool: () => {

            },
            endTool: () => {

            },
            toolbar: [],
            div: null
        }
    }

    function makeColourAction(colourId) {
        return (ev) => {
            ev.preventDefault()
            ev.stopImmediatePropagation()
            if(_activeColour !== colourId) {
                toolbar["colour" + _activeColour].div.classList.remove("colour_selected")
                _activeColour = colourId
                toolbar["colour" + _activeColour].div.classList.add("colour_selected")
                return
            }
            const closePicker = (ev) => {
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

    function makeShiftAction(min, max, shiftFunction) {
        let lastValue = 0
        return () => {
            const toolbarDiv = toolbar.shiftHue.div.parentElement
            toolbarDiv.innerHTML = ''
            const input = document.createElement("input")
            input.type = "range"
            input.min = min.toString()
            input.max = max.toString()
            input.value = "0"
            input.classList.add("tool_item5")
            toolbarDiv.appendChild(input)
            input.addEventListener("input", (ev) => {
                const delta = 1 * ev.target.value - lastValue
                shiftFunction(delta)
                lastValue = 1 * ev.target.value
                requestAnimationFrame(leds.paintCanvas)
            })

            const closeDiv = document.createElement("div")
            closeDiv.classList.add("tool_item")
            closeDiv.style.backgroundImage = 'url("include/capital-X-line.svg")'
            toolbarDiv.appendChild(closeDiv)
            closeDiv.addEventListener("pointerdown", (ev) => {
                ev.stopPropagation()
                leds.applyState()
                createToolbarForCurrentTool()
            })
        }
    }

    function makeStateHolderAction(toolbarItem, defaultValue) {
        return () => {
            toolbar[toolbarItem].value = !toolbar[toolbarItem].value
            toolbar[toolbarItem].div.style.backgroundImage = 'url("include/' + toolbar[toolbarItem].icon +
                (toolbar[toolbarItem].value === defaultValue ? '-line' : '-solid') + '.svg")'
        }
    }

    function makeUndoRedoAction(toolbarItem, ledsFunction) {
        return () => {
            toolbar[toolbarItem].div.style.backgroundImage = 'url("include/' + toolbar[toolbarItem].icon + '-solid.svg")'
            ledsFunction()
            requestAnimationFrame(leds.paintCanvas)
            setTimeout(() => {
                toolbar[toolbarItem].div.style.backgroundImage = 'url("include/' + toolbar[toolbarItem].icon + '-line.svg")'
            }, 100)
        }
    }

    /**
     * @type {Object.<string,{icon: string, action: function, div: {HTMLDivElement}|null}>}
     */
    const toolbar = {
        undo: {
            icon: "undo",
            action: makeUndoRedoAction("undo", leds.undoStep),
            div: null
        },
        redo: {
            icon: "redo",
            action: makeUndoRedoAction("redo", leds.redoStep),
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
        useWrap: {
            icon: "wrap",
            value: true,
            action: makeStateHolderAction ("useWrap", true),
            div: null
        },
        useSelection: {
            icon: "select",
            value: false,
            action: makeStateHolderAction ("useSelection", false),
            div: null
        },
        shiftHue: {
            icon: "capital-H",
            action: makeShiftAction(-180, 180, leds.shiftHue),
            div: null
        },
        shiftSaturation: {
            icon: "capital-S",
            action: makeShiftAction(-100, 100, leds.shiftSaturation),
            div: null
        },
        shiftLightness: {
            icon: "capital-L",
            action: makeShiftAction(-100, 100, leds.shiftLightness),
            div: null
        },
        selectNone: {
            icon: "select-none",
            action: () => {
                leds.selectNone()
                requestAnimationFrame(leds.paintCanvas)
            },
            div: null
        },
        selectUnify: {
            icon: "select-all",
            action: () => {
                leds.unifySelection()
                requestAnimationFrame(leds.paintCanvas)
            },
            div: null
        },
        selectMode: {
            icon: "select-mode",
            value: true,
            action: makeStateHolderAction("selectMode", true),
            div: null
        }
    }

    function createToolbarForCurrentTool() {
        const toolbarDiv = document.getElementById("toolbar")
        for(const button of _currentToolbar) {
            toolbar[button].div = null
        }
        toolbarDiv.innerHTML = "" //this should remove all event listeners
        for(const button of toolbox[_currentTool].toolbar) {
            _currentToolbar.push(button)
            const buttonDef = toolbar[button]
            const buttonDiv = document.createElement("div")
            buttonDiv.className = "tool_item"
            if (buttonDef.icon !== "") {
                buttonDiv.style.backgroundImage = 'url("include/' + buttonDef.icon + '-line.svg")'
            }
            toolbarDiv.appendChild(buttonDiv)
            buttonDef.div = buttonDiv
            buttonDiv.addEventListener("pointerdown", buttonDef.action)
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
            toolDiv.addEventListener("pointerdown", (ev) => {
                ev.preventDefault()
                ev.stopImmediatePropagation()
                if (toolbox[_currentTool].icon !== "") {
                    toolbox[_currentTool].div.style.backgroundImage = 'url("include/' + toolbox[_currentTool].icon + '-line.svg")'
                    toolbox[_currentTool].endTool()
                }
                toolbox[toolName].div.style.backgroundImage = 'url("include/' + toolDef.icon + '-solid.svg")'
                _currentTool = toolName
                createToolbarForCurrentTool()
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
    toolbox[_currentTool].div.dispatchEvent(new Event("pointerdown"))
    return toolbox
}
