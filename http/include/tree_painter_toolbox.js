/* Toolbox */

import { makeHSL, makePoint } from './tree_painter_utils.js'


/*
* Tools and their toolbox
*
*   new
*   brush -> color1, color2, switch color
*
*/

export function makeToolBox(leds) {
    let _selectedColour = makeHSL(0, 100, 50)
    let _currentTool = 'brush'

    function makeCanvasTool(icon, processPoint) {
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
            }
        }
        return t
    }

    const toolbox = {
        brush: makeCanvasTool("paintbrush-2", (pt, w) => {
            leds.setColour(pt, w, toolbox.colour.getColour())
        }),
        select: makeCanvasTool("arrow-cursor-1", (pt, w) => {
            leds.selectLed(pt, w)
        }),
        undo: {
            icon: "undo",
            startTool: () => {
                leds.undoStep()
                requestAnimationFrame(leds.paintCanvas)
            },
            endTool: () => {}
        },
        redo: {
            icon: "redo",
            startTool: () => {
                leds.redoStep()
                requestAnimationFrame(leds.paintCanvas)
            },
            endTool: () => {}
        },
        colour: {
            icon: "",
            getColour: () => {
                return _selectedColour.copy()
            },
            startTool: () => {
                const closePicker = (ev) => {
                    //console.log(ev.target)
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
                    width: 300 * (1 + (leds.pixelRatio - 1) / 2),
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
            },
            endTool: () => {}
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
                toolbox[_currentTool].endTool()
            }
            toolbox[toolName].div.style.backgroundImage = 'url("include/' +  toolDef.icon + '-solid.svg")'
            _currentTool = toolName
            toolDef.startTool()
        })
        toolbox[toolName].div = toolDiv
    }
    //colour has no icon, but shows just color
    toolbox.colour.div.style.backgroundColor = _selectedColour.getString()
    return toolbox
}
