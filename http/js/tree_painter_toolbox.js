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
*
*   https://ionic.io/ionicons
*   https://home.streamlinehq.com
* */

export function makeToolBox(leds, comm, keyframes) {
    let _selectedColour = [makeHSL(0, 100, 50), makeHSL(120, 100, 50)]
    let _activeColour = 0
    let _currentTool = 'brush'
    let _currentToolbar = []

    const THUMB_WIDTH = 16
    const THUMB_HEIGHT = 16

    /**
     *
     * @param tagName {string}
     * @param parent {HTMLElement}
     * @param className {string}
     * @param attributes {Record<string,string>}
     * @return {HTMLAnchorElement | HTMLElement | HTMLAreaElement | HTMLAudioElement | HTMLBaseElement | HTMLQuoteElement | HTMLBodyElement | HTMLBRElement | HTMLButtonElement | HTMLCanvasElement | HTMLTableCaptionElement | HTMLTableColElement | HTMLDataElement | HTMLDataListElement | HTMLModElement | HTMLDetailsElement | HTMLDialogElement | HTMLDivElement | HTMLDListElement | HTMLEmbedElement | HTMLFieldSetElement | HTMLFormElement | HTMLHeadingElement | HTMLHeadElement | HTMLHRElement | HTMLHtmlElement | HTMLIFrameElement | HTMLImageElement | HTMLInputElement | HTMLLabelElement | HTMLLegendElement | HTMLLIElement | HTMLLinkElement | HTMLMapElement | HTMLMenuElement | HTMLMetaElement | HTMLMeterElement | HTMLObjectElement | HTMLOListElement | HTMLOptGroupElement | HTMLOptionElement | HTMLOutputElement | HTMLParagraphElement | HTMLPictureElement | HTMLPreElement | HTMLProgressElement | HTMLScriptElement | HTMLSelectElement | HTMLSlotElement | HTMLSourceElement | HTMLSpanElement | HTMLStyleElement | HTMLTableElement | HTMLTableSectionElement | HTMLTableCellElement | HTMLTemplateElement | HTMLTextAreaElement | HTMLTimeElement | HTMLTitleElement | HTMLTableRowElement | HTMLTrackElement | HTMLUListElement | HTMLVideoElement}
     */
    function createElement(tagName, parent, className="", attributes={}) {
        let e= document.createElement(tagName)
        if(className !== "")
            e.classList.add(className)
        parent.appendChild(e)
        for(let att in attributes) {
            e.setAttribute(att, attributes[att])
        }
        return e
    }

    function createDiv(parent, className) {
        return createElement("div", parent, className)
    }

    function createHelp() {

        function createHelpForContainer(container, heading) {
            const containerHelpDiv = createDiv(helpDiv, "help_tool_container")
            containerHelpDiv.innerHTML = '<h1>' + heading + "</h1>"
            for(const [toolName, toolDef] of Object.entries(container)) {
                const toolHelpDiv = createDiv(containerHelpDiv, "help_tool_row")
                const iconDiv = createDiv(toolHelpDiv, "help_tool_icon")
                if(toolDef.icon !== "") {
                    iconDiv.style.backgroundImage = 'url("include/' + toolDef.icon + '-line.svg")'
                }
                else {
                    iconDiv.style.backgroundColor = "brown"
                }
                const textDiv = createDiv(toolHelpDiv, "help_tool_text")
                textDiv.textContent = toolDef.help
            }
        }

        const helpDiv = document.getElementById("help")
        createHelpForContainer(toolbox, "Tools in toolbar")
        createHelpForContainer(toolbar, "Buttons in toolbar")
    }

    function makeCanvasTool(icon, processPoint, toolbarButtons, helpText) {
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
            div: null,
            help: helpText
        }
        return t
    }

    function makeDragTool(icon, dragAction, toolbarButtons, helpText) {
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
            div: null,
            help: helpText
        }
        return dragTool
    }

    /**
     * @type {Object.<string,{icon: string, handler: function, startTool: function, endTool: function, toolbar:[string], div: {HTMLDivElement}|null}>}
     */
    const toolbox = {
        brush: makeCanvasTool(
            "paintbrush-2",
            (pt, w) => {
                leds.setColour(pt, w, _selectedColour[_activeColour])
            },
            ["colour0", "colour1", "eyeDropper", "undo", "redo"],
            "Paint LEDs with the active colour. If selection is active, only selected LEDs will be affected"),
        move: makeDragTool(
            "arrow-move",
            (startPoint, endPoint, width) => {
                const wrap = toolbar.useWrap.value
                const selectedOnly = toolbar.useSelection.value
                return leds.move(startPoint, endPoint, width, selectedOnly, wrap, _selectedColour[0])
            },
            ["colour0", "useSelection", "useWrap", "undo", "redo"],
            "Move the LEDs around. If Wrap is active, LEDs will be wrapped around, otherwise the colour will be used " +
            "to fill in. If there is selection and Use Selection is active, only selected LEDs will be moved"),
        gradient: makeDragTool(
            "gradient",
            (startPoint, endPoint, width) => {
                return leds.gradient(startPoint, endPoint, width, _selectedColour[(_activeColour + 1) % 2], _selectedColour[_activeColour])
            },
            ["colour0", "colour1", "eyeDropper", "undo", "redo"],
            "Create gradient. If there is selection, it will be padded from the start of selection to the start of " +
            "the gradient with start colour, and from the end of the gradient to the end of selection with the end " +
            "colour. Otherwise, the gradient is created only between start and end LED. Gradient is always from the " +
            "inactive colour to the active colour"),
        select: makeCanvasTool(
            "arrow-cursor-1",
            (pt, w) => {
                leds.selectLed(pt, w, toolbar.selectMode.value)
            },
            ["colour0", "selectFill", "selectNone", "selectUnify", "selectMode"],
            "Select and deselect LEDs. Use Unify Selection button to quickly select large number of LEDs"),
        adjust: {
            icon: "horizontal-slider",
            startTool: () => {}, //all functionality is in the toolbar buttons
            endTool: () => {},
            toolbar: ["shiftHue", "shiftSaturation", "shiftLightness", "useSelection", "undo", "redo"],
            div: null,
            help: "Allows globally adjust hue, saturation and lightness of all LEDs (or only of the selected ones)"
        },
        animation: {
            icon: "anim",
            startTool: () => {},
            endTool: () => {},
            toolbar: ["noAnim", "moveAnim", "aaMoveAnim", "shimmerAnim", "moveShimmerAnim", "addKeyframe", "editKeyframe"],
            div: null,
            help: "Opens menu where you can select global animation mode and speed"
        },
        menu: {
            icon: "menu",
            startTool: () => {}, //all functionality is in toolbar buttons
            endTool: () => {},
            toolbar: ["save", "liveConnection", "ledPlacement", "ledSize", "showHelp"],
            div: null,
            help: "Opens the system menu"
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

            const closeDiv = createDiv(toolbarDiv, "tool_item")
            closeDiv.style.backgroundImage = 'url("include/capital-X-line.svg")'
            closeDiv.addEventListener("pointerdown", (ev) => {
                ev.stopPropagation()
                leds.applyState()
                createToolbarForCurrentTool()
            })
        }
    }

    function makeStateHolderAction(toolbarItem, defaultValue, onSwitch=(value)=>{}) {
        return () => {
            onSwitch(toolbar[toolbarItem].value)
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

    function makeAnimAction(animationName) {
        const animationId = {noAnim: 0, moveAnim: 1, aaMoveAnim: 2, shimmerAnim: 3, moveShimmerAnim: 4}[animationName]
        return () => {
            const min = -10
            const max = +10
            const toolbarDiv = toolbar.noAnim.div.parentElement
            toolbarDiv.innerHTML = ''
            const input = document.createElement("input")
            input.type = "range"
            input.min = min.toString()
            input.max = max.toString()
            input.value = toolbar[animationName].speed.toString()
            input.classList.add("tool_item5")
            toolbarDiv.appendChild(input)
            leds.setAnimation(animationId, toolbar[animationName].speed)
            input.addEventListener("input", (ev) => {
                const speed = -1 * ev.target.value
                leds.setAnimation(animationId, speed)
                toolbar[animationName].speed = speed
            })

            //TODO reuse with makeShiftAction
            const closeDiv = createDiv(toolbarDiv, "tool_item")
            closeDiv.style.backgroundImage = 'url("include/capital-X-line.svg")'
            closeDiv.addEventListener("pointerdown", (ev) => {
                ev.stopPropagation()
                createToolbarForCurrentTool()
            })
        }
    }

    function showKeyframeUI() {
        const C_SLIDER_MIN = 0
        const C_SLIDER_MAX = 100
        const C_MIN_DURATION = 50     // ms
        const C_MAX_DURATION = 90000  //90 seconds
        const C_ADDITIVE_CONST = 0
        const C_AMPLITUDE = (C_MIN_DURATION - C_ADDITIVE_CONST)
        const C_COEFFICIENT = Math.log((C_MAX_DURATION - C_ADDITIVE_CONST)/C_AMPLITUDE)/C_SLIDER_MAX
        /**
         * @param value {number}
         * @return {number}
         */
        const sliderToDuration = (value) => Math.trunc(C_AMPLITUDE * Math.exp(C_COEFFICIENT * value) + C_ADDITIVE_CONST)
        const durationToValue = (duration) => Math.log((duration - C_ADDITIVE_CONST)/C_AMPLITUDE) / C_COEFFICIENT
        /**
         * @param duration {number}
         * @return {string}
         */
        const durationToString = (duration) => duration > 1000 ?
            (duration / 1000).toLocaleString("en-US", {style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 1}) :
            (duration).toLocaleString("en-US", {style: "unit", unit: "millisecond", unitDisplay: "narrow", maximumFractionDigits: 0})

        /**
         * Create common frame UI: slider, move up/down, delete
         * @param frameDiv {HTMLDivElement}
         * @param n {number}
         * @param timing {number}
         */
        function makeKeyframeControls(frameDiv, n, timing) {
            let controlDiv = createDiv(frameDiv, "keyframe_controls")

            //Add duration slider and label
            let sizeId = 'keyframe_duration_' + n
            let label = createElement("label", controlDiv, "keyframe_label", {for: sizeId})
            label.innerText = durationToString(timing)
            let slider = createElement("input", controlDiv, "keyframe_duration", {
                min: C_SLIDER_MIN.toString(),
                max: C_SLIDER_MAX.toString(),
                type: "range",
                step: "any",
                value: durationToValue(timing)
            })
            slider.addEventListener("input", (ev) => {
                const duration = sliderToDuration(slider.value)
                label.innerText = durationToString(duration)
            })
            slider.addEventListener("change", (ev) => {
                keyframes.updateTiming(n, sliderToDuration(ev.target.value))
            })

            //Add buttons
            const buttons = {
                keyframe_load_delete: {
                    keyframe_update: (event) => {
                        const state = keyframes.getKeyframe(n)
                        leds.loadFromState(state)
                        toolbar.editKeyframe.setMode("update", n)
                        showHideCanvas("")
                    },
                    keyframe_delete: (event) => {
                        keyframes.deleteKeyframe(n)
                    }
                },
                keyframe_up_down: {
                    keyframe_up: (event) => {
                        keyframes.swapKeyframe(n)
                    },
                    keyframe_down: (event) => {
                        keyframes.swapKeyframe(n + 1)
                    }
                }
            }
            for(let divStyle in buttons) {
                const div = createDiv(controlDiv, divStyle)
                for(let buttonStyle in buttons[divStyle]) {
                    const button = createElement("input", div, buttonStyle, {type: "button"})
                    button.addEventListener("pointerdown", buttons[divStyle][buttonStyle])
                }
            }
        }

        function makeTimeline() {
            const nFrames = keyframes.getKeyframesCount()
            const timelineDiv = createDiv(kfDiv, "keyframe_timeline")
            for(let i = 0; i < nFrames; i++) {
                const frameDiv = createDiv(timelineDiv, "keyframe_item")
                const thumbnailDiv = createDiv(frameDiv, "keyframe_thumb")
                keyframes.renderThumbnail(thumbnailDiv, i)
                makeKeyframeControls(frameDiv, i, keyframes.getTiming(i))
            }
            if(nFrames > 0) {
                const upButtons = timelineDiv.getElementsByClassName("keyframe_up")
                upButtons.item(0).style.visibility = "hidden"
                const downButtons = timelineDiv.getElementsByClassName("keyframe_down")
                downButtons.item(upButtons.length - 1).style.visibility = "hidden"
            }
        }

        function makeSaveLoadControls() {
            const saveLoadDiv= createDiv(kfDiv, "keyframe_saveLoad")
            const loadDiv = createDiv(saveLoadDiv, "keyframe_load")
            const saveList = createDiv(loadDiv, "keyframe_saveList")
            for(let s of keyframes.getSavesList()) {
                const p = createElement("p", saveList, "")
                p.innerText = s
                p.addEventListener("pointerdown", () => keyframes.loadSave(s))
            }
            const saveDiv = createDiv(saveLoadDiv, "keyframe_save")
            const loadButton = createElement("input", saveDiv, "keyframe_load", {type: "button"})
            loadButton.addEventListener("pointerdown", () => keyframes.querySaves())
            const saveButton = createElement("input", saveDiv, "keyframe_save", {type: "button"})
            saveButton.addEventListener("pointerdown", () => keyframes.saveCurrent())
        }

        const kfDiv = document.getElementById("keyframe")
        kfDiv.innerHTML = ""
        makeTimeline()
        makeSaveLoadControls()
        showHideCanvas("addKeyframe")
    }

    keyframes.registerUIUpdater(showKeyframeUI)

    /**
     * @type {Object.<string,{icon: string, action: function, div: HTMLDivElement, value?:any}|{null}>}
     */
    const toolbar = {
        undo: {
            icon: "undo",
            action: makeUndoRedoAction("undo", leds.undoStep),
            div: null,
            help: "Undo the last action. Experiment with undo/redo to discover its unique capabilities"
        },
        redo: {
            icon: "redo",
            action: makeUndoRedoAction("redo", leds.redoStep),
            div: null,
            help: "Redo the last action. Experiment with undo/redo to discover its unique capabilities"
        },
        colour0: {
            icon: "",
            action: makeColourAction(0),
            div: null,
            help: "First colour. The active colour is marked by frame. Clicking the inactive colour makes it active, " +
                "clicking the active colour opens the colour picker"
        },
        colour1: {
            icon: "",
            action: makeColourAction(1),
            div: null,
            help: "Second colour. Works just like the first one."
        },
        swapColours: {
            icon: "swap-color",
            action: () => {
                toolbar["colour" + _activeColour].div.classList.remove("colour_selected")
                _activeColour = (_activeColour + 1) % 2
                toolbar["colour" + _activeColour].div.classList.add("colour_selected")
            },
            div: null,
            help: "Swap active and inactive colours. Currently this button is not used"
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
            div: null,
            help: "Eye dropper tool -- select colour from any LED on canvas"
        },
        useWrap: {
            icon: "wrap",
            value: true,
            action: makeStateHolderAction ("useWrap", true),
            div: null,
            help: "When active, the LEDs will be wrapped along when moving"
        },
        useSelection: {
            icon: "select",
            value: false,
            action: makeStateHolderAction ("useSelection", false),
            div: null,
            help: "When active, only the selected LEDs will be affected"
        },
        shiftHue: {
            icon: "capital-H",
            action: makeShiftAction(-180, 180, leds.shiftHue),
            div: null,
            help: "Allows to shift hue, this is cyclic (i.e. hue is not clamped)"
        },
        shiftSaturation: {
            icon: "capital-S",
            action: makeShiftAction(-100, 100, leds.shiftSaturation),
            div: null,
            help: "Allows to change saturation, from fully saturated to shades of grey"
        },
        shiftLightness: {
            icon: "capital-L",
            action: makeShiftAction(-100, 100, leds.shiftLightness),
            div: null,
            help: "Allows to change lightness, from black to white"
        },
        selectNone: {
            icon: "select-none",
            action: () => {
                leds.selectNone()
                requestAnimationFrame(leds.paintCanvas)
            },
            div: null,
            help: "Unselects all LEDs"
        },
        selectUnify: {
            icon: "select-all",
            action: () => {
                leds.unifySelection()
                requestAnimationFrame(leds.paintCanvas)
            },
            div: null,
            help: "Selects all LEDs between the first and last selected one"
        },
        selectMode: {
            icon: "select-mode",
            value: true,
            action: makeStateHolderAction("selectMode", true),
            div: null,
            help: "Switches between adding to and removing from the selection"
        },
        selectFill: {
            icon: "paint-bucket",
            action: () => {
                leds.fill(_selectedColour[0])
                requestAnimationFrame(leds.paintCanvas)
            },
            div: null,
            help: "Fill all selected LEDs with colour. If there is no selection, everything will be filled."
        },
        noAnim: {
            icon: "anim-none",
            speed: 0,
            action: makeAnimAction("noAnim"),
            div: null,
            help: "Stops running animations, everything is rendered statically"
        },
        moveAnim: {
            icon: "anim-move-no-aa",
            speed: 1,
            action: makeAnimAction("moveAnim"),
            div: null,
            help: "Pattern moves along the chain with a given speed, there is no antialiasing (i.e. leds 'jump' from place to place)"
        },
        aaMoveAnim: {
            icon: "anim-move-aa",
            speed: 1,
            action: makeAnimAction("aaMoveAnim"),
            div: null,
            help: "Pattern moves along the chain with a given speed by blending (i.e. leds 'flows' from place to place)"
        },
        shimmerAnim: {
            icon: "anim-shimmer",
            speed: 1,
            action: makeAnimAction("shimmerAnim"),
            div: null,
            help: "LEDs in the pattern randomly change their lightness and saturation"
        },
        moveShimmerAnim: {
            icon: "anim-move-shimmer",
            speed: 1,
            action: makeAnimAction("moveShimmerAnim"),
            div: null,
            help: "Combination of the two preceding modes"
        },
        addKeyframe: {
            icon: "anim-add-frame",
            action: () => {
                keyframes.addKeyFrame(leds.getState())
            },
            div: null,
            help: "Add new keyframe to animation"
        },
        editKeyframe: {
            icon: "anim-keyframes",
            mode: "edit",
            updateIndex: -1,
            setMode: (m, i=-1) => {
                switch (m) {
                    case "edit":
                        toolbar.editKeyframe.icon = "anim-keyframes"
                        break
                    case "update":
                        toolbar.editKeyframe.icon = "anim-update-frame"
                        break
                    default:
                        console.log("Unknown keyframe mode")
                }
                toolbar.editKeyframe.updateIndex = i
                toolbar.editKeyframe.mode = m
            },
            action: () => {
                switch(toolbar.editKeyframe.mode) {
                    case "edit":
                        keyframes.openKeyframe()
                        break
                    case "update":
                        keyframes.updateKeyframe(toolbar.editKeyframe.updateIndex, leds.getState())
                        toolbar.editKeyframe.setMode("edit")
                        break;
                    default:
                        console.log("Unknown keyframe mode action")
                }
            },
            div: null,
            help: "View and edit timeline or update the current frame"
        },
        ledPlacement: {
            icon: "led-position",
            value: false,
            action: makeStateHolderAction("ledPlacement", false, (value) => {
                if(!value)
                    leds.positionLEDs('LINE_L2R')
                else
                    leds.positionLEDs('LINE_WRAP')
                requestAnimationFrame(leds.paintCanvas)
            }),
            div: null,
            help: "Select between two LED configurations: alternating left to right and right to left (default) and " +
                "text-like (all lines are left to right)"
        },
        save: {
            icon: "floppy-disk",
            is_init: false,
            init_permanent_listeners: () => {
                if(toolbar.save.is_init)
                    return
                toolbar.save.is_init = true

                //Click new to clear canvas
                document.getElementById("save_new").addEventListener("pointerdown", (ev) => {
                    const state = new Uint8Array(3 * leds.n_leds())
                    leds.loadFromState(state)
                    showHideCanvas("")
                    requestAnimationFrame(leds.paintCanvas)
                })
                //Click get current state
                document.getElementById("save_get").addEventListener("pointerdown", (ev) => {
                    comm.loadCurrentState()
                    showHideCanvas("")
                    requestAnimationFrame(leds.paintCanvas)
                })
                //Click close to do nothing
                document.getElementById("save_close").addEventListener("pointerdown", (ev) => {
                    showHideCanvas("")
                })

            },
            action: () => {
                toolbar.save.init_permanent_listeners()

                //TODO refactor to resemble something human

                /**
                 * @param {HTMLElement} saveLoadDiv
                 * @param {Record<string, string>}saves
                 */
                function showSaves(saveLoadDiv, saves) {
                    for(const [name, base64Data] of Object.entries(saves)) {
                        const loadDiv = document.createElement("div")
                        const binString = atob(base64Data);
                        const state = Uint8Array.from(binString, (m) => m.codePointAt(0))
                        const thumbnailCanvas = document.createElement('canvas');
                        thumbnailCanvas.width = THUMB_WIDTH;
                        thumbnailCanvas.height = THUMB_HEIGHT;
                        loadDiv.appendChild(thumbnailCanvas);
                        const ctx = thumbnailCanvas.getContext('2d');
                        let imageData = ctx.createImageData(THUMB_WIDTH, THUMB_HEIGHT);
                        for(let i = 0, j = 0; i < state.length; i += 3, j += 4) {
                            imageData.data[j]     = state[i];     // Red
                            imageData.data[j + 1] = state[i + 1]; // Green
                            imageData.data[j + 2] = state[i + 2]; // Blue
                            imageData.data[j + 3] = 255;          // Alpha (fully opaque)
                        }
                        ctx.putImageData(imageData, 0, 0);
                        const namePar = document.createElement("p")
                        namePar.textContent = name.substring(name.indexOf("\\") + 1)
                        loadDiv.appendChild(namePar)
                        saveLoadDiv.appendChild(loadDiv)
                        loadDiv.addEventListener("pointerdown", (ev) => {
                            leds.loadFromState(state)
                            showHideCanvas("")
                            requestAnimationFrame(leds.paintCanvas)
                        })
                    }
                }

                function fetchSaves(folder) {
                    comm.loadSaves(folder, (data) => {
                        const saveLoadDiv = document.getElementById("save_load")
                        saveLoadDiv.innerHTML = "<h1>Load your save</h1>"
                        showSaves(saveLoadDiv, data.saves)
                        //console.log(data)
                        const savefoldersDiv = document.getElementById("save_folders")
                        savefoldersDiv.innerHTML = '<h1>Choose another folder</h1>'
                        for(const otherFolder of data.folders) {
                            const folderDiv = document.createElement("div")
                            folderDiv.textContent = otherFolder
                            savefoldersDiv.appendChild(folderDiv)
                            folderDiv.addEventListener("pointerdown", (ev) => {
                                fetchSaves(otherFolder)
                            })
                        }
                    })
                }

                const saveDiv = document.getElementById("save")
                saveDiv.style.display = "block"
                let folder = comm.getFolderName()
                const folderInput = document.getElementById("save_folder")
                folderInput.value = folder
                const saveNamesDiv = document.getElementById("save_names")
                saveNamesDiv.innerHTML = "<h1>Choose your save name</h1>"
                comm.getFileNameCandidates(folder, (data) => {
                    //console.log(data.names)
                    for(const name of data.names) {
                        const nameDiv = document.createElement("div")
                        nameDiv.textContent = name
                        saveNamesDiv.appendChild(nameDiv)
                        nameDiv.addEventListener("pointerdown", (ev) => {
                            const saveFolder = folderInput.value
                            if(saveFolder === "") {
                                alert("Please specify the folder name")
                                return
                            }
                            leds.saveToServer(folderInput.value, name)
                            showHideCanvas("")
                        })
                    }
                })
                fetchSaves(folder)
            },
            div: null,
            help: "Save the current state to server"
        },
        ledSize: {
            icon: "led-size",
            value: false,
            action: makeStateHolderAction("ledSize", false, (value) => {
                if(!value)
                    leds.selectSize(1)
                else
                    leds.selectSize(0)
                leds.positionLEDs()
                requestAnimationFrame(leds.paintCanvas)
            }),
            div: null,
            help: "Select between two LED sizes: smaller and more densely packed and bigger and looser. The latter " +
                "is better for bigger displays and fatter fingers"
        },
        liveConnection: {
            icon: "flash-2",
            value: true,
            action: makeStateHolderAction("liveConnection", true, (value) => {
                comm.setLiveConnection(!value)
            }),
            div: null,
            help: "Turns automatic update on Christmas tree on and off"
        },
        showHelp: {
            icon: "question-mark",
            action: () => {},
            div: null,
            help: "Show this help"
        }

    }

    const canvasHidingButtons = {
        showHelp: 'help',
        save: 'save',
        addKeyframe: 'keyframe',
        editKeyframe: 'keyframe'
    }
    function showHideCanvas(button) {
        if(button in canvasHidingButtons) {
            document.getElementById("treeCanvas").style.display = "none"
            document.getElementById(canvasHidingButtons[button]).style.display = "block"
        }
        else {
            document.getElementById("treeCanvas").style.display = "block"
            for(let [button, buttonId] of Object.entries(canvasHidingButtons)) {
                document.getElementById(buttonId).style.display = "none"
            }
            requestAnimationFrame(leds.paintCanvas)
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
            const buttonDiv = createDiv(toolbarDiv, "tool_item")
            if (buttonDef.icon !== "") {
                buttonDiv.style.backgroundImage = 'url("include/' + buttonDef.icon + '-line.svg")'
            }
            buttonDef.div = buttonDiv
            //some buttons hold state that is persistent per opening/closing of the toolbar
            //we need to update the icon accordingly
            if(buttonDef.hasOwnProperty("value")) {
                buttonDef.value = !buttonDef.value
                buttonDef.action()
            }
            buttonDiv.addEventListener("pointerdown", (ev) => {
                showHideCanvas(button)
                buttonDef.action(ev)
            })
        }
        setColours()
    }

    function initToolbox() {
        console.log("INIT TOOLBOX")
        for (const [toolName, toolDef] of Object.entries(toolbox)) {

            const toolDiv = createDiv(document.getElementById("toolbox"), "tool_item")
            if (toolDef.icon !== "") {
                toolDiv.style.backgroundImage = 'url("include/' + toolDef.icon + '-line.svg")'
            }
            toolDiv.addEventListener("pointerdown", (ev) => {
                ev.preventDefault()
                ev.stopImmediatePropagation()
                if (toolbox[_currentTool].icon !== "") {
                    toolbox[_currentTool].div.style.backgroundImage = 'url("include/' + toolbox[_currentTool].icon + '-line.svg")'
                    toolbox[_currentTool].endTool()
                }
                toolbox[toolName].div.style.backgroundImage = 'url("include/' + toolDef.icon + '-solid.svg")'
                _currentTool = toolName
                showHideCanvas("")
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
    createHelp()
    return toolbox
}
