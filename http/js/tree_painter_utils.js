/* Factories */

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 * @property {function(Point): number} dsq
 */

/**
 * Create point
 * @param x
 * @param y
 * @return {Point}
 */
export function makePoint(x=0, y=0) {

    /**
     * @param other {Point}
     * @return {number} */
    const dsq = (other) => {
        return (other.x - point.x) * (other.x - point.x) + (other.y - point.y) * (other.y - point.y)
    }

    let point = {
        x,
        y,
        dsq
    }
    return point
}

/**
 * @typedef {Object} HSLColour
 * @property {number} h
 * @property {number} s
 * @property {number} l
 */

/**
 *
 * @param h {number}
 * @param s {number}
 * @param l {number}
 * @return {HSLColour}
 */
export function makeHSL(h, s, l) {

    let hsl = {
        h,
        s,
        l
    }

    /**
     * @param other {HSLColour}
     */
    hsl.update = (other) => {
        hsl.h = other.h
        hsl.s = other.s
        hsl.l = other.l
    }

    /**
     * @return {HSLColour}
     */
    hsl.copy = () => {
        return makeHSL(hsl.h, hsl.s, hsl.l)
    }

    /**
     * @param other {HSLColour}
     * @return {boolean}
     */
    hsl.equal = (other) => {
        return (hsl.h === other.h) && (hsl.s === other.s) && (hsl.l === other.l)
    }

    /**
     * @return {string}
     */
    hsl.getString = () => {
        return "hsl(" + hsl.h + " " + hsl.s + "% " + hsl.l + "%)"
    }

    hsl.shiftHue = (amount) => {
        //hsl.h = clamp(hsl.h + amount, 0, 360)
        hsl.h += amount
        if(hsl.h < 360) hsl.h += 360
        if(hsl.h > 360) hsl.h -= 360
    }

    hsl.shiftSaturation = (amount) => {
        hsl.s = clamp(hsl.s + amount, 0, 100)
    }

    hsl.shiftLightness = (amount) => {
        hsl.l = clamp(hsl.l + amount, 0, 100)
    }

    hsl.dotProduct = (other) => {
        let h = other.h
        if((hsl.h - h) > 180) {
            h += 360
        }
        else if((hsl.h - h) < -180) {
            h -= 360
        }
        const l1 = Math.sqrt(hsl.h * hsl.h + hsl.s * hsl.s + hsl.l * hsl.l)
        if(l1 === 0) return  0;
        const l2 = Math.sqrt(h * h + other.s * other.s + other.l * other.l)
        if(l2 === 0) return 0
        return (hsl.h * h + hsl.s * other.s + hsl.l * other.l) / l1 / l2
    }

    function clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    }

    hsl.getRGB = function () {
        const l = hsl.l * 2
        const ss = hsl.s * (l <= 100 ? l : 200 - l) / 100 // Avoid division by zero when l + s is near 0
        const saturation = l + ss < 1e-9 ? 0 : 2 * ss / (l + ss)

        const h = hsl.h / 60;
        const s = clamp(saturation, 0, 1)
        const v = clamp((l + ss) / 2, 0, 100) / 100
        const i = Math.floor(h);
        const f = h - i
        const p = v * (1 - s)
        const q = v * (1 - f * s)
        const t = v * (1 - (1 - f) * s)
        const mod = i % 6
        const r = [v, q, p, p, t, v][mod]
        const g = [t, v, v, q, p, p][mod]
        const b = [p, p, t, v, v, q][mod];
        return {
            r: clamp(r * 255, 0, 255),
            g: clamp(g * 255, 0, 255),
            b: clamp(b * 255, 0, 255)
        }
    }

    hsl.setFromRGB = function (rgb) {
        const r = rgb.r / 255;
        const g = rgb.g / 255;
        const b = rgb.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        let hue = 0;
        const value = max;
        const saturation = max === 0 ? 0 : delta / max;

        switch (max) {
            case min:
                hue = 0; // achromatic
                break;

            case r:
                hue = (g - b) / delta + (g < b ? 6 : 0);
                break;

            case g:
                hue = (b - r) / delta + 2;
                break;

            case b:
                hue = (r - g) / delta + 4;
                break;
        }

        const l = (2 - saturation) * value;
        const divisor = l <= 1 ? l : 2 - l; // Avoid division by zero when lightness is close to zero
        hsl.h = hue * 60 % 360
        hsl.s = clamp(100 * (divisor < 1e-9 ? 0 : saturation * value / divisor), 0, 100);
        hsl.l = clamp(l * 50, 0, 100)
    }

    return hsl
}

/**
 * Fill one pixel in imageData with values from state
 * @param imageData {ImageData}
 * @param state {Uint8Array}
 * @param idIndex {number}
 * @param stateIndex {number}
 */
export function stateToImageData(imageData, state, idIndex, stateIndex) {
    imageData.data[idIndex + 0] = state[stateIndex + 0] // Red
    imageData.data[idIndex + 1] = state[stateIndex + 1] // Green
    imageData.data[idIndex + 2] = state[stateIndex + 2] // Blue
    imageData.data[idIndex + 3] = 255                   // Alpha (fully opaque)
}